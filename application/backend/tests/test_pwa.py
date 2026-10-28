"""PWA resources stay gated, no-store and same-origin; no offline user-data cache."""
import io
from PIL import Image
from test_lab_api import env


def test_pwa_routes_manifest_icons_and_headers(env):
    mod,*_=env
    from fastapi.testclient import TestClient
    c=TestClient(mod.app)
    html=c.get('/').text
    assert 'crossorigin="use-credentials"' in html and '/manifest.webmanifest' in html
    result=c.get('/manifest.webmanifest');assert result.status_code==200
    assert 'application/manifest+json' in result.headers['content-type']
    assert result.headers['cache-control']=='no-store'
    manifest=result.json()
    assert manifest['id']=='/' and manifest['scope']=='/' and manifest['start_url']=='/'
    assert manifest['display']=='standalone' and 'Préproduction' in manifest['name']
    assert {i['sizes'] for i in manifest['icons']}=={'192x192','512x512'}
    for icon in manifest['icons']:
        assert icon['src'].startswith('/assets/icons/')
        image=c.get(icon['src']);assert image.status_code==200
        assert image.headers['cache-control']=='no-store'
        im=Image.open(io.BytesIO(image.content));expected=tuple(map(int,icon['sizes'].split('x')))
        assert im.size==expected and im.format=='PNG'
    sw=c.get('/ucp-sw.js');assert sw.status_code==200
    assert sw.headers['service-worker-allowed']=='/' and sw.headers['cache-control']=='no-store'
    assert 'javascript' in sw.headers['content-type']
    assert "worker-src 'self'" in sw.headers['content-security-policy']
    assert "manifest-src 'self'" in sw.headers['content-security-policy']


def test_pwa_resources_do_not_bypass_staging_gate(env,monkeypatch):
    from hosting import Hosting
    from fastapi.testclient import TestClient
    mod,*_=env
    monkeypatch.setattr(mod,'HOSTING',Hosting(True,frozenset({'ucp.example'}),'fictitious-staging-only-0123456789'))
    c=TestClient(mod.app,base_url='https://ucp.example')
    for path in ['/','/manifest.webmanifest','/ucp-sw.js','/assets/pwa.js','/assets/icons/icon-192.png']:
        denied=c.get(path);assert denied.status_code==401 and denied.headers['cache-control']=='no-store'
        assert c.get(path,auth=('ucp','fictitious-staging-only-0123456789')).status_code==200
