"""Saving a private reference never preserves authorization to project content."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from test_lab_api import env, setup, approve, project


def exercise_favorites(mod, owner, other, requester, pid):
    path=f'/api/project-favorites/{pid}'
    assert owner.put(path).json()=={'project_id':pid,'is_favorite':True}
    assert owner.put(path).status_code==200
    saved=owner.get('/api/project-favorites').json()['items']
    assert len(saved)==1 and saved[0]['available'] is True
    assert saved[0]['project']['id']==pid and saved[0]['project']['is_favorite'] is True
    assert not {'requester_id','email','photos','siren'} & set(saved[0]['project'])
    assert other.get('/api/project-favorites').json()['items']==[]
    assert other.delete(path).status_code==200
    assert len(owner.get('/api/project-favorites').json()['items'])==1
    assert owner.get('/api/projects').json()['items'][0]['is_favorite'] is True
    exported=owner.get('/api/account/export').json()['own_project_favorites']
    assert exported==[{'project_id':pid,'created_at':saved[0]['created_at']}]
    assert other.get('/api/account/export').json()['own_project_favorites']==[]
    assert requester.post(f'/api/projects/{pid}/close').status_code==200
    unavailable=owner.get('/api/project-favorites').json()['items']
    assert unavailable==[{'project_id':pid,'created_at':saved[0]['created_at'],'available':False,'project':None}]
    assert owner.put(path).status_code==404
    assert owner.delete(path).status_code==200
    assert owner.delete(path).status_code==200
    assert owner.get('/api/project-favorites').json()['items']==[]
    assert owner.get('/api/account/export').json()['own_project_favorites']==[]
    with mod.connect() as db:
        actions=[r['action'] for r in db.execute("SELECT action FROM audit WHERE action IN ('save_project_favorite','remove_project_favorite') ORDER BY id")]
        assert actions==['save_project_favorite','remove_project_favorite']


def test_favorites_are_private_idempotent_exportable_and_removable_after_closure(setup):
    v=setup;approve(v);pid=project(v)
    for key,csrf in [('pro','pcsrf'),('intruder','icsrf'),('requester','rcsrf')]:v[key].headers['x-ucp-csrf']=v[csrf]
    exercise_favorites(v['mod'],v['pro'],v['intruder'],v['requester'],pid)


@pytest.mark.parametrize('change',['hidden','requester_suspended','scope','linked_inactive'])
def test_favorite_rechecks_current_project_and_profile_visibility(setup,change):
    v=setup;approve(v);pid=project(v);call=v['call'];p=v['pro'];p.headers['x-ucp-csrf']=v['pcsrf']
    linked=None
    if change=='linked_inactive':
        pid=project(v,'electricite')
        assert call(p,v['pcsrf'],'post','/api/enterprise',json={'label':'Equipe fictive'}).status_code==201
        linked=call(p,v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Electricien fictif','trades':['electricite'],'zones':['Toulouse']}).json()['id']
    assert p.put(f'/api/project-favorites/{pid}').status_code==200
    if change=='hidden':
        assert call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':True,'reason':'Recette fictive de confidentialité.'}).status_code==200
    elif change=='requester_suspended':
        with v['mod'].connect() as db:db.execute('UPDATE users SET suspended=1 WHERE id=?',(v['rid'],))
    elif change=='scope':
        assert p.post('/api/profile',json={'trade':'plomberie','town':'Paris','siren':'123456782'}).status_code==200
        approve(v)
    else:
        assert p.post(f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==200
    item=p.get('/api/project-favorites').json()['items'][0]
    assert item['available'] is False and item['project'] is None
    assert p.put(f'/api/project-favorites/{pid}').status_code==404
    assert p.delete(f'/api/project-favorites/{pid}').status_code==200


def test_saving_a_favorite_never_reveals_an_ineligible_project(setup):
    v=setup;approve(v);pid=project(v,'electricite')
    for target in [pid,9223372036854775807]:
        r=v['call'](v['pro'],v['pcsrf'],'put',f'/api/project-favorites/{target}')
        assert r.status_code==404 and r.json()=={'detail':'Projet indisponible pour vos profils actuels'}
    assert v['pro'].get('/api/project-favorites').json()['items']==[]


def test_favorite_quota_and_duplicate_saves_are_atomic(setup):
    v=setup;approve(v);mod=v['mod'];pid=project(v)
    with mod.connect() as db:
        for i in range(49):
            result=db.execute('INSERT INTO projects(requester_id,title,description,trade,town,created_at) VALUES(?,?,?,?,?,?)',(v['rid'],'Projet fictif','Description fictive','plomberie','Toulouse',mod.now()))
            db.execute('INSERT INTO project_favorites(owner_id,project_id,created_at) VALUES(?,?,?)',(v['pid'],result.lastrowid,mod.now()))
    second=project(v)
    def save(target):
        with TestClient(mod.app) as c:
            c.cookies.update(v['pro'].cookies)
            return v['call'](c,v['pcsrf'],'put',f'/api/project-favorites/{target}').status_code
    with ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(save,[pid,second]))
    assert sorted(statuses)==[200,409]
    items=v['pro'].get('/api/project-favorites').json()['items'];assert len(items)==50
    last=next(x['project_id'] for x in items if x['project_id'] in (pid,second))
    with ThreadPoolExecutor(max_workers=2) as pool:assert list(pool.map(save,[last,last]))==[200,200]
    assert len(v['pro'].get('/api/project-favorites').json()['items'])==50


@pytest.mark.parametrize('operation',['put','delete'])
def test_favorite_change_rolls_back_if_audit_write_fails(setup,operation):
    v=setup;approve(v);pid=project(v);path=f'/api/project-favorites/{pid}'
    if operation=='delete':assert v['call'](v['pro'],v['pcsrf'],'put',path).status_code==200
    before=v['pro'].get('/api/project-favorites').json()
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_favorite_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['pro'].cookies)
        r=v['call'](client,v['pcsrf'],operation,path)
        assert r.status_code==500 and 'controlled audit failure' not in r.text
    assert v['pro'].get('/api/project-favorites').json()==before


def test_favorites_require_role_session_csrf_and_valid_ids(setup):
    v=setup;path='/api/project-favorites/1'
    assert TestClient(v['mod'].app).get('/api/project-favorites').status_code==401
    for key,csrf in [('requester','rcsrf'),('admin','admcsrf')]:
        assert v[key].get('/api/project-favorites').status_code==403
        assert v['call'](v[key],v[csrf],'put',path).status_code==403
        assert v['call'](v[key],v[csrf],'delete',path).status_code==403
    assert v['pro'].put(path).status_code==403
    assert v['pro'].delete(path).status_code==403
    for value in ['0','-1','9223372036854775808','not-a-number']:
        assert v['call'](v['pro'],v['pcsrf'],'put','/api/project-favorites/'+value).status_code==422


@pytest.mark.parametrize('operation',['get','put','delete'])
def test_favorite_operations_recheck_revoked_sessions_after_authentication(setup,operation):
    v=setup;approve(v);pid=project(v);mod=v['mod'];original=mod.get_user
    def revoked(request:Request):
        user=original(request)
        with mod.connect() as db:db.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
        return user
    mod.app.dependency_overrides[original]=revoked
    path='/api/project-favorites'+('' if operation=='get' else '/'+str(pid))
    try:assert v['call'](v['pro'],v['pcsrf'],operation,path).status_code==401
    finally:mod.app.dependency_overrides.clear()
