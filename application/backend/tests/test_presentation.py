"""Presentation access is available only on a newly seeded synthetic database."""
import importlib.util
import os
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient
from test_lab_api import env

SOURCE = Path(__file__).parents[1] / 'presentation.py'
spec = importlib.util.spec_from_file_location('ucp_presentation_factory', SOURCE)
presentation = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = presentation
spec.loader.exec_module(presentation)
ORIGIN = 'http://127.0.0.1'


@pytest.fixture(scope='module')
def demo(tmp_path_factory):
    previous = os.environ.get('UCP_LOCAL_DB')
    try:
        app = presentation.build_presentation(tmp_path_factory.mktemp('presentation') / 'synthetic.sqlite3')
    finally:
        if previous is None:
            os.environ.pop('UCP_LOCAL_DB', None)
        else:
            os.environ['UCP_LOCAL_DB'] = previous
    return app


def test_normal_application_has_no_presentation_access(env):
    app = env[0].app
    with TestClient(app) as client:
        assert client.get('/api/health').json()['presentation'] is False
        assert client.post('/api/presentation/admin', headers={'Origin': 'http://testserver'}).status_code == 404


def test_demo_switch_revokes_prior_session_and_uses_real_authorization(demo):
    with TestClient(demo, base_url=ORIGIN) as client:
        result = client.post('/api/presentation/requester', headers={'Origin': ORIGIN})
        assert result.status_code == 200
        assert result.json()['role'] == 'requester'
        old_token = client.cookies.get('ucp_lab_sid')
        assert len(client.get('/api/projects').json()['items']) == 4
        assert client.get('/api/admin/queue').status_code == 403
        result = client.post('/api/presentation/professional', headers={'Origin': ORIGIN})
        assert result.status_code == 200
        assert result.json()['role'] == 'professional'
        assert len(client.get('/api/my-applications').json()['items']) == 2
        assert client.post('/api/profile', json={}).status_code == 403  # CSRF still required.
        with TestClient(demo, base_url=ORIGIN) as stale:
            stale.cookies.set('ucp_lab_sid', old_token)
            assert stale.get('/api/me').status_code == 401


@pytest.mark.parametrize('origin', [None, 'https://external.example', 'null'])
def test_demo_rejects_missing_or_cross_origin_requests(demo, origin):
    with TestClient(demo, base_url=ORIGIN) as client:
        headers = {} if origin is None else {'Origin': origin}
        assert client.post('/api/presentation/admin', headers=headers).status_code == 403


def test_demo_rejects_remote_client_and_unknown_role(demo):
    with TestClient(demo, base_url=ORIGIN, client=('198.51.100.2', 50000)) as client:
        assert client.post('/api/presentation/admin', headers={'Origin': ORIGIN}).status_code == 403
    with TestClient(demo, base_url=ORIGIN) as client:
        assert client.post('/api/presentation/unknown', headers={'Origin': ORIGIN}).status_code == 404


def test_demo_never_opens_existing_database(tmp_path):
    existing = tmp_path / 'existing.sqlite3'
    existing.write_bytes(b'EXISTING SYNTHETIC DATA')
    with pytest.raises(FileExistsError):
        presentation.build_presentation(existing)
    assert existing.read_bytes() == b'EXISTING SYNTHETIC DATA'


def test_demo_metadata_contains_no_credentials(demo):
    with TestClient(demo, base_url=ORIGIN) as client:
        assert client.get('/api/health').json()['presentation'] is True
        metadata = client.get('/api/presentation').json()
        assert metadata == {'enabled': True, 'synthetic': True, 'roles': ['requester', 'professional', 'admin']}
