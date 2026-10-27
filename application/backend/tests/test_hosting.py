import base64
import importlib.util
import sys
from pathlib import Path
import pytest
from starlette.requests import Request

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))
from hosting import Hosting


def request(host='ucp.example', scheme='https', headers=None):
    return Request({'type':'http','method':'GET','path':'/','scheme':scheme,
                    'query_string':b'', 'server':(host,443),
                    'headers':[(b'host',host.encode()), *[(k.encode(),v.encode()) for k,v in (headers or {}).items()]]})


def test_staging_requires_persistent_database_and_gate(monkeypatch):
    for key in ('UCP_ALLOWED_HOSTS','UCP_STAGING_PASSWORD','UCP_DATABASE_URL','UCP_LOCAL_ADMIN_BOOTSTRAP'):
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('UCP_ENV','staging')
    with pytest.raises(RuntimeError): Hosting.from_env()
    monkeypatch.setenv('UCP_ALLOWED_HOSTS','ucp.example')
    monkeypatch.setenv('UCP_STAGING_PASSWORD','x'*24)
    with pytest.raises(RuntimeError,match='persistent'): Hosting.from_env()
    monkeypatch.setenv('UCP_DATABASE_URL','postgresql://localhost/fake?sslmode=verify-full')
    assert Hosting.from_env().staging
    monkeypatch.setenv('UCP_LOCAL_ADMIN_BOOTSTRAP','forbidden')
    with pytest.raises(RuntimeError,match='bootstrap'): Hosting.from_env()


def test_gate_covers_all_paths_and_requires_https():
    gate=Hosting(True,frozenset({'ucp.example'}),'test-only-password-0123456789')
    token=base64.b64encode(b'ucp:test-only-password-0123456789').decode()
    headers={'authorization':'Basic '+token}
    assert gate.reject(request()).status_code==401
    assert gate.reject(request(headers={'authorization':'Basic !!!'})).status_code==401
    assert gate.reject(request(scheme='http',headers=headers)).status_code==403
    assert gate.reject(request(host='attacker.example',headers=headers)).status_code==403
    assert gate.reject(request(headers=headers)) is None
    assert gate.reject(request(headers={**headers,'content-length':'7000000'})).status_code==413


def test_local_gate_remains_loopback_only():
    gate=Hosting(False,frozenset(),'')
    assert gate.reject(request(host='testserver',scheme='http')) is None
    assert gate.reject(request()).status_code==403


def test_commercial_production_disabled(monkeypatch):
    monkeypatch.setenv('UCP_ENV','production')
    with pytest.raises(RuntimeError): Hosting.from_env()
