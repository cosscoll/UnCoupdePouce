"""Candidate comparison must show the actual applying profile, without contacts."""
from test_lab_api import env, setup, approve, project


def test_candidate_comparison_uses_each_actual_profile_and_no_contact_or_billing_data(setup):
    v=setup;call=v['call'];pid=project(v)
    assert call(v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','additional_trades':['peinture'],'town':'Toulouse','service_zones':['Colomiers'],'siren':'123456782'}).status_code==200
    approve(v);approve(v,who='intruder')
    assert call(v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==201
    # The owner's trade is electricity; the applying team's scope is plumbing.
    assert call(v['intruder'],v['icsrf'],'post','/api/enterprise',json={'label':'Entreprise fictive'}).status_code==201
    linked=call(v['intruder'],v['icsrf'],'post','/api/enterprise/artisans',json={'alias':'Équipe plomberie fictive','trades':['plomberie'],'zones':['Toulouse','Blagnac']}).json()['id']
    assert call(v['intruder'],v['icsrf'],'post',f'/api/projects/{pid}/apply-linked/{linked}').status_code==201
    path=f'/api/projects/{pid}/applications'
    items=v['requester'].get(path).json()['items']
    assert len(items)==2
    assert items[0]['trades']==['plomberie','peinture']
    assert items[0]['service_zones']==['Toulouse','Colomiers']
    assert items[1]['trades']==['plomberie'] and items[1]['service_zones']==['Toulouse','Blagnac']
    assert items[1]['linked_artisan_alias']=='Équipe plomberie fictive'
    for a in items:
        assert a['verification_status']=='test_authorized' and a['eligible_for_selection'] is True
        assert a['submitted_at']
        assert set(a)=={'id','status','professional_name','trade','town','linked_artisan_alias','trades','service_zones','submitted_at','verification_status','eligible_for_selection'}
    for client in [v['other'],v['pro'],v['admin']]:assert client.get(path).status_code==403
    assert v['requester'].get('/api/projects/9999999/applications').status_code==404
    assert call(v['intruder'],v['icsrf'],'post',f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==200
    assert call(v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/suspend').status_code==200
    items=v['requester'].get(path).json()['items']
    assert all(a['verification_status']=='test_unavailable' and a['eligible_for_selection'] is False for a in items)


def test_closed_project_never_offers_candidate_selection(setup):
    v=setup;pid=project(v);approve(v)
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==201
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    data=v['requester'].get(f'/api/projects/{pid}/applications').json()['items'][0]
    assert data['eligible_for_selection'] is False
