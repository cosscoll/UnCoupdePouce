"""Linked-profile state transitions must explain real effects without restoring withdrawals."""
import pytest
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from test_lab_api import env,setup,approve,project


def exercise_enterprise_effects(mod,owner,requester,other,select):
    enterprise=owner.post('/api/enterprise',json={'label':'Entreprise fictive des effets'});assert enterprise.status_code==201
    eid=enterprise.json()['id']
    member=owner.post('/api/enterprise/artisans',json={'alias':'Equipe fictive plomberie','trades':['plomberie'],'zones':['Toulouse']});assert member.status_code==201
    lid=member.json()['id']
    def mission():
        result=requester.post('/api/projects',json={'title':'Chantier fictif','description':'Chantier fictif de plomberie pour tester les effets du profil.','town':'Toulouse','trade':'plomberie'})
        assert result.status_code==201
        pid=result.json()['id'];r=owner.post(f'/api/projects/{pid}/apply-linked/{lid}');assert r.status_code==201
        return pid,r.json()['id']
    pending_pid,pending=mission();accepted_pid,accepted=mission();closed_pid,closed=mission()
    assert select(accepted).status_code==200;assert select(closed).status_code==200
    assert requester.post(f'/api/projects/{closed_pid}/close').status_code==200
    path=f'/api/enterprise/artisans/{lid}/set-active'
    before=len(requester.get('/api/notifications').json()['items'])
    assert owner.post(path,json={'active':False}).status_code==200
    p=requester.get(f'/api/projects/{pending_pid}/applications').json()['items'][0]
    assert p['status']=='withdrawn'
    assert requester.get(f'/api/projects/{accepted_pid}/applications').json()['items'][0]['status']=='accepted'
    for c in [requester,owner]:assert c.get(f'/api/conversations/{accepted}/messages').status_code==403
    notices=requester.get('/api/notifications').json()['items']
    assert len(notices)==before+2
    assert sum(n['event_type']=='application_withdrawn' and n['entity_id']==pending for n in notices)==1
    assert sum(n['event_type']=='linked_conversation_paused' and n['entity_id']==accepted for n in notices)==1
    assert not any(n['event_type']=='linked_conversation_paused' and n['entity_id']==closed for n in notices)
    assert any(n['event_type']=='linked_profile_paused' and n['entity_id']==lid for n in owner.get('/api/notifications').json()['items'])
    assert not any(n['entity_id'] in [lid,accepted] and n['event_type'].startswith('linked_') for n in other.get('/api/notifications').json()['items'])
    assert owner.post(path,json={'active':False}).status_code==409
    assert requester.get('/api/notifications').json()['items']==notices
    assert owner.post(path,json={'active':True}).status_code==200
    assert requester.get(f'/api/projects/{pending_pid}/applications').json()['items'][0]['status']=='withdrawn'
    assert requester.get(f'/api/conversations/{accepted}/messages').status_code==403  # Still no paid/test access.
    assert any(n['event_type']=='linked_conversation_changed' and n['entity_id']==accepted for n in requester.get('/api/notifications').json()['items'])
    assert any(n['event_type']=='linked_profile_resumed' and n['entity_id']==lid for n in owner.get('/api/notifications').json()['items'])
    with mod.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM audit WHERE action='create_lab_enterprise' AND target_id=?",(eid,)).fetchone()[0]==1
    return lid,pending,accepted


def test_linked_profile_effects_notify_both_parties_without_reviving_withdrawals(setup):
    v=setup;approve(v)
    for key,token in [('pro','pcsrf'),('requester','rcsrf')]:v[key].headers['x-ucp-csrf']=v[token]
    exercise_enterprise_effects(v['mod'],v['pro'],v['requester'],v['other'],lambda aid:v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept'))


def test_enterprise_creation_is_rolled_back_if_audit_cannot_be_written(setup):
    v=setup;approve(v)
    with v['mod'].connect() as c:c.execute("CREATE TRIGGER fail_enterprise_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['pro'].cookies)
        result=v['call'](client,v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise fictive annulée'})
        assert result.status_code==500 and 'controlled audit failure' not in result.text
    assert v['pro'].get('/api/enterprise').json()['enterprise'] is None


@pytest.mark.parametrize('failure',['audit','notification'])
@pytest.mark.parametrize('active',[False,True])
def test_profile_transition_and_withdrawals_roll_back_with_failed_notice_or_audit(setup,failure,active):
    v=setup;approve(v);p=v['pro'];p.headers['x-ucp-csrf']=v['pcsrf']
    assert p.post('/api/enterprise',json={'label':'Entreprise fictive atomique'}).status_code==201
    lid=p.post('/api/enterprise/artisans',json={'alias':'Equipe fictive','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    pid=project(v);aid=p.post(f'/api/projects/{pid}/apply-linked/{lid}').json()['id']
    if active:assert p.post(f'/api/enterprise/artisans/{lid}/set-active',json={'active':False}).status_code==200
    before=p.get('/api/enterprise').json();notices=v['requester'].get('/api/notifications').json()
    table='audit' if failure=='audit' else 'notifications'
    with v['mod'].connect() as c:c.execute(f"CREATE TRIGGER fail_profile_transition BEFORE INSERT ON {table} BEGIN SELECT RAISE(ABORT,'controlled failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(p.cookies)
        result=v['call'](client,v['pcsrf'],'post',f'/api/enterprise/artisans/{lid}/set-active',json={'active':active})
        assert result.status_code==500
    assert p.get('/api/enterprise').json()==before
    assert v['requester'].get('/api/notifications').json()==notices
    assert v['requester'].get(f'/api/projects/{pid}/applications').json()['items'][0]['status']==('withdrawn' if active else 'pending')


def exercise_parallel_pause(mod,p,requester,lid,aid):
    def pause(_):
        with TestClient(mod.app) as c:
            c.cookies.update(p.cookies);c.headers.update(p.headers)
            return c.post(f'/api/enterprise/artisans/{lid}/set-active',json={'active':False}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(pause,[0,1]))==[200,409]
    owner=p.get('/api/notifications').json()['items'];notices=requester.get('/api/notifications').json()['items']
    assert sum(n['event_type']=='linked_profile_paused' and n['entity_id']==lid for n in owner)==1
    assert sum(n['event_type']=='application_withdrawn' and n['entity_id']==aid for n in notices)==1


def test_parallel_same_profile_pause_creates_only_one_transition(setup):
    v=setup;approve(v);p=v['pro'];call=v['call'];mod=v['mod'];p.headers['x-ucp-csrf']=v['pcsrf']
    assert p.post('/api/enterprise',json={'label':'Entreprise fictive concurrente'}).status_code==201
    lid=p.post('/api/enterprise/artisans',json={'alias':'Equipe fictive','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    pid=project(v);aid=p.post(f'/api/projects/{pid}/apply-linked/{lid}').json()['id']
    exercise_parallel_pause(mod,p,v['requester'],lid,aid)


def test_denied_profile_change_does_not_send_notices(setup):
    v=setup;approve(v);p=v['pro'];call=v['call'];mod=v['mod']
    assert call(p,v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise fictive privée'}).status_code==201
    lid=call(p,v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Equipe fictive','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    path=f'/api/enterprise/artisans/{lid}/set-active'
    with mod.connect() as c:before=c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0]
    assert p.post(path,json={'active':False}).status_code==403
    assert call(v['intruder'],v['icsrf'],'post',path,json={'active':False}).status_code==403
    assert call(v['requester'],v['rcsrf'],'post',path,json={'active':False}).status_code==403
    with mod.connect() as c:assert c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0]==before
