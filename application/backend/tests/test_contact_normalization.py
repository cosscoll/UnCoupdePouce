"""Contact guards must inspect common Unicode presentation variants."""
import pytest
from test_lab_api import env, setup, approve, project

CONTACTS=[
    'test＠ucp.test',
    '０６ １２ ３４ ５６ ７８',
    '06\u202f12\u202f34\u202f56\u202f78',
    '06\u202e 12 34 56 78',
    'te\u202est@ucp.test',
    'ｈｔｔｐｓ：／／ucp.test',
    '１４ rue des Roses',
]


@pytest.mark.parametrize('value',CONTACTS)
def test_precontact_guard_rejects_unicode_contact_variants(env,value):
    mod=env[0]
    with pytest.raises(ValueError,match='Avant la sélection'):mod.precontact_safe(value)


def test_guard_preserves_safe_prose_and_measurements(env):
    mod=env[0]
    for text in ['Rénover une pièce de 12 m² et une fenêtre de 120 × 80 cm.',
                 'Budget 1 500 € à 2 500 €, travaux dans 3 mois.',
                 'Appartement au 2ᵉ étage, Toulouse 31000.',
                 'Remplacer 6 prises et une canalisation de 06 mm.']:
        assert mod.precontact_safe(text)==text
    assert mod.precontact_safe('  Camille\u200b Démo  ')=='Camille Démo'


def test_project_create_edit_and_draft_publication_reject_obfuscated_contact(setup):
    v=setup;call=v['call'];pid=project(v)
    body={'title':'Travaux fictifs','description':'Travaux fictifs de plomberie. Écrivez à test＠ucp.test','town':'Toulouse','trade':'plomberie'}
    assert call(v['requester'],v['rcsrf'],'post','/api/projects',json=body).status_code==422
    assert call(v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=body).status_code==422
    d=call(v['requester'],v['rcsrf'],'post','/api/v4/drafts',json={'title':body['title'],'description':body['description'],'town':'Toulouse','trades':['plomberie']}).json()
    result=call(v['requester'],v['rcsrf'],'post',f'/api/v4/drafts/{d["id"]}/publish',json={'version':d['version']})
    assert result.status_code==422
    rows=v['requester'].get('/api/projects').json()['items'];assert len(rows)==1 and rows[0]['title']=='Réfection installation'


def exercise_legacy_contact_discovery(mod,owner,professional,pid):
    assert professional.put(f'/api/project-favorites/{pid}').status_code==200
    with mod.connect() as db:db.execute('UPDATE projects SET description=? WHERE id=?',('Ancien projet fictif. Écrivez à test＠ucp.test',pid))
    assert professional.get('/api/projects').json()['items']==[]
    assert professional.get(f'/api/v4/projects/{pid}').status_code==404
    assert professional.post(f'/api/projects/{pid}/apply').status_code==403
    item=professional.get('/api/project-favorites').json()['items'][0]
    assert item['available'] is False and item['project'] is None
    assert owner.get(f'/api/v4/projects/{pid}').status_code==200


def test_legacy_unicode_contacts_stay_out_of_discovery_detail_and_favorites(setup):
    v=setup;approve(v);pid=project(v);v['pro'].headers['x-ucp-csrf']=v['pcsrf']
    exercise_legacy_contact_discovery(v['mod'],v['requester'],v['pro'],pid)


def test_unicode_contact_rejected_in_account_profile_and_showcase_without_mutation(setup):
    v=setup;call=v['call'];p=v['pro'];before=p.get('/api/my-profile').json()
    assert call(p,v['pcsrf'],'put','/api/v4/account',json={'name':'Compte test＠ucp.test'}).status_code==422
    assert call(p,v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Toulouse','siren':'123456782','service_zones':['Toulouse','１４ rue des Roses']}).status_code==422
    assert call(p,v['pcsrf'],'put','/api/v4/showcase',json={'version':0,'intro':'Appelez au ０６ １２ ３４ ５６ ７８','works':[]}).status_code==422
    assert p.get('/api/my-profile').json()==before
    assert p.get('/api/v4/showcase').json()['version']==0
    assert p.get('/api/me').json()['name']=='demo-plombier'
