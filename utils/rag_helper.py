"""
RAG (Retrieval-Augmented Generation) helper for SearchBox AI summaries.
Handles text extraction, context building, and source-grounded generation.
"""

import logging
import re
import json
from typing import Dict, Any, List, Tuple
import time

logger = logging.getLogger(__name__)

def generate_summary_with_citations(query: str, search_results: List[Dict], config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate AI-powered search summary with citations using RAG.
    
    Args:
        query: User's search query
        search_results: List of search result dictionaries
        config: SearchBox configuration
        
    Returns:
        Dictionary with summary, citations, and metadata
    """
    try:
        start_time = time.time()
        
        # Check Ollama connection
        from utils.ollama_client import get_ollama_client
        client = get_ollama_client(config)
        
        status = client.test_connection()
        if not status.get('connected', False):
            return get_fallback_summary(query, search_results)
        
        # Extract context from top results
        context_data = extract_relevance_based_context(search_results, query)
        
        if not context_data['documents']:
            return get_fallback_summary(query, search_results)
        
        # Create RAG prompt
        prompt = create_summary_prompt(query, context_data)
        
        # Generate summary with Ollama
        response = client.generate_response(
            model_name=config.get('ollama_model', 'gemma3:12b'),
            prompt=prompt,
            temperature=0.0,        # Maximum factual accuracy (no creativity)
            max_tokens=2000,         # Concise but informative summaries
            top_p=0.9,             # Nucleus sampling for better coherence
            repeat_penalty=1.1,     # Reduce repetition in responses
            stop=['\n\n\n\n', '####', '###'] # Stop at clear boundaries
        )
        
        if not response.get('success', False):
            logger.error(f"Failed to generate summary: {response.get('error', 'Unknown error')}")
            return get_fallback_summary(query, search_results)
        
        # Parse and format response
        summary_data = parse_summary_response(response.get('response', ''), context_data)
        
        # Add metadata
        summary_data.update({
            'sources_used': len(context_data['documents']),
            'model_used': config.get('ollama_model', 'llama2'),
            'generation_time': round(time.time() - start_time, 2),
            'query': query
        })
        
        return summary_data
        
    except Exception as e:
        logger.error(f"Error generating summary with citations: {e}")
        return get_fallback_summary(query, search_results)

def generate_summary_with_citations_stream(query: str, search_results: List[Dict], config: Dict[str, Any]):
    """
    Generate AI-powered search summary with citations using RAG and streaming.
    
    Args:
        query: User's search query
        search_results: List of search result documents
        config: SearchBox configuration
        
    Yields:
        Streaming response chunks from Ollama
    """
    try:
        # Check if AI Search is enabled
        if not config.get('ai_search_enabled', False):
            yield {
                'error': 'AI Search is disabled',
                'done': True
            }
            return
        
        # Extract relevant context with enhanced metadata
        context_data = extract_relevance_based_context(search_results, query)
        
        if not context_data['documents']:
            yield {
                'error': 'No relevant documents found',
                'done': True
            }
            return
        
        # Create RAG prompt
        prompt = create_summary_prompt(query, context_data)
        
        # Get Ollama client
        from utils.ollama_client import get_ollama_client
        client = get_ollama_client(config)
        
        # Generate streaming summary with Ollama
        for chunk in client.generate_response_stream(
            model_name=config.get('ollama_model', 'gemma3:12b'),
            prompt=prompt,
            temperature=0.0,        # Maximum factual accuracy (no creativity)
            max_tokens=2000,         # Concise but informative summaries
            top_p=0.9,             # Nucleus sampling for better coherence
            repeat_penalty=1.1,     # Reduce repetition in responses
            stop=['\n\n\n\n', '####', '###'] # Stop at clear boundaries
        ):
            yield chunk
            
    except Exception as e:
        logger.error(f"Error in streaming summary generation: {e}")
        yield {
            'error': str(e),
            'done': True
        }

def extract_relevance_based_context(search_results: List[Dict], query: str, max_total_chars: int = 8000) -> Dict[str, Any]:
    """Extract context with enhanced relevance-based chunking and increased limits for detailed summaries."""
    chunks = []
    remaining_chars = max_total_chars
    
    # Enhanced relevance-based allocation with more content for detailed summaries
    chunk_allocations = [3000, 2000, 1500, 1000, 500]  # Top 5 results with increased limits
    
    for i, result in enumerate(search_results[:5]):  # Limit to top 5
        if remaining_chars <= 0 or i >= len(chunk_allocations):
            break
            
        chunk_size = min(chunk_allocations[i], remaining_chars)
        
        # Extract content with smart truncation at sentence boundaries
        content = result.get('content', '')
        chunk = smart_truncate_content(content, chunk_size)
        
        if chunk.strip():
            enhanced_doc = {
                'id': i + 1,
                'title': result.get('filename', ''),
                'doc_id': result.get('id', f'doc_{i}'),
                'url': f"/view/{result.get('id')}?q={query}",
                'file_type': result.get('fileType', 'unknown'),
                'file_size': format_file_size(result.get('fileSize', 0)),
                'modified': format_date(result.get('uploadedAt')),
                'relevance_score': 1.0 / (i + 1),
                'content': chunk,
                'preview': content[:200] + '...' if len(content) > 200 else content,
                'content_length': len(content)
            }
            chunks.append(enhanced_doc)
            remaining_chars -= chunk_size
    
    return {
        'documents': chunks,
        'citations': [{'id': doc['id'], 'title': doc['title'], 'url': doc['url'], 
                       'file_type': doc['file_type'], 'file_size': doc['file_size']} 
                      for doc in chunks],
        'total_sources': len(chunks),
        'query': query,
        'total_characters': sum(len(doc['content']) for doc in chunks)
    }

def smart_truncate_content(content: str, max_length: int) -> str:
    """Truncate content at sentence boundaries."""
    if len(content) <= max_length:
        return content
    
    # Find the last sentence boundary within the limit
    truncated = content[:max_length]
    
    # Look for sentence endings (. ! ?) followed by space
    sentences = ['. ', '! ', '? ']
    for i in range(len(truncated) - 1, 0, -1):
        if truncated[i-2:i] in sentences:
            return truncated[:i]
    
    # Fallback: truncate at word boundary
    words = truncated.split()
    return ' '.join(words[:-1]) + '...'

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    if not size_bytes:
        return 'Unknown'
    
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"

def format_date(timestamp: str) -> str:
    """Format timestamp in human-readable format."""
    if not timestamp:
        return 'Unknown'
    
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except:
        return 'Unknown'

def create_summary_prompt(query: str, context_data: Dict[str, Any]) -> str:
    """
    Create enhanced RAG prompt for detailed search summary generation.
    
    Args:
        query: User's search query
        context_data: Extracted context from search results
        
    Returns:
        Enhanced RAG prompt string
    """
    documents = context_data['documents']
    total_sources = context_data['total_sources']
    
    # Build enhanced context section with rich metadata
    context_sections = []
    for doc in documents:
        context_section = f"""SOURCE {doc['id']}: {doc['title']}
🔗 URL: {doc['url']}
📄 Type: {doc['file_type']} | 📊 Size: {doc['file_size']} | 📅 Modified: {doc['modified']}
🎯 Relevance: {doc['relevance_score']:.1%} ({'Top Result' if doc['id'] == 1 else f'{doc["id"]}th Result'})
👁️ Preview: {doc['preview']}
📝 Content: {doc['content']}"""
        context_sections.append(context_section)
    
    context_text = '\n\n'.join(context_sections)
    
    # Create explicit citation mapping with exact URLs
    citation_mapping = "\n".join([f"[{doc['id']}] = {doc['title']} → {doc['url']}" for doc in documents])
    
    prompt = f"""You are creating a comprehensive, detailed search summary based ONLY on the provided sources. Your goal is to provide maximum value and depth while maintaining strict factual accuracy.

USER QUERY: {query}

AVAILABLE SOURCES ({total_sources} documents):

{context_text}

CITATION MAPPING (EXACT URLs):
{citation_mapping}

🚨 CRITICAL REQUIREMENTS:
1. Use ONLY information from the {total_sources} sources above
2. Cite using [1], [2], [3], [4], [5] format ONLY
3. NEVER invent citations - only use [1] through [{total_sources}]
4. Each citation links to the exact URL shown in mapping
5. If sources don't contain relevant information, say: "The provided sources do not contain information about this topic"
6. Create a CONCISE summary (200-400 words total) that is focused and to the point
7. Include 3-5 key findings that capture the most important information
8. Provide insights and context - not just surface facts
9. Include specific details and citations when available
10. Structure the response clearly with logical flow
11. DO NOT hallucinate, invent, or create any information

RESPONSE FORMAT (JSON ONLY):
{{
  "overview": "Brief overview (2-3 sentences) introducing the topic and key findings",
  "detailed_analysis": "Concise analysis (100-200 words) with key explanations and insights",
  "key_findings": [
    "Key finding with citation [1]",
    "Another finding [2]",
    "Third finding [3]"
  ],
  "context_connections": "Brief note on how sources relate (1-2 sentences)",
  "specific_details": [
    "Important detail or statistic [1]",
    "Another specific detail [2]"
  ],
  "confidence": "high/medium/low"
}}

🎯 QUALITY STANDARDS:
- Be concise and focused - avoid filler or repetition
- Every sentence should add value
- Ensure every claim is supported by citations
- Prioritize the most important and relevant information

🚨 VALIDATION: Every citation number [1-{total_sources}] must exist in the sources above."""

    return prompt

def parse_summary_response(response_text: str, context_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse and format the enhanced AI response for detailed search summary.
    
    Args:
        response_text: Raw response from Ollama
        context_data: Original context for citation mapping
        
    Returns:
        Formatted summary data with structured sections
    """
    try:
        # Clean response text
        cleaned_text = response_text.strip()
        
        # Remove code block markers if present
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]
        
        cleaned_text = cleaned_text.strip()
        
        # Try to parse as JSON
        if cleaned_text.startswith('{'):
            response_data = json.loads(cleaned_text)
            
            # Validate entire response structure for citation accuracy
            validated_response = validate_response_structure(response_data, context_data['documents'])
            
            # Build comprehensive summary from all structured sections
            summary_parts = []
            
            # Add overview if available
            if validated_response.get('overview'):
                summary_parts.append(f"## Overview\n{validated_response['overview']}")
            
            # Add detailed analysis if available
            if validated_response.get('detailed_analysis'):
                summary_parts.append(f"## Detailed Analysis\n{validated_response['detailed_analysis']}")
            
            # Add key findings if available
            if validated_response.get('key_findings'):
                findings_text = "\n".join([f"• {finding}" for finding in validated_response['key_findings']])
                summary_parts.append(f"## Key Findings\n{findings_text}")
            
            # Add context connections if available
            if validated_response.get('context_connections'):
                summary_parts.append(f"## Context & Connections\n{validated_response['context_connections']}")
            
            # Add specific details if available
            if validated_response.get('specific_details'):
                details_text = "\n".join([f"• {detail}" for detail in validated_response['specific_details']])
                summary_parts.append(f"## Specific Details\n{details_text}")
            
            # Combine all parts into a comprehensive summary
            comprehensive_summary = "\n\n".join(summary_parts)
            
            # If no structured data, fall back to basic summary field
            if not comprehensive_summary and validated_response.get('summary'):
                comprehensive_summary = validated_response['summary']
            
            return {
                'success': True,
                'summary': comprehensive_summary,
                'overview': validated_response.get('overview', ''),
                'detailed_analysis': validated_response.get('detailed_analysis', ''),
                'key_findings': validated_response.get('key_findings', []),
                'context_connections': validated_response.get('context_connections', ''),
                'specific_details': validated_response.get('specific_details', []),
                'key_points': validated_response.get('key_findings', []),  # Backward compatibility
                'confidence': validated_response.get('confidence', 'medium'),
                'citations': context_data['citations']
            }
        
        # Fallback: extract summary from non-JSON response
        summary = extract_summary_from_text(cleaned_text)
        
        return {
            'success': True,
            'summary': summary,
            'overview': '',
            'detailed_analysis': '',
            'key_findings': [],
            'context_connections': '',
            'specific_details': [],
            'key_points': [],
            'confidence': 'medium',
            'citations': context_data['citations']
        }
        
    except Exception as e:
        logger.error(f"Error parsing summary response: {e}")
        return get_fallback_summary("", context_data.get('documents', []))

def validate_and_clean_citations(text: str, documents: List[Dict]) -> str:
    """Validate and clean citations with strict enforcement."""
    if not documents:
        return text
    
    # Get valid citation numbers
    valid_citations = set(str(doc['id']) for doc in documents)
    
    # Enhanced citation pattern
    citation_pattern = r'\[(\d+)\]'
    
    def replace_invalid_citation(match):
        citation_num = match.group(1)
        if citation_num in valid_citations:
            return match.group(0)  # Keep valid citation
        else:
            # Log invalid citation for debugging
            logger.warning(f"Removed invalid citation [{citation_num}]")
            return ''  # Remove invalid citation
    
    # Replace invalid citations
    cleaned_text = re.sub(citation_pattern, replace_invalid_citation, text)
    
    # Clean up formatting
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    cleaned_text = re.sub(r'\[\s+\]', '[]', cleaned_text)  # Remove empty brackets
    
    return cleaned_text.strip()

def validate_response_structure(response_data: Dict, documents: List[Dict]) -> Dict:
    """Validate entire response structure for citation accuracy across all fields."""
    valid_citations = set(str(doc['id']) for doc in documents)
    
    # Check summary citations
    summary = response_data.get('summary', '')
    summary_citations = re.findall(r'\[(\d+)\]', summary)
    
    # Check overview citations
    overview = response_data.get('overview', '')
    overview_citations = re.findall(r'\[(\d+)\]', overview)
    
    # Check detailed_analysis citations
    detailed_analysis = response_data.get('detailed_analysis', '')
    analysis_citations = re.findall(r'\[(\d+)\]', detailed_analysis)
    
    # Check context_connections citations
    context_connections = response_data.get('context_connections', '')
    context_citations = re.findall(r'\[(\d+)\]', context_connections)
    
    # Check key findings citations
    key_findings = response_data.get('key_findings', [])
    findings_citations = []
    for finding in key_findings:
        findings_citations.extend(re.findall(r'\[(\d+)\]', finding))
    
    # Check specific details citations
    specific_details = response_data.get('specific_details', [])
    details_citations = []
    for detail in specific_details:
        details_citations.extend(re.findall(r'\[(\d+)\]', detail))
    
    # Check legacy key_points citations for backward compatibility
    key_points = response_data.get('key_points', [])
    points_citations = []
    for point in key_points:
        points_citations.extend(re.findall(r'\[(\d+)\]', point))
    
    # Validate all citations
    invalid_citations = []
    all_citations = (summary_citations + overview_citations + analysis_citations + 
                     context_citations + findings_citations + details_citations + points_citations)
    
    for citation in all_citations:
        if citation not in valid_citations:
            invalid_citations.append(citation)
    
    if invalid_citations:
        logger.error(f"Found invalid citations: {invalid_citations}")
        # Remove invalid citations from all text fields
        response_data['summary'] = validate_and_clean_citations(summary, documents)
        response_data['overview'] = validate_and_clean_citations(overview, documents)
        response_data['detailed_analysis'] = validate_and_clean_citations(detailed_analysis, documents)
        response_data['context_connections'] = validate_and_clean_citations(context_connections, documents)
        response_data['key_findings'] = [
            validate_and_clean_citations(finding, documents) for finding in key_findings
        ]
        response_data['specific_details'] = [
            validate_and_clean_citations(detail, documents) for detail in specific_details
        ]
        response_data['key_points'] = [
            validate_and_clean_citations(point, documents) for point in key_points
        ]
    
    return response_data

def extract_summary_from_text(text: str) -> str:
    """
    Extract summary from non-JSON response text.
    
    Args:
        text: Raw response text
        
    Returns:
        Extracted summary
    """
    # Look for summary-like content
    lines = text.split('\n')
    summary_lines = []
    
    for line in lines:
        line = line.strip()
        if line and not line.startswith(('INSTRUCTIONS:', 'USER QUERY:', 'AVAILABLE SOURCES:', 'Example format:')):
            summary_lines.append(line)
    
    return ' '.join(summary_lines[:5])  # Limit to first 5 lines

def get_fallback_summary(query: str, search_results: List[Dict]) -> Dict[str, Any]:
    """
    Get fallback summary when AI generation fails.
    
    Args:
        query: User's search query
        search_results: Search results list
        
    Returns:
        Fallback summary data
    """
    if not search_results:
        return {
            'success': False,
            'summary': f"Unable to generate AI summary for '{query}'. No search results available.",
            'key_points': [],
            'confidence': 'low',
            'citations': [],
            'sources_used': 0,
            'model_used': 'fallback',
            'generation_time': 0,
            'error': 'No search results available'
        }
    
    # Create basic summary from search results
    result_count = len(search_results)
    file_types = list(set([r.get('fileType', 'unknown') for r in search_results[:5]]))
    
    summary = f"Found {result_count} documents matching '{query}'. "
    
    if file_types:
        if len(file_types) == 1:
            summary += f"Results include {file_types[0].upper()} files. "
        else:
            summary += f"Results include various file types: {', '.join(file_types[:3]).upper()}. "
    
    summary += "AI summary generation is currently unavailable. Please review the search results manually."
    
    # Create basic citations
    citations = []
    for i, result in enumerate(search_results[:3]):
        citations.append({
            'id': i + 1,
            'title': result.get('filename', f'Document {i + 1}'),
            'url': f"/document/{result.get('id', f'doc_{i}')}",
            'file_type': result.get('fileType', 'unknown')
        })
    
    return {
        'success': True,
        'summary': summary,
        'key_points': [
            f"Found {result_count} matching documents",
            f"File types: {', '.join(file_types[:3])}" if file_types else "Various document types"
        ],
        'confidence': 'low',
        'citations': citations,
        'sources_used': min(3, len(search_results)),
        'model_used': 'fallback',
        'generation_time': 0,
        'message': 'AI summary unavailable - showing basic summary'
    }
