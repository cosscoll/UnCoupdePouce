"""A public choice of interface never grants a different account role."""
import pytest
from test_lab_api import env


@pytest.mark.parametrize('role,entry,forbidden_api', [
    ('requester', '/professionnel', '/api/my-applications'),
    ('professional', '/particulier', '/api/v4/drafts'),
])
def test_entry_keeps_authenticated_role(env, role, entry, forbidden_api):
    _, make, *_ = env
    client, _, _ = make(role, 'entry-' + role)
    response = client.get(entry)
    assert response.status_code == 200
    assert 'id="space-requester"' in response.text
    assert client.get('/api/session').json()['role'] == role
    assert client.get(forbidden_api).status_code == 403
