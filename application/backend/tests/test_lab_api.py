import importlib.util, os, secrets, sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

SRC=Path(__file__).parents[1]/'app.py'

@pytest.fixture
def env(tmp_path,monkeypatch):
    monkeypatch.setenv('UCP_LOCAL_DB',str(tmp_path/'lab.sqlite3'))
    secret=secrets.token_urlsafe(32)
    monkeypatch.setenv('UCP_LOCAL_ADMIN_BOOTSTRAP',secret)
    spec=importlib.util.spec_from_file_location('isolated_ucp_app',SRC)
    mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;spec.loader.exec_module(mod)
    def make_user(role,name):
        client=TestClient(mod.app)
        email=name+'@ucp-lab.example'
        data={'role':role,'email':email,'name':name,'password':'Laboratoire-Test!9326'}
        resp=client.post('/api/register',json=data); assert resp.status_code==201,resp.text
        login=client.post('/api/login',json={'email':email,'password':data['password']})
        assert login.status_code==200,login.text
        return client,login.json()['user_id'],login.json()['csrf']
    def call(client,csrf,method,path,**kw):
        headers=kw.pop('headers',{});return getattr(client,method)(path,headers={'x-ucp-csrf':csrf,**headers},**kw)
    admin_client=TestClient(mod.app)
    r=admin_client.post('/api/admin/bootstrap',json={'secret':secret,'email':'owner@ucp-lab.example','password':'Admin-Long-Test!9326'})
    assert r.status_code==200
    logged=admin_client.post('/api/login',json={'email':'owner@ucp-lab.example','password':'Admin-Long-Test!9326'})
    assert logged.status_code==200
    ad_csrf=logged.json()['csrf']
    return mod,make_user,call,admin_client,ad_csrf

@pytest.fixture
def setup(env):
    mod,make,call,admin,admcsrf=env
    requester,rid,rcsrf=make('requester','demo-occupant')
    other,oid,ocsrf=make('requester','demo-autre')
    pro,pid,pcsrf=make('professional','demo-plombier')
    intruder,iid,icsrf=make('professional','demo-autre-pro')
    for c,csrf,siren,trade in [(pro,pcsrf,'123456782','plomberie'),(intruder,icsrf,'123456790','electricite')]:
        assert call(c,csrf,'post','/api/profile',json={'trade':trade,'town':'Toulouse','siren':siren}).status_code==200
    return locals()

def approve(setup,who='pro',paid=False):
    v=setup;pid=v['pid'] if who=='pro' else v['iid'];cl=v['admin'];token=v['admcsrf'];call=v['call']
    assert call(cl,token,'post',f'/api/admin/professionals/{pid}/approve').status_code==200
    if paid:assert call(cl,token,'post',f'/api/admin/professionals/{pid}/activate-test-subscription').status_code==200

def project(v,trade='plomberie'):
    resp=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json={'title':'Réfection installation','description':'Je souhaite refaire une installation de plomberie.', 'town':'Toulouse','trade':trade})
    assert resp.status_code==201,resp.text
    return resp.json()['id']

def test_health_and_default_admin_blocked(env):
    mod,*_=env
    c=TestClient(mod.app)
    assert c.get('/api/health').json()['production'] is False
    assert c.get('/api/admin/queue').status_code==401
    assert c.post('/api/admin/bootstrap',json={'secret':'wrong'}).status_code==403

def test_duplicate_email_and_invalid_login(env):
    _,make,*_=env
    c,_,_=make('requester','person')
    assert c.post('/api/register',json={'role':'requester','email':'person@ucp-lab.example','name':'person','password':'Laboratoire-Test!9326'}).status_code==409
    assert c.post('/api/login',json={'email':'person@ucp-lab.example','password':'FAUX'}).status_code==401

def test_csrf_and_identity(setup):
    v=setup
    c=v['requester']
    assert c.post('/api/projects',json={'trade':'plomberie','title':'Test projet','description':'Du texte assez long pour validation','town':'Toulouse'}).status_code==403
    assert v['call'](c,v['rcsrf'],'post','/api/projects',json={'trade':'plomberie','title':'123','description':'court','town':'Toulouse'}).status_code==422
    assert c.get('/api/me').json()['email']=='demo-occupant@ucp-lab.example'
    assert c.get('/api/me').headers['x-frame-options']=='DENY'

def test_role_and_matching_unverified(setup):
    v=setup;pid=project(v)
    assert v['pro'].get('/api/projects').json()['items']==[]
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/apply').status_code==403
    approve(v)
    visible=v['pro'].get('/api/projects').json()['items'];assert visible[0]['id']==pid
    assert v['intruder'].get('/api/projects').json()['items']==[]
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/projects/{pid}/apply').status_code==403

def test_unique_application_and_owner_accept(setup):
    v=setup;pid=project(v);approve(v)
    r=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply')
    assert r.status_code==201;app_id=r.json()['id']
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==409
    assert v['other'].get(f'/api/projects/{pid}/applications').status_code==403
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/applications/{app_id}/accept').status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{app_id}/accept').status_code==200
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{app_id}/accept').status_code==409

def test_chat_requires_accept_and_subscription(setup):
    v=setup;pid=project(v);approve(v)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/activate-test-subscription').status_code==200
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==200
    assert v['intruder'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['other'].get(f'/api/conversations/{aid}/messages').status_code==403
    r=v['call'](v['pro'],v['pcsrf'],'post',f'/api/conversations/{aid}/messages',json={'body':'Bonjour, projet fictif.'})
    assert r.status_code==201
    items=v['requester'].get(f'/api/conversations/{aid}/messages').json()['items'];assert len(items)==1
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/suspend').status_code==200
    assert v['requester'].get(f'/api/conversations/{aid}/messages').status_code==403

def test_beta_consent_required_and_not_fake_participant(setup):
    v=setup
    fresh,_,freshcsrf=v['make']('professional','demo-noprofile')
    assert v['call'](fresh,freshcsrf,'post','/api/beta-interest',json={'consent':True,'wants_interview':'yes'}).status_code==409
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/beta-interest',json={'consent':False,'wants_interview':'yes'}).status_code==422
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/beta-interest',json={'consent':True,'wants_interview':'yes'}).status_code==200
    assert v['pro'].get('/api/my-profile').json()['beta']['wants_interview']=='yes'
    assert v['other'].get('/api/admin/queue').status_code==403

def test_profile_change_revokes_approval(setup):
    v=setup;approve(v,paid=True)
    assert v['pro'].get('/api/my-profile').json()['profile']['approved']==1
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'chauffage','town':'Blagnac','siren':'123456782'}).status_code==200
    p=v['pro'].get('/api/my-profile').json()['profile'];assert p['approved']==0 and p['subscription_active']==0

def test_session_logout_and_private_request(setup):
    v=setup
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/logout').status_code==200
    assert v['pro'].get('/api/me').status_code==401
    assert v['other'].get('/api/projects').json()['items']==[]

def test_owner_may_delete_empty_account_only(setup):
    v=setup
    assert v['call'](v['intruder'],v['icsrf'],'delete','/api/account').status_code==200
    pid=project(v)
    assert v['call'](v['requester'],v['rcsrf'],'delete','/api/account').status_code==409

def test_private_admin_queue_and_no_payments(setup):
    v=setup
    queue=v['admin'].get('/api/admin/queue');assert queue.status_code==200 and len(queue.json()['items'])==2
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/activate-test-subscription').status_code==409

def test_cookie_security_attrs_and_origin_protection(setup):
    v=setup;c=v['requester']
    assert any(x.name=='ucp_lab_sid' and x.has_nonstandard_attr('HttpOnly') for x in c.cookies.jar)
    assert v['call'](c,v['rcsrf'],'post','/api/projects',headers={'origin':'https://attacker.example'},json={}).status_code==403


def test_public_host_rejected(env):
    mod,*_=env
    evil=TestClient(mod.app,base_url='https://public-example.invalid')
    assert evil.get('/api/health').status_code==403
    assert evil.get('/').status_code==403

def test_refresh_session_csrf_rotation(setup):
    v=setup;c=v['requester']
    me=c.get('/api/session')
    assert me.status_code==200
    assert me.json()['csrf']!=v['rcsrf']
    assert v['call'](c,v['rcsrf'],'post','/api/projects',json={'title':'Un projet fictif','description':'Demande de peinture pour une pièce imaginaire','town':'Toulouse','trade':'peinture'}).status_code==403
    assert v['call'](c,me.json()['csrf'],'post','/api/projects',json={'title':'Un projet fictif','description':'Demande de peinture pour une pièce imaginaire','town':'Toulouse','trade':'peinture'}).status_code==201

def test_wrong_trade_must_not_apply_even_if_approved(setup):
    v=setup;pid=project(v,'plomberie')
    approve(v,'intruder')
    assert v['intruder'].get('/api/projects').json()['items']==[]
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/projects/{pid}/apply').status_code==403

def test_messages_not_visible_with_other_requester(setup):
    v=setup;pid=project(v);approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept')
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/conversations/{aid}/messages',json={'body':'message espion'}).status_code==403
    assert v['other'].get('/api/conversations').json()['items']==[]

def test_admin_approval_does_not_mean_verified_siren(setup):
    v=setup
    r=v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/approve')
    assert r.status_code==200 and 'simulation' in r.json()['note'].lower()

def test_user_enumeration_does_not_expose_email(setup):
    v=setup
    assert v['requester'].get('/api/admin/queue').status_code==403
    resp=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json={'title':'test','description':'long enough for the endpoint','trade':'inconnu','town':'Toulouse'})
    assert resp.status_code==422

def test_multiple_declared_service_zones_enable_matching(setup):
    v=setup
    # Professional based in Toulouse but explicitly serves Blagnac.
    saved=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456782','service_zones':['Blagnac','Colomiers','toulouse']})
    assert saved.status_code==200,saved.text
    profile=v['pro'].get('/api/my-profile').json()['profile']
    assert len(profile['service_zones'])==3  # duplicate home city ignored
    assert 'Blagnac' in profile['service_zones']
    approve(v)
    data={'title':'Évier à remplacer','description':'Projet entièrement fictif dans une cuisine fictive.', 'town':'Blagnac','trade':'plomberie'}
    one=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=data)
    assert one.status_code==201
    assert any(x['id']==one.json()['id'] for x in v['pro'].get('/api/projects').json()['items'])
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{one.json()["id"]}/apply').status_code==201

def test_service_zone_outside_declared_scope_blocks_applications(setup):
    v=setup
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456782','service_zones':['Blagnac']})
    assert r.status_code==200
    approve(v)
    data={'title':'Toilettes à remplacer','description':'Projet entièrement fictif sans coordonnées privées.', 'town':'Colomiers','trade':'plomberie'}
    new=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=data);assert new.status_code==201
    assert v['pro'].get('/api/projects').json()['items']==[]
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{new.json()["id"]}/apply').status_code==403

def test_reject_oversized_zone_list(setup):
    v=setup
    rs=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456782','service_zones':[f'Commune {i}' for i in range(21)]})
    assert rs.status_code==422

# v3.2: Reserved-domain data minimization, checksum and laboratory analytics.
def test_registration_blocks_real_email_domains(env):
    mod,_,_,_,_=env
    client=TestClient(mod.app)
    for email in ['prospect@gmail.com','artisan@business.fr','owner@company.org']:
        r=client.post('/api/register',json={'role':'professional','email':email,'name':'Artisan fictif', 'password':'Laboratoire-Test!9326'})
        assert r.status_code==422, (email,r.text)
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM users WHERE role='professional'").fetchone()[0]==0


def test_reserved_test_domains_remain_accepted(env):
    mod,_,_,_,_=env
    for domain in ['example','test','invalid']:
        client=TestClient(mod.app)
        r=client.post('/api/register',json={'role':'requester','email':f'fake-user@ucp.{domain}','name':'Utilisateur fictif','password':'Laboratoire-Test!9326'})
        assert r.status_code==201, r.text


def test_bootstrap_admin_real_email_rejected_even_with_secret(env):
    mod,_,_,_,_=env
    client=TestClient(mod.app)
    secret=os.environ['UCP_LOCAL_ADMIN_BOOTSTRAP']
    r=client.post('/api/admin/bootstrap',json={'secret':secret,'email':'realperson@gmail.com','password':'Laboratoire-Test!9326'})
    assert r.status_code==422, r.text


def test_siren_checksum_rejects_invalid_number(setup):
    v=setup
    current=v['pro'].get('/api/my-profile').json()['profile']['siren']
    assert current=='123456782'
    for bad in ['123456783','000000001','abcdefghi','12345678']:
        r=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':bad})
        assert r.status_code==422, (bad,r.text)
    assert v['pro'].get('/api/my-profile').json()['profile']['siren']==current


def test_metrics_admin_only_and_no_real_traction(setup):
    v=setup
    assert v['requester'].get('/api/admin/metrics').status_code==403
    assert v['pro'].get('/api/admin/metrics').status_code==403
    metrics=v['admin'].get('/api/admin/metrics')
    assert metrics.status_code==200
    body=metrics.json()
    assert body['mode']=='LOCAL_TEST_ONLY'
    assert body['real_participants']==0 and body['live_revenue_eur']==0
    assert body['counts']['requesters']==2
    assert body['counts']['professionals']==2
    assert body['counts']['projects']==0
    assert body['counts']['beta_interests']==0


def test_metrics_track_full_workflow_only_as_simulation(setup):
    v=setup
    pid=project(v)
    approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept')
    v['call'](v['pro'],v['pcsrf'],'post',f'/api/conversations/{aid}/messages',json={'body':'Message purement fictif.'})
    v['call'](v['pro'],v['pcsrf'],'post','/api/beta-interest',json={'consent':True,'wants_interview':'yes'})
    body=v['admin'].get('/api/admin/metrics').json()
    assert body['counts']['projects']==1
    assert body['counts']['applications']==1
    assert body['counts']['accepted_applications']==1
    assert body['counts']['messages']==1
    assert body['counts']['beta_interests']==1
    assert body['counts']['demo_subscriptions']==1
    assert body['real_participants']==0 and body['live_revenue_eur']==0


def test_secondary_trades_are_eligible_only_inside_declared_zones(setup):
    v=setup
    changes={'trade':'plomberie','additional_trades':['electricite','chauffage'],
             'town':'Toulouse','service_zones':['Blagnac'],'siren':'123456782'}
    saved=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json=changes)
    assert saved.status_code==200,saved.text
    approve(v)
    def add(town,trade):
        data={'title':'Projet multi métier fictif', 'description':'Travaux de simulation sans données clients', 'town':town,'trade':trade}
        resp=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=data)
        assert resp.status_code==201,resp.text
        return resp.json()['id']
    plumbing=add('Toulouse','plomberie')
    electric=add('Blagnac','electricite')
    heating=add('Toulouse','chauffage')
    carpentry=add('Toulouse','menuiserie')
    outside=add('Colomiers','electricite')
    available={i['id'] for i in v['pro'].get('/api/projects').json()['items']}
    assert available=={plumbing,electric,heating}
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{electric}/apply').status_code==201
    for invalid in [carpentry,outside]:
        assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{invalid}/apply').status_code==403


def test_secondary_trades_validation_and_dedup(setup):
    v=setup
    first={'trade':'plomberie','town':'Toulouse','siren':'123456782',
           'additional_trades':['plomberie','electricite','electricite','chauffage']}
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json=first)
    assert r.status_code==200,r.text
    p=v['pro'].get('/api/my-profile').json()['profile']
    assert p['additional_trades']==['electricite','chauffage']
    for bad in [['unknown'],['plomberie','chauffage','electricite','couverture','peinture','menuiserie'],
                ['plomberie','chauffage','electricite','couverture','peinture','menuiserie','isolation']]:
        r=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={**first,'additional_trades':bad})
        assert r.status_code==422,(bad,r.text)


def test_change_secondary_trades_resets_approval_and_test_subscription(setup):
    v=setup
    approve(v,paid=True)
    saved=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','additional_trades':['electricite'],'town':'Toulouse','siren':'123456782'})
    assert saved.status_code==200
    p=v['pro'].get('/api/my-profile').json()['profile']
    assert p['approved']==0 and p['subscription_active']==0

# v3.3: operational changes must not bypass ownership, state, or chat permissions.
def test_owner_can_edit_open_project_before_applications(setup):
    v=setup; pid=project(v)
    data={'title':'Peinture fictive à Toulouse','description':'Peinture intérieure dans un projet de démonstration uniquement.','trade':'peinture','town':'Toulouse'}
    r=v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=data)
    assert r.status_code==200,r.text
    owned=v['requester'].get('/api/projects').json()['items'][0]
    assert owned['title']==data['title'] and owned['trade']=='peinture'
    assert v['call'](v['other'],v['ocsrf'],'put',f'/api/projects/{pid}',json=data).status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'put',f'/api/projects/{pid}',json=data).status_code==403


def test_edit_prevented_once_pro_has_applied(setup):
    v=setup;pid=project(v);approve(v)
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==201
    attempt=v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json={
        'title':'Projet modifié fictif','description':'On change la description pour tromper le professionnel.','trade':'plomberie','town':'Toulouse'})
    assert attempt.status_code==409


def test_reject_application_removes_selection_option(setup):
    v=setup;pid=project(v);approve(v)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/applications/{aid}/reject').status_code==403
    r=v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/reject')
    assert r.status_code==200 and r.json()['status']=='rejected'
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==409
    assert v['pro'].get('/api/my-applications').json()['items'][0]['status']=='rejected'


def test_withdrawal_is_owner_only_and_final(setup):
    v=setup;pid=project(v);approve(v)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/applications/{aid}/withdraw').status_code==403
    r=v['call'](v['pro'],v['pcsrf'],'post',f'/api/applications/{aid}/withdraw')
    assert r.status_code==200 and r.json()['status']=='withdrawn'
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/applications/{aid}/withdraw').status_code==409
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==409
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==409


def test_close_project_blocks_future_applications_and_chat(setup):
    v=setup;pid=project(v);approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept')
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==200
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/projects/{pid}/close').status_code==403
    r=v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close')
    assert r.status_code==200 and r.json()['chat_access'] is False
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['requester'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==409
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==403


def test_profile_change_invalidates_pending_applications(setup):
    v=setup;pid=project(v);approve(v)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'electricite','town':'Colomiers','siren':'123456782'}).status_code==200
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==409
    assert v['pro'].get('/api/my-applications').json()['items'][0]['status']=='rejected'


def test_own_data_export_excludes_other_people_and_secret_hashes(setup):
    v=setup;pid=project(v)
    result=v['requester'].get('/api/account/export')
    assert result.status_code==200
    body=result.json()
    assert body['user']['role']=='requester' and len(body['own_projects'])==1
    assert 'pw_hash' not in str(body) and 'csrf' not in str(body)
    assert 'demo-autre@ucp-lab.example' not in str(body)
    assert v['pro'].get('/api/account/export').json()['own_projects']==[]
    assert v['admin'].get('/api/account/export').status_code==200


def test_beta_interest_revoke_without_impact_other_profiles(setup):
    v=setup
    v['call'](v['pro'],v['pcsrf'],'post','/api/beta-interest',json={'wants_interview':'yes','consent':True})
    assert v['call'](v['other'],v['ocsrf'],'delete','/api/beta-interest').status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'delete','/api/beta-interest').status_code==200
    assert v['pro'].get('/api/my-profile').json()['beta'] is None
    assert v['pro'].get('/api/my-profile').json()['profile'] is not None


def test_readonly_does_not_modify_user_records(setup):
    v=setup
    r=v['pro'].get('/api/account/export')
    assert r.status_code==200
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/projects',json={}).status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/applications/999/reject').status_code==404

# v3.4: internal notifications, strictly local. No sending of email/push.
def test_notices_on_application_private_and_read_marker(setup):
    v=setup; job=project(v); approve(v)
    assert v['requester'].get('/api/notifications').json()['items']==[]
    application=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply')
    assert application.status_code==201
    req_data=v['requester'].get('/api/notifications').json()
    assert req_data['unread']==1 and req_data['channel']=='LAB_LOCAL_ONLY'
    assert req_data['items'][0]['event_type']=='new_application'
    assert 'email' not in req_data['items'][0]
    nid=req_data['items'][0]['id']
    assert v['other'].get('/api/notifications').json()['items']==[]
    pro_notices=v['pro'].get('/api/notifications').json()['items']
    assert [n['event_type'] for n in pro_notices]==['profile_test_authorized']
    assert all(n['id']!=nid for n in pro_notices)
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/notifications/{nid}/read').status_code==404
    assert v['requester'].get('/api/notifications').json()['unread']==1
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/notifications/{nid}/read').status_code==200
    assert v['requester'].get('/api/notifications').json()['unread']==0
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/notifications/{nid}/read').status_code==200


def test_accept_chat_and_close_notifications_are_private(setup):
    v=setup; job=project(v); approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert v['pro'].get('/api/notifications').json()['items'][0]['event_type']=='application_accepted'
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/conversations/{aid}/messages',json={'body':'Message fictif sans information personnelle.'}).status_code==201
    note=v['requester'].get('/api/notifications').json()['items'][0]
    assert note['event_type']=='new_message'
    assert 'Message fictif sans' not in note['message']
    assert v['other'].get('/api/notifications').json()['items']==[]
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{job}/close').status_code==200
    events=v['pro'].get('/api/notifications').json()
    assert events['items'][0]['event_type']=='project_closed'
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/notifications/read-all').json()['count']==4
    assert v['pro'].get('/api/notifications').json()['unread']==0
    assert v['requester'].get('/api/notifications').json()['unread']==2


def test_reject_and_withdraw_notices_and_owner_export(setup):
    v=setup;approve(v); j1=project(v)
    app1=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{j1}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{app1}/reject').status_code==200
    assert v['pro'].get('/api/notifications').json()['items'][0]['event_type']=='application_rejected'
    j2=project(v)
    app2=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{j2}/apply').json()['id']
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/applications/{app2}/withdraw').status_code==200
    assert v['requester'].get('/api/notifications').json()['items'][0]['event_type']=='application_withdrawn'
    mine=v['requester'].get('/api/account/export').json()['own_notifications']
    others=v['pro'].get('/api/account/export').json()['own_notifications']
    assert len(mine)==3 and len(others)==2
    assert {r['event_type'] for r in others}=={'profile_test_authorized','application_rejected'}
    assert all(r['event_type']!='application_rejected' for r in mine)
    assert all(r['event_type']!='new_application' for r in others)


def test_failed_actions_cannot_enqueue_notifications(setup):
    v=setup;j=project(v)
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{j}/apply').status_code==403
    assert v['requester'].get('/api/notifications').json()['items']==[]
    approve(v)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{j}/apply').json()['id']
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{j}/apply').status_code==409
    assert len(v['requester'].get('/api/notifications').json()['items'])==1
    before=v['pro'].get('/api/notifications').json()
    assert v['call'](v['other'],v['ocsrf'],'post',f'/api/applications/{aid}/accept').status_code==403
    assert v['pro'].get('/api/notifications').json()==before


def test_notification_access_requires_session_and_csrf(env):
    mod,*_=env
    client=TestClient(mod.app)
    assert client.get('/api/notifications').status_code==401
    assert client.post('/api/notifications/read-all').status_code==401

# v3.4 : enterprise manager simulation (one login, linked artisan profiles).
def test_enterprise_creation_requires_approved_professional(setup):
    v=setup
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise Démo Toulouse'})
    assert r.status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/enterprise',json={'label':'Demandeur'}).status_code==403
    approve(v)
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise Démo Toulouse'})
    assert r.status_code==201,r.text
    r=v['pro'].get('/api/enterprise');assert r.status_code==200
    assert r.json()['pricing']['monthly_ht']==20
    assert r.json()['pricing']['billing'].startswith('SIMULATION')
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Deuxième entreprise'}).status_code==409
    assert v['intruder'].get('/api/enterprise').json()['enterprise'] is None


def test_enterprise_billing_is_only_simulated_and_toggle_changes_quantity(setup):
    v=setup;approve(v)
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise Fictive A'}).status_code==201
    artisans=[]
    for ix in range(3):
        res=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
            'alias':f'Équipe fictive {ix+1}', 'trades':['menuiserie'], 'zones':['Blagnac']})
        assert res.status_code==201,res.text
        artisans.append(res.json()['id'])
    r=v['pro'].get('/api/enterprise').json()
    assert r['pricing']['monthly_ht']==65 and r['pricing']['active_artisans']==3
    assert r['pricing']['manager_counted_as_artisan'] is False
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{artisans[1]}/set-active',json={'active':False}).status_code==200
    r=v['pro'].get('/api/enterprise').json()
    assert r['pricing']['monthly_ht']==50 and r['pricing']['active_artisans']==2
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{artisans[1]}/set-active',json={'active':False}).status_code==409
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{artisans[1]}/set-active',json={'active':True}).status_code==200
    assert v['pro'].get('/api/enterprise').json()['pricing']['monthly_ht']==65
    assert v['admin'].get('/api/admin/metrics').json()['live_revenue_eur']==0


def test_linked_professional_matches_trade_and_zone_and_chat_is_private(setup):
    v=setup;approve(v,paid=True)
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise Démo Atelier'}).status_code==201
    linked=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
        'alias':'Menuiserie fictive','trades':['menuiserie','peinture'],'zones':['Blagnac','Toulouse']})
    assert linked.status_code==201;lid=linked.json()['id']
    pr=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json={
        'title':'Portes fictives','description':'Pose de portes dans une habitation absolument fictive.',
        'trade':'menuiserie','town':'Blagnac'})
    assert pr.status_code==201;pid=pr.json()['id']
    visible=v['pro'].get('/api/projects').json()['items']
    assert len(visible)==1 and visible[0]['matching_linked_profile_id']==lid
    assert visible[0]['matching_individual_profile'] is False
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply-linked/{lid}').status_code==201
    apps=v['requester'].get(f'/api/projects/{pid}/applications').json()['items']
    assert len(apps)==1 and apps[0]['linked_artisan_alias']=='Menuiserie fictive'
    aid=apps[0]['id']
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply-linked/{lid}').status_code==409
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==200
    assert v['intruder'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{lid}/set-active',json={'active':False}).status_code==200
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['requester'].get(f'/api/conversations/{aid}/messages').status_code==403


def test_linked_profiles_not_visible_or_mutable_across_companies(setup):
    v=setup;approve(v);approve(v,'intruder')
    v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise A test'})
    v['call'](v['intruder'],v['icsrf'],'post','/api/enterprise',json={'label':'Entreprise B test'})
    linked=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
        'alias':'Artisan A test','trades':['menuiserie'],'zones':['Toulouse']}).json()['id']
    assert v['intruder'].get('/api/enterprise').json()['members']==[]
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==403
    job=project(v,trade='menuiserie')
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/projects/{job}/apply-linked/{linked}').status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply-linked/{linked}').status_code==201


def test_enterprise_validation_and_inactive_scope_blocks_submission(setup):
    v=setup;approve(v)
    v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise test validation'})
    cases=[{'alias':'x','trades':['menuiserie'],'zones':['Toulouse']},
       {'alias':'Mon Atelier','trades':['menuiserie','menuiserie'],'zones':['Toulouse']},
       {'alias':'Mon Atelier','trades':['inconnu'],'zones':['Toulouse']},
       {'alias':'Mon Atelier','trades':['menuiserie'],'zones':['Toulouse','toulouse']}]
    for entry in cases:
        r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json=entry)
        assert r.status_code==422,(entry,r.text)
    linked=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
        'alias':'Mon Atelier test','trades':['menuiserie'],'zones':['Toulouse']}).json()['id']
    job=project(v,trade='menuiserie')
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==200
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply-linked/{linked}').status_code==403
    assert v['pro'].get('/api/projects').json()['items']==[]


def test_enterprise_export_only_shows_own_artisans_and_inactive_chat_marker(setup):
    v=setup; approve(v,paid=True);approve(v,'intruder')
    v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise Export Fictive'})
    lid=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
         'alias':'Faux poseur','trades':['menuiserie'],'zones':['Toulouse']}).json()['id']
    assert v['intruder'].get('/api/account/export').json()['own_enterprise'] is None
    own=v['pro'].get('/api/account/export').json()
    assert own['own_enterprise']['label']=='Entreprise Export Fictive'
    assert len(own['own_linked_artisans'])==1
    job=project(v,trade='menuiserie')
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply-linked/{lid}').json()['id']
    v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept')
    conv=v['requester'].get('/api/conversations').json()['items']
    assert len(conv)==1 and conv[0]['linked_active']==1
    v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{lid}/set-active',json={'active':False})
    conv=v['requester'].get('/api/conversations').json()['items']
    assert conv[0]['linked_active']==0
    assert v['requester'].get(f'/api/conversations/{aid}/messages').status_code==403

# v3.5 — management of local sessions and auditable actions.
def test_other_sessions_can_be_revoked_without_killing_current(env):
    mod,make,call,admin,admcsrf=env
    first,uid,csrf=make('requester','session-user')
    second=TestClient(mod.app)
    login=second.post('/api/login',json={'email':'session-user@ucp-lab.example','password':'Laboratoire-Test!9326'})
    assert login.status_code==200
    sessions=first.get('/api/account/sessions')
    assert sessions.status_code==200 and sessions.json()['active_sessions']==2
    assert 'token' not in str(sessions.json()).lower()
    assert second.get('/api/me').status_code==200
    assert call(first,csrf,'post','/api/account/sessions/revoke-others').json()['revoked']==1
    assert first.get('/api/me').status_code==200
    assert second.get('/api/me').status_code==401
    assert first.get('/api/account/sessions').json()['active_sessions']==1
    assert call(second,login.json()['csrf'],'post','/api/account/sessions/revoke-others').status_code==401


def test_session_revoke_requires_csrf(setup):
    v=setup
    assert v['requester'].post('/api/account/sessions/revoke-others').status_code==403
    assert v['requester'].get('/api/account/sessions').json()['active_sessions']==1
    assert v['admin'].get('/api/account/activity').status_code==200


def test_owner_activity_is_private_and_audit_records_creation(setup):
    v=setup
    assert v['requester'].get('/api/account/activity').json()['items']==[]
    pr=project(v)
    mine=v['requester'].get('/api/account/activity')
    assert mine.status_code==200
    assert any(x['action']=='create_project' and x['target_id']==pr for x in mine.json()['items'])
    assert v['other'].get('/api/account/activity').json()['items']==[]
    approve(v)
    resp=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pr}/apply')
    assert resp.status_code==201
    own=v['pro'].get('/api/account/activity').json()['items']
    assert any(x['action']=='apply_individual' for x in own)
    assert not any(x['action']=='create_project' for x in own)
    assert all('pw_hash' not in x and 'email' not in x for x in mine.json()['items'])


def test_admin_audit_only_and_linked_submission_logged(setup):
    v=setup;approve(v)
    assert v['requester'].get('/api/admin/audit').status_code==403
    assert v['pro'].get('/api/admin/audit').status_code==403
    assert TestClient(v['mod'].app).get('/api/admin/audit').status_code==401
    account=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Structure interne de test'})
    assert account.status_code==201
    linked=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
        'alias':'Poseur fictif', 'trades':['plomberie'], 'zones':['Toulouse']})
    assert linked.status_code==201
    job=project(v)
    r=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply-linked/{linked.json()["id"]}')
    assert r.status_code==201
    records=v['admin'].get('/api/admin/audit')
    assert records.status_code==200
    items=records.json()['items']
    assert any(x['action']=='apply_enterprise' and x['target_id']==r.json()['id'] for x in items)
    assert not any('password' in x or 'email' in x for x in items)


def test_login_throttle_applies_to_existing_and_unknown_accounts(env):
    mod,make,call,admin,admcsrf=env
    client,uid,csrf=make('requester','throttle-user')
    for i in range(4):
        assert client.post('/api/login',json={'email':'throttle-user@ucp-lab.example','password':'Bad!Password'}).status_code==401
    assert client.post('/api/login',json={'email':'throttle-user@ucp-lab.example','password':'Bad!Password'}).status_code==429
    assert client.post('/api/login',json={'email':'throttle-user@ucp-lab.example','password':'Laboratoire-Test!9326'}).status_code==429
    # Existing authenticated sessions remain usable; the lock applies to new login attempts.
    assert client.get('/api/me').status_code==200
    second=TestClient(mod.app)
    for i in range(4):
        assert second.post('/api/login',json={'email':'absent-user@ucp-lab.example','password':'Bad!Password'}).status_code==401
    assert second.post('/api/login',json={'email':'absent-user@ucp-lab.example','password':'Bad!Password'}).status_code==429


def test_successful_login_clears_previous_lab_failures(env):
    mod,make,call,admin,admcsrf=env
    client,uid,csrf=make('requester','reset-throttle')
    bad={'email':'reset-throttle@ucp-lab.example','password':'Bad!Password'}
    assert client.post('/api/login',json=bad).status_code==401
    assert client.post('/api/login',json={**bad,'password':'Laboratoire-Test!9326'}).status_code==200
    import sqlite3
    with sqlite3.connect(str(mod.DB)) as db:
        count=db.execute('SELECT COUNT(*) FROM auth_failures WHERE email=?',(bad['email'],)).fetchone()[0]
    assert count==0

# v3.6: pre-selection privacy and explicit manager-as-artisan seat.
@pytest.mark.parametrize('payload_field,bad_value',[
    ('description','Je cherche un artisan et joignez-moi au 06 12 34 56 78.'),
    ('description','Je cherche un artisan sur https://contact.example/test.'),
    ('description','Merci de répondre à test.personne@ucp-lab.example rapidement.'),
    ('description','Le chantier est au 14 rue des Roses, venez faire un devis.'),
    ('title','Appelez au 06 12 34 56 78'),
    ('town','14 avenue de la Paix'),
])
def test_project_blocks_contact_disclosure_before_selection(setup,payload_field,bad_value):
    v=setup
    data={'title':'Une fuite plomberie', 'description':'Je souhaite refaire une canalisation dans un logement fictif.',
          'town':'Toulouse','trade':'plomberie'}
    data[payload_field]=bad_value
    r=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=data)
    assert r.status_code==422,(payload_field,bad_value,r.text)
    assert v['requester'].get('/api/projects').json()['items']==[]


def test_edit_project_revalidates_contact_and_preserves_original(setup):
    v=setup;pid=project(v)
    data={'title':'Une fuite plomberie', 'description':'Appelez-moi au +33 6 12 34 56 78 pour une visite.',
          'town':'Toulouse','trade':'plomberie'}
    result=v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=data)
    assert result.status_code==422
    items=v['requester'].get('/api/projects').json()['items']
    assert len(items)==1 and items[0]['title']=='Réfection installation'


def test_manager_artisan_explicit_seat_billing_and_suspend(setup):
    v=setup;approve(v,'pro')
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise siège test'})
    assert r.status_code==201
    get=lambda:v['pro'].get('/api/enterprise').json()['pricing']
    assert get()['monthly_ht']==20 and get()['manager_counted_as_artisan'] is False
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/manager-profile',json={'active':True})
    assert r.status_code==200
    assert get()['monthly_ht']==35 and get()['manager_counted_as_artisan'] is True
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/manager-profile',json={'active':True}).status_code==409
    link=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
      'alias':'Menuiserie fictive','trades':['menuiserie'],'zones':['Toulouse']})
    assert link.status_code==201
    assert get()['monthly_ht']==50 and get()['active_artisans']==2
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/suspend').status_code==200
    assert get()['manager_counted_as_artisan'] is False and get()['monthly_ht']==35
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/manager-profile',json={'active':True}).status_code==403
    assert v['intruder'].get('/api/enterprise').json()['enterprise'] is None


def test_profile_update_clears_manager_artisan_seat(setup):
    v=setup;approve(v,'pro')
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Gestionnaire entreprise test'}).status_code==201
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/manager-profile',json={'active':True}).status_code==200
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Blagnac','siren':'123456782'}).status_code==200
    state=v['pro'].get('/api/enterprise').json()
    assert state['pricing']['manager_counted_as_artisan'] is False
    assert state['pricing']['monthly_ht']==20

@pytest.mark.parametrize('field,value',[
  ('name','Appelez-moi au 06 12 34 56 78'),
  ('name','Ecrivez à compte@ucp-lab.example'),
])
def test_registration_public_name_disallows_contact(env,field,value):
    _,make,*_=env
    from fastapi.testclient import TestClient
    mod=env[0];c=TestClient(mod.app)
    p={'email':'demo-propre@ucp-lab.example','name':'Nom de démo',
       'password':'Laboratoire-Test!9326','role':'professional'}
    p[field]=value
    assert c.post('/api/register',json=p).status_code==422


def test_professional_zones_and_linked_alias_do_not_leak_contact(setup):
    v=setup
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/profile',json={
      'trade':'plomberie','town':'Toulouse','siren':'123456782','service_zones':['15 rue des Lilas']})
    assert r.status_code==422
    approve(v,'pro')
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise de démo'}).status_code==201
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
      'alias':'Num 06 12 34 56 78','trades':['plomberie'],'zones':['Toulouse']})
    assert r.status_code==422
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={
      'alias':'Artisan fictif A','trades':['plomberie'],'zones':['15 avenue des Pins']})
    assert r.status_code==422

@pytest.mark.parametrize('field,value',[
  ('title','          '),
  ('town','     '),
  ('description','                                     '),
])
def test_project_all_whitespace_rejected(setup,field,value):
    v=setup
    body={'title':'Projet plomberie fictif',
          'description':'Je voudrais refaire une salle de bain fictive.',
          'town':'Toulouse','trade':'plomberie'}
    body[field]=value
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=body).status_code==422


def test_existing_legacy_contact_information_hidden_from_professional(setup):
    v=setup;approve(v,'pro')
    # Emulate an old v3.5 SQLite row that predates the new input guard.
    with v['mod'].connect() as c:
        c.execute('INSERT INTO projects(requester_id,title,description,trade,town,created_at) VALUES(?,?,?,?,?,?)',
                  (v['rid'],'Projet ancien fictif','Merci de me joindre au 06 12 34 56 78 pour visite.',
                   'plomberie','Toulouse',v['mod'].now()))
        job=c.execute('SELECT id FROM projects ORDER BY id DESC LIMIT 1').fetchone()[0]
    assert v['pro'].get('/api/projects').json()['items']==[]
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{job}/apply').status_code==403
    assert v['requester'].get('/api/projects').json()['items'][0]['id']==job


def test_v35_lab_database_upgrades_seat_column_without_deleting_data(tmp_path,monkeypatch):
    import sqlite3
    db=tmp_path/'existing-v35-lab.sqlite3'
    with sqlite3.connect(db) as c:
        c.execute('''CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,role TEXT NOT NULL,pw_salt TEXT NOT NULL,
            pw_hash TEXT NOT NULL,created_at TEXT NOT NULL)''')
        c.execute('''CREATE TABLE enterprise_accounts(id INTEGER PRIMARY KEY,
            owner_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            label TEXT NOT NULL,created_at TEXT NOT NULL)''')
        c.execute("INSERT INTO users VALUES(1,'demo-legacy@ucp-lab.example','Ancien test','professional','00','00','2026-10-12')")
        c.execute("INSERT INTO enterprise_accounts VALUES(9,1,'Entreprise test v3.5','2026-10-12')")
    monkeypatch.setenv('UCP_LOCAL_DB',str(db))
    name='migration_ucp_v36_lab'
    spec=importlib.util.spec_from_file_location(name,SRC)
    module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    with module.connect() as c:
        row=c.execute('SELECT id,owner_id,label,manager_artisan_active FROM enterprise_accounts').fetchone()
        assert dict(row)=={'id':9,'owner_id':1,'label':'Entreprise test v3.5','manager_artisan_active':0}
        assert c.execute('SELECT COUNT(*) FROM users').fetchone()[0]==1
