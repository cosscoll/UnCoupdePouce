import time

from fastapi.testclient import TestClient

from test_lab_api import env


PATH = '/api/account/password'
OLD = 'Original-Test-Password!2026'
NEW = 'Replacement-Test-Password!2026'


def account(mod, email, role='requester'):
    client = TestClient(mod.app)
    assert client.post('/api/register', json={'email':email,'name':'Compte fictif','role':role,'password':OLD}).status_code == 201
    uid = sign_in(client, email, OLD).json()['user_id']
    return client, uid


def sign_in(client, email, password):
    response = client.post('/api/login', json={'email':email,'password':password})
    if response.status_code == 200:
        client.headers['x-ucp-csrf'] = response.json()['csrf']
    return response


def exercise_password_change(mod):
    email = 'password-change@ucp.test'
    client, uid = account(mod, email, role='professional')
    second = TestClient(mod.app)
    other, _ = account(mod, 'password-change-other@ucp.test')
    assert sign_in(second, email, OLD).status_code == 200
    token = 'test-only-password-recovery-token'
    with mod.connect() as c:
        c.execute('INSERT INTO resets VALUES(?,?,?)',(mod.hash_token(token),uid,int(time.time())+120))

    body = {'current_password':OLD,'new_password':NEW}
    assert TestClient(mod.app).post(PATH, json=body).status_code == 401
    assert client.post(PATH, json=body, headers={'x-ucp-csrf':'invalid'}).status_code == 403
    invalid = client.post(PATH, json={**body, 'new_password':'hidden'})
    assert invalid.status_code == 422 and 'hidden' not in invalid.text and OLD not in invalid.text
    assert client.post(PATH, json={**body, 'current_password':'Wrong-Password!'}).status_code == 403
    assert client.post(PATH, json={**body, 'new_password':OLD}).status_code == 422

    stale_cookie = client.cookies.get('ucp_lab_sid')
    assert client.post(PATH, json=body).json() == {'ok':True}
    assert client.cookies.get('ucp_lab_sid') is None
    assert client.get('/api/session', headers={'cookie':'ucp_lab_sid='+stale_cookie}).status_code == 401
    assert second.get('/api/session').status_code == 401
    assert other.get('/api/session').status_code == 200
    assert client.post('/api/v4/account/reset', json={'token':token,'password':OLD}).status_code == 400
    assert sign_in(client, email, OLD).status_code == 401
    assert sign_in(client, email, NEW).status_code == 200
    activity = client.get('/api/account/activity').json()['items']
    assert [event['action'] for event in activity] == ['password_changed']
    assert OLD not in str(activity) and NEW not in str(activity)


def test_password_change_revokes_sessions_and_recovery_on_sqlite(env):
    exercise_password_change(env[0])


def test_wrong_password_throttle_is_shared_across_sessions_but_does_not_lock_login(env):
    mod = env[0]
    email = 'change-throttle@ucp.test'
    client, _ = account(mod, email)
    second = TestClient(mod.app)
    assert sign_in(second, email, OLD).status_code == 200
    body = {'current_password':'Wrong-Password!','new_password':NEW}
    for session in [client, second, client, second]:
        assert session.post(PATH, json=body).status_code == 403
    assert client.post(PATH, json=body).status_code == 429
    assert second.post(PATH, json={**body,'current_password':OLD}).status_code == 429
    assert sign_in(TestClient(mod.app), email, OLD).status_code == 200


def test_demo_password_stays_operator_managed(env):
    mod = env[0]
    client, _ = account(mod, 'camille@ucp.test')
    assert client.get('/api/account/sessions').json()['password_change_available'] is False
    assert client.post(PATH, json={'current_password':OLD,'new_password':NEW}).status_code == 403
    assert client.get('/api/session').status_code == 200
