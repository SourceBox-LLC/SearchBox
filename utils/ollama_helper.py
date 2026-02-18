"""
Ollama AI helper for SearchBox recommendation generation.
Handles intelligent prompt creation and context-aware suggestion generation.
"""

import logging
import json
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

def generate_recommendations(client, model_name: str, search_history: List[str] = None) -> List[Dict[str, str]]:
    """
    Generate 3 contextual search recommendations using Ollama.
    
    Args:
        client: OllamaClient instance
        model_name: Name of the Ollama model to use
        search_history: Optional list of recent user searches
        
    Returns:
        List of recommendation dictionaries with query, reason, and category
    """
    try:
        # Gather document context
        document_context = get_document_context()
        
        # Create enhanced prompt with history
        prompt = create_recommendation_prompt(document_context, search_history)
        
        # Generate recommendations using Ollama
        response = client.generate_response(
            model_name=model_name,
            prompt=prompt,
            temperature=0.7,
            max_tokens=200
        )
        
        if not response.get('success', False):
            logger.error(f"Failed to generate recommendations: {response.get('error', 'Unknown error')}")
            return get_fallback_recommendations()
        
        # Parse and format recommendations
        recommendations = parse_recommendations(response.get('response', ''))
        
        # Ensure we have exactly 3 recommendations
        while len(recommendations) < 3:
            recommendations.extend(get_fallback_recommendations()[:3 - len(recommendations)])
        
        return recommendations[:3]
        
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        return get_fallback_recommendations()

def get_document_context() -> Dict[str, Any]:
    """
    Gather context about available documents for smart recommendations.
    Uses Flask's current_app to query Meilisearch directly instead of HTTP self-call.
    """
    try:
        from flask import current_app
        from services.config_service import get_searchbox_config
        from services.meilisearch_service import get_documents_index

        def _get_config():
            return get_searchbox_config(current_app._get_current_object(), current_app.Settings)

        index = get_documents_index(_get_config)
        results = index.search('', {'limit': 20})
        documents = results.get('hits', [])

        file_types = set()
        document_titles = []

        for doc in documents:
            title = doc.get('filename', '')
            if title:
                document_titles.append(title)
                if '.' in title:
                    file_types.add(title.rsplit('.', 1)[-1].upper())

        return {
            'documents': document_titles[:10],
            'file_types': list(file_types),
            'total_count': len(documents),
            'has_documents': len(documents) > 0
        }

    except Exception as e:
        logger.error(f"Error gathering document context: {e}")
        return {'documents': [], 'file_types': [], 'total_count': 0}

def create_recommendation_prompt(context: Dict[str, Any], search_history: List[str] = None) -> str:
    """
    Create intelligent prompt for recommendation generation.
    
    Args:
        context: Document context information
        search_history: Optional list of recent user searches
        
    Returns:
        Prompt string for Ollama
    """
    base_prompt = """Generate exactly 3 search query recommendations for a document search system. 
Each recommendation should be:
- Specific and actionable
- Relevant to the user's document collection
- Different from each other (cover different categories)
- Concise (4 - 6 words maximum)

Format your response as a JSON array of objects with these fields:
- query: the search query (4-6 words)
- reason: brief explanation why this is useful
- category: one of: recent, technical, discovery, creative, popular

Example format:
[{"query": "project planning documents", "reason": "Find planning documents", "category": "recent"}]"""

    # Add search history context if provided
    if search_history and len(search_history) > 0:
        history_context = "\n\nRecent user searches for context:\n" + "\n".join([
            f"- {search}" for search in search_history
        ])
        
        base_prompt += f"""

{history_context}

⚠️ CRITICAL: The user has recently searched for the topics above. Generate recommendations that are SPECIFICALLY related to these search patterns. Focus on:

1. Topics similar to: {', '.join(search_history[:2])}
2. Themes that match the user's demonstrated interests
3. Specific queries that continue their research pattern

DO NOT generate generic recommendations. Make them highly relevant to the user's recent searches!"""
        
        logger.info(f"Enhanced prompt with search history: {search_history}")
        logger.info(f"Full enhanced prompt preview: {base_prompt[:500]}...")
    else:
        logger.info("No search history provided - using generic prompt")

    if context.get('has_documents', False):
        file_types = ', '.join(context.get('file_types', [])[:5])
        sample_titles = context.get('documents', [])[:3]
        
        context_info = f"""

User's document collection:
- Total documents: {context.get('total_count', 0)}
- File types: {file_types}
- Sample titles: {', '.join(sample_titles)}

Based on this collection, generate recommendations that would help the user discover relevant content."""
        
        return base_prompt + context_info
    else:
        return base_prompt + """

The user has no indexed documents yet. Generate general recommendations that would be useful for someone setting up a document search system."""

def parse_recommendations(response_text: str) -> List[Dict[str, str]]:
    """
    Parse Ollama response into recommendation format.
    
    Args:
        response_text: Raw response from Ollama
        
    Returns:
        List of parsed recommendation dictionaries
    """
    try:
        # Clean the response text - remove code blocks and extra formatting
        cleaned_text = response_text.strip()
        
        # Remove ```json and ``` code block markers
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]  # Remove ```json
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]  # Remove ```
        
        cleaned_text = cleaned_text.strip()
        
        # Try to parse as JSON first
        if cleaned_text.startswith('['):
            recommendations = json.loads(cleaned_text)
            
            # Validate and clean recommendations
            parsed = []
            for rec in recommendations:
                if isinstance(rec, dict) and 'query' in rec and 'reason' in rec and 'category' in rec:
                    parsed.append({
                        'query': str(rec['query']).strip(),
                        'reason': str(rec['reason']).strip(),
                        'category': str(rec['category']).strip()
                    })
            
            return parsed
        
        # Fallback: parse line by line
        lines = response_text.strip().split('\n')
        recommendations = []
        
        for line in lines:
            if line.strip() and not line.startswith('#'):
                # Simple parsing for non-JSON responses
                parts = line.split('|')
                if len(parts) >= 2:
                    query = parts[0].strip()
                    reason = parts[1].strip() if len(parts) > 1 else 'Search suggestion'
                    category = 'discovery'  # Default category
                    
                    recommendations.append({
                        'query': query,
                        'reason': reason,
                        'category': category
                    })
        
        return recommendations[:3]
        
    except Exception as e:
        logger.error(f"Error parsing recommendations: {e}")
        return get_fallback_recommendations()

def get_fallback_recommendations() -> List[Dict[str, str]]:
    """
    Get fallback recommendations when AI generation fails.
    
    Returns:
        List of fallback recommendation dictionaries
    """
    return [
        {
            'query': 'recently added documents',
            'reason': 'Browse your recently indexed files',
            'category': 'recent'
        },
        {
            'query': 'technical documentation guides',
            'reason': 'Find technical documentation and manuals',
            'category': 'technical'
        },
        {
            'query': 'project meeting notes',
            'reason': 'Search through project-related content',
            'category': 'discovery'
        }
    ]
