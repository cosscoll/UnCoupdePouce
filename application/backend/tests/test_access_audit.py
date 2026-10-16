"""Adversarial access checks on the real Work API, with synthetic accounts only."""
import time
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from test_lab_api import env, setup, approve, project
from test_v4 import accepted_chat, draft, photo, publish

@pytest.mark.parametrize('restriction',['hidden','requester_suspended','pro_suspended','unapproved'])
def test_moderated_conversation_is_absent_from_lists_and_photos(setup,restriction):
    v=setup;d=draft(v);image=photo(v,d);pid=publish(v,d);approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    assert v['pro'].get(f'/api/v4/photos/{image}').status_code==200
    if restriction=='hidden':
        r=v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/projects/{pid}/hide',json={'value':True,'reason':'Restriction de recette fictive'})
        assert r.status_code==200
    elif restriction.endswith('_suspended'):
        uid=v['rid'] if restriction=='requester_suspended' else v['pid']
        r=v['call'](v['admin'],v['admcsrf'],'post',f'/api/v4/admin/users/{uid}/suspend',json={'value':True,'reason':'Restriction de recette fictive'})
        assert r.status_code==200
    else:
        assert v['call'](v['admin'],v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/suspend').status_code==200
    peer=v['requester'] if restriction=='pro_suspended' else v['pro']
    assert peer.get('/api/conversations').json()['items']==[]
    assert peer.get(f'/api/conversations/{aid}/messages').status_code==403
    assert v['pro'].get(f'/api/v4/photos/{image}').status_code in (401,403)
    assert v['other'].get(f'/api/v4/photos/{image}').status_code==404

@pytest.mark.parametrize('endpoint',['message','project','draft','account'])
def test_revoked_session_cannot_write_after_dependency_authentication(setup,endpoint):
    v=setup;pid,aid=accepted_chat(v);mod=v['mod'];original=mod.get_user
    client,csrf=(v['pro'],v['pcsrf']) if endpoint=='message' else (v['requester'],v['rcsrf'])
    def revoke_after_auth(request:Request):
        user=original(request)
        with mod.connect() as c:c.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
        return user
    mod.app.dependency_overrides[original]=revoke_after_auth
    routes={
      'message':('post',f'/api/conversations/{aid}/messages',{'body':'Ce message ne doit pas être enregistré.'}),
      'project':('post','/api/projects',{'title':'Projet rejeté','description':'Ce projet de test ne doit jamais être enregistré.','town':'Toulouse','trade':'plomberie'}),
      'draft':('post','/api/v4/drafts',{'title':'Brouillon rejeté'}),
      'account':('put','/api/v4/account',{'name':'Nom non autorisé'})}
    method,path,body=routes[endpoint]
    try:
        assert v['call'](client,csrf,method,path,json=body).status_code==401
        with mod.connect() as c:
            assert c.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==0
            assert c.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==1
            assert c.execute('SELECT COUNT(*) FROM drafts').fetchone()[0]==0
            assert not c.execute("SELECT 1 FROM users WHERE name='Nom non autorisé'").fetchone()
    finally:mod.app.dependency_overrides.clear()

@pytest.mark.parametrize('change',['reset','suspend'])
def test_login_rechecks_identity_after_password_work(env,monkeypatch,change):
    mod,make,call,*_=env;client,uid,csrf=make('requester','login-race')
    original=mod.pw
    replacement_salt='a1'*16
    replacement_hash=original('Replacement-Test-Pass!2026',replacement_salt)
    def change_during_kdf(password,salt):
        result=original(password,salt)
        with mod.connect() as c:
            if change=='reset':c.execute('UPDATE users SET pw_salt=?,pw_hash=? WHERE id=?',(replacement_salt,replacement_hash,uid))
            else:c.execute('UPDATE users SET suspended=1 WHERE id=?',(uid,))
            c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        return result
    monkeypatch.setattr(mod,'pw',change_during_kdf)
    fresh=TestClient(mod.app)
    assert fresh.post('/api/login',json={'email':'login-race@ucp-lab.example','password':'Laboratoire-Test!9326'}).status_code==401
    with mod.connect() as c:assert c.execute('SELECT COUNT(*) FROM sessions WHERE user_id=?',(uid,)).fetchone()[0]==0

def test_session_is_expired_at_its_expiration_second(env,monkeypatch):
    mod,make,*_=env;client,uid,csrf=make('requester','expiry-boundary')
    stamp=int(time.time())
    with mod.connect() as c:c.execute('UPDATE sessions SET expires=? WHERE user_id=?',(stamp,uid))
    monkeypatch.setattr(mod.time,'time',lambda:stamp)
    assert client.get('/api/me').status_code==401

@pytest.mark.parametrize('endpoint',['photo','messages','export','me'])
def test_private_reads_recheck_revocation_in_their_snapshot(setup,endpoint):
    v=setup;d=draft(v);image=photo(v,d);pid=publish(v,d);approve(v,paid=True)
    aid=v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').json()['id']
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/applications/{aid}/accept').status_code==200
    mod=v['mod'];original=mod.get_user
    def revoke_after_auth(request:Request):
        user=original(request)
        with mod.connect() as c:c.execute('DELETE FROM sessions WHERE user_id=?',(user['id'],))
        return user
    mod.app.dependency_overrides[original]=revoke_after_auth
    paths={'photo':f'/api/v4/photos/{image}','messages':f'/api/conversations/{aid}/messages','export':'/api/account/export','me':'/api/me'}
    try:assert v['requester'].get(paths[endpoint]).status_code==401
    finally:mod.app.dependency_overrides.clear()

def test_revocation_committed_while_message_waits_for_write_lock(setup):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    v=setup;_,aid=accepted_chat(v);mod=v['mod'];original=mod.get_user;authenticated=Event()
    def observe_auth(request:Request):
        user=original(request);authenticated.set();return user
    mod.app.dependency_overrides[original]=observe_auth
    with TestClient(mod.app) as client,ThreadPoolExecutor(max_workers=1) as pool:
        client.cookies.update(v['pro'].cookies)
        try:
            with mod.connect() as lock:
                lock.execute('BEGIN IMMEDIATE')
                future=pool.submit(v['call'],client,v['pcsrf'],'post',f'/api/conversations/{aid}/messages',json={'body':'Écriture en attente, session révoquée.'})
                assert authenticated.wait(timeout=5),'Authentication did not reach the controlled race'
                lock.execute('DELETE FROM sessions WHERE user_id=?',(v['pid'],));lock.commit()
            assert future.result(timeout=10).status_code==401
            with mod.connect() as c:assert c.execute('SELECT COUNT(*) FROM messages').fetchone()[0]==0
        finally:mod.app.dependency_overrides.clear()

def test_csrf_rotation_after_authentication_blocks_stale_write(env):
    mod,make,call,*_=env;client,uid,csrf=make('requester','csrf-race');original=mod.get_user
    def rotate_after_auth(request:Request):
        user=original(request)
        with mod.connect() as c:c.execute('UPDATE sessions SET csrf_hash=? WHERE user_id=?',(mod.hash_token('new-private-csrf-value'),uid))
        return user
    mod.app.dependency_overrides[original]=rotate_after_auth
    try:
        assert call(client,csrf,'put','/api/v4/account',json={'name':'Changement interdit'}).status_code==403
        with mod.connect() as c:assert c.execute('SELECT name FROM users WHERE id=?',(uid,)).fetchone()[0]=='csrf-race'
    finally:mod.app.dependency_overrides.clear()

@pytest.mark.parametrize('operation',['approve','activate-test-subscription','suspend'])
def test_admin_decision_and_audit_are_atomic(setup,operation):
    v=setup;mod=v['mod']
    if operation!='approve':approve(v,paid=operation=='suspend')
    with mod.connect() as c:
        before=tuple(c.execute('SELECT approved,subscription_active FROM profiles WHERE user_id=?',(v['pid'],)).fetchone())
        c.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    with TestClient(mod.app,raise_server_exceptions=False) as client:
        client.cookies.update(v['admin'].cookies)
        response=v['call'](client,v['admcsrf'],'post',f'/api/admin/professionals/{v["pid"]}/{operation}')
        assert response.status_code==500
        assert 'controlled audit failure' not in response.text
    with mod.connect() as c:
        assert tuple(c.execute('SELECT approved,subscription_active FROM profiles WHERE user_id=?',(v['pid'],)).fetchone())==before

def test_reset_token_expired_at_exact_boundary(env,monkeypatch):
    mod,make,*_=env;client,uid,csrf=make('requester','reset-boundary');stamp=int(time.time());token='expiry-test-token-'+'x'*24
    with mod.connect() as c:c.execute('INSERT INTO resets VALUES(?,?,?)',(mod.hash_token(token),uid,stamp))
    monkeypatch.setattr(mod.time,'time',lambda:stamp)
    assert TestClient(mod.app).post('/api/v4/account/reset',json={'token':token,'password':'Replacement-Test-Pass!2026'}).status_code==400

def test_publication_retry_preserves_closed_status(setup):
    v=setup;d=draft(v);pid=publish(v,d)
    assert v['call'](v['requester'],v['rcsrf'],'post',f'/api/projects/{pid}/close').status_code==200
    response=v['call'](v['requester'],v['rcsrf'],'post',f'/api/v4/drafts/{d["id"]}/publish',json={'version':d['version']})
    assert response.status_code==201
    assert response.json()=={'id':pid,'status':'closed','already_published':True}
    with v['mod'].connect() as c:assert c.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==1
