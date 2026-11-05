from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from test_project_intake import change, env, intake, setup


def exercise_cancellation(mod, owner, candidate, fresh, pid, aid):
    endpoint = f'/api/projects/{pid}/cancel'
    assert candidate.put(f'/api/project-favorites/{pid}').status_code == 200
    assert fresh.post(endpoint).status_code == 403
    with TestClient(mod.app) as unauthorised:
        unauthorised.cookies.update(owner.cookies)
        assert unauthorised.post(endpoint).status_code == 403

    assert change(owner, pid, True, 0).status_code == 200
    assert owner.post(endpoint).json() == {'ok':True,'status':'closed','cancelled':True,'chat_access':False}
    assert owner.post(endpoint).status_code == 409
    assert owner.post(f'/api/projects/{pid}/close').status_code == 409
    assert change(owner, pid, False, 2).status_code == 409
    assert fresh.post(f'/api/projects/{pid}/apply').status_code == 403
    assert candidate.get('/api/project-favorites').json()['items'][0]['project'] is None
    assert candidate.get(f'/api/v4/projects/{pid}').status_code == 404
    assert not any(p['id']==pid for p in fresh.get('/api/projects').json()['items'])

    detail = owner.get(f'/api/v4/projects/{pid}').json()
    assert (detail['status'],detail['cancelled'],detail['applications_paused'],detail['intake_version']) == ('closed',1,0,2)
    assert detail['content_editable'] is False
    assert [p['id'] for p in owner.get('/api/projects',params={'status':'cancelled'}).json()['items']] == [pid]
    export = owner.get('/api/account/export').json()
    assert next(p for p in export['own_projects'] if p['id']==pid)['cancelled'] == 1
    assert any(a['action']=='cancel_project' and a['target_id']==pid for a in export['own_activity'])
    assert owner.get(f'/api/projects/{pid}/applications').json()['items'][0]['status'] == 'rejected'

    tracking = candidate.get('/api/my-applications').json()['items'][0]
    assert (tracking['status'],tracking['project_cancelled'],tracking['conversation_state']) == ('rejected',1,'closed')
    notices = candidate.get('/api/notifications').json()['items']
    assert [n['entity_id'] for n in notices if n['event_type']=='project_cancelled'] == [aid]
    assert not any(n['event_type']=='project_cancelled' for n in fresh.get('/api/notifications').json()['items'])


def test_cancel_pending_project_revokes_intake_but_keeps_history(intake):
    v = intake
    path = f"/api/projects/{v['project']}/cancel"
    assert v['other'].post(path).status_code == 403
    exercise_cancellation(v['mod'],v['requester'],v['pro'],v['intruder'],v['project'],v['application'])


def test_cancel_selected_project_closes_chat_and_keeps_selection(intake):
    v = intake
    owner, candidate, pid, aid = v['requester'],v['pro'],v['project'],v['application']
    assert owner.post(f'/api/applications/{aid}/accept').status_code == 200
    chat = f'/api/conversations/{aid}/messages'
    assert candidate.post(chat,json={'body':'Message fictif avant annulation.'}).status_code == 201
    assert owner.post(f'/api/projects/{pid}/cancel').status_code == 200
    for client in [owner,candidate]:
        assert client.get(chat).status_code == 403
        assert client.post(chat,json={'body':'Message après annulation.'}).status_code == 403
        assert client.get('/api/conversations').json()['items'] == []
    tracking = candidate.get('/api/my-applications').json()['items'][0]
    assert (tracking['status'],tracking['project_cancelled'],tracking['conversation_state']) == ('accepted',1,'closed')
    assert len(candidate.get('/api/account/export').json()['own_messages']) == 1


def test_close_and_cancel_concurrently_allow_only_one_final_outcome(intake):
    v = intake
    owner, candidate, pid = v['requester'],v['pro'],v['project']

    def attempt(mode):
        with TestClient(v['mod'].app) as client:
            client.cookies.update(owner.cookies)
            client.headers.update(owner.headers)
            return client.post(f'/api/projects/{pid}/{mode}').status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        closed, cancelled = pool.map(attempt,['close','cancel'])
    assert sorted([closed,cancelled]) == [200,409]
    detail = owner.get(f'/api/v4/projects/{pid}').json()
    assert detail['cancelled'] == int(cancelled==200)
    notices = candidate.get('/api/notifications').json()['items']
    assert sum(n['event_type'] in ('project_closed','project_cancelled') for n in notices) == 1


def test_cancel_notification_failure_leaves_project_and_candidate_unchanged(intake):
    v = intake
    with v['mod'].connect() as db:
        db.execute("""CREATE TRIGGER fail_cancel_notice BEFORE INSERT ON notifications
                     WHEN NEW.event_type='project_cancelled'
                     BEGIN SELECT RAISE(ABORT,'injected failure'); END""")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['requester'].cookies)
        client.headers.update(v['requester'].headers)
        assert client.post(f"/api/projects/{v['project']}/cancel").status_code == 500
    detail = v['requester'].get(f"/api/v4/projects/{v['project']}").json()
    assert (detail['status'],detail['cancelled'],detail['intake_version']) == ('open',0,0)
    assert v['pro'].get('/api/my-applications').json()['items'][0]['status'] == 'pending'
