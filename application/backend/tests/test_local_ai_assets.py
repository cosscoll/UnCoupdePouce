"""The browser-local AI must not expose billed model endpoints or secrets."""
from fastapi.testclient import TestClient
from test_lab_api import env

def test_browser_assets_and_csp_are_available_locally(env):
    mod,*_=env
    c=TestClient(mod.app)
    for name in ('assistant-ai.js','local-ai.js','local-ai-worker.js','local-ai-engine.js'):
        res=c.get('/assets/'+name)
        assert res.status_code==200,(name,res.status_code)
    html=c.get('/')
    assert html.status_code==200
    assert '/assets/local-ai.js' in html.text
    assert '/assets/assistant-ai.js' in html.text
    policy=html.headers['Content-Security-Policy']
    assert 'https://huggingface.co' in policy
    assert 'https://raw.githubusercontent.com' in policy
    assert "'wasm-unsafe-eval'" in policy

def test_paid_inference_routes_are_absent(env):
    mod,*_=env
    c=TestClient(mod.app)
    assert c.get('/api/assistant/status').status_code==404
    assert c.post('/api/assistant/chat',json={'message':'Essai fictif'}).status_code==404
