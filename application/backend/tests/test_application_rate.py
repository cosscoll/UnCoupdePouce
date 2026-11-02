"""Abuse guard shared across individual/linked applications and server workers."""
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sys
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env, setup, approve, project
sys.path.insert(0,str(Path(__file__).parents[1]))
from application_rate import load_limits


def make_project(owner):
    result=owner.post('/api/projects',json={'title':'Mission fictive','description':'Travaux fictifs de plomberie pour une recette.','trade':'plomberie','town':'Toulouse'})
    assert result.status_code==201,result.text
    return result.json()['id']


def counts(mod):
    with mod.connect() as c:
        return tuple(c.execute('SELECT COUNT(*) FROM '+table).fetchone()[0] for table in ['applications','notifications','audit'])


def exercise_shared_rate(mod,pro,requester):
    projects=[make_project(requester) for _ in range(4)]
    assert pro.post('/api/enterprise',json={'label':'Equipe fictive'}).status_code==201
    linked=pro.post('/api/enterprise/artisans',json={'alias':'Plombier fictif','trades':['plomberie'],'zones':['Toulouse']}).json()['id']
    original_now,original_limits=mod.now,mod.APPLICATION_LIMITS
    current=datetime(2026,11,2,12,tzinfo=timezone.utc)
    mod.now=lambda:current.isoformat(timespec='seconds');mod.APPLICATION_LIMITS=((60,2),(3600,3))
    def apply(i,as_linked=False,client=pro):return client.post(f'/api/projects/{projects[i]}/apply'+(f'-linked/{linked}' if as_linked else ''))
    try:
        first=apply(0);assert first.status_code==201,first.text
        assert apply(1,True).status_code==201
        before=counts(mod)
        assert apply(0).status_code==409  # Duplicate retains its meaning even at the limit.
        blocked=apply(2,True);assert blocked.status_code==429 and blocked.headers['Retry-After']=='60'
        assert counts(mod)==before
        assert pro.post(f'/api/applications/{first.json()["id"]}/withdraw').status_code==200
        assert apply(2).status_code==429  # Withdrawal does not erase the successful send.
        # A new worker/session and reinitialization see the same persisted history.
        mod.init_db()
        with TestClient(mod.app) as fresh:
            fresh.cookies.update(pro.cookies);fresh.headers.update(pro.headers)
            assert apply(2,client=fresh).status_code==429
        current+=timedelta(seconds=60)
        assert apply(2).status_code==201  # Exact rolling-window boundary releases the slot.
        before=counts(mod);blocked=apply(3,True)
        assert blocked.status_code==429 and blocked.headers['Retry-After']=='3540'
        assert counts(mod)==before
        current+=timedelta(seconds=3540)
        assert apply(3,True).status_code==201
    finally:mod.now,mod.APPLICATION_LIMITS=original_now,original_limits


def test_individual_and_linked_share_persisted_rolling_windows(setup):
    v=setup;approve(v)
    for key,csrf in [('pro','pcsrf'),('requester','rcsrf')]:v[key].headers['x-ucp-csrf']=v[csrf]
    exercise_shared_rate(v['mod'],v['pro'],v['requester'])


def exercise_parallel_rate(mod,pro,requester):
    projects=[make_project(requester) for _ in range(2)]
    original=mod.APPLICATION_LIMITS;mod.APPLICATION_LIMITS=((60,1),(3600,2))
    def send(pid):
        with TestClient(mod.app) as client:
            client.cookies.update(pro.cookies);client.headers.update(pro.headers)
            return client.post(f'/api/projects/{pid}/apply').status_code
    try:
        before=counts(mod)
        with ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(send,projects))
        assert sorted(statuses)==[201,429]
        after=counts(mod)
        assert tuple(after[i]-before[i] for i in range(3))==(1,1,1)
    finally:mod.APPLICATION_LIMITS=original


def test_parallel_applications_cannot_exceed_limit(setup):
    v=setup;approve(v)
    for key,csrf in [('pro','pcsrf'),('requester','rcsrf')]:v[key].headers['x-ucp-csrf']=v[csrf]
    exercise_parallel_rate(v['mod'],v['pro'],v['requester'])


def test_limit_is_per_account_and_forwarded_ip_does_not_change_it(setup):
    v=setup;approve(v);mod=v['mod'];mod.APPLICATION_LIMITS=((60,1),(3600,2));a=project(v);b=project(v)
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{a}/apply').status_code==201
    for fake_ip in ['192.0.2.1','192.0.2.2']:
        assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{b}/apply',headers={'x-forwarded-for':fake_ip}).status_code==429
    with mod.connect() as c:c.execute("UPDATE profiles SET trade='plomberie',approved=1 WHERE user_id=?",(v['iid'],))
    assert v['call'](v['intruder'],v['icsrf'],'post',f'/api/projects/{b}/apply',headers={'x-forwarded-for':'192.0.2.1'}).status_code==201


def test_failed_transaction_does_not_consume_a_rate_slot(setup):
    v=setup;approve(v);mod=v['mod'];mod.APPLICATION_LIMITS=((60,1),(3600,2));pid=project(v)
    with mod.connect() as c:c.execute("CREATE TRIGGER fail_application_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    before=counts(mod)
    with TestClient(mod.app,raise_server_exceptions=False) as client:
        client.cookies.update(v['pro'].cookies)
        assert v['call'](client,v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==500
    assert counts(mod)==before
    with mod.connect() as c:c.execute('DROP TRIGGER fail_application_audit')
    assert v['call'](v['pro'],v['pcsrf'],'post',f'/api/projects/{pid}/apply').status_code==201


def test_lowered_limit_waits_until_enough_previous_sends_expire(setup):
    v=setup;approve(v);mod=v['mod'];current=datetime(2026,11,2,12,tzinfo=timezone.utc)
    for offset in [-40,-30,-20,-10]:
        pid=project(v)
        with mod.connect() as c:c.execute('INSERT INTO applications(project_id,professional_id,created_at) VALUES(?,?,?)',(pid,v['pid'],(current+timedelta(seconds=offset)).isoformat(timespec='seconds')))
    pid=project(v);mod.APPLICATION_LIMITS=((60,2),(3600,5));mod.now=lambda:current.isoformat(timespec='seconds')
    path=f'/api/projects/{pid}/apply'
    blocked=v['call'](v['pro'],v['pcsrf'],'post',path)
    assert blocked.status_code==429 and blocked.headers['Retry-After']=='40'
    current+=timedelta(seconds=39)
    blocked=v['call'](v['pro'],v['pcsrf'],'post',path)
    assert blocked.status_code==429 and blocked.headers['Retry-After']=='1'
    current+=timedelta(seconds=1)
    assert v['call'](v['pro'],v['pcsrf'],'post',path).status_code==201


@pytest.mark.parametrize('raw',['0','-1','1.5','','１１','10001'])
def test_invalid_rate_configuration_fails_closed(monkeypatch,raw):
    monkeypatch.setenv('UCP_APPLICATIONS_PER_MINUTE',raw)
    with pytest.raises(RuntimeError):load_limits()


def test_rate_defaults_and_inconsistent_configuration(monkeypatch):
    monkeypatch.delenv('UCP_APPLICATIONS_PER_MINUTE',raising=False);monkeypatch.delenv('UCP_APPLICATIONS_PER_HOUR',raising=False)
    assert load_limits()==((60,10),(3600,50))
    monkeypatch.setenv('UCP_APPLICATIONS_PER_MINUTE','20');monkeypatch.setenv('UCP_APPLICATIONS_PER_HOUR','10')
    with pytest.raises(RuntimeError):load_limits()
