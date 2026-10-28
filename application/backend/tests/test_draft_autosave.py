"""Lost initial responses must not duplicate drafts or adopt a later version."""
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from test_lab_api import env,setup
from test_v4 import PAYLOAD

KEY='draft-create-fictional-0001'
HEADERS={'Idempotency-Key':KEY}


def exercise_draft_creation_recovery(mod,owner,other):
    def create(client,body=PAYLOAD):return client.post('/api/v4/drafts',json=body,headers=HEADERS)
    first=create(owner);assert first.status_code==201,first.text
    initial=first.json();did=initial['id']
    assert create(owner).json()==initial
    assert create(owner,PAYLOAD|{'title':'Une autre demande fictive'}).status_code==409
    foreign=create(other);assert foreign.status_code==201 and foreign.json()['id']!=did
    assert len(owner.get('/api/v4/drafts').json()['items'])==1
    changed=PAYLOAD|{'title':'Texte plus récent dans une autre fenêtre','version':1}
    assert owner.put(f'/api/v4/drafts/{did}',json=changed).json()['version']==2
    assert create(owner).json()=={'id':did,'version':1,'changed_since_creation':True}
    assert owner.put(f'/api/v4/drafts/{did}',json=PAYLOAD|{'version':1}).status_code==409
    assert owner.get('/api/v4/drafts').json()['items'][0]['title']==changed['title']
    assert owner.delete(f'/api/v4/drafts/{did}').status_code==200
    assert create(owner).status_code==409
    assert owner.get('/api/v4/drafts').json()['items']==[]
    with mod.connect() as db:
        rows=db.execute('SELECT draft_id FROM draft_creation_retries WHERE retry_key=? ORDER BY owner_id',(KEY,)).fetchall()
        assert len(rows)==2 and any(r['draft_id'] is None for r in rows)


def test_creation_retries_are_private_version_safe_and_do_not_resurrect_deleted_drafts(setup):
    v=setup
    v['requester'].headers['x-ucp-csrf']=v['rcsrf'];v['other'].headers['x-ucp-csrf']=v['ocsrf']
    exercise_draft_creation_recovery(v['mod'],v['requester'],v['other'])


def test_parallel_initial_retries_create_only_one_draft_and_audit_event(setup):
    v=setup
    def create(i):
        with TestClient(v['mod'].app) as client:
            client.cookies.update(v['requester'].cookies)
            return v['call'](client,v['rcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD)
    with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(create,range(4)))
    assert {r.status_code for r in results}=={201}
    assert len({r.json()['id'] for r in results})==1
    with v['mod'].connect() as db:
        for table in ['drafts','draft_creation_retries']:assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==1
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='draft_created'").fetchone()[0]==1


def test_recovering_an_existing_creation_does_not_consume_the_full_draft_quota(setup):
    v=setup
    first=v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).json()
    for i in range(29):assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',json=PAYLOAD).status_code==201
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).json()==first
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',json=PAYLOAD).status_code==409
    assert len(v['requester'].get('/api/v4/drafts').json()['items'])==30


def test_failed_creation_audit_does_not_leave_a_draft_or_retry_marker(setup):
    v=setup
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_create_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'fictional audit failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['requester'].cookies)
        result=v['call'](client,v['rcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD)
        assert result.status_code==500 and 'fictional audit failure' not in result.text
    with v['mod'].connect() as db:
        for table in ['drafts','draft_creation_retries']:assert db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]==0
        db.execute('DROP TRIGGER fail_create_audit')
    assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).status_code==201


def test_replayed_initial_creation_after_publication_never_creates_another_draft(setup):
    v=setup;call=v['call'];owner=v['requester'];csrf=v['rcsrf']
    original=call(owner,csrf,'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).json()
    published=call(owner,csrf,'post',f'/api/v4/drafts/{original["id"]}/publish',json={'version':1});assert published.status_code==201
    assert call(owner,csrf,'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).json()==original|{'changed_since_creation':True}
    assert call(owner,csrf,'put',f'/api/v4/drafts/{original["id"]}',json=PAYLOAD|{'version':1}).status_code==409
    with v['mod'].connect() as db:
        assert db.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==1
        assert db.execute('SELECT COUNT(*) FROM drafts').fetchone()[0]==1


def test_creation_retry_keys_require_valid_syntax_role_session_and_csrf(setup):
    v=setup
    for key in ['short','bad key with spaces 0000','x'*101]:
        assert v['call'](v['requester'],v['rcsrf'],'post','/api/v4/drafts',headers={'Idempotency-Key':key},json=PAYLOAD).status_code==422
    assert v['requester'].post('/api/v4/drafts',headers=HEADERS,json=PAYLOAD).status_code==403
    assert v['call'](v['pro'],v['pcsrf'],'post','/api/v4/drafts',headers=HEADERS,json=PAYLOAD).status_code==403
    assert TestClient(v['mod'].app).post('/api/v4/drafts',headers=HEADERS,json=PAYLOAD).status_code==401
    assert v['requester'].get('/api/v4/drafts').json()['items']==[]
