"""Authenticated general support: private cases and audited, atomic responses."""
from fastapi.testclient import TestClient
import pytest
from test_lab_api import env,setup

BODY={'subject':'Question sur le compte fictif','category':'account','body':'Je souhaite comprendre le fonctionnement de mon compte de test.'}
REVIEW={'reason':'Examiner cette demande pour une réponse interne.'}
REPLY={'reason':'Votre demande fictive a été examinée. Voici la réponse de recette.'}

def exercise_support_flow(mod,owner,other,admin):
    r=owner.post('/api/v4/support',json=BODY);assert r.status_code==201,r.text
    id=r.json()['id'];review=f'/api/v4/admin/support/{id}/review';resolve=f'/api/v4/admin/support/{id}/resolve'
    assert owner.post('/api/v4/support',json=BODY).status_code==409
    own=next(t for t in owner.get('/api/v4/support').json()['items'] if t['id']==id)
    assert own['status']=='open' and own['body']==BODY['body']
    assert other.get('/api/v4/support').json()['items']==[]
    for route in [review,resolve]:assert other.post(route,json=REVIEW).status_code==403
    assert owner.get('/api/v4/admin/support').status_code==403
    assert admin.post(resolve,json=REPLY).status_code==409
    queued=next(t for t in admin.get('/api/v4/admin/support').json()['items'] if t['id']==id)
    assert set(queued)=={'id','subject','category','status','created_at'}
    assert admin.post(review,json={'reason':' '*20}).status_code==422
    assert admin.post(review,json=REVIEW,headers={'x-ucp-csrf':'incorrect'}).status_code==403
    viewed=admin.post(review,json=REVIEW);assert viewed.status_code==200
    assert viewed.json()['ticket']['body']==BODY['body'] and 'email' not in viewed.json()['ticket']
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='review_support' AND target_id=?",(id,)).fetchone()[0]==1
    assert admin.post(resolve,json=REPLY).status_code==200
    assert admin.post(resolve,json=REPLY).status_code==409
    assert admin.post(review,json=REVIEW).status_code==409
    assert all(t['id']!=id for t in admin.get('/api/v4/admin/support').json()['items'])
    own=next(t for t in owner.get('/api/v4/support').json()['items'] if t['id']==id)
    assert own['status']=='resolved' and own['response']==REPLY['reason'] and own['resolved_at']
    assert other.get('/api/v4/support').json()['items']==[]
    assert other.get('/api/account/export').json()['own_support']==[]
    exported=next(t for t in owner.get('/api/account/export').json()['own_support'] if t['id']==id)
    assert exported['body']==BODY['body'] and 'review_support' not in str(exported)
    notices=[n for n in owner.get('/api/notifications').json()['items'] if n['event_type']=='support_resolved']
    assert len(notices)==1 and REPLY['reason'] not in str(notices)
    assert owner.delete('/api/account').status_code==409


def test_general_support_lifecycle_privacy_audit_and_response(setup):
    v=setup
    for client,key in [(v['requester'],'rcsrf'),(v['other'],'ocsrf'),(v['admin'],'admcsrf')]:client.headers['x-ucp-csrf']=v[key]
    exercise_support_flow(v['mod'],v['requester'],v['other'],v['admin'])
    assert TestClient(v['mod'].app).get('/api/v4/support').status_code==401


def test_support_inputs_and_pagination_are_owner_scoped(setup):
    v=setup;call=v['call']
    for body in [BODY|{'subject':' '*8},BODY|{'body':' '*20},BODY|{'category':'automatic-refund'},BODY|{'body':'a'*2001}]:
        assert call(v['requester'],v['rcsrf'],'post','/api/v4/support',json=body).status_code==422
    assert v['requester'].post('/api/v4/support',json=BODY).status_code==403
    with v['mod'].connect() as db:
        for i in range(53):db.execute('INSERT INTO support_tickets(owner_id,subject,category,body,created_at) VALUES(?,?,?,?,?)',
                                      (v['rid'],f'Demande de pagination {i}','other','Demande entièrement fictive.',v['mod'].now()))
        db.execute('INSERT INTO support_tickets(owner_id,subject,category,body,created_at) VALUES(?,?,?,?,?)',
                   (v['oid'],'Autre demande privée','other','Contenu privé du second compte.',v['mod'].now()))
    page=v['requester'].get('/api/v4/support').json();assert len(page['items'])==50
    old=v['requester'].get('/api/v4/support',params={'before_id':page['next_before_id']}).json();assert len(old['items'])==3 and old['next_before_id'] is None
    assert len({t['id'] for t in page['items']+old['items']})==53
    assert 'second compte' not in str(page)+str(old)
    assert v['requester'].get('/api/v4/support?before_id=0').status_code==422
    assert len(v['admin'].get('/api/v4/admin/support').json()['items'])==50


def test_support_response_and_notice_roll_back_together(setup):
    v=setup;call=v['call']
    id=call(v['requester'],v['rcsrf'],'post','/api/v4/support',json=BODY).json()['id']
    assert call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/support/{id}/review',json=REVIEW).status_code==200
    with v['mod'].connect() as db:
        db.execute("CREATE TRIGGER fail_support_notice BEFORE INSERT ON notifications WHEN NEW.event_type='support_resolved' BEGIN SELECT RAISE(ABORT,'test failure'); END")
    client=TestClient(v['mod'].app,raise_server_exceptions=False);client.cookies.update(v['admin'].cookies)
    assert call(client,v['admcsrf'],'post',f'/api/v4/admin/support/{id}/resolve',json=REPLY).status_code==500
    with v['mod'].connect() as db:
        row=db.execute('SELECT status,response FROM support_tickets WHERE id=?',(id,)).fetchone();assert row['status']=='open' and row['response'] is None
        assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='resolve_support'").fetchone()[0]==0


def test_support_review_never_returns_body_without_audit(setup):
    v=setup;call=v['call'];id=call(v['requester'],v['rcsrf'],'post','/api/v4/support',json=BODY).json()['id']
    with v['mod'].connect() as db:
        db.execute("CREATE TRIGGER fail_support_audit BEFORE INSERT ON audit WHEN NEW.action='review_support' BEGIN SELECT RAISE(ABORT,'test audit failure'); END")
    client=TestClient(v['mod'].app,raise_server_exceptions=False);client.cookies.update(v['admin'].cookies)
    r=call(client,v['admcsrf'],'post',f'/api/v4/admin/support/{id}/review',json=REVIEW)
    assert r.status_code==500 and BODY['body'] not in r.text
    assert call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/support/{id}/resolve',json=REPLY).status_code==409


def test_concurrent_duplicate_support_creates_only_one_case(setup):
    from concurrent.futures import ThreadPoolExecutor
    v=setup
    def create(_):
        with TestClient(v['mod'].app) as c:
            c.cookies.update(v['requester'].cookies)
            return v['call'](c,v['rcsrf'],'post','/api/v4/support',json=BODY)
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(create,range(8)))
    assert sorted(r.status_code for r in results)==[201]+[409]*7
    with v['mod'].connect() as db:
        assert db.execute('SELECT COUNT(*) FROM support_tickets').fetchone()[0]==1
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='support_created'").fetchone()[0]==1
