"""Declared portfolio ownership, individual/linked separation and lost update guards."""
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from test_lab_api import env,setup,approve,project

BODY={'intro':'Présentation fictive de notre savoir-faire en plomberie.','works':[{'title':'Salle de bains fictive','description':'Pose fictive de sanitaires et adaptation des arrivées d’eau.','trade':'plomberie','year':2025}],'version':0}


def authenticated(v):
    for name,key in [('pro','pcsrf'),('requester','rcsrf'),('other','ocsrf'),('intruder','icsrf'),('admin','admcsrf')]:v[name].headers['x-ucp-csrf']=v[key]


def exercise_showcase(pro,requester,other):
    assert pro.get('/api/v4/showcase').json()['version']==0
    saved=pro.put('/api/v4/showcase',json=BODY);assert saved.status_code==200,saved.text
    assert saved.json()['version']==1
    assert pro.put('/api/v4/showcase',json=BODY).status_code==409
    pid=requester.post('/api/projects',json={'title':'Projet de présentation','description':'Projet entièrement fictif pour comparer des réalisations déclarées.','trade':'plomberie','town':'Toulouse'}).json()['id']
    aid=pro.post(f'/api/projects/{pid}/apply').json()['id'];path=f'/api/projects/{pid}/applications/{aid}/showcase'
    shown=requester.get(path);assert shown.status_code==200,shown.text
    assert shown.json()['intro']==BODY['intro'] and shown.json()['works']==BODY['works']
    assert set(shown.json())=={'profile_name','intro','works','updated_at','declaration'}
    assert other.get(path).status_code==404 and pro.get(path).status_code==403
    assert requester.get(f'/api/projects/{pid+100}/applications/{aid}/showcase').status_code==404
    assert pro.get('/api/account/export').json()['own_showcases'][0]['intro']==BODY['intro']
    assert requester.get('/api/account/export').json()['own_showcases']==[]
    assert pro.put('/api/v4/showcase',json={'intro':'','works':[],'version':1}).json()['version']==2
    assert requester.get(path).json()['works']==[]
    return pid,aid,path


def test_own_and_candidate_showcase_lifecycle_is_private_versioned_and_exported(setup):
    v=setup;authenticated(v);approve(v)
    exercise_showcase(v['pro'],v['requester'],v['other'])
    assert v['requester'].get('/api/v4/showcase').status_code==403
    assert TestClient(v['mod'].app).get('/api/v4/showcase').status_code==401
    with v['mod'].connect() as db:assert db.execute("SELECT COUNT(*) FROM audit WHERE action='save_declared_showcase'").fetchone()[0]==2


def test_linked_profile_never_inherits_manager_or_other_profiles_content(setup):
    v=setup;authenticated(v);approve(v);p=v['pro'];r=v['requester']
    assert p.put('/api/v4/showcase',json=BODY).status_code==200
    assert p.post('/api/enterprise',json={'label':'Entreprise fictive'}).status_code==201
    linked=p.post('/api/enterprise/artisans',json={'alias':'Équipe peinture','trades':['peinture'],'zones':['Toulouse']}).json()['id']
    path=f'/api/v4/showcase?linked_profile_id={linked}'
    assert p.get(path).json()['works']==[]
    assert v['intruder'].get(path).status_code==404
    assert v['intruder'].put(path,json=BODY).status_code==404
    assert p.put(path,json=BODY).status_code==422  # manager trade is not the linked trade
    content=BODY|{'intro':'Équipe fictive pour la peinture intérieure.','works':[BODY['works'][0]|{'trade':'peinture','title':'Peinture fictive'}]}
    assert p.put(path,json=content).status_code==200
    pid=project(v,'peinture');aid=p.post(f'/api/projects/{pid}/apply-linked/{linked}').json()['id']
    candidate=f'/api/projects/{pid}/applications/{aid}/showcase'
    shown=r.get(candidate).json();assert shown['profile_name']=='Équipe peinture' and shown['intro']==content['intro']
    assert shown['works'][0]['trade']=='peinture' and BODY['intro'] not in str(shown)
    assert p.post(f'/api/enterprise/artisans/{linked}/set-active',json={'active':False}).status_code==200
    assert r.get(candidate).status_code==404
    assert p.get(path).json()['intro']==content['intro']  # owner can correct an inactive profile


def test_declared_text_rejects_contacts_invalid_years_and_foreign_trades(setup):
    v=setup;authenticated(v);p=v['pro']
    for values in [BODY|{'intro':'Écrivez à contact@example.com'},BODY|{'intro':'Contactez le 06 12 34 56 78'},BODY|{'intro':'https://example.com'},BODY|{'version':True},BODY|{'works':BODY['works']*7}]:
        assert p.put('/api/v4/showcase',json=values).status_code==422
    for work in [BODY['works'][0]|{'year':'2025'},BODY['works'][0]|{'year':True},BODY['works'][0]|{'year':2101},BODY['works'][0]|{'trade':'electricite'},BODY['works'][0]|{'description':' '*30},BODY['works'][0]|{'description':'Travail au 12 rue des Lilas, réalisation fictive.'}]:
        assert p.put('/api/v4/showcase',json=BODY|{'works':[work]}).status_code==422
    assert p.get('/api/v4/showcase').json()['version']==0


def test_moderation_suspension_and_changed_trade_hide_declarations(setup):
    v=setup;authenticated(v);approve(v);p=v['pro'];r=v['requester'];pid,aid,path=exercise_showcase(p,r,v['other'])
    assert p.put('/api/v4/showcase',json=BODY|{'version':2}).status_code==200
    with v['mod'].connect() as db:db.execute('UPDATE projects SET hidden=1 WHERE id=?',(pid,))
    assert r.get(path).status_code==404
    with v['mod'].connect() as db:db.execute('UPDATE projects SET hidden=0 WHERE id=?',(pid,));db.execute('UPDATE users SET suspended=1 WHERE id=?',(v['pid'],))
    assert r.get(path).status_code==404
    with v['mod'].connect() as db:db.execute('UPDATE users SET suspended=0 WHERE id=?',(v['pid'],));db.execute("UPDATE profiles SET trade='electricite',service_trades='[]' WHERE user_id=?",(v['pid'],))
    assert r.get(path).json()['works']==[]
    with v['mod'].connect() as db:db.execute('UPDATE profiles SET approved=0 WHERE user_id=?',(v['pid'],))
    assert r.get(path).status_code==404


def test_showcase_audit_failure_rolls_back_content_and_version(setup):
    v=setup;authenticated(v);p=v['pro'];assert p.put('/api/v4/showcase',json=BODY).status_code==200
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_showcase_audit BEFORE INSERT ON audit WHEN NEW.action='save_declared_showcase' BEGIN SELECT RAISE(ABORT,'test only'); END")
    failing=TestClient(v['mod'].app,raise_server_exceptions=False);failing.cookies.update(p.cookies);failing.headers['x-ucp-csrf']=v['pcsrf']
    assert failing.put('/api/v4/showcase',json=BODY|{'intro':'Texte qui ne doit pas être conservé.','version':1}).status_code==500
    saved=p.get('/api/v4/showcase').json();assert saved['version']==1 and saved['intro']==BODY['intro']


def test_concurrent_first_save_accepts_only_one_version_and_requires_csrf(setup):
    v=setup
    assert v['pro'].put('/api/v4/showcase',json=BODY).status_code==403
    def save(_):
        with TestClient(v['mod'].app) as c:
            c.cookies.update(v['pro'].cookies)
            return v['call'](c,v['pcsrf'],'put','/api/v4/showcase',json=BODY).status_code
    with ThreadPoolExecutor(max_workers=4) as pool:codes=list(pool.map(save,range(8)))
    assert sorted(codes)==[200]+[409]*7
    assert v['pro'].get('/api/v4/showcase').json()['version']==1
