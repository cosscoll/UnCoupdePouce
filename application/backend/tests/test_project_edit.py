"""Published content uses an owner-only revision separate from application intake."""
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from test_lab_api import approve, env, project, setup


EDIT = {
    'title': 'Modification fictive',
    'description': 'Une nouvelle description fictive pour le chantier de plomberie.',
    'trade': 'plomberie',
    'town': 'Toulouse',
}


def owner_client(v):
    v['requester'].headers['x-ucp-csrf'] = v['rcsrf']
    return v['requester']


def edit_snapshot(mod, pid):
    with mod.connect() as db:
        row = db.execute('SELECT title,description,trade,trades_json,town,budget_min,budget_max,content_version FROM projects WHERE id=?', (pid,)).fetchone()
        edits = db.execute("SELECT COUNT(*) FROM audit WHERE target_id=? AND action='edit_project'", (pid,)).fetchone()[0]
    return tuple(row), edits


def exercise_two_windows(mod, owner, pid):
    path = f'/api/projects/{pid}'
    detail = f'/api/v4/projects/{pid}'
    first_session = owner.get('/api/session').json()
    assert owner.get(detail).json()['content_version'] == 0

    with TestClient(mod.app) as other_window:
        other_window.cookies.update(owner.cookies)
        other_window.headers.update(owner.headers)
        assert other_window.get('/api/session').json()['csrf'] == first_session['csrf']
        other_version = other_window.get(detail).json()['content_version']
        response = owner.put(path, json=EDIT | {'content_version': 0, 'budget_min': 450})
        assert response.status_code == 200, response.text
        assert response.json()['content_version'] == 1
        saved = edit_snapshot(mod, pid)

        conflict = other_window.put(path, json=EDIT | {
            'content_version': other_version, 'title': 'Ancienne fenêtre fictive', 'budget_min': 120,
        })
        assert conflict.status_code == 409
        assert conflict.json()['detail']['code'] == 'project_content_conflict'
        assert edit_snapshot(mod, pid) == saved
        current = other_window.get(detail).json()
        assert (current['title'], current['budget_min'], current['content_version']) == (EDIT['title'], 450, 1)

        saved_again = other_window.put(path, json=EDIT | {
            'content_version': current['content_version'], 'title': 'Modification relue fictive',
        })
        assert saved_again.json()['content_version'] == 2
    assert edit_snapshot(mod, pid)[1] == 2


def test_second_window_cannot_replace_newer_edit(setup):
    exercise_two_windows(setup['mod'], owner_client(setup), project(setup))


def test_legacy_project_gets_content_version_without_touching_existing_fields(setup):
    v = setup
    pid = project(v)
    detail = f'/api/v4/projects/{pid}'
    owner = owner_client(v)
    before = owner.get(detail).json()
    with v['mod'].connect() as db:
        db.execute('ALTER TABLE projects DROP COLUMN content_version')
    v['mod'].init_db()
    assert owner.get(detail).json() == before
    assert owner.put(f'/api/projects/{pid}', json=EDIT | {'content_version': 0}).status_code == 200
    v['mod'].init_db()
    assert owner.get(detail).json()['content_version'] == 1


def test_version_and_project_are_owner_scoped_and_invalid_versions_have_no_effect(setup):
    v = setup
    pid = project(v)
    path = f'/api/projects/{pid}'
    detail = f'/api/v4/projects/{pid}'
    owner = owner_client(v)
    approve(v)
    assert 'content_version' not in v['pro'].get(detail).json()
    assert v['other'].get(detail).status_code == 404
    before = edit_snapshot(v['mod'], pid)
    for body in [EDIT, *(EDIT | {'content_version': invalid} for invalid in (-1, '0', True, None, 0.5))]:
        assert owner.put(path, json=body).status_code == 422
    forbidden = v['call'](v['other'], v['ocsrf'], 'put', path, json=EDIT | {'content_version': 0})
    assert forbidden.status_code == 403
    assert edit_snapshot(v['mod'], pid) == before


def test_moderation_classification_invalidates_old_content_but_pause_does_not(setup):
    v = setup
    pid = project(v, trade='inconnu')
    path = f'/api/projects/{pid}'
    owner = owner_client(v)
    assert owner.post(path+'/application-intake', json={'paused': True, 'version': 0}).status_code == 200
    detail = f'/api/v4/projects/{pid}'
    assert owner.get(detail).json()['content_version'] == 0
    classified = v['call'](v['admin'], v['admcsrf'], 'post', f'/api/v4/admin/projects/{pid}/classify',
                           json={'trades': ['plomberie', 'electricite'], 'reason': 'Classement fictif de recette'})
    assert classified.status_code == 200
    assert owner.put(path, json=EDIT | {'content_version': 0, 'trade': 'inconnu'}).status_code == 409
    latest = owner.get(detail).json()
    assert set(latest['trades']) == {'plomberie', 'electricite'}
    assert (latest['content_version'], latest['intake_version']) == (1, 1)


def test_audit_failure_rolls_back_all_content_and_revision(setup):
    v = setup
    pid = project(v)
    before = edit_snapshot(v['mod'], pid)
    with v['mod'].connect() as db:
        db.execute("""CREATE TRIGGER fail_edit_audit BEFORE INSERT ON audit
                      WHEN NEW.action='edit_project' BEGIN SELECT RAISE(ABORT,'injected failure'); END""")
    with TestClient(v['mod'].app, raise_server_exceptions=False) as client:
        client.cookies.update(owner_client(v).cookies)
        client.headers.update(v['requester'].headers)
        assert client.put(f'/api/projects/{pid}', json=EDIT | {'content_version': 0, 'trade': 'electricite'}).status_code == 500
    assert edit_snapshot(v['mod'], pid) == before


def exercise_concurrent_application(mod, owner, candidate, pid):
    path = f'/api/projects/{pid}'
    title = 'Modification pendant la candidature'
    with ThreadPoolExecutor(max_workers=2) as pool:
        edited = pool.submit(owner.put, path, json=EDIT | {'content_version': 0, 'title': title})
        applied = pool.submit(candidate.post, path+'/apply')
        edit_result, apply_result = edited.result(), applied.result()
    assert apply_result.status_code == 201, apply_result.text
    assert edit_result.status_code == 200, edit_result.text
    detail = owner.get(f'/api/v4/projects/{pid}').json()
    assert detail['content_editable'] is True and detail['content_scope_locked'] is True
    assert detail['content_version'] == 1 and detail['title'] == title
    aid = apply_result.json()['id']
    with mod.connect() as db:
        events = [r['action'] for r in db.execute(
            """SELECT action FROM audit WHERE (action='edit_project' AND target_id=?)
            OR (action='apply_individual' AND target_id=?) ORDER BY id""",(pid,aid))]
    assert len(events) == 2
    notices = [n for n in candidate.get('/api/notifications').json()['items'] if n['event_type']=='project_updated']
    assert len(notices) == int(events[0]=='apply_individual') == edit_result.json()['notified']


def test_edit_and_incoming_application_are_serialized(setup):
    v = setup
    approve(v)
    v['pro'].headers['x-ucp-csrf'] = v['pcsrf']
    exercise_concurrent_application(v['mod'], owner_client(v), v['pro'], project(v))


def test_project_closed_during_edit_stays_unmodified(setup):
    v = setup
    pid = project(v)
    owner = owner_client(v)
    path = f'/api/projects/{pid}'
    assert owner.post(path+'/close').status_code == 200
    before = edit_snapshot(v['mod'], pid)
    assert owner.put(path, json=EDIT | {'content_version': 0}).status_code == 409
    assert edit_snapshot(v['mod'], pid) == before


def test_only_pending_candidates_get_one_notice_and_project_scope_stays_fixed(setup):
    v = setup
    owner = owner_client(v)
    approve(v)
    approve(v,'intruder')
    pro, intruder = v['pro'], v['intruder']
    pro.headers['x-ucp-csrf'] = v['pcsrf']
    intruder.headers['x-ucp-csrf'] = v['icsrf']
    assert intruder.post('/api/enterprise',json={'label':'Entreprise fictive UCP'}).status_code == 201
    linked = intruder.post('/api/enterprise/artisans',json={
        'alias':'Profil lié fictif','trades':['plomberie'],'zones':['Toulouse']})
    assert linked.status_code == 201, linked.text
    pid = project(v)
    path = f'/api/projects/{pid}'
    aid = pro.post(path+'/apply').json()['id']
    pending = intruder.post(path+f"/apply-linked/{linked.json()['id']}")
    assert pending.status_code == 201, pending.text
    assert pro.post(f'/api/applications/{aid}/withdraw').status_code == 200
    before = edit_snapshot(v['mod'],pid)
    for scope in [{'town':'Balma'},{'trade':'electricite'}]:
        error = owner.put(path,json=EDIT | {'content_version':0} | scope)
        assert error.status_code == 409 and error.json()['detail']['code']=='project_scope_locked'
    assert edit_snapshot(v['mod'],pid)==before
    saved = owner.put(path,json=EDIT | {'content_version':0})
    assert saved.status_code == 200 and saved.json()['notified']==1
    assert owner.put(path,json=EDIT | {'content_version':0}).status_code == 409
    unchanged = owner.put(path,json=EDIT | {'content_version':1,'title':' '+EDIT['title']+' '})
    assert unchanged.json()['changed'] is False and unchanged.json()['content_version']==1
    assert not any(n['event_type']=='project_updated' for n in pro.get('/api/notifications').json()['items'])
    notes=[n for n in intruder.get('/api/notifications').json()['items'] if n['event_type']=='project_updated']
    assert [n['entity_id'] for n in notes]==[pending.json()['id']]
    assert {a['status'] for a in owner.get(path+'/applications').json()['items']}=={'withdrawn','pending'}
    assert edit_snapshot(v['mod'],pid)[1]==1


def test_failed_notification_rolls_back_edit_audit_and_version(setup):
    v = setup
    approve(v)
    pid = project(v)
    path = f'/api/projects/{pid}'
    assert v['call'](v['pro'],v['pcsrf'],'post',path+'/apply').status_code==201
    before = edit_snapshot(v['mod'],pid)
    with v['mod'].connect() as db:
        db.execute("""CREATE TRIGGER fail_project_notice BEFORE INSERT ON notifications
                      WHEN NEW.event_type='project_updated' BEGIN SELECT RAISE(ABORT,'injected failure'); END""")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(owner_client(v).cookies)
        client.headers.update(v['requester'].headers)
        assert client.put(path,json=EDIT | {'content_version':0}).status_code==500
    assert edit_snapshot(v['mod'],pid)==before
    assert not any(n['event_type']=='project_updated' for n in v['pro'].get('/api/notifications').json()['items'])


def test_accepted_application_freezes_project_even_if_multiple_selection_leaves_it_open(setup, monkeypatch):
    v = setup
    monkeypatch.setattr(v['mod'],'SINGLE_ACCEPT',False)
    approve(v)
    pid = project(v)
    owner = owner_client(v)
    aid = v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert owner.post(f'/api/applications/{aid}/accept').status_code==200
    assert owner.get(f'/api/v4/projects/{pid}').json()['content_editable'] is False
    assert owner.put(f'/api/projects/{pid}',json=EDIT | {'content_version':0}).status_code==409
