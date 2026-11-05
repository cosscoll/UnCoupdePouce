from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from test_project_intake import change, env, intake, setup


def suspend(owner, pid, value, version):
    return owner.post(f'/api/projects/{pid}/suspension', json={'suspended':value,'version':version})


def exercise_suspension(owner, candidate, fresh, pid, aid):
    assert candidate.put(f'/api/project-favorites/{pid}').status_code == 200
    assert fresh.post('/api/enterprise',json={'label':'Entreprise fictive suspension'}).status_code == 201
    linked = fresh.post('/api/enterprise/artisans',json={'alias':'Équipe fictive','trades':['plomberie'],'zones':['Toulouse']})
    assert linked.status_code == 201
    assert suspend(fresh,pid,True,0).status_code == 403
    assert suspend(owner,pid,True,0).json() == {'suspended':True,'version':1}
    assert suspend(owner,pid,True,0).status_code == 409
    assert suspend(owner,pid,False,0).status_code == 409
    assert change(owner,pid,True,1).status_code == 409
    assert fresh.get('/api/projects').json()['items'] == []
    assert candidate.get('/api/project-favorites').json()['items'][0]['project'] is None
    assert fresh.get(f'/api/v4/projects/{pid}').status_code == 404
    assert fresh.post(f'/api/projects/{pid}/apply').status_code == 403
    assert fresh.post(f'/api/projects/{pid}/apply-linked/{linked.json()["id"]}').status_code == 403
    assert owner.post(f'/api/applications/{aid}/accept').status_code == 409
    assert owner.post(f'/api/applications/{aid}/reject').status_code == 409
    assert owner.get(f'/api/v4/projects/{pid}').json()['content_editable'] is False
    assert owner.get('/api/projects',params={'status':'open'}).json()['items'] == []
    assert owner.get('/api/projects',params={'status':'suspended'}).json()['items'][0]['id'] == pid
    assert owner.get(f'/api/projects/{pid}/applications').json()['items'][0]['eligible_for_selection'] is False
    tracking = candidate.get('/api/my-applications').json()['items'][0]
    assert (tracking['status'],tracking['project_suspended'],tracking['conversation_state']) == ('pending',1,'project_suspended')

    assert suspend(owner,pid,False,1).json() == {'suspended':False,'version':2}
    assert owner.get(f'/api/projects/{pid}/applications').json()['items'][0]['eligible_for_selection'] is True
    assert fresh.get('/api/projects').json()['items'][0]['id'] == pid
    assert candidate.get('/api/project-favorites').json()['items'][0]['available'] is True
    notices = candidate.get('/api/notifications').json()['items']
    assert [(n['event_type'],n['entity_id']) for n in notices if n['event_type'] in ('project_suspended','project_resumed')] == [
        ('project_resumed',aid),('project_suspended',aid),
    ]


def test_suspend_and_resume_open_project_preserves_pending_application(intake):
    v=intake
    assert suspend(v['other'],v['project'],True,0).status_code == 403
    with TestClient(v['mod'].app) as no_csrf:
        no_csrf.cookies.update(v['requester'].cookies)
        assert suspend(no_csrf,v['project'],True,0).status_code == 403
    exercise_suspension(v['requester'],v['pro'],v['intruder'],v['project'],v['application'])


def test_suspend_selected_project_temporarily_closes_chat_and_rechecks_access_at_resume(intake):
    v=intake
    owner, pro, pid, aid = v['requester'],v['pro'],v['project'],v['application']
    assert owner.post(f'/api/applications/{aid}/accept').status_code == 200
    path=f'/api/conversations/{aid}/messages'
    assert pro.post(path,json={'body':'Message fictif avant suspension.'}).status_code == 201
    assert suspend(owner,pid,True,1).status_code == 200
    for client in (owner,pro):
        assert client.get(path).status_code == 403
        assert client.post(path,json={'body':'Message bloqué pendant la suspension.'}).status_code == 403
        assert client.get('/api/conversations').json()['items'] == []
    assert pro.get(f'/api/v4/projects/{pid}').status_code == 403
    report={'kind':'conversation','target_id':aid,'reason':'Motif fictif pendant la suspension.'}
    assert v['intruder'].post('/api/v4/reports',json=report).status_code == 403
    assert pro.post('/api/v4/reports',json=report).status_code == 201
    assert suspend(owner,pid,False,2).status_code == 200
    assert len(pro.get(path).json()['items']) == 1
    assert pro.get('/api/my-applications').json()['items'][0]['status'] == 'accepted'


def test_resume_preserves_prior_intake_pause_and_cannot_override_moderation(intake):
    v=intake
    owner, pid = v['requester'],v['project']
    assert change(owner,pid,True,0).status_code == 200
    assert suspend(owner,pid,True,1).status_code == 200
    path=f'/api/v4/admin/projects/{pid}/hide'
    assert v['admin'].post(path,json={'value':True,'reason':'Examen fictif de modération.'}).status_code == 200
    assert suspend(owner,pid,False,2).status_code == 409
    assert v['admin'].post(path,json={'value':False,'reason':'Examen fictif terminé.'}).status_code == 200
    assert suspend(owner,pid,False,2).status_code == 200
    detail=owner.get(f'/api/v4/projects/{pid}').json()
    assert (detail['suspended'],detail['applications_paused'],detail['intake_version']) == (0,1,3)
    assert v['pro'].get('/api/projects').json()['items'] == []


def test_cancel_while_suspended_is_final(intake):
    v=intake
    owner, pid = v['requester'],v['project']
    assert suspend(owner,pid,True,0).status_code == 200
    assert owner.post(f'/api/projects/{pid}/cancel').status_code == 200
    assert suspend(owner,pid,False,2).status_code == 409
    detail=owner.get(f'/api/v4/projects/{pid}').json()
    assert (detail['status'],detail['cancelled'],detail['suspended']) == ('closed',1,0)


def test_suspend_and_intake_changes_share_one_revision(intake):
    v=intake
    owner, pid = v['requester'],v['project']

    def attempt(mode):
        with TestClient(v['mod'].app) as client:
            client.cookies.update(owner.cookies)
            client.headers.update(owner.headers)
            return (suspend(client,pid,True,0) if mode=='suspend' else change(client,pid,True,0)).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt,['suspend','pause'])) == [200,409]
    detail=owner.get(f'/api/v4/projects/{pid}').json()
    assert detail['intake_version'] == 1 and detail['suspended']+detail['applications_paused'] == 1
