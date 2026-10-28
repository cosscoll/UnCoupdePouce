"""Owner-scoped history beyond 100 entries, unread cursors and idempotent reading."""
from fastapi.testclient import TestClient
from test_lab_api import env,setup


def exercise_notification_history(mod,owner,owner_id,other,other_id):
    with mod.connect() as db:
        for i in range(123):
            db.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at,read_at) VALUES(?,?,?,?,?)',(owner_id,'new_message',i,mod.now(),mod.now() if i<30 else None))
        db.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at) VALUES(?,?,?,?)',(other_id,'new_message',99999,mod.now()))
    all_items=[];cursor=None
    for expected in [50,50,23]:
        data=owner.get('/api/notifications',params={'before_id':cursor} if cursor else {}).json()
        assert len(data['items'])==expected and data['unread']==93
        assert all(item['entity_id']!=99999 for item in data['items'])
        all_items.extend(data['items']);cursor=data['next_before_id']
    assert cursor is None and len({n['id'] for n in all_items})==123
    assert len(other.get('/api/notifications').json()['items'])==1
    unread=owner.get('/api/notifications?unread_only=true').json();assert len(unread['items'])==50
    older=owner.get('/api/notifications',params={'unread_only':True,'before_id':unread['next_before_id']}).json()
    assert len(older['items'])==43 and older['next_before_id'] is None
    assert all(x['read_at'] is None for x in unread['items']+older['items'])
    nid=unread['items'][0]['id'];assert other.post(f'/api/notifications/{nid}/read').status_code==404
    read=owner.post(f'/api/notifications/{nid}/read');assert read.status_code==200 and read.json()['unread']==92
    again=owner.post(f'/api/notifications/{nid}/read');assert again.json()==read.json()
    assert len(owner.get('/api/notifications').json()['items'])==50
    assert all(x['id']!=nid for x in owner.get('/api/notifications?unread_only=true').json()['items'])
    result=owner.post('/api/notifications/read-all');assert result.json()['count']==92 and result.json()['unread']==0
    assert owner.get('/api/notifications?unread_only=true').json()['items']==[]
    assert other.get('/api/notifications').json()['unread']==1


def test_notifications_older_than_100_remain_accessible_only_to_the_recipient(setup):
    v=setup
    v['requester'].headers['x-ucp-csrf']=v['rcsrf'];v['other'].headers['x-ucp-csrf']=v['ocsrf']
    exercise_notification_history(v['mod'],v['requester'],v['rid'],v['other'],v['oid'])


def test_notification_filter_parameters_and_writes_require_valid_authentication(setup):
    v=setup
    for path in ['/api/notifications?before_id=0','/api/notifications?before_id=-1','/api/notifications?unread_only=invalid']:
        assert v['requester'].get(path).status_code==422
    assert TestClient(v['mod'].app).get('/api/notifications?unread_only=true').status_code==401
    with v['mod'].connect() as db:nid=db.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at) VALUES(?,?,?,?)',(v['rid'],'new_message',1,v['mod'].now())).lastrowid
    assert v['requester'].post(f'/api/notifications/{nid}/read').status_code==403
    assert v['requester'].post('/api/notifications/read-all').status_code==403
    assert v['requester'].get('/api/notifications').json()['unread']==1


def test_new_notifications_do_not_disrupt_an_existing_unread_history_cursor(setup):
    v=setup
    with v['mod'].connect() as db:
        for i in range(53):db.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at) VALUES(?,?,?,?)',(v['rid'],'new_message',i,v['mod'].now()))
    first=v['requester'].get('/api/notifications?unread_only=true').json()
    with v['mod'].connect() as db:new=db.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at) VALUES(?,?,?,?)',(v['rid'],'new_message',1000,v['mod'].now())).lastrowid
    older=v['requester'].get('/api/notifications',params={'unread_only':True,'before_id':first['next_before_id']}).json()
    assert len(older['items'])==3 and older['unread']==54
    assert new not in {n['id'] for n in first['items']+older['items']}
    assert v['requester'].get('/api/notifications?unread_only=true').json()['items'][0]['id']==new
