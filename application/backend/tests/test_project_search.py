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


def test_multi_trade_detail_exposes_only_eligible_profiles_and_keeps_one_application(setup):
    v = setup
    approve(v)
    pro, requester = v['pro'], v['requester']

    def write(path, **body):
        return v['call'](pro, v['pcsrf'], 'post', path, **({'json': body} if body else {}))

    assert write('/api/enterprise', label='Atelier fictif').status_code == 201

    def linked(alias, trade, town='Toulouse'):
        response = write('/api/enterprise/artisans', alias=alias, trades=[trade], zones=[town])
        assert response.status_code == 201, response.text
        return response.json()['id']

    electrical = linked('Équipe électrique', 'electricite')
    painting = linked('Équipe peinture', 'peinture')
    wrong_town = linked('Autre zone', 'electricite', 'Paris')
    inactive = linked('Équipe inactive', 'electricite')
    assert write(f'/api/enterprise/artisans/{inactive}/set-active', active=False).status_code == 200
    pid = publish(v, draft(v, trades=['plomberie','electricite','peinture']))
    path = f'/api/v4/projects/{pid}'
    assert 'application_profiles' not in requester.get(path).json()
    assert v['intruder'].get(path).status_code == 404
    assert pro.get('/api/projects').json()['items'][0]['matching_profile_count'] == 3
    assert pro.get(path).json()['application_profiles'] == [
        {'profile':'individual','linked_profile_id':None,'alias':None,'trades':['plomberie']},
        {'profile':'linked','linked_profile_id':electrical,'alias':'Équipe électrique','trades':['electricite']},
        {'profile':'linked','linked_profile_id':painting,'alias':'Équipe peinture','trades':['peinture']},
    ]
    assert write(f'/api/projects/{pid}/apply-linked/{wrong_town}').status_code == 403
    created = write(f'/api/projects/{pid}/apply-linked/{electrical}')
    assert created.status_code == 201
    assert write(f'/api/projects/{pid}/apply-linked/{painting}').status_code == 409
    assert write(f'/api/projects/{pid}/apply').status_code == 409
    detail = pro.get(path).json()
    assert detail['own_application']['id'] == created.json()['id']
    assert detail['application_profiles'] == []
    received = requester.get(f'/api/projects/{pid}/applications').json()['items']
    assert [item['linked_artisan_alias'] for item in received] == ['Équipe électrique']
    notices = requester.get('/api/notifications').json()['items']
    assert [item['entity_id'] for item in notices if item['event_type'] == 'new_application'] == [created.json()['id']]


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
    for params in [{'q':'a'*121},{'trade':'a'*62},{'town':'a'*91},{'category':'a'*81},{'timing':'tomorrow'},{'published_within':0},{'published_within':366},{'sort':'secret'},{'status':'private'}]:
        assert c.get('/api/projects',params=params).status_code==422
