"""Private, authenticated support cases. No external mail or response-time promise."""
from typing import Literal
from fastapi import Depends,Query
from pydantic import BaseModel,Field,field_validator
from features_v4 import Reason

Category=Literal['account','profile','project','application','messaging','enterprise','subscription','other']
CATEGORIES={'account':'Mon compte','profile':'Mon profil professionnel','project':'Un projet',
            'application':'Une candidature','messaging':'La messagerie','enterprise':'Mon entreprise',
            'subscription':'Un abonnement de test','other':'Autre demande'}
class SupportRequest(BaseModel):
    subject:str=Field(min_length=5,max_length=120)
    category:Category
    body:str=Field(min_length=10,max_length=2000)
    @field_validator('subject','body')
    @classmethod
    def meaningful(cls,value,info):
        value=value.strip()
        if len(value)<(5 if info.field_name=='subject' else 10):raise ValueError('Précisez votre demande')
        return value


def install(m):
    app,error=m.app,m.error
    with m.connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS support_tickets(
          id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id),
          subject TEXT NOT NULL,category TEXT NOT NULL,body TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
          response TEXT,created_at TEXT NOT NULL,resolved_at TEXT);
          CREATE INDEX IF NOT EXISTS idx_support_owner ON support_tickets(owner_id,id);
          CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,id);''')
    def audit(c,user,action,id):
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],action,'support',id,m.now()))
    def decision(c,user,kind,id,reason):
        c.execute('INSERT INTO admin_decisions(actor_id,kind,target_id,reason,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],kind,id,reason,m.now()))
    def page(rows):
        items=[dict(r) for r in rows[:50]]
        return {'items':items,'next_before_id':items[-1]['id'] if len(rows)>50 else None,'categories':CATEGORIES}

    @app.post('/api/v4/support',status_code=201)
    def create(body:SupportRequest,user=Depends(m.get_user)):
        with m.authenticated_db(user,write=True) as c:
            if c.execute("SELECT 1 FROM support_tickets WHERE owner_id=? AND category=? AND subject=? AND body=? AND status='open'",
                         (user['id'],body.category,body.subject,body.body)).fetchone():error(409,'Cette demande est déjà ouverte dans Assistance')
            cur=c.execute('INSERT INTO support_tickets(owner_id,category,subject,body,created_at) VALUES(?,?,?,?,?)',
                          (user['id'],body.category,body.subject,body.body,m.now()))
            audit(c,user,'support_created',cur.lastrowid);c.execute('COMMIT')
            return {'id':cur.lastrowid,'status':'open'}

    @app.get('/api/v4/support')
    def own(before_id:int|None=Query(default=None,gt=0,le=9223372036854775807),user=Depends(m.get_user)):
        with m.authenticated_db(user,write=False) as c:
            return page(c.execute('''SELECT id,subject,category,body,status,response,created_at,resolved_at
                FROM support_tickets WHERE owner_id=? AND id<COALESCE(?,9223372036854775807)
                ORDER BY id DESC LIMIT 51''',(user['id'],before_id)).fetchall())

    @app.get('/api/v4/admin/support')
    def queue(status:Literal['open','resolved']='open',before_id:int|None=Query(default=None,gt=0,le=9223372036854775807),user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=False) as c:
            # No body, response or account identifiers in the queue.
            return page(c.execute('''SELECT id,subject,category,status,created_at FROM support_tickets
                WHERE status=? AND id<COALESCE(?,9223372036854775807) ORDER BY id DESC LIMIT 51''',
                (status,before_id)).fetchall())

    @app.post('/api/v4/admin/support/{id}/review')
    def review(id:int,body:Reason,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            row=c.execute('''SELECT t.id,t.subject,t.category,t.body,t.status,t.created_at,u.name AS owner_name
                FROM support_tickets t JOIN users u ON u.id=t.owner_id WHERE t.id=?''',(id,)).fetchone()
            if not row:error(404,'Demande introuvable')
            if row['status']!='open':error(409,'Cette demande est déjà traitée')
            decision(c,user,'review_support',id,body.reason);audit(c,user,'review_support',id);c.execute('COMMIT')
            return {'ticket':dict(row)}

    @app.post('/api/v4/admin/support/{id}/resolve')
    def resolve(id:int,body:Reason,user=Depends(m.require('admin'))):
        with m.authenticated_db(user,write=True) as c:
            row=c.execute('SELECT owner_id,status FROM support_tickets WHERE id=?',(id,)).fetchone()
            if not row:error(404,'Demande introuvable')
            if row['status']!='open':error(409,'Cette demande est déjà traitée')
            if not c.execute("SELECT 1 FROM admin_decisions WHERE actor_id=? AND kind='review_support' AND target_id=?",(user['id'],id)).fetchone():
                error(409,'Examinez cette demande avant de répondre')
            c.execute("UPDATE support_tickets SET status='resolved',response=?,resolved_at=? WHERE id=?",(body.reason,m.now(),id))
            decision(c,user,'resolve_support',id,body.reason);audit(c,user,'resolve_support',id)
            m.queue_notice(c,row['owner_id'],'support_resolved',id);c.execute('COMMIT')
            return {'ok':True,'status':'resolved'}
