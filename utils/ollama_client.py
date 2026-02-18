"""
Ollama AI client for SearchBox AI search functionality.
Handles connection to Ollama server and AI model interactions.
"""

import logging
import requests
import json
from typing import Optional, Dict, Any, List
import time

logger = logging.getLogger(__name__)

class OllamaClient:
    """Client for interacting with Ollama AI server."""
    
    def __init__(self, base_url: str = "http://localhost:11434", timeout: int = 30):
        """
        Initialize Ollama client.
        
        Args:
            base_url: Ollama server URL
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.timeout = timeout
    
    def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to Ollama server.
        
        Returns:
            Dict with connection status and info
        """
        try:
            # Test basic connectivity
            response = self.session.get(f"{self.base_url}/api/tags", timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                models = [model['name'] for model in data.get('models', [])]
                
                return {
                    'connected': True,
                    'models': models,
                    'model_count': len(models),
                    'server_url': self.base_url,
                    'message': f"Connected to Ollama with {len(models)} models available"
                }
            else:
                return {
                    'connected': False,
                    'error': f"HTTP {response.status_code}: {response.text}",
                    'server_url': self.base_url,
                    'message': "Failed to connect to Ollama server"
                }
                
        except requests.exceptions.ConnectionError:
            return {
                'connected': False,
                'error': "Connection refused - Ollama server not running",
                'server_url': self.base_url,
                'message': "Cannot connect to Ollama server"
            }
        except requests.exceptions.Timeout:
            return {
                'connected': False,
                'error': "Connection timeout",
                'server_url': self.base_url,
                'message': "Ollama server not responding"
            }
        except Exception as e:
            return {
                'connected': False,
                'error': str(e),
                'server_url': self.base_url,
                'message': f"Unexpected error: {str(e)}"
            }
    
    def get_models(self) -> List[str]:
        """
        Get list of available models.
        
        Returns:
            List of model names
        """
        try:
            response = self.session.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                return [model['name'] for model in data.get('models', [])]
            return []
        except Exception as e:
            logger.error(f"Failed to get models: {e}")
            return []
    
    def model_exists(self, model_name: str) -> bool:
        """
        Check if a model exists.
        
        Args:
            model_name: Name of the model to check
            
        Returns:
            True if model exists, False otherwise
        """
        models = self.get_models()
        return model_name in models
    
    def pull_model(self, model_name: str) -> Dict[str, Any]:
        """
        Pull a model from Ollama registry.
        
        Args:
            model_name: Name of the model to pull
            
        Returns:
            Dict with pull status
        """
        try:
            response = self.session.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                stream=True
            )
            
            if response.status_code == 200:
                # Process streaming response
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        if data.get('status') == 'success':
                            return {
                                'success': True,
                                'message': f"Model {model_name} pulled successfully"
                            }
                        elif 'error' in data:
                            return {
                                'success': False,
                                'error': data['error']
                            }
                
                return {
                    'success': True,
                    'message': f"Model {model_name} pull completed"
                }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_response(self, model_name: str, prompt: str, **kwargs) -> Dict[str, Any]:
        """
        Generate a response from the AI model.
        
        Args:
            model_name: Name of the model to use
            prompt: Input prompt for the model
            **kwargs: Additional generation parameters
            
        Returns:
            Dict with generated response
        """
        try:
            payload = {
                "model": model_name,
                "prompt": prompt,
                "stream": False,
                **kwargs
            }
            
            response = self.session.post(
                f"{self.base_url}/api/generate",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'success': True,
                    'response': data.get('response', ''),
                    'model': model_name,
                    'done': data.get('done', False),
                    'total_duration': data.get('total_duration', 0),
                    'prompt_eval_count': data.get('prompt_eval_count', 0),
                    'eval_count': data.get('eval_count', 0)
                }
            else:
                return {
                    'success': False,
                    'error': f"HTTP {response.status_code}: {response.text}"
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def generate_response_stream(self, model_name: str, prompt: str, **kwargs):
        """
        Generate streaming response from the AI model.
        
        Args:
            model_name: Name of the model to use
            prompt: Input prompt for the model
            **kwargs: Additional generation parameters
            
        Yields:
            Streaming response chunks from Ollama
        """
        try:
            payload = {
                "model": model_name,
                "prompt": prompt,
                "stream": True,
                **kwargs
            }
            
            response = self.session.post(
                f"{self.base_url}/api/generate",
                json=payload,
                stream=True
            )
            
            if response.status_code == 200:
                for line in response.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line.decode('utf-8'))
                            yield chunk
                            if chunk.get('done', False):
                                break
                        except json.JSONDecodeError as e:
                            logger.error(f"Error parsing streaming chunk: {e}")
                            continue
            else:
                yield {
                    'error': f"HTTP {response.status_code}: {response.text}",
                    'done': True
                }
                
        except Exception as e:
            logger.error(f"Error in streaming response: {e}")
            yield {
                'error': str(e),
                'done': True
            }
    

# Global client instance
_ollama_client: Optional[OllamaClient] = None

def get_ollama_client(config: Optional[Dict[str, Any]] = None) -> OllamaClient:
    """
    Get or create Ollama client instance.
    
    Args:
        config: Configuration dictionary with ollama settings
        
    Returns:
        OllamaClient instance
    """
    global _ollama_client
    
    if _ollama_client is None or config:
        base_url = config.get('ollama_url', 'http://localhost:11434') if config else 'http://localhost:11434'
        timeout = config.get('ollama_timeout', 30) if config else 30
        
        _ollama_client = OllamaClient(base_url=base_url, timeout=timeout)
    
    return _ollama_client

def reset_ollama_client():
    """Reset the global Ollama client instance."""
    global _ollama_client
    _ollama_client = None
