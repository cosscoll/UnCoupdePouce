"""Real SQL integration. Set UCP_TEST_POSTGRES_URL for an EMPTY test database.

Every test uses a fresh private schema and removes only that schema afterwards.
Never point this variable at a production database.
"""
import importlib.util
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT))

@pytest.fixture
def pg(monkeypatch):
    url=os.getenv('UCP_TEST_POSTGRES_URL')
    if not url: pytest.skip('UCP_TEST_POSTGRES_URL not configured')
    import psycopg
    from psycopg import sql
    schema='ucp_test_'+secrets.token_hex(8)
    monkeypatch.setenv('UCP_DATABASE_URL',url)
    monkeypatch.setenv('UCP_DATABASE_SCHEMA',schema)
    monkeypatch.setenv('UCP_ENV','local')
    monkeypatch.setenv('UCP_LOCAL_ADMIN_BOOTSTRAP','test-bootstrap-only-0123456789')
    spec=importlib.util.spec_from_file_location('ucp_pg_'+schema,ROOT/'app.py')
    mod=importlib.util.module_from_spec(spec); sys.modules[spec.name]=mod
    try:
        spec.loader.exec_module(mod)
        yield mod
    finally:
        with psycopg.connect(url,autocommit=True) as c:
            c.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(schema)))
        sys.modules.pop(spec.name,None)


def client_for(mod,email,role):
    c=TestClient(mod.app)
    data={'email':email,'name':'Compte fictif','role':role,'password':'Fictif-Long-Test!9326'}
    assert c.post('/api/register',json=data).status_code==201
    r=c.post('/api/login',json={'email':email,'password':data['password']})
    assert r.status_code==200,r.text
    c.headers['x-ucp-csrf']=r.json()['csrf']
    return c,r.json()['user_id']


def test_postgres_full_journey_persistence_and_confidentiality(pg):
    admin=TestClient(pg.app)
    assert admin.post('/api/admin/bootstrap',json={'secret':'test-bootstrap-only-0123456789','email':'admin@ucp.test','password':'Fictif-Long-Test!9326'}).status_code==200
    r=admin.post('/api/login',json={'email':'admin@ucp.test','password':'Fictif-Long-Test!9326'})
    admin.headers['x-ucp-csrf']=r.json()['csrf']
    requester,rid=client_for(pg,'requester@ucp.test','requester')
    pro,pid=client_for(pg,'artisan@ucp.test','professional')
    other,_=client_for(pg,'other@ucp.test','requester')
    assert pro.post('/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456782'}).status_code==200
    r=requester.post('/api/projects',json={'title':'Salle de bain fictive','description':'Remplacer un lavabo dans une salle de bain fictive.','trade':'plomberie','town':'Toulouse','budget_min':1200,'budget_max':2500})
    assert r.status_code==201,r.text
    project_id=r.json()['id']
    assert pro.get('/api/projects').json()['items']==[]
    assert admin.post(f'/api/admin/professionals/{pid}/approve').status_code==200
    assert pro.get('/api/projects').json()['items'][0]['id']==project_id
    listing=pro.get('/api/projects',params={'q':'SALLE bain','town':'Toulouse','trade':'plomberie','timing':'flexible','published_within':7,'sort':'oldest'}).json()['items']
    assert listing[0]['id']==project_id and listing[0]['match']['trades']==['plomberie']
    assert (listing[0]['budget_min'],listing[0]['budget_max'])==(1200,2500)
    assert pro.get('/api/projects',params={'budget_from':3000}).json()['items']==[]
    assert pro.get('/api/projects',params={'town':'Paris'}).json()['items']==[]
    r=pro.post(f'/api/projects/{project_id}/apply');assert r.status_code==201,r.text
    aid=r.json()['id']
    assert pro.post(f'/api/projects/{project_id}/apply').status_code==409
    path=f'/api/conversations/{aid}/messages'
    assert pro.get(path).status_code==403
    assert other.post(f'/api/applications/{aid}/accept').status_code==403
    assert requester.post(f'/api/applications/{aid}/accept').status_code==200
    assert pro.get(path).status_code==403
    assert pro.get('/api/my-applications').json()['items'][0]['conversation_state']=='test_access_required'
    assert admin.post(f'/api/admin/professionals/{pid}/activate-test-subscription').status_code==200
    assert pro.get('/api/my-applications').json()['items'][0]['conversation_state']=='available'
    for _ in range(2):
        r=pro.post(path,json={'body':'Bonjour, échange fictif.'},headers={'Idempotency-Key':'test-retry-1234567890'})
        assert r.status_code==201,r.text
    assert len(requester.get(path).json()['items'])==1
    assert other.get(path).status_code==403
    # Separate SQL connection sees committed records and hashed sessions.
    with pg.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==1
        assert len(db.execute('SELECT token_hash FROM sessions').fetchone()[0])==64
    # Reinitialization does not erase data or reset the catalog.
    pg.init_db()
    assert len(requester.get(path).json()['items'])==1
    assert requester.post('/api/projects',json={'title':'Autre demande fictive','description':'Une demande fictive suffisamment longue.','trade':'plomberie','town':'Toulouse'}).status_code==201
    assert requester.post('/api/account/sessions/revoke-others').status_code==200
    assert pro.post('/api/enterprise',json={'label':'Entreprise fictive'}).status_code==201
    linked=pro.post('/api/enterprise/artisans',json={'alias':'Equipe fictive','trades':['plomberie'],'zones':['Toulouse']})
    assert linked.status_code==201,linked.text
    assert pro.get('/api/enterprise').json()['members'][0]['id']==linked.json()['id']
    second=next(p['id'] for p in requester.get('/api/projects').json()['items'] if p['status']=='open')
    assert pro.post(f'/api/projects/{second}/apply-linked/{linked.json()["id"]}').status_code==201
    assert pro.post(f'/api/projects/{second}/apply-linked/{linked.json()["id"]}').status_code==409
    assert pro.post(f'/api/enterprise/artisans/{linked.json()["id"]}/set-active',json={'active':False}).status_code==200
    candidate=requester.get(f'/api/projects/{project_id}/applications').json()['items'][0]
    assert candidate['trades']==['plomberie'] and candidate['verification_status']=='test_authorized'
    assert 'siren' not in candidate and 'subscription_active' not in candidate
    from test_reports import exercise_report_flow
    exercise_report_flow(pg,admin,requester,pro,other,aid)
    from test_support_cases import exercise_support_flow
    exercise_support_flow(pg,requester,other,admin)
    assert admin.post(f'/api/admin/professionals/{pid}/suspend').status_code==200
    assert requester.get(path).status_code==403
    assert next(x for x in pro.get('/api/my-applications').json()['items'] if x['id']==aid)['conversation_state']=='unavailable'


def test_postgres_drafts_and_private_photos(pg):
    from PIL import Image
    import base64,io
    requester,_=client_for(pg,'draft@ucp.test','requester')
    body={'title':'Peinture fictive','description':'Repeindre un mur dans un logement fictif.','town':'Toulouse','trades':['peinture'],'timing':'month','version':0}
    r=requester.post('/api/v4/drafts',json=body);assert r.status_code==201,r.text
    did=r.json()['id']
    b=io.BytesIO();Image.new('RGB',(20,20),'orange').save(b,'PNG')
    r=requester.post(f'/api/v4/drafts/{did}/photos',json={'data':base64.b64encode(b.getvalue()).decode()})
    assert r.status_code==201,r.text
    photo=r.json()['id']
    assert requester.get(f'/api/v4/photos/{photo}').status_code==200
    assert TestClient(pg.app).get(f'/api/v4/photos/{photo}').status_code==401
    body['version']=2
    r=requester.post(f'/api/v4/drafts/{did}/publish',json={'version':2})
    assert r.status_code==201,r.text
    assert requester.post(f'/api/v4/drafts/{did}/publish',json={'version':2}).json()['id']==r.json()['id']


def test_postgres_constraints_rollback_and_schema_protection(pg):
    from postgres import Connection
    with pg.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute("INSERT INTO taxonomy VALUES(?,?,?,?,?)",('duplicate','Test','Test','[]',1))
        with pytest.raises(sqlite3.IntegrityError):
            db.execute("INSERT INTO taxonomy VALUES(?,?,?,?,?)",('duplicate','Test','Test','[]',1))
        db.rollback()
        assert db.execute('SELECT id FROM taxonomy WHERE id=?',('duplicate',)).fetchone() is None
        tables=db.raw.execute('SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname=%s AND relkind=\'r\'',(pg.DATABASE_SCHEMA,)).fetchall()
        assert tables and all(r['relrowsecurity'] for r in tables)
        assert db.raw.execute("SELECT count(*) FROM pg_namespace n, LATERAL aclexplode(n.nspacl) a WHERE n.nspname=%s AND a.grantee=0",(pg.DATABASE_SCHEMA,)).fetchone()[0] == 0
    with pytest.raises(ValueError): Connection(os.environ['UCP_DATABASE_URL'],'public')


def test_staging_https_gate_cookies_and_origin(pg,monkeypatch):
    from hosting import Hosting
    monkeypatch.setattr(pg,'HOSTING',Hosting(True,frozenset({'ucp.example'}),'fictif-staging-password-0123456789'))
    guest=TestClient(pg.app,base_url='https://ucp.example')
    assert guest.get('/').status_code==401
    assert guest.get('/assets/app.js').status_code==401
    guest.auth=('ucp','fictif-staging-password-0123456789')
    assert guest.get('/api/health').json()['storage']=='postgresql'
    assert guest.post('/api/register',json={'name':'Staging fictif','email':'staging@ucp.test','role':'requester','password':'Fictif-Long-Test!9326'}).status_code==201
    r=guest.post('/api/login',json={'email':'staging@ucp.test','password':'Fictif-Long-Test!9326'})
    assert r.status_code==200
    assert 'Secure' in r.headers['set-cookie'] and 'HttpOnly' in r.headers['set-cookie']
    assert guest.get('/api/me').status_code==200
    assert guest.post('/api/logout',headers={'x-ucp-csrf':r.json()['csrf'],'origin':'https://attacker.example'}).status_code==403
    assert guest.get('/',headers={'host':'attacker.example'}).status_code==403


def test_staging_demo_seed_uses_private_gate(pg,monkeypatch):
    from hosting import Hosting
    monkeypatch.setattr(pg,'HOSTING',Hosting(True,frozenset({'ucp.example'}),'fictif-staging-password-0123456789'))
    monkeypatch.setitem(sys.modules,'app',pg)
    spec=importlib.util.spec_from_file_location('ucp_demo_test',ROOT/'demo.py')
    demo=importlib.util.module_from_spec(spec);spec.loader.exec_module(demo)
    password=demo.seed()
    assert len(password)>=24
    with pg.connect() as c:
        assert c.execute('SELECT COUNT(*) FROM users').fetchone()[0]==3
        assert c.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==1
    with pytest.raises(ValueError,match='Base non vide'): demo.seed()


def test_first_staging_start_seeds_once_and_preserves_accounts(pg,monkeypatch):
    from hosting import Hosting
    monkeypatch.setenv('UCP_DEMO_SEED_PASSWORD','Fictional-bootstrap-only!0123456789')
    monkeypatch.setattr(Hosting,'from_env',classmethod(lambda cls: Hosting(True,frozenset({'ucp.example'}),'fictif-staging-password-0123456789')))
    for i in range(2):
        name='ucp_bootstrap_test_'+str(i)
        spec=importlib.util.spec_from_file_location(name,ROOT/'app.py')
        mod=importlib.util.module_from_spec(spec);sys.modules[name]=mod
        try:
            spec.loader.exec_module(mod)
            with mod.connect() as c:
                assert c.execute('SELECT COUNT(*) FROM users').fetchone()[0]==3
                assert c.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==1
        finally:
            sys.modules.pop(name,None)


def test_hosted_ipv4_keeps_tls_hostname(monkeypatch):
    import postgres
    seen={}
    class Raw:
        def execute(self,*a,**k): pass
    def connect(url,**options):
        seen.update(url=url,options=options)
        return Raw()
    monkeypatch.setenv('VERCEL','1')
    monkeypatch.setattr(postgres.socket,'getaddrinfo',lambda *args:[(2,1,6,'',('192.0.2.15',5432)),(2,1,6,'',('192.0.2.16',5432))])
    monkeypatch.setattr(postgres.psycopg,'connect',connect)
    original='postgresql://fictional:unused@db.example/test?sslmode=verify-full'
    postgres.Connection(original,'ucp_test_transport')
    assert seen['url']==original  # DNS host remains available for TLS certificate verification.
    assert seen['options']['hostaddr']=='192.0.2.15'


def test_database_diagnostic_never_exposes_credentials(monkeypatch):
    import postgres
    monkeypatch.delenv('VERCEL',raising=False)
    password='Fictional-secret-should-not-be-logged'
    def fail(*args,**kwargs):
        raise postgres.psycopg.OperationalError('connection rejected for fictional-user password='+password)
    monkeypatch.setattr(postgres.psycopg,'connect',fail)
    with pytest.raises(RuntimeError) as exc:
        postgres.Connection('postgresql://fictional-user:'+password+'@db.example/test','ucp_test_diagnostic')
    assert password not in str(exc.value)
    assert 'fictional-user' not in str(exc.value)
    assert '[redacted]' in str(exc.value)
