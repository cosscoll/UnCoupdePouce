"""Search criteria only narrow an already authorized discovery list."""
import json
from datetime import datetime,timedelta,timezone
from test_lab_api import env,setup,approve,project
from test_v4 import draft,publish


def test_search_filters_combine_without_widening_access(setup):
    v=setup;approve(v)
    recent=publish(v,draft(v,title='Réparer une fuite discrète',description='Réparation fictive des tuyaux dans une salle de bain.',trades=['plomberie'],timing='urgent'))
    old=publish(v,draft(v,title='Peindre et poser un lavabo',trades=['plomberie','peinture'],timing='month'))
    wrong_trade=project(v,trade='electricite')
    with v['mod'].connect() as db:
        db.execute('UPDATE projects SET created_at=? WHERE id=?',((datetime.now(timezone.utc)-timedelta(days=40)).isoformat(),old))
        db.execute('UPDATE taxonomy SET synonyms=? WHERE id=?',(json.dumps(['étanchéité fictive']),'plomberie'))
        group=db.execute('SELECT group_name FROM taxonomy WHERE id=?',('plomberie',)).fetchone()[0]
    def ids(**params):
        r=v['pro'].get('/api/projects',params=params);assert r.status_code==200,r.text
        return [p['id'] for p in r.json()['items']]
    assert ids()==[recent,old]
    assert ids(q='fuite discrete',timing='urgent',town='toulouse',trade='plomberie',category=group,published_within=7)==[recent]
    assert ids(q='ETANCHEITE FICTIVE')==[recent,old]
    assert ids(trade='peinture',timing='month',sort='oldest')==[old]
    assert ids(trade='electricite')==[]
    assert ids(q='installation',trade='electricite',town='Toulouse')==[]
    assert ids(sort='oldest')==[old,recent]
    assert ids(published_within=30)==[recent]
    assert ids(town='Paris')==[]
    assert v['pro'].get(f'/api/v4/projects/{wrong_trade}').status_code==404
    assert v['other'].get('/api/projects',params={'q':'fuite'}).json()['items']==[]
    data=v['pro'].get('/api/projects').json();assert data['search_scope']=='ready'
    for item in data['items']:
        assert item['match']['profile']=='individual' and item['match']['trades']==['plomberie']
        assert item['match']['town']=='Toulouse' and item['match']['alias'] is None
        assert 'draft_payload' not in item and 'requester_id' not in item


def test_search_explains_linked_scope_without_mixing_profiles(setup):
    v=setup;approve(v)
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Atelier fictif'}).status_code==201
    member=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Équipe électrique','trades':['electricite'],'zones':['Toulouse']}).json()['id']
    pid=project(v,trade='electricite')
    item=v['pro'].get('/api/projects',params={'trade':'electricite'}).json()['items'][0]
    assert item['id']==pid and item['match']=={'profile':'linked','alias':'Équipe électrique','trades':['electricite'],'town':'Toulouse'}
    assert item['matching_linked_profile_id']==member and item['matching_individual_profile'] is False
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/enterprise/artisans/{member}/set-active',json={'active':False}).status_code==200
    assert v['pro'].get('/api/projects',params={'trade':'electricite'}).json()['items']==[]


def test_search_never_returns_hidden_suspended_or_unapproved_projects(setup):
    v=setup;pid=project(v)
    assert v['pro'].get('/api/projects').json()['search_scope']=='pending_review'
    approve(v)
    assert v['pro'].get('/api/projects').json()['items']
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':True,'reason':'Restriction de recette de recherche.'}).status_code==200
    assert v['pro'].get('/api/projects',params={'q':'installation'}).json()['items']==[]
    assert v['requester'].get('/api/projects',params={'q':'installation'}).json()['items'][0]['hidden']==1
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':False,'reason':'Rétablissement après recette.'}).status_code==200
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/users/{v["rid"]}/suspend',json={'value':True,'reason':'Suspension fictive de recette.'}).status_code==200
    assert v['pro'].get('/api/projects',params={'sort':'oldest'}).json()['items']==[]


def test_search_rejects_invalid_parameters(setup):
    c=setup['pro']
    for params in [{'q':'a'*121},{'trade':'a'*61},{'town':'a'*91},{'category':'a'*81},{'timing':'tomorrow'},{'published_within':0},{'published_within':366},{'sort':'secret'},{'status':'private'}]:
        assert c.get('/api/projects',params=params).status_code==422
