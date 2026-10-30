from unittest.mock import patch, MagicMock
import os
import importlib
import sys

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

from backend.gateway import LLMGateway, LocalProvider, CloudProvider

def test_local_routing():
    with patch.dict(os.environ, {"LLM_MODE": "local"}):
        import backend.config
        importlib.reload(backend.config)
        import backend.gateway
        importlib.reload(backend.gateway)
        
        gateway = backend.gateway.LLMGateway()
        
        assert gateway._get_model_for_task("routing") == "qwen2.5:3b"
        assert gateway._get_model_for_task("reasoning") == "qwen2.5:7b"
        assert gateway._get_model_for_task("coding") == "qwen2.5-coder:7b"
        assert gateway._get_model_for_task("embedding") == "bge-m3:latest"
        assert isinstance(gateway._get_provider(), backend.gateway.LocalProvider)

@patch("requests.post")
def test_local_provider_generate(mock_post):
    import backend.gateway
    provider = backend.gateway.LocalProvider()
    
    mock_response = MagicMock()
    mock_response.json.return_value = {"message": {"content": "Hello local"}}
    mock_post.return_value = mock_response
    
    result = provider.generate([{"role": "user", "content": "Hi"}], "qwen2.5:7b")
    assert result == "Hello local"
    
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert "api/chat" in args[0]
    assert kwargs["json"]["model"] == "qwen2.5:7b"

if __name__ == "__main__":
    print("Running tests manually...")
    test_local_routing()
    print("test_local_routing passed.")
    test_local_provider_generate()
    print("test_local_provider_generate passed.")
    print("All tests passed!")
