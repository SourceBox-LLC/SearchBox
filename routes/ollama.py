"""
Ollama AI and search summary API routes for SearchBox.
"""

import json
import logging

from flask import Blueprint, jsonify, request, Response, current_app

from routes.helpers import get_config as _get_config

ollama_bp = Blueprint('ollama', __name__)
logger = logging.getLogger(__name__)


@ollama_bp.route("/api/ollama/status", methods=['GET'])
def get_ollama_status():
    """Get Ollama server status and available models."""
    try:
        config = _get_config()
        
        if not config.get('ai_search_enabled', False):
            return jsonify({
                'enabled': False,
                'message': 'AI Search is disabled'
            })
        
        from utils.ollama_client import get_ollama_client
        client = get_ollama_client(config)
        
        status = client.test_connection()
        status['enabled'] = True
        status['configured_model'] = config.get('ollama_model', 'llama2')
        status['autoconnect'] = config.get('ollama_autoconnect', False)
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error checking Ollama status: {e}")
        return jsonify({
            'enabled': False,
            'connected': False,
            'error': str(e),
            'message': f"Error: {str(e)}"
        }), 500


@ollama_bp.route("/api/ollama/models", methods=['GET'])
def get_ollama_models():
    """Get list of available Ollama models."""
    try:
        config = _get_config()
        
        from utils.ollama_client import get_ollama_client
        client = get_ollama_client(config)
        
        models = client.get_models()
        
        return jsonify({
            'enabled': config.get('ai_search_enabled', False),
            'models': models,
            'count': len(models),
            'configured_model': config.get('ollama_model', 'llama2')
        })
        
    except Exception as e:
        logger.error(f"Error getting Ollama models: {e}")
        return jsonify({
            'enabled': False,
            'models': [],
            'error': str(e)
        }), 500


@ollama_bp.route("/api/ollama/test", methods=['POST'])
def test_ollama_connection():
    """Test connection to Ollama server with current settings."""
    try:
        data = request.get_json() or {}
        config = _get_config()
        
        if data.get('ollama_url'):
            config['ollama_url'] = data['ollama_url']
        if data.get('ollama_timeout'):
            config['ollama_timeout'] = int(data['ollama_timeout'])
        
        from utils.ollama_client import get_ollama_client, reset_ollama_client
        reset_ollama_client()
        client = get_ollama_client(config)
        
        status = client.test_connection()
        
        return jsonify(status)
        
    except Exception as e:
        logger.error(f"Error testing Ollama connection: {e}")
        return jsonify({
            'connected': False,
            'error': str(e),
            'message': f"Connection test failed: {str(e)}"
        }), 500


@ollama_bp.route("/api/ollama/pull", methods=['POST'])
def pull_ollama_model():
    """Pull a model from Ollama registry."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        model_name = data.get('model')
        
        if not model_name:
            return jsonify({
                'success': False,
                'error': 'Model name is required'
            }), 400
        
        config = _get_config()
        from utils.ollama_client import get_ollama_client
        client = get_ollama_client(config)
        
        if client.model_exists(model_name):
            return jsonify({
                'success': True,
                'message': f"Model {model_name} already available"
            })
        
        result = client.pull_model(model_name)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error pulling Ollama model: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ollama_bp.route("/api/ollama/recommendations", methods=['GET'])
def get_ollama_recommendations():
    """Get AI-powered search recommendations from Ollama."""
    try:
        config = _get_config()
        
        if not config.get('ai_search_enabled', False):
            return jsonify({
                'success': False,
                'recommendations': [],
                'message': 'AI Search is disabled'
            })
        
        from utils.ollama_client import get_ollama_client
        from utils.ollama_helper import generate_recommendations
        
        client = get_ollama_client(config)
        
        status = client.test_connection()
        if not status.get('connected', False):
            return jsonify({
                'success': True,
                'recommendations': [
                    {
                        'query': 'recently added documents',
                        'reason': 'Browse your recently indexed files',
                        'category': 'recent'
                    },
                    {
                        'query': 'technical documentation guides',
                        'reason': 'Find technical guides and manuals',
                        'category': 'technical'
                    },
                    {
                        'query': 'project meeting notes',
                        'reason': 'Search through project-related content',
                        'category': 'discovery'
                    }
                ],
                'cached': False,
                'model_used': 'fallback',
                'message': 'Ollama not connected - using generic suggestions'
            })
        
        history_param = request.args.get('history', '')
        search_history = None
        if history_param:
            try:
                search_history = json.loads(history_param)
                if not isinstance(search_history, list):
                    search_history = None
            except (json.JSONDecodeError, TypeError):
                search_history = None
        
        logger.info(f"Search history received: {search_history}")
        
        recommendations = generate_recommendations(client, config.get('ollama_model', 'llama2'), search_history)
        
        return jsonify({
            'success': True,
            'recommendations': recommendations,
            'cached': False,
            'model_used': config.get('ollama_model', 'llama2'),
            'message': 'AI recommendations generated successfully',
            'enhanced': search_history is not None
        })
        
    except Exception as e:
        logger.error(f"Error generating Ollama recommendations: {e}")
        return jsonify({
            'success': False,
            'recommendations': [],
            'error': str(e),
            'message': 'Failed to generate recommendations'
        }), 500


@ollama_bp.route("/api/search/summary", methods=['POST'])
def generate_search_summary():
    """Generate AI-powered search summary using RAG."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        query = data.get('query', '')
        search_results = data.get('results', [])
        
        if not query or not search_results:
            return jsonify({
                'success': False,
                'error': 'Missing query or search results'
            }), 400
        
        config = _get_config()
        if not config.get('ai_search_enabled', False):
            return jsonify({
                'success': False,
                'error': 'AI Search is disabled'
            }), 400
        
        from utils.rag_helper import generate_summary_with_citations
        
        summary_data = generate_summary_with_citations(query, search_results, config)
        
        return jsonify(summary_data)
        
    except Exception as e:
        logger.error(f"Error generating search summary: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to generate summary'
        }), 500


@ollama_bp.route("/api/search/summary/stream", methods=['POST'])
def generate_search_summary_stream():
    """Generate AI-powered search summary with streaming using RAG."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Request body is required'}), 400
        query = data.get('query', '')
        search_results = data.get('results', [])
        
        if not query or not search_results:
            return jsonify({
                'success': False,
                'error': 'Missing query or search results'
            }), 400
        
        config = _get_config()
        if not config.get('ai_search_enabled', False):
            return jsonify({
                'success': False,
                'error': 'AI Search is disabled'
            }), 400
        
        from utils.rag_helper import generate_summary_with_citations_stream
        
        def generate():
            try:
                logger.info(f"Starting streaming summary for query: {query}")
                for chunk in generate_summary_with_citations_stream(query, search_results, config):
                    logger.debug(f"Yielding chunk: {chunk}")
                    yield f"{json.dumps(chunk)}\n"
                logger.info("Streaming summary completed")
            except Exception as e:
                logger.error(f"Error in streaming chunk: {e}")
                yield f"{json.dumps({'error': str(e), 'done': True})}\n"
        
        return Response(generate(), mimetype='application/x-ndjson')
        
    except Exception as e:
        logger.error(f"Error in streaming summary: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Failed to generate streaming summary'
        }), 500
