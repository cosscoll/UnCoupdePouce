import base64
import importlib.util
import io
import json
import sys
import time
from pathlib import Path
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from test_lab_api import env,setup,approve,project

@pytest.mark.parametrize('linked',[False,True])
def test_notification_failure_rolls_back_application_without_false_duplicate(setup,linked):
    v=setup;approve(v);pid=project(v)
    path=f'/api/projects/{pid}/apply'
    if linked:
        assert v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise',json={'label':'Atelier de test'}).status_code==201
        r=v['call'](v['pro'],v['pcsrf'],'post','/api/enterprise/artisans',json={'alias':'Plombier test','trades':['plomberie'],'zones':['Toulouse']})
        assert r.status_code==201
        path+=f'-linked/{r.json()["id"]}'
    with v['mod'].connect() as db:
        db.execute("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'test notification failure'); END")
    client=TestClient(v['mod'].app,raise_server_exceptions=False)
    client.cookies.update(v['pro'].cookies)
    r=v['call'](client,v['pcsrf'],'post',path)
    assert r.status_code==500
    assert 'test notification failure' not in r.text
    with v['mod'].connect() as db:
        assert db.execute('SELECT COUNT(*) FROM applications').fetchone()[0]==0
        assert db.execute('SELECT COUNT(*) FROM notifications').fetchone()[0]==0
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action IN ('apply_individual','apply_enterprise')").fetchone()[0]==0
        db.execute('DROP TRIGGER fail_notice')
    assert v['call'](client,v['pcsrf'],'post',path).status_code==201
    assert v['call'](client,v['pcsrf'],'post',path).status_code==409
    client.close()

PAYLOAD={'title':'Rénover la salle de bains','description':'Remplacer les équipements et le revêtement de la pièce.','town':'Toulouse','trades':['plomberie','electricite'],'timing':'month'}

def accepted_chat(v):
    pid=project(v);approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    return pid,aid

def test_message_retries_are_scoped_atomic_and_recheck_permissions(setup):
    v=setup;pid,aid=accepted_chat(v);path=f'/api/conversations/{aid}/messages'
    headers={'Idempotency-Key':'retry-test-00000001'}
    def send(client,csrf,text='Bonjour, précisons le projet.'):
        return v['call'](client,csrf,'post',path,headers=headers,json={'body':text})
    first=send(v['pro'],v['pcsrf']);assert first.status_code==201
    assert send(v['pro'],v['pcsrf']).json()==first.json()
    assert send(v['pro'],v['pcsrf'],'Un autre texte').status_code==409
    assert send(v['other'],v['ocsrf']).status_code==403
    assert send(v['requester'],v['rcsrf']).json()['id']!=first.json()['id']
    with v['mod'].connect() as db:
        assert db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==2
        assert db.execute("SELECT COUNT(*) FROM notifications WHERE event_type='new_message'").fetchone()[0]==2
    assert v['call'](v['pro'],v['pcsrf'],'post',path,headers={'Idempotency-Key':'bad'},json={'body':'Bonjour'}).status_code==422
    assert v['call'](v['pro'],v['pcsrf'],'post',path,json={'body':'   '}).status_code==422
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    assert send(v['pro'],v['pcsrf']).status_code==403

def test_parallel_message_retries_use_sql_transactions(setup):
    from concurrent.futures import ThreadPoolExecutor
    v=setup;_,aid=accepted_chat(v);path=f'/api/conversations/{aid}/messages'
    def send(i):
        with TestClient(v['mod'].app) as client:
            client.cookies.update(v['pro'].cookies)
            return v['call'](client,v['pcsrf'],'post',path,headers={'Idempotency-Key':'parallel-test-00001'},json={'body':'Un seul message malgré les réessais.'})
    with ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(send,range(16)))
    assert {r.status_code for r in results}=={201}
    assert len({r.json()['id'] for r in results})==1
    with v['mod'].connect() as db:
        assert db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==1
        assert db.execute("SELECT COUNT(*) FROM notifications WHERE event_type='new_message'").fetchone()[0]==1

def test_message_notification_failure_rolls_back_retry_key(setup):
    v=setup;_,aid=accepted_chat(v);path=f'/api/conversations/{aid}/messages'
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_notice BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'simulated'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['pro'].cookies)
        def send():return v['call'](client,v['pcsrf'],'post',path,headers={'Idempotency-Key':'rollback-test-00001'},json={'body':'Bonjour, test de transaction.'})
        assert send().status_code==500
        with v['mod'].connect() as db:
            assert db.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==0
            assert db.execute('SELECT COUNT(*) FROM message_retries').fetchone()[0]==0
            db.execute('DROP TRIGGER fail_notice')
        assert send().status_code==201

def draft(v,**updates):
    r=v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',json=PAYLOAD|updates)
    assert r.status_code==201,r.text
    return r.json()

def publish(v,d):
    r=v['call'](v['requester'],v['rcsrf'],'post',f'/api/v4/drafts/{d["id"]}/publish',json={'version':d['version']})
    assert r.status_code==201,r.text
    return r.json()['id']

def photo(v,d):
    im=Image.new('RGB',(12,10),'red');exif=Image.Exif();exif[270]='metadata-must-be-removed'
    buf=io.BytesIO();im.save(buf,'JPEG',exif=exif)
    r=v['call'](v['requester'],v['rcsrf'],'post',f'/api/v4/drafts/{d["id"]}/photos',json={'data':base64.b64encode(buf.getvalue()).decode()})
    assert r.status_code==201,r.text
    d['version']=r.json()['version']
    return r.json()['id']

def test_draft_owner_version_and_idempotent_publication(setup):
    v=setup;d=draft(v)
    assert v['other'].get('/api/v4/drafts').json()['items']==[]
    for method,suffix,data in [('put','',PAYLOAD|{'version':1}),('post','/publish',{'version':1}),('delete','',None)]:
        assert v['call'](v['other'],v['ocsrf'],method,f'/api/v4/drafts/{d["id"]}'+suffix,**({'json':data} if data is not None else {})).status_code==404
    path=f'/api/v4/drafts/{d["id"]}'
    assert v['call'](v['requester'],v['rcsrf'],'put',path,json=PAYLOAD|{'version':0}).status_code==409
    r=v['call'](v['requester'],v['rcsrf'],'put',path,json=PAYLOAD|{'version':1});assert r.json()['version']==2
    assert v['call'](v['requester'],v['rcsrf'],'post',path+'/publish',json={'version':1}).status_code==409
    d['version']=2;pid=publish(v,d);assert publish(v,d)==pid
    assert len(v['requester'].get('/api/projects').json()['items'])==1
    assert v['call'](v['requester'],v['rcsrf'],'delete',path).status_code==409

def test_multi_trade_matching_timing_and_legacy_edit_preserves_categories(setup):
    v=setup;pid=publish(v,draft(v));approve(v);approve(v,'intruder')
    for cl in [v['pro'],v['intruder']]:assert pid in [r['id'] for r in cl.get('/api/projects').json()['items']]
    d=v['pro'].get(f'/api/v4/projects/{pid}').json();assert set(d['trades'])==set(PAYLOAD['trades']);assert d['timing']=='month'
    edit={k:PAYLOAD[k] for k in ['title','description','town']}|{'trade':'plomberie'}
    assert v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=edit).status_code==200
    assert set(v['requester'].get(f'/api/v4/projects/{pid}').json()['trades'])==set(PAYLOAD['trades'])
    assert v['call'](v['requester'],v['rcsrf'],'put',f'/api/projects/{pid}',json=edit|{'trade':'chauffage'}).status_code==409

def test_photo_privacy_metadata_and_export(setup):
    v=setup;d=draft(v);iid=photo(v,d);path=f'/api/v4/photos/{iid}'
    r=v['requester'].get(path);assert r.status_code==200;assert r.headers['cache-control']=='no-store'
    assert not Image.open(io.BytesIO(r.content)).getexif()
    assert v['other'].get(path).status_code==404
    assert TestClient(v['mod'].app).get(path).status_code==401
    pid=publish(v,d);approve(v,paid=True)
    assert v['pro'].get(path).status_code==404
    assert v['pro'].get(f'/api/v4/projects/{pid}').json()['photos']==[]
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert v['pro'].get(path).status_code==200
    assert v['call'](v['requester'],v['rcsrf'],'delete',path).status_code==409
    exported=v['requester'].get('/api/account/export').json()
    assert exported['own_photos'][0]['jpeg_base64']==base64.b64encode(r.content).decode()
    assert v['other'].get('/api/account/export').json()['own_photos']==[]
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    assert v['pro'].get(path).status_code==403

def test_photo_validation_limits_delete_and_cascade(setup):
    v=setup;d=draft(v);path=f'/api/v4/drafts/{d["id"]}/photos'
    assert v['call'](v['requester'],v['rcsrf'],'post',path,json={'data':'invalid!'}).status_code==422
    assert v['call'](v['requester'],v['rcsrf'],'post',path,json={'data':base64.b64encode(b'<svg></svg>').decode()}).status_code==422
    ids=[photo(v,d) for _ in range(5)]
    im=io.BytesIO();Image.new('RGB',(1,1)).save(im,'PNG')
    assert v['call'](v['requester'],v['rcsrf'],'post',path,json={'data':base64.b64encode(im.getvalue()).decode()}).status_code==409
    assert v['call'](v['other'],v['ocsrf'],'delete',f'/api/v4/photos/{ids[0]}').status_code==404
    assert v['call'](v['requester'],v['rcsrf'],'delete',f'/api/v4/drafts/{d["id"]}').status_code==200
    for id in ids:assert v['requester'].get(f'/api/v4/photos/{id}').status_code==404

def test_moderation_reports_audit_and_hidden_projects(setup):
    v=setup;pid=publish(v,draft(v));approve(v)
    report={'kind':'project','target_id':pid,'reason':'Description de test à examiner'}
    assert v['call'](v['other'],v['ocsrf'],'post','/api/v4/reports',json=report).status_code==404
    r=v['call'](v['pro'],v['pcsrf'],'post','/api/v4/reports',json=report);assert r.status_code==201
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/v4/reports',json=report).status_code==409
    decision={'value':True,'reason':'Modération de test justifiée'}
    path=f'/api/v4/admin/projects/{pid}/hide'
    assert v['call'](v['requester'],v['rcsrf'],'post',path,json=decision).status_code==403
    assert v['call'](v['admin'],v['admcsrf'],'post',path,json=decision).status_code==200
    assert v['pro'].get('/api/projects').json()['items']==[]
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==403
    assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/reports/{r.json()["id"]}/resolve',json=decision).status_code==200
    with v['mod'].connect() as c:assert c.execute("SELECT 1 FROM audit WHERE action='hide_project'").fetchone()

def test_suspension_revokes_sessions_and_blocks_counterparty_chat(setup):
    v=setup;pid=publish(v,draft(v));approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept')
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==200
    r=v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/users/{v["rid"]}/suspend',json={'value':True,'reason':'Suspension de test motivée'});assert r.status_code==200
    assert v['requester'].get('/api/me').status_code==401
    assert v['pro'].get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['requester'].post('/api/login',json={'email':'demo-occupant@ucp-lab.example','password':'Laboratoire-Test!9326'}).status_code==401

def test_catalog_live_add_disable_and_unknown_classification(setup):
    v=setup
    assert v['requester'].get('/api/catalog?q=electricite').json()['items']
    t={'id':'etude-test','label':'Étude de test','group':'Études','synonyms':['testeur'],'active':True}
    assert v['call'](v['admin'],v['admcsrf'],'put','/api/v4/admin/catalog',json=t).status_code==200
    v['mod'].TRADES.discard('etude-test') # Simulate a different worker's stale in-memory cache.
    d=draft(v,trades=['etude-test']);publish(v,d)
    assert v['call'](v['admin'],v['admcsrf'],'put','/api/v4/admin/catalog',json=t|{'active':False}).status_code==200
    body={'title':PAYLOAD['title'],'description':PAYLOAD['description'],'town':'Toulouse','trade':'etude-test'}
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/projects',json=body).status_code==422
    pid=publish(v,draft(v,trades=['inconnu']));approve(v)
    assert v['pro'].get('/api/projects').json()['items']==[]
    path=f'/api/v4/admin/projects/{pid}/classify';body={'trades':['plomberie'],'reason':'Le besoin décrit une fuite de test'}
    assert v['call'](v['pro'],v['pcsrf'],'post',path,json=body).status_code==403
    assert v['call'](v['admin'],v['admcsrf'],'post',path,json=body).status_code==200
    assert v['pro'].get('/api/projects').json()['items'][0]['id']==pid
    assert v['call'](v['admin'],v['admcsrf'],'post',path,json=body).status_code==409

def test_recovery_single_use_expiry_and_old_sessions(env):
    mod,make,call,admin,csrf=env;c,uid,_=make('requester','recovery-test')
    token='a'*32
    with mod.connect() as db:db.execute('INSERT INTO resets VALUES(?,?,?)',(mod.hash_token(token),uid,int(time.time())+60))
    anon=TestClient(mod.app);body={'token':token,'password':'New-Local-Pass!2026'}
    assert anon.post('/api/v4/account/reset',json=body).status_code==200
    assert c.get('/api/me').status_code==401
    assert anon.post('/api/v4/account/reset',json=body).status_code==400
    assert anon.post('/api/login',json={'email':'recovery-test@ucp-lab.example','password':body['password']}).status_code==200
    with mod.connect() as db:db.execute('INSERT INTO resets VALUES(?,?,?)',(mod.hash_token(token),uid,int(time.time())-1))
    assert anon.post('/api/v4/account/reset',json=body).status_code==400

def test_name_change_is_scoped_and_rejects_contact(env):
    mod,make,call,*_=env;c,uid,csrf=make('requester','name-test')
    assert call(c,csrf,'put','/api/v4/account',json={'name':'Camille Test'}).status_code==200
    assert c.get('/api/me').json()['name']=='Camille Test'
    assert call(c,csrf,'put','/api/v4/account',json={'name':'person@example.com'}).status_code==422

def test_database_backup_restore_photos_and_session_revocation(setup,tmp_path):
    v=setup;d=draft(v);iid=photo(v,d);pid=publish(v,d)
    script=Path(__file__).parents[2]/'scripts/database.py'
    spec=importlib.util.spec_from_file_location('backup_tool',script);backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
    saved=backup.copy_database(v['mod'].DB,tmp_path/'backup.db')
    restored=backup.copy_database(saved,tmp_path/'restore.db',True)
    import sqlite3
    with sqlite3.connect(restored) as c:
        assert c.execute('SELECT count(*) FROM photos').fetchone()[0]==1
        assert c.execute('SELECT count(*) FROM projects').fetchone()[0]==1
        assert c.execute('SELECT count(*) FROM sessions').fetchone()[0]==0
        assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    with pytest.raises(ValueError):backup.copy_database(saved,restored)
