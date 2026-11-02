"""Legacy fields remain editable by their owner without leaking to another account."""
import json
import pytest
from test_lab_api import env,setup,approve,project

CONTACT='test＠ucp.test'


@pytest.mark.parametrize('field',['name','town','zones','trade','alias','linked_zones'])
def test_legacy_candidate_fields_are_redacted_without_erasing_owner_data(setup,field):
    v=setup;approve(v);pid=project(v);call=v['call'];linked=None
    if field in ('alias','linked_zones'):
        assert call(v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Equipe fictive'}).status_code==201
        linked=call(v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Equipe plomberie','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    path=f'/api/projects/{pid}/apply'+(f'-linked/{linked}' if linked else '')
    aid=call(v['pro'],v['pcsrf'],'post',path).json()['id']
    with v['mod'].connect() as c:
        if field=='name':c.execute('UPDATE users SET name=? WHERE id=?',(CONTACT,v['pid']))
        elif field=='town':c.execute('UPDATE profiles SET town=? WHERE user_id=?',(CONTACT,v['pid']))
        elif field=='zones':c.execute('UPDATE profiles SET service_areas=? WHERE user_id=?',(json.dumps(['Toulouse',CONTACT]),v['pid']))
        elif field=='trade':c.execute('UPDATE profiles SET service_trades=? WHERE user_id=?',(json.dumps([CONTACT]),v['pid']))
        elif field=='alias':c.execute('UPDATE enterprise_artisans SET alias=? WHERE id=?',(CONTACT,linked))
        else:c.execute('UPDATE enterprise_artisans SET service_areas=? WHERE id=?',(json.dumps(['Toulouse',CONTACT]),linked))
    result=v['requester'].get(f'/api/projects/{pid}/applications').json()['items'][0]
    assert CONTACT not in json.dumps(result,ensure_ascii=False)
    assert result['public_details_restricted'] is True and result['id']==aid and result['status']=='pending'
    assert v['other'].get(f'/api/projects/{pid}/applications').status_code==403
    private=v['pro'].get('/api/me').json() if field=='name' else v['pro'].get('/api/enterprise').json() if field in ('alias','linked_zones') else v['pro'].get('/api/my-profile').json()
    assert CONTACT in json.dumps(private,ensure_ascii=False)


@pytest.mark.parametrize('field',['intro','title','description'])
def test_legacy_showcase_is_withheld_until_owner_corrects_it(setup,field):
    v=setup;approve(v);pid=project(v);call=v['call'];p=v['pro']
    aid=call(p,v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    body={'version':0,'intro':'Présentation fictive de plomberie.','works':[{'title':'Réalisation fictive','description':'Une réalisation entièrement fictive en plomberie.','trade':'plomberie'}]}
    assert call(p,v['pcsrf'],'put','/api/v4/showcase',json=body).status_code==200
    payload={k:val for k,val in body.items() if k!='version'}
    if field=='intro':payload['intro']=CONTACT
    else:payload['works'][0][field]='Texte fictif de contact '+CONTACT
    with v['mod'].connect() as c:c.execute('UPDATE professional_showcases SET payload=? WHERE owner_id=?',(json.dumps(payload),v['pid']))
    path=f'/api/projects/{pid}/applications/{aid}/showcase'
    result=v['requester'].get(path);assert result.status_code==404
    assert CONTACT not in result.text
    assert CONTACT in json.dumps(p.get('/api/v4/showcase').json(),ensure_ascii=False)
    clean={'version':1,'intro':'Présentation fictive corrigée.','works':[]}
    assert call(p,v['pcsrf'],'put','/api/v4/showcase',json=clean).status_code==200
    assert v['requester'].get(path).json()['intro']==clean['intro']


def exercise_legacy_headers(mod,requester,pro,pid,pro_id,requester_id):
    aid=pro.post(f'/api/projects/{pid}/apply').json()['id']
    with mod.connect() as c:
        c.execute('UPDATE users SET name=? WHERE id IN (?,?)',(CONTACT,pro_id,requester_id))
        c.execute('UPDATE projects SET title=? WHERE id=?',(CONTACT,pid))
    candidate=requester.get(f'/api/projects/{pid}/applications').json()['items'][0]
    assert CONTACT not in json.dumps(candidate,ensure_ascii=False)
    assert candidate['public_details_restricted'] is True
    showcase=requester.get(f'/api/projects/{pid}/applications/{aid}/showcase')
    assert showcase.status_code==200 and CONTACT not in json.dumps(showcase.json(),ensure_ascii=False)
    assert CONTACT not in json.dumps(pro.get('/api/my-applications').json(),ensure_ascii=False)
    assert requester.post(f'/api/applications/{aid}/accept').status_code==200
    for client in [requester,pro]:
        result=client.get('/api/conversations').json()
        assert len(result['items'])==1 and CONTACT not in json.dumps(result,ensure_ascii=False)
        assert client.get(f'/api/conversations/{aid}/messages').status_code==403
        assert client.get('/api/me').json()['name']==CONTACT


def test_legacy_names_and_project_headers_do_not_bypass_locked_chat(setup):
    v=setup;approve(v);pid=project(v)
    for key,csrf in [('pro','pcsrf'),('requester','rcsrf')]:v[key].headers['x-ucp-csrf']=v[csrf]
    exercise_legacy_headers(v['mod'],v['requester'],v['pro'],pid,v['pid'],v['rid'])
