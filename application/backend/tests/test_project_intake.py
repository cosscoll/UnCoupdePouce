"""Pausing intake never withdraws applications or grants private project access."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env, setup, approve, project


@pytest.fixture
def intake(setup):
    v = setup
    for name, token in [('requester','rcsrf'),('other','ocsrf'),('pro','pcsrf'),('intruder','icsrf'),('admin','admcsrf')]:
        v[name].headers['x-ucp-csrf'] = v[token]
    assert v['intruder'].post('/api/profile', json={'trade':'plomberie','town':'Toulouse','siren':'123456790'}).status_code == 200
    approve(v, paid=True); approve(v, who='intruder')
    v['project'] = project(v)
    v['application'] = v['pro'].post(f"/api/projects/{v['project']}/apply").json()['id']
    return v


def change(owner, pid, paused, version):
    return owner.post(f'/api/projects/{pid}/application-intake', json={'paused':paused,'version':version})


def exercise_intake(mod, owner, candidate, fresh, pid, aid):
    assert candidate.put(f'/api/project-favorites/{pid}').status_code == 200
    assert fresh.post('/api/enterprise', json={'label':'Entreprise fictive réception'}).status_code == 201
    lid = fresh.post('/api/enterprise/artisans', json={'alias':'Equipe fictive plomberie','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    assert change(owner, pid, True, 0).json() == {'paused':True,'version':1}
    paused = owner.get(f'/api/v4/projects/{pid}').json()
    assert paused['applications_paused'] == 1 and paused['intake_version'] == 1
    exported=next(p for p in owner.get('/api/account/export').json()['own_projects'] if p['id']==pid)
    assert exported['applications_paused']==1 and exported['intake_version']==1
    assert next(p for p in owner.get('/api/projects').json()['items'] if p['id']==pid)['applications_paused'] == 1
    assert all(p['id'] != pid for p in candidate.get('/api/projects').json()['items'])
    assert candidate.get('/api/project-favorites').json()['items'][0]['project'] is None
    for client in [candidate, fresh]:
        assert client.get(f'/api/v4/projects/{pid}').status_code == 404
        assert client.post(f'/api/projects/{pid}/apply').status_code == 403
    assert fresh.post(f'/api/projects/{pid}/apply-linked/{lid}').status_code == 403
    pending = next(a for a in candidate.get('/api/my-applications').json()['items'] if a['id']==aid)
    assert pending['status'] == 'pending' and pending['project_paused'] == 1
    assert owner.get(f'/api/projects/{pid}/applications').json()['items'][0]['eligible_for_selection'] is True
    notes = candidate.get('/api/notifications').json()['items']
    assert sum(n['event_type']=='project_intake_paused' and n['entity_id']==pid for n in notes) == 1
    assert not any(n['event_type'].startswith('project_intake_') for n in fresh.get('/api/notifications').json()['items'])
    assert change(owner, pid, True, 0).status_code == 409
    assert change(owner, pid, True, 1).status_code == 409
    assert candidate.get('/api/notifications').json()['items'] == notes
    mod.init_db()  # Additive initialization never clears the pause or its revision.
    assert owner.get(f'/api/v4/projects/{pid}').json()['intake_version'] == 1
    assert change(owner, pid, False, 1).json() == {'paused':False,'version':2}
    assert any(p['id']==pid for p in candidate.get('/api/projects').json()['items'])
    assert candidate.get('/api/project-favorites').json()['items'][0]['available'] is True
    assert owner.get(f'/api/projects/{pid}/applications').json()['items'][0]['status'] == 'pending'
    assert change(owner, pid, True, 0).status_code == 409  # Old intent cannot override a pause/resume cycle.
    assert fresh.post(f'/api/projects/{pid}/apply-linked/{lid}').status_code == 201
    notes = candidate.get('/api/notifications').json()['items']
    assert sum(n['event_type']=='project_intake_resumed' and n['entity_id']==pid for n in notes) == 1
    with mod.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM audit WHERE target_id=? AND action IN ('project_intake_paused','project_intake_resumed')", (pid,)).fetchone()[0] == 2


def test_pause_resume_preserves_candidates_and_rechecks_search_favorites_and_both_apply_routes(intake):
    v=intake
    exercise_intake(v['mod'],v['requester'],v['pro'],v['intruder'],v['project'],v['application'])


def test_owner_can_select_a_received_candidate_while_new_intake_is_paused(intake):
    v=intake;pid=v['project'];aid=v['application']
    assert change(v['requester'],pid,True,0).status_code == 200
    assert v['requester'].post(f'/api/applications/{aid}/accept').status_code == 200
    detail=v['requester'].get(f'/api/v4/projects/{pid}').json()
    assert detail['status']=='selected' and detail['applications_paused']==0
    assert change(v['requester'],pid,False,1).status_code == 409
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code == 200


def test_pause_keeps_authorized_existing_conversations_in_multiple_selection_lab(intake,monkeypatch):
    v=intake;pid=v['project'];aid=v['application'];monkeypatch.setattr(v['mod'],'SINGLE_ACCEPT',False)
    assert v['requester'].post(f'/api/applications/{aid}/accept').status_code == 200
    assert change(v['requester'],pid,True,0).status_code == 200
    assert v['pro'].get(f'/api/v4/projects/{pid}').status_code == 200
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code == 200
    assert v['intruder'].get(f'/api/v4/projects/{pid}').status_code == 404


def test_close_paused_project_rejects_pending_candidates_and_cannot_resume(intake):
    v=intake;pid=v['project']
    assert change(v['requester'],pid,True,0).status_code == 200
    assert v['requester'].post(f'/api/projects/{pid}/close').status_code == 200
    detail=v['requester'].get(f'/api/v4/projects/{pid}').json()
    assert detail['status']=='closed' and detail['applications_paused']==0
    assert v['requester'].get(f'/api/projects/{pid}/applications').json()['items'][0]['status']=='rejected'
    assert change(v['requester'],pid,False,2).status_code == 409


def snapshot(v):
    with v['mod'].connect() as c:
        return (tuple(c.execute('SELECT applications_paused,intake_version FROM projects WHERE id=?',(v['project'],)).fetchone()),
                [dict(n) for n in c.execute('SELECT * FROM notifications ORDER BY id')],
                [dict(n) for n in c.execute('SELECT * FROM audit ORDER BY id')])


def test_intake_change_is_owner_only_with_csrf_and_no_denied_side_effect(intake):
    v=intake;pid=v['project'];before=snapshot(v)
    for client in [v['other'],v['pro'],v['admin']]:assert change(client,pid,True,0).status_code==403
    no_csrf=TestClient(v['mod'].app);no_csrf.cookies.update(v['requester'].cookies)
    assert change(no_csrf,pid,True,0).status_code==403
    assert change(v['requester'],99999999,True,0).status_code==404
    assert snapshot(v)==before


@pytest.mark.parametrize('direction',[True,False])
@pytest.mark.parametrize('failure',['notification','audit'])
def test_intake_notifications_state_and_revision_rollback_together(intake,direction,failure):
    v=intake;pid=v['project'];version=0
    if not direction:assert change(v['requester'],pid,True,0).status_code==200;version=1
    event='project_intake_paused' if direction else 'project_intake_resumed'
    table,column=('notifications','event_type') if failure=='notification' else ('audit','action')
    with v['mod'].connect() as c:c.execute(f"CREATE TRIGGER fail_intake BEFORE INSERT ON {table} WHEN NEW.{column}='{event}' BEGIN SELECT RAISE(ABORT,'injected failure'); END")
    before=snapshot(v)
    client=TestClient(v['mod'].app,raise_server_exceptions=False);client.cookies.update(v['requester'].cookies);client.headers['x-ucp-csrf']=v['rcsrf']
    assert change(client,pid,direction,version).status_code==500
    assert snapshot(v)==before


def exercise_parallel_intake(mod,owner,candidate,pid):
    def attempt(_):
        with TestClient(mod.app) as c:
            c.cookies.update(owner.cookies);c.headers.update(owner.headers)
            return change(c,pid,True,0).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:assert sorted(pool.map(attempt,[0,1]))==[200,409]
    assert owner.get(f'/api/v4/projects/{pid}').json()['intake_version']==1
    notes=candidate.get('/api/notifications').json()['items']
    assert sum(n['event_type']=='project_intake_paused' and n['entity_id']==pid for n in notes)==1


def test_concurrent_pause_is_one_transition_and_one_notice(intake):
    v=intake;exercise_parallel_intake(v['mod'],v['requester'],v['pro'],v['project'])


def test_resume_cannot_override_moderation(intake):
    v=intake;pid=v['project']
    assert change(v['requester'],pid,True,0).status_code==200
    assert v['admin'].post(f'/api/v4/admin/projects/{pid}/hide',json={'value':True,'reason':'Examen fictif de modération.'}).status_code==200
    before=snapshot(v)
    assert change(v['requester'],pid,False,1).status_code==409
    assert snapshot(v)==before


def test_intake_payload_rejects_ambiguous_values_without_any_change(intake):
    v=intake;before=snapshot(v);path=f"/api/projects/{v['project']}/application-intake"
    for body in [{'paused':'false','version':0},{'paused':True,'version':-1},{'paused':True},{'paused':True,'version':True},{'paused':True,'version':'0'}]:
        assert v['requester'].post(path,json=body).status_code==422
    assert snapshot(v)==before


def exercise_apply_pause_race(mod,owner,fresh,pid):
    def perform(actor,op):
        with TestClient(mod.app) as c:
            c.cookies.update(actor.cookies);c.headers.update(actor.headers)
            return change(c,pid,True,0).status_code if op=='pause' else c.post(f'/api/projects/{pid}/apply').status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        paused=pool.submit(perform,owner,'pause');applied=pool.submit(perform,fresh,'apply')
        assert paused.result()==200;status=applied.result();assert status in (201,403)
    uid=fresh.get('/api/me').json()['id']
    with mod.connect() as c:
        assert c.execute('SELECT COUNT(*) FROM applications WHERE project_id=? AND professional_id=?',(pid,uid)).fetchone()[0]==int(status==201)
    notes=fresh.get('/api/notifications').json()['items']
    assert sum(n['event_type']=='project_intake_paused' and n['entity_id']==pid for n in notes)==int(status==201)
    assert owner.get(f'/api/v4/projects/{pid}').json()['applications_paused']==1
    assert all(p['id']!=pid for p in fresh.get('/api/projects').json()['items'])


def test_pause_and_new_application_are_serialized_without_losing_candidate_notice(intake):
    v=intake;exercise_apply_pause_race(v['mod'],v['requester'],v['intruder'],v['project'])
