"""Additive v4 features for the isolated UCP laboratory. No external services."""
import base64, binascii, io, json, re, secrets, sqlite3, time, unicodedata
from fastapi import Depends, Response, Query
from pydantic import BaseModel, Field, field_validator
from PIL import Image, ImageOps, UnidentifiedImageError

class Draft(BaseModel):
    title: str = Field(default='',max_length=120)
    description: str = Field(default='',max_length=5000)
    town: str = Field(default='',max_length=90)
    trades: list[str] = Field(default_factory=list,max_length=12)
    timing: str = Field(default='flexible',pattern='^(flexible|month|quarter|urgent)$')
    version: int = Field(default=0,ge=0)
class Photo(BaseModel):
    data: str = Field(max_length=6_000_000)
class Reason(BaseModel):
    reason: str = Field(min_length=10,max_length=500)

    @field_validator('reason')
    @classmethod
    def meaningful_reason(cls, value):
        value = value.strip()
        if len(value) < 10:
            raise ValueError('Précisez le motif en au moins 10 caractères')
        return value

class Report(Reason):
    kind: str = Field(pattern='^(project|conversation|message)$')
    target_id: int = Field(gt=0)
    reason: str = Field(min_length=10,max_length=1000)
class Decision(Reason):
    value: bool
class Review(Reason):
    before_id: int | None = Field(default=None,gt=0,le=9223372036854775807)
class Trade(BaseModel):
    id: str = Field(pattern='^[a-z][a-z0-9-]{1,60}$')
    label: str = Field(min_length=2,max_length=80)
    group: str = Field(min_length=2,max_length=80)
    synonyms: list[str] = Field(default_factory=list,max_length=15)
    active: bool = True
class Reset(BaseModel):
    token: str = Field(min_length=20,max_length=128)
    password: str = Field(min_length=12,max_length=128)
class Classification(BaseModel):
    trades: list[str] = Field(min_length=1,max_length=12)
    reason: str = Field(min_length=10,max_length=500)
class Account(BaseModel):
    name: str = Field(min_length=2,max_length=100)

def normalize(s):
    return ''.join(c for c in unicodedata.normalize('NFD',s.casefold()) if unicodedata.category(c)!='Mn')

def install(m):
    app,connect,error,now = m.app,m.connect,m.error,m.now
    with connect() as c:
        for table,col,ddl in [('users','suspended','INTEGER NOT NULL DEFAULT 0'),('projects','trades_json',"TEXT NOT NULL DEFAULT '[]'"),('projects','hidden','INTEGER NOT NULL DEFAULT 0')]:
            if col not in [r['name'] for r in c.execute(f'PRAGMA table_info({table})')]:
                c.execute(f'ALTER TABLE {table} ADD COLUMN {col} {ddl}')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS taxonomy(id TEXT PRIMARY KEY,label TEXT NOT NULL,group_name TEXT NOT NULL,synonyms TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS drafts(id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,project_id INTEGER REFERENCES projects(id),updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS photos(id INTEGER PRIMARY KEY,draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,body BLOB NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,reporter_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,target_id INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',resolution TEXT,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS admin_decisions(id INTEGER PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,target_id INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_drafts_owner ON drafts(owner_id);
        CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id);
        CREATE INDEX IF NOT EXISTS idx_photos_draft ON photos(draft_id);
        CREATE TABLE IF NOT EXISTS message_retries(application_id INTEGER NOT NULL REFERENCES applications(id),sender_id INTEGER NOT NULL REFERENCES users(id),retry_key TEXT NOT NULL,message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,body_hash TEXT NOT NULL,PRIMARY KEY(application_id,sender_id,retry_key));
        ''')
        for t in json.loads((m.ROOT/'taxonomy.json').read_text()):
            c.execute('INSERT OR IGNORE INTO taxonomy VALUES(?,?,?,?,?)',(t['id'],t['label'],t['group'],json.dumps(t['synonyms']),1))
        m.TRADES.update(r[0] for r in c.execute('SELECT id FROM taxonomy'))
    def audit(c,user,action,kind,id):
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',(user['id'],action,kind,id,now()))
    def owned_draft(c,id,user):
        row=c.execute('SELECT * FROM drafts WHERE id=? AND owner_id=?',(id,user['id'])).fetchone()
        if not row:error(404,'Brouillon introuvable')
        return row
    def draft_json(c,row):
        return dict(id=row['id'],**json.loads(row['payload']),version=row['version'],project_id=row['project_id'],photos=[x[0] for x in c.execute('SELECT id FROM photos WHERE draft_id=?',(row['id'],))])
    def validate_draft(c,body,publishing=False):
        if 'inconnu' in body.trades and len(body.trades)>1:error(422,'Choisissez des métiers précis ou « Je ne sais pas », pas les deux')
        for t in body.trades:
            if not c.execute('SELECT 1 FROM taxonomy WHERE id=? AND active=1',(t,)).fetchone():error(422,'Métier inconnu ou désactivé')
        if publishing:
            if not body.trades:error(422,'Choisissez un métier ou « Je ne sais pas »')
            # Reuse the tested v3 input/contact guards.
            try:m.Project.model_validate(dict(title=body.title,description=body.description,town=body.town,trade=body.trades[0]),context={'connection':c})
            except ValueError:error(422,'Complétez le titre (5 caractères), la description (20) et la commune. Ne donnez pas de coordonnées directes.')
    def visible_project(c,id,user):
        row=c.execute('SELECT * FROM projects WHERE id=?',(id,)).fetchone()
        if not row:error(404,'Projet introuvable')
        if user['role']=='admin' or row['requester_id']==user['id']:return row
        if user['role']=='professional' and not row['hidden']:
            # Only authorized projects or accepted relationships reveal attachments.
            allowed={x['id'] for x in m.projects(user)['items']}
            selected=c.execute("SELECT id FROM applications WHERE project_id=? AND professional_id=? AND status='accepted'",(id,user['id'])).fetchone()
            if id in allowed:return row
            if selected:
                m.check_conversation(c,selected['id'],user['id']);return row
        error(404,'Projet introuvable')

    @app.get('/api/catalog')
    def catalog(q:str=''):
        if len(q)>120:error(422,'Recherche trop longue')
        with connect() as c:
            rows=[{'id':r['id'],'label':r['label'],'group':r['group_name'],'synonyms':json.loads(r['synonyms']),'active':bool(r['active'])} for r in c.execute('SELECT * FROM taxonomy ORDER BY rowid')]
        terms=normalize(q).split()
        if terms:rows=[r for r in rows if all(w in normalize(' '.join([r['label'],r['group'],*r['synonyms']])) for w in terms)]
        return {'items':[r for r in rows if r['active']]}

    @app.get('/api/v4/drafts')
    def drafts(user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=False) as c:return {'items':[draft_json(c,r) for r in c.execute('SELECT * FROM drafts WHERE owner_id=? AND project_id IS NULL ORDER BY updated_at DESC',(user['id'],))]}

    @app.post('/api/v4/drafts',status_code=201)
    def create_draft(body:Draft,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=True) as c:
            validate_draft(c,body)
            if c.execute('SELECT count(*) FROM drafts WHERE owner_id=? AND project_id IS NULL',(user['id'],)).fetchone()[0]>=30:error(409,'Vous avez déjà 30 brouillons')
            cur=c.execute('INSERT INTO drafts(owner_id,payload,updated_at) VALUES(?,?,?)',(user['id'],body.model_dump_json(exclude={'version'}),now()))
            audit(c,user,'draft_created','draft',cur.lastrowid);c.execute('COMMIT')
            return {'id':cur.lastrowid,'version':1}

    @app.put('/api/v4/drafts/{id}')
    def save_draft(id:int,body:Draft,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=True) as c:
            r=owned_draft(c,id,user)
            if r['project_id']:error(409,'Demande déjà publiée')
            if r['version']!=body.version:error(409,'Ce brouillon a changé dans une autre fenêtre. Rechargez-le avant de continuer.')
            validate_draft(c,body)
            c.execute('UPDATE drafts SET payload=?,version=version+1,updated_at=? WHERE id=?',(body.model_dump_json(exclude={'version'}),now(),id))
            c.execute('COMMIT')
        return {'id':id,'version':body.version+1}

    @app.post('/api/v4/drafts/{id}/publish',status_code=201)
    def publish(id:int,body:dict,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=True) as c:
            r=owned_draft(c,id,user)
            if r['project_id']:
                current=c.execute('SELECT status FROM projects WHERE id=?',(r['project_id'],)).fetchone()
                if not current:error(404,'Projet publié introuvable')
                return {'id':r['project_id'],'status':current['status'],'already_published':True}
            if r['version']!=body.get('version'):error(409,'Le brouillon a changé. Rechargez le récapitulatif.')
            d=Draft(**json.loads(r['payload']));validate_draft(c,d,True)
            cur=c.execute('INSERT INTO projects(requester_id,title,description,trade,town,created_at,trades_json) VALUES(?,?,?,?,?,?,?)',(user['id'],d.title.strip(),d.description.strip(),d.trades[0],d.town.strip(),now(),json.dumps(list(dict.fromkeys(d.trades)))))
            pid=cur.lastrowid
            c.execute('UPDATE drafts SET project_id=? WHERE id=?',(pid,id));audit(c,user,'project_published','project',pid);c.execute('COMMIT')
            return {'id':pid,'status':'open'}

    @app.delete('/api/v4/drafts/{id}')
    def delete_draft(id:int,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=True) as c:
            r=owned_draft(c,id,user)
            if r['project_id']:error(409,'Une demande publiée ne peut plus être supprimée comme brouillon')
            c.execute('DELETE FROM drafts WHERE id=?',(id,));audit(c,user,'draft_deleted','draft',id);c.execute('COMMIT')
        return {'ok':True}

    @app.post('/api/v4/drafts/{id}/photos',status_code=201)
    def add_photo(id:int,body:Photo,user=Depends(m.require('requester'))):
        try:
            data=base64.b64decode(body.data,validate=True)
            if len(data)>4_000_000:error(413,'Photo limitée à 4 Mo')
            im=Image.open(io.BytesIO(data))
            if im.format not in ('JPEG','PNG','WEBP') or im.width*im.height>16_000_000:error(422,'Photo JPG, PNG ou WebP de 16 mégapixels maximum')
            im.load();im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((1600,1600));out=io.BytesIO();im.save(out,format='JPEG',quality=85)
            # Reencoding strips EXIF, GPS and embedded non-image payloads.
        except (ValueError,binascii.Error,UnidentifiedImageError,OSError,Image.DecompressionBombError):error(422,'Photo illisible')
        with m.authenticated_db(user,write=True) as c:
            r=owned_draft(c,id,user)
            if r['project_id']:error(409,'Photos figées après publication')
            if c.execute('SELECT count(*) FROM photos WHERE draft_id=?',(id,)).fetchone()[0]>=5:error(409,'Maximum 5 photos par projet')
            cur=c.execute('INSERT INTO photos(draft_id,body,created_at) VALUES(?,?,?)',(id,out.getvalue(),now()));c.execute('UPDATE drafts SET version=version+1 WHERE id=?',(id,));c.execute('COMMIT')
            return {'id':cur.lastrowid,'version':r['version']+1}

    @app.get('/api/v4/photos/{id}')
    def get_photo(id:int,user=Depends(m.get_user)):
        with m.authenticated_db(user,write=False) as c:
            r=c.execute('SELECT photos.body,drafts.owner_id,drafts.project_id FROM photos JOIN drafts ON drafts.id=photos.draft_id WHERE photos.id=?',(id,)).fetchone()
            if not r:error(404,'Photo introuvable')
            # Conservative privacy default: images only after explicit selection, never in discovery.
            if r['owner_id']!=user['id'] and user['role']!='admin':
                a=c.execute("SELECT id FROM applications WHERE project_id=? AND professional_id=? AND status='accepted'",(r['project_id'],user['id'])).fetchone()
                if not a:error(404,'Photo introuvable')
                m.check_conversation(c,a['id'],user['id'])
            return Response(r['body'],media_type='image/jpeg',headers={'Cache-Control':'no-store'})

    @app.delete('/api/v4/photos/{id}')
    def remove_photo(id:int,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=True) as c:
            r=c.execute('SELECT draft_id FROM photos WHERE id=?',(id,)).fetchone()
            if not r:error(404,'Photo introuvable')
            d=owned_draft(c,r['draft_id'],user)
            if d['project_id']:error(409,'Photos figées après publication')
            c.execute('DELETE FROM photos WHERE id=?',(id,));c.execute('UPDATE drafts SET version=version+1 WHERE id=?',(r['draft_id'],));c.execute('COMMIT')
            return {'ok':True,'version':d['version']+1}

    @app.get('/api/v4/projects/{id}')
    def project_detail(id:int,user=Depends(m.get_user)):
        with m.authenticated_db(user,write=False) as c:
            r=visible_project(c,id,user)
            photos=[x[0] for x in c.execute('SELECT photos.id FROM photos JOIN drafts ON drafts.id=photos.draft_id WHERE drafts.project_id=?',(id,))]
            row={k:r[k] for k in ('id','title','description','town','trade','status','hidden','created_at')};row['trades']=list(m.project_trades(r))
            draft=c.execute('SELECT payload FROM drafts WHERE project_id=?',(id,)).fetchone()
            row['timing']=json.loads(draft['payload']).get('timing','flexible') if draft else 'flexible'
            row['photos']=photos if user['role'] in ('requester','admin') or c.execute("SELECT 1 FROM applications WHERE project_id=? AND professional_id=? AND status='accepted'",(id,user['id'])).fetchone() else []
            return row

    @app.post('/api/v4/reports',status_code=201)
    def report(body:Report,user=Depends(m.get_user)):
        with m.authenticated_db(user,write=True) as c:
            if body.kind=='project':visible_project(c,body.target_id,user)
            elif body.kind=='message':
                message=c.execute('SELECT application_id FROM messages WHERE id=?',(body.target_id,)).fetchone()
                if not message:error(404,'Message introuvable')
                m.check_conversation(c,message['application_id'],user['id'])
            else:m.check_conversation(c,body.target_id,user['id'])
            if c.execute("SELECT 1 FROM reports WHERE reporter_id=? AND kind=? AND target_id=? AND status='open'",(user['id'],body.kind,body.target_id)).fetchone():error(409,'Un signalement est déjà en cours')
            cur=c.execute('INSERT INTO reports(reporter_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',(user['id'],body.kind,body.target_id,body.reason.strip(),now()));audit(c,user,'report_created','report',cur.lastrowid);c.execute('COMMIT')
            return {'id':cur.lastrowid,'status':'open'}

    @app.get('/api/v4/reports')
    def own_reports(before_id:int | None=Query(default=None,gt=0,le=9223372036854775807),user=Depends(m.get_user)):
        with m.authenticated_db(user,write=False) as c:
            rows=c.execute('''SELECT id,kind,target_id,reason,status,resolution,created_at FROM reports
                WHERE reporter_id=? AND id<COALESCE(?,9223372036854775807) ORDER BY id DESC LIMIT 51''',
                (user['id'],before_id)).fetchall()
            items=[dict(r) for r in rows[:50]]
            return {'items':items,'next_before_id':items[-1]['id'] if len(rows)>50 else None}

    @app.post('/api/v4/admin/reports/{id}/review')
    def review_report(id:int,body:Review,user=Depends(m.require('admin'))):
        # The audit is committed before any private content is returned. No general
        # admin conversation reader is introduced; every read belongs to an open case.
        with m.authenticated_db(user,write=True) as c:
            report=c.execute('SELECT id,kind,target_id,reason,status,created_at FROM reports WHERE id=?',(id,)).fetchone()
            if not report:error(404,'Signalement introuvable')
            if report['status']!='open':error(409,'Ce signalement est déjà traité')
            context={'project':None,'messages':[],'next_before_id':None}
            if report['kind']=='project':
                if body.before_id is not None:error(422,'Pagination réservée aux conversations signalées')
                row=c.execute('SELECT id,title,description,town,status,hidden FROM projects WHERE id=?',(report['target_id'],)).fetchone()
                if row:context['project']=dict(row)
            else:
                if report['kind']=='message':
                    if body.before_id is not None:error(422,'Un seul message est consultable dans ce dossier')
                    rows=c.execute('''SELECT messages.id,messages.application_id,messages.sender_id,
                        users.name AS sender_name,messages.body,messages.created_at FROM messages
                        JOIN users ON users.id=messages.sender_id WHERE messages.id=?''',(report['target_id'],)).fetchall()
                else:
                    # Keyset pagination: a bounded window, no unrelated conversations.
                    rows=c.execute('''SELECT messages.id,messages.application_id,messages.sender_id,
                        users.name AS sender_name,messages.body,messages.created_at FROM messages
                        JOIN users ON users.id=messages.sender_id WHERE messages.application_id=?
                        AND messages.id<COALESCE(?,9223372036854775807) ORDER BY messages.id DESC LIMIT 21''',
                        (report['target_id'],body.before_id)).fetchall()
                    if len(rows)>20:context['next_before_id']=rows[19]['id']
                    rows=list(reversed(rows[:20]))
                context['messages']=[dict(r) for r in rows]
            c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',
                      (user['id'],'review_report',id,body.reason,now()))
            audit(c,user,'review_report','report',id)
            c.execute('COMMIT')
            return {'report':dict(report),'context':context}

    @app.get('/api/v4/admin')
    def admin(user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=False) as c:return {'users':[dict(x) for x in c.execute('SELECT id,name,role,suspended FROM users')], 'projects':[dict(x) for x in c.execute('SELECT id,title,description,trade,trades_json,town,status,hidden FROM projects ORDER BY id DESC')], 'reports':[dict(x) for x in c.execute('SELECT * FROM reports ORDER BY id DESC')], 'taxonomy':[dict(x) for x in c.execute('SELECT * FROM taxonomy ORDER BY group_name,label')]}

    @app.post('/api/v4/admin/projects/{id}/classify')
    def classify(id:int,body:Classification,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            r=c.execute('SELECT * FROM projects WHERE id=?',(id,)).fetchone()
            if not r:error(404,'Projet introuvable')
            if r['status']!='open' or m.project_trades(r)!={'inconnu'}:error(409,'Seules les demandes sans métier peuvent être classées ici')
            if 'inconnu' in body.trades:error(422,'Choisissez des métiers précis')
            validate_draft(c,Draft(trades=body.trades))
            c.execute('UPDATE projects SET trade=?,trades_json=? WHERE id=?',(body.trades[0],json.dumps(list(dict.fromkeys(body.trades))),id))
            c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',(user['id'],'classify',id,body.reason,now()))
            audit(c,user,'classify_project','project',id);c.execute('COMMIT')
        return {'ok':True}

    @app.put('/api/v4/account')
    def account(body:Account,user=Depends(m.get_user)):
        try:
            name=m.precontact_safe(body.name)
            if len(name)<2:raise ValueError('Nom trop court')
        except ValueError:error(422,'Nom invalide ou contenant des coordonnées')
        with m.authenticated_db(user,write=True) as c:
            c.execute('UPDATE users SET name=? WHERE id=?',(name,user['id']))
            audit(c,user,'account_updated','user',user['id'])
        return {'ok':True,'name':name}

    @app.post('/api/v4/admin/users/{id}/suspend')
    def suspend(id:int,body:Decision,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            r=c.execute('SELECT role FROM users WHERE id=?',(id,)).fetchone()
            if not r:error(404,'Compte introuvable')
            if r['role']=='admin':error(409,'La suspension d’un administrateur nécessite une procédure opérateur')
            c.execute('UPDATE users SET suspended=? WHERE id=?',(int(body.value),id))
            if body.value:c.execute('DELETE FROM sessions WHERE user_id=?',(id,))
            c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',(user['id'],'suspend' if body.value else 'restore',id,body.reason,now()));audit(c,user,'suspend_user' if body.value else 'restore_user','user',id);c.execute('COMMIT')
        return {'ok':True}

    @app.post('/api/v4/admin/projects/{id}/hide')
    def hide(id:int,body:Decision,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            if not c.execute('SELECT 1 FROM projects WHERE id=?',(id,)).fetchone():error(404,'Projet introuvable')
            c.execute('UPDATE projects SET hidden=? WHERE id=?',(int(body.value),id));audit(c,user,'hide_project' if body.value else 'restore_project','project',id)
            c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',(user['id'],'hide' if body.value else 'unhide',id,body.reason,now()));c.execute('COMMIT')
        return {'ok':True}

    @app.post('/api/v4/admin/reports/{id}/resolve')
    def resolve(id:int,body:Decision,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            report=c.execute("SELECT reporter_id FROM reports WHERE id=? AND status='open'",(id,)).fetchone()
            if not report:error(409,'Signalement absent ou déjà traité')
            c.execute("UPDATE reports SET status='resolved',resolution=? WHERE id=?",(body.reason,id))
            c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',
                      (user['id'],'resolve_report',id,body.reason,now()))
            audit(c,user,'resolve_report','report',id)
            m.queue_notice(c,report['reporter_id'],'report_resolved',id)
            c.execute('COMMIT')
        return {'ok':True}

    @app.put('/api/v4/admin/catalog')
    def save_trade(body:Trade,user=Depends(m.require('admin'))):
        if any(len(s)>80 for s in body.synonyms):error(422,'Synonyme trop long')
        with m.authenticated_db(user,write=True) as c:
            c.execute('INSERT INTO taxonomy VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,group_name=excluded.group_name,synonyms=excluded.synonyms,active=excluded.active',(body.id,body.label,body.group,json.dumps(body.synonyms),int(body.active)))
            audit(c,user,'catalog_changed','catalog',0);c.execute('COMMIT')
        m.TRADES.add(body.id)
        return {'ok':True}

    @app.post('/api/v4/account/reset')
    def reset(body:Reset):
        with connect() as c:
            c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT * FROM resets WHERE token_hash=?',(m.hash_token(body.token),)).fetchone()
            if not r or r['expires']<=time.time():error(400,'Lien invalide ou expiré')
            salt=secrets.token_hex(16)
            c.execute('UPDATE users SET pw_salt=?,pw_hash=? WHERE id=?',(salt,m.pw(body.password,salt),r['user_id']))
            c.execute('DELETE FROM resets WHERE user_id=?',(r['user_id'],));c.execute('DELETE FROM sessions WHERE user_id=?',(r['user_id'],));c.execute('COMMIT')
        return {'ok':True}
