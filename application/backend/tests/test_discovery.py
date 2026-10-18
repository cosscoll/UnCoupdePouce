"""Discovery consent and structured work, using a fresh tmp_path database only."""
from test_lab_api import env, setup, approve
from test_v4 import draft, photo, publish


def test_discovery_photo_opt_in_is_scoped_and_revocable(setup):
    v=setup;approve(v);approve(v,who='intruder')
    d=draft(v,trades=['plomberie'],actions=['Remplacer le lavabo'],photo_visibility='matched')
    image=photo(v,d);pid=publish(v,d);path=f'/api/v4/photos/{image}'
    entry=next(p for p in v['pro'].get('/api/projects').json()['items'] if p['id']==pid)
    assert entry['photos']==[image]
    assert entry['actions']==['Remplacer le lavabo']
    assert entry['timing']=='month'
    assert v['pro'].get(path).status_code==200
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['photos']==[image]
    assert v['intruder'].get(path).status_code==404
    assert v['other'].get(path).status_code==404
    endpoint=f'/api/v4/projects/{pid}/hide-previews'
    assert v['requester'].post(endpoint).status_code==403
    assert v['call'](v['other'],v['ocsrf'],'post',endpoint).status_code==404
    assert v['call'](v['requester'],v['rcsrf'],'post',endpoint).status_code==200
    assert v['pro'].get(path).status_code==404
    assert v['pro'].get('/api/projects').json()['items'][0]['photos']==[]
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['photos']==[]
    assert v['requester'].get(path).status_code==200


def test_unselected_photo_access_rechecks_approval_suspension_and_status(setup):
    v=setup;approve(v)
    d=draft(v,trades=['plomberie'],photo_visibility='matched');image=photo(v,d);pid=publish(v,d)
    path=f'/api/v4/photos/{image}'
    assert v['pro'].get(path).status_code==200
    with v['mod'].connect() as c:c.execute('UPDATE projects SET hidden=1 WHERE id=?',(pid,))
    assert v['pro'].get(path).status_code==404
    with v['mod'].connect() as c:c.execute('UPDATE projects SET hidden=0 WHERE id=?',(pid,));c.execute('UPDATE profiles SET approved=0 WHERE user_id=?',(v['pid'],))
    assert v['pro'].get(path).status_code==404
    approve(v)
    assert v['pro'].get(path).status_code==200
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    assert v['pro'].get(path).status_code==404


def test_existing_private_photos_never_appear_in_discovery(setup):
    v=setup;approve(v)
    d=draft(v,trades=['plomberie']);image=photo(v,d);pid=publish(v,d)
    # Also exercise legacy JSON without the new keys, without altering any real DB.
    with v['mod'].connect() as c:
        import json
        r=c.execute('SELECT payload FROM drafts WHERE id=?',(d['id'],)).fetchone()
        payload=json.loads(r[0]);payload.pop('photo_visibility',None);payload.pop('actions',None)
        c.execute('UPDATE drafts SET payload=? WHERE id=?',(json.dumps(payload),d['id']))
    entry=v['pro'].get('/api/projects').json()['items'][0]
    assert entry['photos']==[] and entry['actions']==[]
    assert v['pro'].get(f'/api/v4/photos/{image}').status_code==404
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['photos']==[]


def test_structured_actions_validation_and_contact_guard(setup):
    v=setup
    for updates in [{'actions':['x'*121]},{'actions':['Travail']*13},{'actions':[' ']},{'photo_visibility':'public'}]:
        assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',json=updates).status_code==422
    d=draft(v,actions=['Contacter chantier@example.test'])
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/v4/drafts/{d["id"]}/publish',json={'version':d['version']}).status_code==422


def test_discovery_photos_are_not_accessible_before_publication(setup):
    v=setup;approve(v)
    d=draft(v,photo_visibility='matched');image=photo(v,d)
    assert v['pro'].get(f'/api/v4/photos/{image}').status_code==404
    assert v['requester'].get(f'/api/v4/photos/{image}').status_code==200
