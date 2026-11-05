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
    with ThreadPoolExecutor(max_workers=2) as pool:
        edited = pool.submit(owner.put, path, json=EDIT | {'content_version': 0})
        applied = pool.submit(candidate.post, path+'/apply')
        edit_result, apply_result = edited.result(), applied.result()
    assert apply_result.status_code == 201, apply_result.text
    assert edit_result.status_code in (200, 409), edit_result.text
    detail = owner.get(f'/api/v4/projects/{pid}').json()
    assert detail['content_editable'] is False
    expected_version = int(edit_result.status_code == 200)
    assert detail['content_version'] == expected_version
    assert edit_snapshot(mod, pid)[1] == expected_version
    assert owner.put(path, json=EDIT | {'content_version': expected_version}).status_code == 409


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
