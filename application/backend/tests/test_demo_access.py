import pytest
from fastapi.testclient import TestClient
from test_lab_api import env

OLD = 'Fictional-Previous!2026'
NEW = 'Demo-1234'


def make_demo_setup(mod, admin, csrf):
    accounts = {}
    for email, role in [('camille@ucp.test', 'requester'), ('atelier@ucp.test', 'professional')]:
        client = TestClient(mod.app)
        r = client.post('/api/register', json={'email': email, 'role': role, 'name': 'Compte fictif', 'password': OLD})
        assert r.status_code == 201
        login = client.post('/api/login', json={'email': email, 'password': OLD})
        assert login.status_code == 200
        accounts[role] = {'client': client, 'id': login.json()['user_id'], 'email': email}
    return {'mod': mod, 'admin': admin, 'csrf': csrf, 'accounts': accounts}


@pytest.fixture
def demo(env):
    mod, _, _, admin, csrf = env
    return make_demo_setup(mod, admin, csrf)


def payload():
    return {'accounts': [{'email': 'camille@ucp.test', 'alias': 'preview.part', 'password': NEW},
                         {'email': 'atelier@ucp.test', 'alias': 'preview.pro', 'password': NEW}]}


def update(v, body=None):
    return v['admin'].post('/api/admin/demo-access', json=body or payload(), headers={'x-ucp-csrf': v['csrf']})


def exercise_alias_access(v):
    mod = v['mod']
    assert update(v).json() == {'updated': 2}
    for role, alias in [('requester', 'preview.part'), ('professional', 'preview.pro')]:
        old = v['accounts'][role]
        assert old['client'].get('/api/me').status_code == 401
        c = TestClient(mod.app)
        r = c.post('/api/login', json={'email': '  ' + alias.upper() + '  ', 'password': NEW})
        assert r.status_code == 200 and r.json()['role'] == role and r.json()['user_id'] == old['id']
        assert c.get('/api/account/export').json()['user']['login_alias'] == alias
        assert c.post('/api/login', json={'email': old['email'], 'password': NEW}).status_code == 200
        assert c.post('/api/login', json={'email': alias, 'password': OLD}).status_code == 401
    assert v['admin'].get('/api/admin/audit').status_code == 200
    with mod.connect() as c:
        rows = c.execute("SELECT action,target_id FROM audit WHERE action='configure_demo_access'").fetchall()
        assert {r['target_id'] for r in rows} == {a['id'] for a in v['accounts'].values()}


def test_aliases_keep_roles_ids_and_revoke_old_credentials(demo):
    exercise_alias_access(demo)


def exercise_alias_throttle(v):
    assert update(v).status_code == 200
    c = TestClient(v['mod'].app)
    for i in range(4):
        identifier = 'preview.part' if i % 2 else 'camille@ucp.test'
        assert c.post('/api/login', json={'email': identifier, 'password': 'Wrong-demo-password'}).status_code == 401
    assert c.post('/api/login', json={'email': 'preview.part', 'password': 'Wrong-demo-password'}).status_code == 429
    for identifier in ['preview.part', 'camille@ucp.test']:
        assert c.post('/api/login', json={'email': identifier, 'password': NEW}).status_code == 429


def test_alias_and_email_share_login_throttle(demo):
    exercise_alias_throttle(demo)


def test_demo_configuration_requires_admin_and_csrf(demo):
    assert TestClient(demo['mod'].app).post('/api/admin/demo-access', json=payload()).status_code == 401
    assert demo['admin'].post('/api/admin/demo-access', json=payload()).status_code == 403
    pro = demo['accounts']['professional']['client']
    csrf = pro.get('/api/session').json()['csrf']
    assert pro.post('/api/admin/demo-access', json=payload(), headers={'x-ucp-csrf': csrf}).status_code == 403
    with demo['mod'].connect() as c: assert c.execute('SELECT COUNT(*) FROM login_aliases').fetchone()[0] == 0


def test_invalid_configuration_never_echoes_password_or_changes_accounts(demo):
    cases = [payload(), payload(), payload()]
    cases[0]['accounts'][0]['password'] = 'private'
    cases[1]['accounts'][0]['email'] = 'admin@ucp.test'
    cases[2]['accounts'][1]['alias'] = cases[2]['accounts'][0]['alias']
    for body in cases:
        response = update(demo, body)
        assert response.status_code == 422
        assert all(a['password'] not in response.text for a in body['accounts'])
    with demo['mod'].connect() as c: assert c.execute('SELECT COUNT(*) FROM login_aliases').fetchone()[0] == 0


def test_alias_collision_rolls_back_entire_batch(demo):
    with demo['mod'].connect() as c:
        admin_id = c.execute("SELECT id FROM users WHERE role='admin'").fetchone()[0]
        c.execute('INSERT INTO login_aliases(alias,user_id) VALUES(?,?)', ('preview.pro', admin_id))
    assert update(demo).status_code == 409
    for a in demo['accounts'].values():
        assert a['client'].get('/api/me').status_code == 200
        assert a['client'].post('/api/login', json={'email': a['email'], 'password': OLD}).status_code == 200
    with demo['mod'].connect() as c:
        assert c.execute("SELECT COUNT(*) FROM audit WHERE action='configure_demo_access'").fetchone()[0] == 0


def test_audit_failure_preserves_passwords_aliases_sessions_and_resets(demo):
    mod = demo['mod']
    with mod.connect() as c:
        c.execute("CREATE TRIGGER fail_demo_audit BEFORE INSERT ON audit WHEN NEW.action='configure_demo_access' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
        c.execute('INSERT INTO resets VALUES(?,?,?)', ('test-reset-digest', demo['accounts']['requester']['id'], 9999999999))
    admin = TestClient(mod.app, raise_server_exceptions=False)
    r = admin.post('/api/login', json={'email': 'owner@ucp-lab.example', 'password': 'Admin-Long-Test!9326'})
    result = admin.post('/api/admin/demo-access', json=payload(), headers={'x-ucp-csrf': r.json()['csrf']})
    assert result.status_code == 500
    with mod.connect() as c:
        assert c.execute('SELECT COUNT(*) FROM login_aliases').fetchone()[0] == 0
        assert c.execute('SELECT COUNT(*) FROM resets').fetchone()[0] == 1
    for a in demo['accounts'].values():
        assert a['client'].get('/api/me').status_code == 200
        assert a['client'].post('/api/login', json={'email': a['email'], 'password': OLD}).status_code == 200
