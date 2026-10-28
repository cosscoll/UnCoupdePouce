"""Private criteria persistence must not become a cached permission grant."""
import json
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env,setup,approve,project

BODY={'label':'Plomberie Toulouse','criteria':{'trade':'plomberie','town':'Toulouse','budget_from':0,'budget_to':1500,'sort':'oldest'}}


def exercise_private_saved_searches(mod,owner,other):
    result=owner.post('/api/saved-searches',json=BODY);assert result.status_code==201,result.text
    saved=result.json();sid=saved['id']
    assert saved['criteria']['budget_from']==0 and saved['criteria']['q']==''
    assert owner.get('/api/saved-searches').json()['items']==[saved]
    assert other.get('/api/saved-searches').json()['items']==[]
    assert owner.post('/api/saved-searches',json=BODY|{'label':'  PLOMBERIE TOULOUSE  '}).status_code==409
    assert other.delete(f'/api/saved-searches/{sid}').status_code==404
    assert owner.get('/api/account/export').json()['own_saved_searches']==[saved]
    assert other.get('/api/account/export').json()['own_saved_searches']==[]
    assert owner.delete(f'/api/saved-searches/{sid}').status_code==200
    assert owner.delete(f'/api/saved-searches/{sid}').status_code==404
    assert owner.get('/api/saved-searches').json()['items']==[]
    assert owner.get('/api/account/export').json()['own_saved_searches']==[]
    with mod.connect() as db:
        actions=[r['action'] for r in db.execute("SELECT action FROM audit WHERE action IN ('create_saved_search','delete_saved_search') ORDER BY id")]
        assert actions==['create_saved_search','delete_saved_search']


def test_saved_criteria_are_private_exportable_and_deletable(setup):
    v=setup
    v['pro'].headers['x-ucp-csrf']=v['pcsrf'];v['intruder'].headers['x-ucp-csrf']=v['icsrf']
    exercise_private_saved_searches(v['mod'],v['pro'],v['intruder'])


def test_saved_search_reapplication_obeys_current_visibility_and_profile_rights(setup):
    v=setup;call=v['call'];approve(v);pid=project(v)
    saved=call(v['pro'],v['pcsrf'],'post','/api/saved-searches',json={'label':'Mes travaux','criteria':{'town':'Toulouse','trade':'plomberie'}}).json()
    def results():
        criteria=v['pro'].get('/api/saved-searches').json()['items'][0]['criteria']
        return v['pro'].get('/api/projects',params={k:x for k,x in criteria.items() if x is not None}).json()['items']
    assert [p['id'] for p in results()]==[pid]
    call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':True,'reason':'Recette fictive des critères conservés.'})
    assert results()==[]
    call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':False,'reason':'Recette fictive des critères conservés.'})
    call(v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/suspend')
    assert results()==[]
    assert v['pro'].get('/api/saved-searches').json()['items'][0]==saved
    assert 'project' not in json.dumps(saved).lower()


def test_saved_search_validation_rejects_unusable_or_extra_filters(setup):
    v=setup;call=v['call']
    bad=[{'budget_from':-1},{'budget_from':True},{'budget_from':1.5},{'budget_from':500,'budget_to':100},
         {'published_within':0},{'published_within':366},{'q':'x'*121},{'town':'x'*91},
         {'sort':'relevance'},{'timing':'tomorrow'},{'status':'closed'},{'owner_id':1}]
    for criteria in bad:
        assert call(v['pro'],v['pcsrf'],'post','/api/saved-searches',json={'label':'Critères fictifs','criteria':criteria}).status_code==422
    for label in [' ','a','x'*61]:
        assert call(v['pro'],v['pcsrf'],'post','/api/saved-searches',json=BODY|{'label':label}).status_code==422
    assert v['pro'].get('/api/saved-searches').json()['items']==[]
    for value in ['0','-1','9223372036854775808']:
        assert call(v['pro'],v['pcsrf'],'delete','/api/saved-searches/'+value).status_code==422


def test_saved_search_limit_is_atomic_under_parallel_creates(setup):
    v=setup
    for i in range(9):assert v['call'](v['pro'],v['pcsrf'],'post','/api/saved-searches',json=BODY|{'label':'Recherche '+str(i)}).status_code==201
    def create(i):
        with TestClient(v['mod'].app) as client:
            client.cookies.update(v['pro'].cookies)
            return v['call'](client,v['pcsrf'],'post','/api/saved-searches',json=BODY|{'label':'Dernière '+str(i)}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(create,range(2)))
    assert sorted(statuses)==[201,409]
    assert len(v['pro'].get('/api/saved-searches').json()['items'])==10


@pytest.mark.parametrize('operation',['create','delete'])
def test_saved_search_changes_roll_back_if_audit_cannot_be_written(setup,operation):
    v=setup
    sid=v['call'](v['pro'],v['pcsrf'],'post','/api/saved-searches',json=BODY).json()['id']
    before=v['pro'].get('/api/saved-searches').json()
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_saved_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['pro'].cookies)
        result=v['call'](client,v['pcsrf'],'post','/api/saved-searches',json=BODY|{'label':'Autre recherche'}) if operation=='create' else v['call'](client,v['pcsrf'],'delete',f'/api/saved-searches/{sid}')
        assert result.status_code==500 and 'controlled audit failure' not in result.text
    assert v['pro'].get('/api/saved-searches').json()==before


def test_saved_searches_require_role_session_and_csrf(setup):
    v=setup
    assert TestClient(v['mod'].app).get('/api/saved-searches').status_code==401
    for client in [v['requester'],v['admin']]:assert client.get('/api/saved-searches').status_code==403
    assert v['pro'].post('/api/saved-searches',json=BODY).status_code==403
    assert v['pro'].delete('/api/saved-searches/1').status_code==403
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/saved-searches',json=BODY).status_code==403
