"""Owner-scoped application lifecycle and actionable chat states."""
from test_lab_api import env,setup,approve,project


def test_application_tracking_explains_access_and_preserves_actual_status(setup):
    v=setup;approve(v);pid=project(v);call=v['call']
    aid=call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    def row():return next(x for x in v['pro'].get('/api/my-applications').json()['items'] if x['id']==aid)
    item=row();assert item['status']=='pending' and item['conversation_state']=='not_selected' and item['submitted_at']
    assert v['intruder'].get('/api/my-applications').json()['items']==[]
    assert v['requester'].get('/api/my-applications').status_code==403
    assert not {'email','siren','requester_id','professional_id','subscription_active'}&set(item)
    assert call(v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert row()['conversation_state']=='test_access_required'
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    approve(v,paid=True);assert row()['conversation_state']=='available'
    with v['mod'].connect() as db:db.execute('UPDATE projects SET hidden=1 WHERE id=?',(pid,))
    assert row()['conversation_state']=='unavailable'
    with v['mod'].connect() as db:db.execute('UPDATE projects SET hidden=0 WHERE id=?',(pid,));db.execute('UPDATE users SET suspended=1 WHERE id=?',(v['rid'],))
    assert row()['conversation_state']=='unavailable'
    with v['mod'].connect() as db:db.execute('UPDATE users SET suspended=0 WHERE id=?',(v['rid'],))
    assert call(v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    item=row();assert item['status']=='accepted' and item['project_status']=='closed' and item['conversation_state']=='closed'
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403


def test_withdrawn_application_keeps_its_history_and_remains_private(setup):
    v=setup;approve(v);pid=project(v);call=v['call']
    aid=call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert call(v['pro'],v['pcsrf'],'post',f'/api/applications/{aid}/withdraw').status_code==200
    item=v['pro'].get('/api/my-applications').json()['items'][0]
    assert item['status']=='withdrawn' and item['conversation_state']=='not_selected'
    assert call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==409
    assert v['intruder'].get('/api/my-applications').json()['items']==[]


def test_linked_application_explains_inactive_profile_without_opening_chat(setup):
    v=setup;approve(v,paid=True);call=v['call'];pid=project(v)
    assert call(v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Entreprise fictive'}).status_code==201
    linked=call(v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Profil fictif','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    aid=call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply-linked/{linked}').json()['id']
    assert call(v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert call(v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==200
    item=v['pro'].get('/api/my-applications').json()['items'][0]
    assert item['linked_artisan_alias']=='Profil fictif' and item['conversation_state']=='linked_inactive'
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403


def test_project_detail_returns_only_the_viewers_application(setup):
    v=setup;approve(v);approve(v,who='intruder');pid=project(v);call=v['call']
    # A second eligible professional sees no application belonging to the first.
    assert call(v['intruder'],v['icsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456790'}).status_code==200
    approve(v,who='intruder')
    path=f'/api/v4/projects/{pid}'
    assert v['pro'].get(path).json()['own_application'] is None
    aid=call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['pro'].get(path).json()['own_application']=={'id':aid,'status':'pending'}
    assert v['intruder'].get(path).json()['own_application'] is None
    assert 'own_application' not in v['requester'].get(path).json()
    assert v['other'].get(path).status_code==404
    assert call(v['pro'],v['pcsrf'],'post',f'/api/applications/{aid}/withdraw').status_code==200
    assert v['pro'].get(path).json()['own_application']=={'id':aid,'status':'withdrawn'}
