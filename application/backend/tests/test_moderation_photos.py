"""An admin role alone must not authorize reading private project photos."""
import base64,io
from PIL import Image
from fastapi.testclient import TestClient
from test_lab_api import env,setup
from test_v4 import PAYLOAD


def photo_project(owner):
    draft=owner.post('/api/v4/drafts',json=PAYLOAD).json()
    content=io.BytesIO();Image.new('RGB',(6,6),'orange').save(content,'PNG')
    image=owner.post(f'/api/v4/drafts/{draft["id"]}/photos',json={'data':base64.b64encode(content.getvalue()).decode()})
    assert image.status_code==201,image.text
    pid=owner.post(f'/api/v4/drafts/{draft["id"]}/publish',json={'version':image.json()['version']}).json()['id']
    return pid,image.json()['id']


def open_case(owner,pid):
    result=owner.post('/api/v4/reports',json={'kind':'project','target_id':pid,'reason':'Demande fictive d’examen de la photo du projet.'})
    assert result.status_code==201,result.text
    return result.json()['id']


def prepare(v):
    for name,csrf in [('requester','rcsrf'),('admin','admcsrf'),('other','ocsrf')]:v[name].headers['x-ucp-csrf']=v[csrf]


def test_admin_cannot_read_a_private_photo_without_a_motivated_open_case(setup):
    v=setup;prepare(v);pid,image=photo_project(v['requester'])
    assert v['requester'].get(f'/api/v4/photos/{image}').status_code==200
    assert v['admin'].get(f'/api/v4/photos/{image}').status_code==404
    assert v['other'].get(f'/api/v4/photos/{image}').status_code==404


def exercise_case_scoped_photos(mod,owner,admin,other):
    pid,image=photo_project(owner);case=open_case(owner,pid);path=f'/api/v4/photos/{image}';scoped=path+f'?report_id={case}'
    assert admin.get(scoped).status_code==404
    assert other.post(f'/api/v4/admin/reports/{case}/review',json={'reason':'Tentative fictive non administrative.'}).status_code==403
    assert admin.post(f'/api/v4/admin/reports/{case}/review',json={'reason':'court'}).status_code==422
    assert admin.get(scoped).status_code==404
    # Reviewing a different project's case does not authorize this photo.
    second=owner.post('/api/projects',json={'title':'Autre projet fictif','description':PAYLOAD['description'],'trade':'plomberie','town':'Toulouse'}).json()['id']
    unrelated=open_case(owner,second)
    assert admin.post(f'/api/v4/admin/reports/{unrelated}/review',json={'reason':'Examen du second projet seulement.'}).status_code==200
    assert admin.get(scoped).status_code==404
    context=admin.post(f'/api/v4/admin/reports/{case}/review',json={'reason':'Examiner la photo du seul projet signalé.'}).json()['context']
    assert context['project']['photos']==[image]
    assert admin.get(path).status_code==404
    assert admin.get(path+f'?report_id={unrelated}').status_code==404
    for _ in range(2):
        viewed=admin.get(scoped);assert viewed.status_code==200 and viewed.headers['cache-control']=='no-store'
        assert viewed.content==owner.get(path).content
    assert other.get(path).status_code==404
    with mod.connect() as db:
        rows=db.execute("SELECT target_type,target_id FROM audit WHERE action='view_report_photo' ORDER BY id").fetchall()
        assert len(rows)==2 and all(r['target_type']=='photo' and r['target_id']==image for r in rows)
        assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='view_report_photo' AND target_id=?",(case,)).fetchone()[0]==2
    assert admin.post(f'/api/v4/admin/reports/{case}/resolve',json={'value':True,'reason':'Photo fictive examinée, signalement traité.'}).status_code==200
    assert admin.get(scoped).status_code==404
    assert owner.get(path).status_code==200


def test_admin_photo_access_is_bound_to_the_reviewed_project_and_open_case(setup):
    v=setup;prepare(v);exercise_case_scoped_photos(v['mod'],v['requester'],v['admin'],v['other'])


def test_another_admin_must_review_the_case_before_reading_its_photos(setup):
    v=setup;prepare(v);pid,image=photo_project(v['requester']);case=open_case(v['requester'],pid)
    with v['mod'].connect() as db:db.execute("UPDATE users SET role='admin' WHERE id=?",(v['oid'],))
    body={'reason':'Examen individuel motivé du dossier fictif.'}
    assert v['admin'].post(f'/api/v4/admin/reports/{case}/review',json=body).status_code==200
    assert v['admin'].get(f'/api/v4/photos/{image}?report_id={case}').status_code==200
    assert v['other'].get(f'/api/v4/photos/{image}?report_id={case}').status_code==404
    assert v['other'].post(f'/api/v4/admin/reports/{case}/review',json=body).status_code==200
    assert v['other'].get(f'/api/v4/photos/{image}?report_id={case}').status_code==200


def test_failed_photo_audit_returns_no_image_and_rolls_back_the_case_decision(setup):
    v=setup;prepare(v);pid,image=photo_project(v['requester']);case=open_case(v['requester'],pid)
    assert v['admin'].post(f'/api/v4/admin/reports/{case}/review',json={'reason':'Examen pour contrôler la trace obligatoire.'}).status_code==200
    with v['mod'].connect() as db:db.execute("CREATE TRIGGER fail_photo_audit BEFORE INSERT ON audit WHEN NEW.action='view_report_photo' BEGIN SELECT RAISE(ABORT,'controlled audit failure'); END")
    with TestClient(v['mod'].app,raise_server_exceptions=False) as client:
        client.cookies.update(v['admin'].cookies)
        result=client.get(f'/api/v4/photos/{image}?report_id={case}')
        assert result.status_code==500 and 'image/jpeg' not in result.headers.get('content-type','')
        assert 'controlled audit failure' not in result.text
    with v['mod'].connect() as db:assert db.execute("SELECT COUNT(*) FROM admin_decisions WHERE kind='view_report_photo'").fetchone()[0]==0
