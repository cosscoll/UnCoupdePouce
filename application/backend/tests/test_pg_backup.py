"""Operator backups: no overwrite, no leaked credentials, real isolated PG restore."""
import hashlib,importlib.util,json,os,secrets,sys
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).parents[1]))
import pg_backup as ops
from test_postgres import pg

URL='postgresql://postgres:Fictional-secret-0123456789@localhost/ucp_test'


def fake_archive(tmp_path):
    path=tmp_path/'safe.dump';path.write_bytes(b'PGDMP-fictional');path.chmod(0o600)
    data={'format':1,'schema':'ucp_private','sha256':ops.digest(path),'source_fingerprint':'a'*64,'tables':{t:0 for t in ['users','projects','messages',*ops.AUTH_TABLES]},'auth_data_excluded':True}
    meta=Path(str(path)+'.json');meta.write_text(json.dumps(data));meta.chmod(0o600)
    return path,data,meta


def test_backup_never_overwrites_an_existing_archive(tmp_path):
    path=tmp_path/'old.dump';path.write_bytes(b'original contents')
    with pytest.raises(ops.BackupError,match='écrasement'):ops.backup(URL,path)
    assert path.read_bytes()==b'original contents'


def test_restore_refuses_unconfirmed_altered_public_or_symlinked_archives(tmp_path):
    path,data,meta=fake_archive(tmp_path)
    with pytest.raises(ops.BackupError,match='Confirmation'):ops.restore(URL,path)
    path.chmod(0o644)
    with pytest.raises(ops.BackupError,match='600'):ops.restore(URL,path,confirm_empty=True)
    path.chmod(0o600);path.write_bytes(b'corrupted')
    with pytest.raises(ops.BackupError,match='altérée'):ops.restore(URL,path,confirm_empty=True)
    symlink=tmp_path/'symlink.dump';symlink.symlink_to(path)
    with pytest.raises(ops.BackupError,match='symbolique'):ops.restore(URL,symlink,confirm_empty=True)


def test_restore_rejects_source_and_nonempty_target_before_starting_a_process(tmp_path,monkeypatch):
    path,data,meta=fake_archive(tmp_path)
    data['source_fingerprint']=ops.fingerprint(ops.connection_info(URL));meta.write_text(json.dumps(data))
    with pytest.raises(ops.BackupError,match='base source'):ops.restore(URL,path,confirm_empty=True)
    data['source_fingerprint']='a'*64;meta.write_text(json.dumps(data))
    class Conn:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def execute(self,*args):return self
        def fetchone(self):return (1,)
    monkeypatch.setattr(ops,'connect',lambda url:Conn())
    monkeypatch.setattr(ops.subprocess,'run',lambda *a,**kw:pytest.fail('No process may start for a nonempty target'))
    with pytest.raises(ops.BackupError,match='vide'):ops.restore(URL,path,confirm_empty=True)


def test_pg_command_does_not_log_or_put_passwords_in_arguments(monkeypatch):
    seen={};password='Fictional-secret-0123456789'
    def failed(argv,**kw):
        seen.update(argv=argv,env=kw['env'])
        class Result:returncode=1;stderr=password.encode()
        return Result()
    monkeypatch.setattr(ops.subprocess,'run',failed)
    monkeypatch.setenv('UCP_BACKUP_SOURCE_URL',URL)
    with pytest.raises(ops.BackupError) as exc:ops.run('pg_dump',['--format=custom'],ops.connection_info(URL))
    assert password not in str(exc.value) and password not in str(seen['argv'])
    assert seen['env']['PGPASSWORD']==password and 'UCP_BACKUP_SOURCE_URL' not in seen['env']


def test_backup_configuration_requires_private_schema_and_remote_tls():
    for value in ['public','ucp_*','ucp_bad; DROP TABLE users','other_schema']:
        with pytest.raises(ops.BackupError):ops.schema_name(value)
    with pytest.raises(ops.BackupError,match='TLS'):ops.connection_info('postgresql://u:p@db.example/neondb?sslmode=require')
    assert ops.connection_info('postgresql://u:p@db.example/neondb?sslmode=verify-full')['sslmode']=='verify-full'
    with pytest.raises(ops.BackupError,match='TLS'):ops.connection_info('postgresql://u:p@localhost/db?hostaddr=192.0.2.1')


def test_native_pg_backup_restore_keeps_data_photos_sequences_and_revokes_sessions(pg,tmp_path,monkeypatch):
    if os.getenv('UCP_TEST_PG_BACKUP')!='1':pytest.skip('Explicit isolated PostgreSQL backup service not configured')
    import psycopg
    from psycopg import sql
    from fastapi.testclient import TestClient
    from demo import seed
    from urllib.parse import urlsplit,urlunsplit
    source=os.environ['UCP_TEST_POSTGRES_URL'];parts=urlsplit(source)
    if parts.hostname not in ('localhost','127.0.0.1','::1'):pytest.skip('Backup integration is limited to a local fictional test service')
    password='Backup-fictitious-only!0123456789';seed(module=pg,password=password)
    c=TestClient(pg.app);r=c.post('/api/login',json={'email':'camille@ucp.test','password':password});assert r.status_code==200
    c.headers['x-ucp-csrf']=r.json()['csrf']
    draft_body={'title':'Photo de sauvegarde','trades':['peinture'],'town':'Toulouse'}
    draft_headers={'Idempotency-Key':'backup-draft-fictional-001'}
    d=c.post('/api/v4/drafts',json=draft_body,headers=draft_headers).json()['id']
    from PIL import Image
    import io,base64
    image=io.BytesIO();Image.new('RGB',(8,8),'orange').save(image,'PNG')
    photo=c.post(f'/api/v4/drafts/{d}/photos',json={'data':base64.b64encode(image.getvalue()).decode()});assert photo.status_code==201
    photo_id=photo.json()['id'];source_photo=c.get(f'/api/v4/photos/{photo_id}').content
    budget_project=c.post('/api/projects',json={'title':'Budget de sauvegarde','description':'Travaux fictifs pour contrôler la restauration des montants déclarés.','town':'Toulouse','trade':'plomberie','budget_min':1200,'budget_max':4500});assert budget_project.status_code==201
    budget_id=budget_project.json()['id']
    with pg.connect() as db:
        assert db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0]>0
        maximum=db.execute('SELECT MAX(id) FROM projects').fetchone()[0]
    support=c.post('/api/v4/support',json={'subject':'Question de restauration','category':'account','body':'Demande fictive à retrouver après restauration.'});assert support.status_code==201
    support_id=support.json()['id']
    pro=TestClient(pg.app);logged=pro.post('/api/login',json={'email':'atelier@ucp.test','password':password});pro.headers['x-ucp-csrf']=logged.json()['csrf']
    from test_professional_showcase import BODY
    assert pro.put('/api/v4/showcase',json=BODY).status_code==200
    saved=pro.post('/api/saved-searches',json={'label':'Critères à restaurer','criteria':{'town':'Toulouse','budget_from':0}})
    assert saved.status_code==201
    saved_search=saved.json()
    archive=tmp_path/'fictional.dump';metadata=ops.backup(source,archive,pg.DATABASE_SCHEMA)
    assert metadata['tables']['sessions']==0 and metadata['tables']['resets']==0
    assert metadata['tables']['support_tickets']==1
    assert metadata['tables']['professional_showcases']==1
    assert metadata['tables']['saved_searches']==1
    assert metadata['tables']['draft_creation_retries']==1
    assert metadata['tables']['photos']==1 and archive.stat().st_mode&0o077==0
    assert password not in Path(str(archive)+'.json').read_text()
    with pytest.raises(ops.BackupError,match='écrasement'):ops.backup(source,archive,pg.DATABASE_SCHEMA)
    target_name='ucp_restore_test_'+secrets.token_hex(6)
    target=urlunsplit(parts._replace(path='/'+target_name));created=False;module_name='restored_'+target_name
    try:
        with psycopg.connect(source,autocommit=True) as db:
            db.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target_name)));created=True
        result=ops.restore(target,archive,confirm_empty=True);assert result['auth_sessions_restored'] is False
        assert c.get('/api/me').status_code==200  # source was never revoked or modified
        with pytest.raises(ops.BackupError,match='vide'):ops.restore(target,archive,confirm_empty=True)
        monkeypatch.setenv('UCP_DATABASE_URL',target);monkeypatch.setenv('UCP_DATABASE_SCHEMA',pg.DATABASE_SCHEMA)
        spec=importlib.util.spec_from_file_location(module_name,Path(__file__).parents[1]/'app.py')
        restored=importlib.util.module_from_spec(spec);sys.modules[module_name]=restored;spec.loader.exec_module(restored)
        copy=TestClient(restored.app);copy.cookies.update(c.cookies)
        assert copy.get('/api/me').status_code==401
        logged=copy.post('/api/login',json={'email':'camille@ucp.test','password':password});assert logged.status_code==200
        copy.headers['x-ucp-csrf']=logged.json()['csrf']
        assert copy.get(f'/api/v4/photos/{photo_id}').content==source_photo
        assert copy.post('/api/v4/drafts',json=draft_body,headers=draft_headers).json()=={'id':d,'version':1,'changed_since_creation':True}
        assert copy.put(f'/api/v4/drafts/{d}',json=draft_body|{'version':1}).status_code==409
        budget_copy=copy.get(f'/api/v4/projects/{budget_id}').json();assert (budget_copy['budget_min'],budget_copy['budget_max'])==(1200,4500)
        assert next(t for t in copy.get('/api/v4/support').json()['items'] if t['id']==support_id)['body']=='Demande fictive à retrouver après restauration.'
        conversations=copy.get('/api/conversations').json()['items'];assert conversations
        assert len(copy.get('/api/conversations/'+str(conversations[0]['application_id'])+'/messages').json()['items'])==1
        new=copy.post('/api/projects',json={'title':'Après restauration','description':'Projet entièrement fictif créé après restauration.','town':'Toulouse','trade':'plomberie'})
        assert new.status_code==201 and new.json()['id']>maximum
        with psycopg.connect(target) as db:
            tables=db.execute('SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=%s AND c.relkind=%s',(pg.DATABASE_SCHEMA,'r')).fetchall()
            assert tables and all(row[0] for row in tables)
        restored_pro=TestClient(restored.app);restored_pro.post('/api/login',json={'email':'atelier@ucp.test','password':password})
        assert restored_pro.get('/api/v4/showcase').json()['intro']==BODY['intro']
        assert restored_pro.get('/api/saved-searches').json()['items']==[saved_search]
        restored_pro.close();pro.close()
        copy.close()
    finally:
        c.close();sys.modules.pop(module_name,None)
        if created:
            with psycopg.connect(source,autocommit=True) as db:db.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(target_name)))
