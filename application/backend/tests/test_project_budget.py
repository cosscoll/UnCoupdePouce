"""Optional declared work budgets: persistence, versioning, edits and scoped filters."""
from test_lab_api import env,setup,approve,project
from test_v4 import draft,publish

BASE={'title':'Budget de travaux fictif','description':'Travaux entièrement fictifs pour valider le budget indicatif.','town':'Toulouse','trade':'plomberie'}

def test_invalid_declared_budgets_never_create_a_draft(setup):
    v=setup
    for values in [{'budget_min':-1},{'budget_max':2147483648},{'budget_min':'1000'},{'budget_min':True},{'budget_min':10.5},{'budget_min':2000,'budget_max':1000}]:
        result=v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',json={'trades':['plomberie']}|values)
        assert result.status_code==422,result.text
    assert v['requester'].get('/api/v4/drafts').json()['items']==[]


def test_draft_budget_is_versioned_published_once_and_visible_only_with_project_rights(setup):
    v=setup;approve(v);d=draft(v,budget_min=1000,budget_max=2500)
    stored=v['requester'].get('/api/v4/drafts').json()['items'][0]
    assert (stored['budget_min'],stored['budget_max'])==(1000,2500)
    body={'title':stored['title'],'description':stored['description'],'town':'Toulouse','trades':['plomberie'],'timing':'month','version':d['version'],'budget_min':1500,'budget_max':3000}
    updated=v['call'](v['requester'],v['rcsrf'],'put',f'/api/v4/drafts/{d["id"]}',json=body);assert updated.status_code==200
    assert v['call'](v['requester'],v['rcsrf'],'put',f'/api/v4/drafts/{d["id"]}',json=body|{'budget_min':0}).status_code==409
    path=f'/api/v4/drafts/{d["id"]}/publish';version=updated.json()['version']
    first=v['call'](v['requester'],v['rcsrf'],'post',path,json={'version':version});assert first.status_code==201
    pid=first.json()['id'];assert v['call'](v['requester'],v['rcsrf'],'post',path,json={'version':version}).json()['id']==pid
    row=next(p for p in v['pro'].get('/api/projects').json()['items'] if p['id']==pid)
    assert (row['budget_min'],row['budget_max'])==(1500,3000)
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['budget_min']==1500
    assert v['other'].get(f'/api/v4/projects/{pid}').status_code==404
    assert v['other'].get('/api/projects',params={'budget_from':1500}).json()['items']==[]


def test_budget_edits_merge_omitted_fields_and_allow_explicit_null_or_zero(setup):
    v=setup;call=v['call']
    pid=call(v['requester'],v['rcsrf'],'post','/api/projects',json=BASE|{'budget_min':1000,'budget_max':3000}).json()['id']
    path=f'/api/projects/{pid}'
    assert call(v['requester'],v['rcsrf'],'put',path,json=BASE).status_code==200
    detail=v['requester'].get(f'/api/v4/projects/{pid}').json();assert (detail['budget_min'],detail['budget_max'])==(1000,3000)
    assert call(v['requester'],v['rcsrf'],'put',path,json=BASE|{'title':'Titre non applicable','budget_max':500}).status_code==422
    assert v['requester'].get(f'/api/v4/projects/{pid}').json()['title']==BASE['title']
    assert call(v['requester'],v['rcsrf'],'put',path,json=BASE|{'budget_min':None,'budget_max':0}).status_code==200
    detail=v['requester'].get(f'/api/v4/projects/{pid}').json();assert detail['budget_min'] is None and detail['budget_max']==0
    exported=v['requester'].get('/api/account/export').json()['own_projects'][0];assert exported['budget_max']==0
    assert call(v['other'],v['ocsrf'],'put',path,json=BASE|{'budget_min':0,'budget_max':100}).status_code==403


def test_budget_filter_uses_overlap_and_never_converts_unknown_to_zero(setup):
    v=setup;approve(v);call=v['call'];ids=[]
    for budget in [{},{'budget_min':0,'budget_max':0},{'budget_min':1000,'budget_max':2000},{'budget_min':3000},{'budget_max':500}]:
        result=call(v['requester'],v['rcsrf'],'post','/api/projects',json=BASE|budget);assert result.status_code==201;ids.append(result.json()['id'])
    outside=call(v['requester'],v['rcsrf'],'post','/api/projects',json=BASE|{'trade':'electricite','budget_min':0,'budget_max':0}).json()['id']
    def found(**params):return {p['id'] for p in v['pro'].get('/api/projects',params=params).json()['items']}
    assert found()==set(ids)
    assert found(budget_from=1500,budget_to=2500)=={ids[2]}
    assert found(budget_from=2000,budget_to=3000)=={ids[2],ids[3]}
    assert found(budget_from=0,budget_to=0)=={ids[1],ids[4]}
    assert ids[0] not in found(budget_to=500) and outside not in found(budget_to=500)
    assert v['pro'].get(f'/api/v4/projects/{outside}').status_code==404
    for params in [{'budget_from':-1},{'budget_to':2147483648},{'budget_from':200,'budget_to':100}]:
        assert v['pro'].get('/api/projects',params=params).status_code==422


def test_budget_cannot_change_after_a_candidate_applies(setup):
    v=setup;approve(v);call=v['call'];pid=call(v['requester'],v['rcsrf'],'post','/api/projects',json=BASE|{'budget_min':100,'budget_max':400}).json()['id']
    assert call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==201
    assert call(v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=BASE|{'budget_min':200,'budget_max':300}).status_code==409
    item=v['requester'].get(f'/api/v4/projects/{pid}').json();assert (item['budget_min'],item['budget_max'])==(100,400)


def test_nullable_budget_migration_preserves_existing_projects(setup):
    v=setup;pid=project(v)
    # This is an isolated temporary SQLite test database, not a deployed database.
    with v['mod'].connect() as db:
        db.execute('ALTER TABLE projects DROP COLUMN budget_max');db.execute('ALTER TABLE projects DROP COLUMN budget_min')
    v['mod'].init_db()
    item=next(p for p in v['requester'].get('/api/projects').json()['items'] if p['id']==pid)
    assert item['budget_min'] is None and item['budget_max'] is None and item['title']=='Réfection installation'
