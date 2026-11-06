"""F11: optional measurements belong to the project and never confer new access."""
from test_lab_api import env,setup,approve,project
from test_v4 import draft,publish,PAYLOAD

BASE={'title':'Salle de bains fictive','description':'Travaux de rénovation de salle de bains, exemple fictif.','trade':'plomberie','town':'Toulouse'}
MEASURES={'surface_m2':8.75,'length_m':3.5,'width_m':2.5,'height_m':2.4}


def test_validation_disallows_invalid_dimensions_and_does_not_create_drafts(setup):
    v=setup
    invalid=[
      {'surface_m2':0}, {'length_m':-1}, {'surface_m2':10001},
      {'width_m':'2.45'}, {'height_m':True}, {'surface_m2':1.234},
      {'surface_m2':[]}, {'unknown':4}, {'surface_m2':None,'length_m':0},
    ]
    for values in invalid:
        r=v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',
                    json=PAYLOAD|{'dimensions':values})
        assert r.status_code==422,(values,r.status_code,r.text)
        direct=v['call'](v['requester'],v['rcsrf'],'post','/api/projects',
                        json=BASE|{'dimensions':values})
        assert direct.status_code==422,(values,direct.status_code,direct.text)
    assert v['requester'].get('/api/v4/drafts').json()['items']==[]


def test_measurements_survive_draft_autosave_publication_and_authorized_read(setup):
    v=setup;approve(v)
    d=draft(v,dimensions={'surface_m2':8.75})
    own=v['requester'].get('/api/v4/drafts').json()['items'][0]
    assert own['dimensions']['surface_m2']==8.75
    assert v['other'].get('/api/v4/drafts').json()['items']==[]
    changed=v['call'](v['requester'],v['rcsrf'],'put',
        f"/api/v4/drafts/{d['id']}",json=PAYLOAD|{'dimensions':MEASURES,'version':d['version']})
    assert changed.status_code==200,changed.text
    d['version']=changed.json()['version']
    assert v['call'](v['requester'],v['rcsrf'],'post',f"/api/v4/drafts/{d['id']}/publish",
        json={'version':d['version']-1}).status_code==409
    pid=publish(v,d)
    detail=v['requester'].get(f'/api/v4/projects/{pid}').json()
    assert detail['dimensions']==MEASURES
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['dimensions']==MEASURES
    assert v['other'].get(f'/api/v4/projects/{pid}').status_code==404
    assert v['intruder'].get(f'/api/v4/projects/{pid}').status_code==404
    exported=v['requester'].get('/api/account/export').json()['own_projects']
    assert next(p for p in exported if p['id']==pid)['dimensions']==MEASURES


def test_direct_projects_default_to_no_measurements_and_versioned_edits_preserve_or_replace(setup):
    v=setup;approve(v);pid=project(v);endpoint=f'/api/projects/{pid}';detail=f'/api/v4/projects/{pid}'
    c=v['requester'];call=v['call']
    assert c.get(detail).json()['dimensions']=={}
    edit=BASE|{'content_version':0,'dimensions':{'length_m':2.4,'surface_m2':8}}
    response=call(c,v['rcsrf'],'put',endpoint,json=edit)
    assert response.status_code==200,response.text
    assert response.json()['content_version']==1
    assert c.get(detail).json()['dimensions']=={'length_m':2.4,'surface_m2':8}
    assert call(c,v['rcsrf'],'put',endpoint,json=edit).status_code==409
    # Omitting the optional field does not erase measurements set in another edit.
    unchanged=call(c,v['rcsrf'],'put',endpoint,json=BASE|{'content_version':1})
    assert unchanged.status_code==200 and unchanged.json()['changed'] is False
    assert c.get(detail).json()['dimensions']=={'length_m':2.4,'surface_m2':8}
    cleared=call(c,v['rcsrf'],'put',endpoint,json=BASE|{'content_version':1,'dimensions':{}})
    assert cleared.status_code==200 and cleared.json()['content_version']==2
    assert c.get(detail).json()['dimensions']=={}
    assert call(v['other'],v['ocsrf'],'put',endpoint,json=BASE|{'content_version':2,'dimensions':MEASURES}).status_code==403


def test_measurement_edit_notifies_pending_candidate_and_cannot_change_selected_project(setup):
    v=setup;approve(v);pid=project(v);call=v['call']
    applied=call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply')
    assert applied.status_code==201,applied.text
    aid=applied.json()['id']
    edited=call(v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=BASE|{
      'content_version':0,'dimensions':{'surface_m2':6.5}
    })
    assert edited.status_code==200 and edited.json()['notified']==1,edited.text
    notes=v['pro'].get('/api/notifications').json()['items']
    assert any(n['event_type']=='project_updated' and n['entity_id']==aid for n in notes)
    assert call(v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    locked=call(v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=BASE|{
      'content_version':1,'dimensions':{'surface_m2':10}
    })
    assert locked.status_code==409
    assert v['requester'].get(f'/api/v4/projects/{pid}').json()['dimensions']=={'surface_m2':6.5}


def test_legacy_project_migration_adds_dimensions_without_erasing_projects(setup):
    v=setup;pid=project(v)
    with v['mod'].connect() as db:
        db.execute('ALTER TABLE projects DROP COLUMN dimensions_json')
    v['mod'].init_db()
    assert v['requester'].get(f'/api/v4/projects/{pid}').json()['dimensions']=={}
    saved=v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',
        json=BASE|{'content_version':0,'dimensions':{'height_m':2.6}})
    assert saved.status_code==200,saved.text
    assert v['requester'].get(f'/api/v4/projects/{pid}').json()['dimensions']=={'height_m':2.6}
