"""Declared text portfolios, scoped to an individual or one enterprise profile.

No public directory, certification claim, contact channel or image publication.
"""
import json
from fastapi import Depends,Query
from pydantic import BaseModel,Field,field_validator

class Work(BaseModel):
    title:str=Field(min_length=3,max_length=100)
    description:str=Field(min_length=20,max_length=1000)
    trade:str=Field(min_length=1,max_length=80)
    year:int|None=Field(default=None,ge=1900,le=2100,strict=True)
    @field_validator('title','description','trade',mode='before')
    @classmethod
    def strip(cls,value):
        return value.strip() if isinstance(value,str) else value

class Showcase(BaseModel):
    intro:str=Field(default='',max_length=1200)
    works:list[Work]=Field(default_factory=list,max_length=6)
    version:int=Field(ge=0,strict=True)


def install(m):
    app,error=m.app,m.error
    with m.connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS professional_showcases(
          id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          linked_profile_id INTEGER REFERENCES enterprise_artisans(id) ON DELETE CASCADE,
          payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),updated_at TEXT NOT NULL);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_showcase_individual ON professional_showcases(owner_id) WHERE linked_profile_id IS NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_showcase_linked ON professional_showcases(owner_id,linked_profile_id) WHERE linked_profile_id IS NOT NULL;''')

    def scope(c,owner,linked):
        profile=c.execute('SELECT trade,service_trades,approved FROM profiles WHERE user_id=?',(owner,)).fetchone()
        if not profile:error(409,'Complétez d’abord le profil professionnel')
        if linked is not None:
            row=c.execute('''SELECT a.alias,a.service_trades,a.is_active FROM enterprise_artisans a
                JOIN enterprise_accounts e ON e.id=a.enterprise_id WHERE a.id=? AND e.owner_id=?''',(linked,owner)).fetchone()
            if not row:error(404,'Profil lié introuvable')
            return {'linked_profile_id':linked,'name':row['alias'],'trades':json.loads(row['service_trades']),'active':bool(row['is_active'] and profile['approved'])}
        user=c.execute('SELECT name FROM users WHERE id=?',(owner,)).fetchone()
        return {'linked_profile_id':None,'name':user['name'],'trades':list(dict.fromkeys([profile['trade'],*json.loads(profile['service_trades'] or '[]')])),'active':bool(profile['approved'])}

    def stored(c,owner,linked):
        if linked is None:return c.execute('SELECT * FROM professional_showcases WHERE owner_id=? AND linked_profile_id IS NULL',(owner,)).fetchone()
        return c.execute('SELECT * FROM professional_showcases WHERE owner_id=? AND linked_profile_id=?',(owner,linked)).fetchone()

    def view(row):
        return (json.loads(row['payload'])|{'version':row['version'],'updated_at':row['updated_at']}) if row else {'intro':'','works':[],'version':0,'updated_at':None}

    @app.get('/api/v4/showcase')
    def own(linked_profile_id:int|None=Query(default=None,ge=1),user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=False) as c:
            meta=scope(c,user['id'],linked_profile_id)
            return view(stored(c,user['id'],linked_profile_id))|{'scope':meta}

    @app.put('/api/v4/showcase')
    def save(body:Showcase,linked_profile_id:int|None=Query(default=None,ge=1),user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=True) as c:
            meta=scope(c,user['id'],linked_profile_id)
            row=stored(c,user['id'],linked_profile_id)
            if body.version!=(row['version'] if row else 0):error(409,'Cette présentation a changé. Rechargez-la avant de modifier ; votre saisie reste dans ce formulaire.')
            payload=body.model_dump(exclude={'version'})
            try:
                payload['intro']=m.precontact_safe(body.intro) if body.intro.strip() else ''
                for work in payload['works']:
                    work['title']=m.precontact_safe(work['title']);work['description']=m.precontact_safe(work['description'])
                    if len(work['title'])<3 or len(work['description'])<20:raise ValueError('Précisez le titre et la description de chaque réalisation')
                    if work['trade'] not in meta['trades'] or not m.active_trade(work['trade'],c):raise ValueError('Choisissez un métier actif déclaré pour ce profil')
            except ValueError as exc:error(422,str(exc))
            packed=json.dumps(payload,ensure_ascii=False)
            if row:
                c.execute('UPDATE professional_showcases SET payload=?,version=version+1,updated_at=? WHERE id=?',(packed,m.now(),row['id']))
                id=row['id']
            else:
                id=c.execute('INSERT INTO professional_showcases(owner_id,linked_profile_id,payload,updated_at) VALUES(?,?,?,?)',(user['id'],linked_profile_id,packed,m.now())).lastrowid
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',(user['id'],'save_declared_showcase','showcase',id,m.now()))
            c.execute('COMMIT')
            return {'ok':True,'version':body.version+1}

    @app.get('/api/projects/{project_id}/applications/{application_id}/showcase')
    def candidate(project_id:int,application_id:int,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=False) as c:
            row=c.execute('''SELECT a.professional_id,a.linked_profile_id,p.requester_id,p.hidden,
                u.suspended,pr.approved FROM applications a JOIN projects p ON p.id=a.project_id
                JOIN users u ON u.id=a.professional_id JOIN profiles pr ON pr.user_id=u.id
                WHERE a.id=? AND a.project_id=? AND p.requester_id=?''',(application_id,project_id,user['id'])).fetchone()
            if not row:error(404,'Présentation introuvable')
            meta=scope(c,row['professional_id'],row['linked_profile_id'])
            if row['hidden'] or row['suspended'] or not row['approved'] or not meta['active']:error(404,'Présentation indisponible')
            data=view(stored(c,row['professional_id'],row['linked_profile_id']))
            # Scope changes cannot advertise a realization for an undeclared trade.
            works=[w for w in data['works'] if w['trade'] in meta['trades'] and m.active_trade(w['trade'],c)]
            return {'profile_name':meta['name'],'intro':data['intro'],'works':works,'updated_at':data['updated_at'],
                    'declaration':'Informations déclarées, non vérifiées. Aucune certification ni avis client.'}
