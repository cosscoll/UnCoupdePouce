"""Report cases: least-privilege review, audit, response and participant privacy."""
import pytest
from fastapi.testclient import TestClient
from test_lab_api import env, setup, project
from test_v4 import accepted_chat


def test_message_report_review_response_is_scoped_and_audited(setup):
    v=setup;_,aid=accepted_chat(v)
    admin,r,pro,other=v['admin'],v['requester'],v['pro'],v['other']
    for client,key in [(admin,'admcsrf'),(r,'rcsrf'),(pro,'pcsrf'),(other,'ocsrf')]:
        client.headers['x-ucp-csrf']=v[key]
    exercise_report_flow(v['mod'],admin,r,pro,other,aid)


def exercise_report_flow(mod,admin,r,pro,other,aid):
    path=f'/api/conversations/{aid}/messages'
    first=pro.post(path,json={'body':'Premier message fictif à examiner.'}).json()['id']
    second=pro.post(path,json={'body':'Autre message privé hors du signalement.'}).json()['id']
    assert [x['id'] for x in r.get(path).json()['items']][-2:]==[first,second]
    data={'kind':'message','target_id':first,'reason':'Message fictif à examiner en recette.'}
    assert other.post('/api/v4/reports',json=data).status_code==403
    created=r.post('/api/v4/reports',json=data)
    assert created.status_code==201,created.text
    case=created.json()['id'];review=f'/api/v4/admin/reports/{case}/review'
    assert r.post('/api/v4/reports',json=data).status_code==409
    assert other.get('/api/v4/reports').json()['items']==[]
    own=r.get('/api/v4/reports').json()['items'][0]
    assert own['id']==case and own['status']=='open' and own['resolution'] is None
    for client in [r,pro,other]:
        assert client.post(review,json={'reason':'Examen interne du signalement.'}).status_code==403
    assert admin.post(review,json={'reason':'Examen du message ciblé.'},headers={'x-ucp-csrf':'wrong'}).status_code==403
    assert admin.post(review,json={'reason':' '*20}).status_code==422
    assert admin.post(review,json={'reason':'Examen du message ciblé.','before_id':second}).status_code==422
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='review_report'").fetchone()[0]==0
    read=admin.post(review,json={'reason':'Examen du message ciblé.'})
    assert read.status_code==200,read.text
    ctx=read.json()['context']
    assert [m['id'] for m in ctx['messages']]==[first]
    assert ctx['next_before_id'] is None and ctx['project'] is None
    assert 'Autre message privé' not in read.text and 'email' not in read.text
    assert admin.get(path).status_code==403  # no general-purpose admin reader
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='review_report' AND target_id=?",(case,)).fetchone()[0]==1
        assert db.execute("SELECT reason FROM admin_decisions WHERE kind='review_report' AND target_id=?",(case,)).fetchone()[0]=='Examen du message ciblé.'
    resolution=f'/api/v4/admin/reports/{case}/resolve'
    assert admin.post(resolution,json={'value':True,'reason':' '*20}).status_code==422
    response='Votre signalement fictif a été examiné. Réponse de recette.'
    assert admin.post(resolution,json={'value':True,'reason':response}).status_code==200
    assert admin.post(resolution,json={'value':True,'reason':response}).status_code==409
    own=r.get('/api/v4/reports').json()['items'][0]
    assert own['status']=='resolved' and own['resolution']==response
    assert other.get('/api/v4/reports').json()['items']==[]
    assert pro.get('/api/v4/reports').json()['items']==[]
    notices=[x for x in r.get('/api/notifications').json()['items'] if x['event_type']=='report_resolved']
    assert len(notices)==1 and response not in str(notices)
    assert admin.post(review,json={'reason':'Consultation après clôture.'}).status_code==409
    conv=r.post('/api/v4/reports',json={'kind':'conversation','target_id':aid,'reason':'Examen de la conversation fictive.'}).json()['id']
    reviewed=admin.post(f'/api/v4/admin/reports/{conv}/review',json={'reason':'Recette du contexte conversation.'})
    assert reviewed.status_code==200,reviewed.text
    assert [m['id'] for m in reviewed.json()['context']['messages']][-2:]==[first,second]
    assert admin.post('/api/v4/admin/reports/9999999/review',json={'reason':'Dossier absent de la base.'}).status_code==404
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='resolve_report' AND target_id=?",(case,)).fetchone()[0]==1


def test_report_conversation_review_uses_bounded_keyset_pages(setup):
    v=setup;_,aid=accepted_chat(v);mod=v['mod'];call=v['call']
    with mod.connect() as db:
        for i in range(25):
            db.execute('INSERT INTO messages(application_id,sender_id,body,created_at) VALUES(?,?,?,?)',
                       (aid,v['pid'],f'Message de pagination {i}',mod.now()))
        expected=[x[0] for x in db.execute('SELECT id FROM messages WHERE application_id=? ORDER BY id',(aid,))]
    result=call(v['requester'],v['rcsrf'],'post','/api/v4/reports',json={'kind':'conversation','target_id':aid,'reason':'Examiner la conversation fictive.'})
    case=result.json()['id'];path=f'/api/v4/admin/reports/{case}/review'
    first=call(v['admin'],v['admcsrf'],'post',path,json={'reason':'Première page pour examen.'}).json()['context']
    assert [m['id'] for m in first['messages']]==expected[-20:]
    second=call(v['admin'],v['admcsrf'],'post',path,json={'reason':'Messages plus anciens du dossier.','before_id':first['next_before_id']}).json()['context']
    assert [m['id'] for m in second['messages']]==expected[:5]
    assert second['next_before_id'] is None
    assert call(v['admin'],v['admcsrf'],'post',path,json={'reason':'Curseur invalide de recette.','before_id':0}).status_code==422
    with mod.connect() as db:
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='review_report'").fetchone()[0]==2


def test_own_report_pagination_never_crosses_account_boundary(setup):
    v=setup;pid=project(v)
    with v['mod'].connect() as db:
        for i in range(53):
            db.execute('INSERT INTO reports(reporter_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',
                       (v['rid'],'project',pid,f'Signalement fictif numéro {i}',v['mod'].now()))
        db.execute('INSERT INTO reports(reporter_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',
                   (v['oid'],'project',pid,'Une autre demande confidentielle.',v['mod'].now()))
    page=v['requester'].get('/api/v4/reports').json()
    assert len(page['items'])==50
    next_page=v['requester'].get('/api/v4/reports',params={'before_id':page['next_before_id']}).json()
    assert len(next_page['items'])==3 and next_page['next_before_id'] is None
    assert len({r['id'] for r in page['items']+next_page['items']})==53
    assert 'confidentielle' not in str(page)+str(next_page)
    assert v['requester'].get('/api/v4/reports?before_id=0').status_code==422
    assert TestClient(v['mod'].app).get('/api/v4/reports').status_code==401


def test_review_access_rollback_does_not_return_private_content(setup):
    v=setup;_,aid=accepted_chat(v);call=v['call']
    case=call(v['requester'],v['rcsrf'],'post','/api/v4/reports',json={'kind':'conversation','target_id':aid,'reason':'Recette de la trace obligatoire.'}).json()['id']
    with v['mod'].connect() as db:
        db.execute("CREATE TRIGGER fail_review BEFORE INSERT ON audit WHEN NEW.action='review_report' BEGIN SELECT RAISE(ABORT,'audit failure'); END")
    client=TestClient(v['mod'].app,raise_server_exceptions=False);client.cookies.update(v['admin'].cookies)
    result=call(client,v['admcsrf'],'post',f'/api/v4/admin/reports/{case}/review',json={'reason':'La trace doit être enregistrée.'})
    assert result.status_code==500 and 'context' not in result.text
    with v['mod'].connect() as db:
        assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='review_report'").fetchone()[0]==0


def test_response_and_notification_roll_back_together(setup):
    v=setup;pid=project(v);call=v['call']
    case=call(v['requester'],v['rcsrf'],'post','/api/v4/reports',json={'kind':'project','target_id':pid,'reason':'Recette de réponse atomique.'}).json()['id']
    review=call(v['admin'],v['admcsrf'],'post',f'/api/v4/admin/reports/{case}/review',json={'reason':'Examen du seul projet signalé.'})
    assert review.status_code==200
    assert review.json()['context']['project']['id']==pid
    assert review.json()['context']['messages']==[]
    with v['mod'].connect() as db:
        db.execute("CREATE TRIGGER fail_report_notice BEFORE INSERT ON notifications WHEN NEW.event_type='report_resolved' BEGIN SELECT RAISE(ABORT,'notice failure'); END")
    client=TestClient(v['mod'].app,raise_server_exceptions=False);client.cookies.update(v['admin'].cookies)
    response=call(client,v['admcsrf'],'post',f'/api/v4/admin/reports/{case}/resolve',json={'value':True,'reason':'Réponse sans notification possible.'})
    assert response.status_code==500
    with v['mod'].connect() as db:
        assert db.execute('SELECT status FROM reports WHERE id=?',(case,)).fetchone()[0]=='open'
        assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='resolve_report'").fetchone()[0]==0
