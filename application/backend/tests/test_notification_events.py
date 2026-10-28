"""Real state transitions must atomically notify only their affected account."""
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env,setup


def exercise_lifecycle_notices(mod,admin,pro,pid,other):
    root=f'/api/admin/professionals/{pid}'
    def events():return [n['event_type'] for n in pro.get('/api/notifications').json()['items']]
    assert events()==[]
    assert admin.post(root+'/activate-test-subscription').status_code==409
    assert events()==[]
    for path in ['/approve','/approve','/activate-test-subscription','/activate-test-subscription','/suspend','/suspend']:
        assert admin.post(root+path).status_code==200
    assert events()==['profile_test_suspended','test_access_activated','profile_test_authorized']
    for n in pro.get('/api/notifications').json()['items']:
        assert n['entity_id']==pid and n['read_at'] is None
        assert 'test' in n['message']
    decision={'value':True,'reason':'Suspension fictive pour recette isolée.'}
    for _ in range(2):assert admin.post(f'/api/v4/admin/users/{pid}/suspend',json=decision).status_code==200
    assert pro.get('/api/notifications').status_code in (401,403)
    for _ in range(2):assert admin.post(f'/api/v4/admin/users/{pid}/suspend',json=decision|{'value':False}).status_code==200
    # Restoration never revives the revoked session.
    assert pro.get('/api/notifications').status_code==401
    with mod.connect() as db:
        types=[r['event_type'] for r in db.execute('SELECT event_type FROM notifications WHERE recipient_id=? ORDER BY id',(pid,))]
        assert types==['profile_test_authorized','test_access_activated','profile_test_suspended','account_suspended','account_restored']
        assert db.execute('SELECT COUNT(*) FROM sessions WHERE user_id=?',(pid,)).fetchone()[0]==0
        p=db.execute('SELECT approved,subscription_active FROM profiles WHERE user_id=?',(pid,)).fetchone()
        assert not p['approved'] and not p['subscription_active']
    assert other.get('/api/notifications').json()['items']==[]


def test_profile_and_account_transition_notifications_have_no_retry_duplicates(setup):
    v=setup
    for client,csrf in [(v['admin'],v['admcsrf']),(v['pro'],v['pcsrf'])]:client.headers['x-ucp-csrf']=csrf
    exercise_lifecycle_notices(v['mod'],v['admin'],v['pro'],v['pid'],v['other'])


def test_profile_revision_notifies_only_when_previous_rights_were_revoked(setup):
    v=setup;call=v['call'];root=f'/api/admin/professionals/{v["pid"]}'
    data={'trade':'plomberie','town':'Toulouse','siren':'123456782'}
    # First save and repeated save while pending do not claim a lost authorization.
    assert call(v['pro'],v['pcsrf'],'post','/api/profile',json=data).status_code==200
    assert v['pro'].get('/api/notifications').json()['items']==[]
    for path in ['/approve','/activate-test-subscription']:
        assert call(v['admin'],v['admcsrf'],'post',root+path).status_code==200
    for _ in range(2):assert call(v['pro'],v['pcsrf'],'post','/api/profile',json=data|{'town':'Blagnac'}).status_code==200
    notes=v['pro'].get('/api/notifications').json()['items']
    assert [n['event_type'] for n in notes].count('profile_review_required')==1
    profile=v['pro'].get('/api/my-profile').json()['profile']
    assert profile['approved']==0 and profile['subscription_active']==0
    assert v['other'].get('/api/notifications').json()['items']==[]


@pytest.mark.parametrize('operation',['approve','activate-test-subscription','suspend','account-suspend','profile-change'])
def test_failed_notice_rolls_back_its_state_change_and_audit(setup,monkeypatch,operation):
    v=setup;mod=v['mod'];call=v['call'];root=f'/api/admin/professionals/{v["pid"]}'
    if operation not in ('approve','account-suspend'):
        assert call(v['admin'],v['admcsrf'],'post',root+'/approve').status_code==200
    if operation in ('suspend','profile-change'):
        assert call(v['admin'],v['admcsrf'],'post',root+'/activate-test-subscription').status_code==200
    def snapshot():
        with mod.connect() as db:
            return {table:[tuple(r) for r in db.execute('SELECT * FROM '+table+' ORDER BY 1')] for table in
                    ('profiles','users','sessions','notifications','audit','admin_decisions')}
    before=snapshot()
    def fail(*args):raise RuntimeError('Fictional notification insert failure')
    monkeypatch.setattr(mod,'queue_notice',fail)
    with pytest.raises(RuntimeError,match='Fictional notification insert failure'):
        if operation=='account-suspend':call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/users/{v["pid"]}/suspend',json={'value':True,'reason':'Fictional suspension reason.'})
        elif operation=='profile-change':call(v['pro'],v['pcsrf'],'post','/api/profile',json={'trade':'plomberie','town':'Blagnac','siren':'123456782'})
        else:call(v['admin'],v['admcsrf'],'post',root+'/'+operation)
    assert snapshot()==before


def test_denied_lifecycle_actions_do_not_send_notices(setup):
    v=setup;root=f'/api/admin/professionals/{v["pid"]}'
    for path in ['/approve','/activate-test-subscription','/suspend']:
        assert v['admin'].post(root+path).status_code==403  # Missing CSRF.
        assert v['call'](v['requester'],v['rcsrf'],'post',root+path).status_code==403
        assert v['call'](v['admin'],v['admcsrf'],'post','/api/admin/professionals/999999'+path).status_code in (404,409)
    with v['mod'].connect() as db:assert db.execute('SELECT COUNT(*) FROM notifications').fetchone()[0]==0
