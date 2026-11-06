"""Declared text portfolios, scoped to an individual or one enterprise profile.

No public directory, certification claim, contact channel or image publication.
"""
import base64
import binascii
import io
import json
from fastapi import Depends, Query, Response
from pydantic import BaseModel, Field, field_validator
from PIL import Image, ImageOps, UnidentifiedImageError

class Work(BaseModel):
    title:str=Field(min_length=3,max_length=100)
    description:str=Field(min_length=20,max_length=1000)
    trade:str=Field(min_length=1,max_length=80)
    year:int|None=Field(default=None,ge=1900,le=2100,strict=True)
    photo_id:int|None=Field(default=None,gt=0,strict=True)
    @field_validator('title','description','trade',mode='before')
    @classmethod
    def strip(cls,value):
        return value.strip() if isinstance(value,str) else value

class Showcase(BaseModel):
    intro:str=Field(default='',max_length=1200)
    works:list[Work]=Field(default_factory=list,max_length=6)
    version:int=Field(ge=0,strict=True)

class WorkPhoto(BaseModel):
    data:str=Field(max_length=6_000_000)
    version:int=Field(ge=1,strict=True)

class PhotoVersion(BaseModel):
    version:int=Field(ge=1,strict=True)


def clean_image(data):
    try:
        raw=base64.b64decode(data,validate=True)
        if len(raw)>4_000_000:
            raise ImageTooLarge()
        source=Image.open(io.BytesIO(raw))
        if source.format not in ('JPEG','PNG','WEBP') or source.width*source.height>16_000_000:
            raise InvalidImage()
        source.load()
        rendered=ImageOps.exif_transpose(source).convert('RGB')
        rendered.thumbnail((1600,1600))
        output=io.BytesIO()
        rendered.save(output,format='JPEG',quality=83,optimize=True)
        if output.tell()>2_000_000:
            raise ImageTooLarge()
        return output.getvalue()
    except (ValueError,binascii.Error,UnidentifiedImageError,OSError,Image.DecompressionBombError) as exc:
        raise InvalidImage() from exc

class ImageTooLarge(Exception):
    pass

class InvalidImage(Exception):
    pass


def install(m):
    app,error=m.app,m.error
    with m.connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS professional_showcases(
          id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          linked_profile_id INTEGER REFERENCES enterprise_artisans(id) ON DELETE CASCADE,
          payload TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),updated_at TEXT NOT NULL);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_showcase_individual ON professional_showcases(owner_id) WHERE linked_profile_id IS NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_showcase_linked ON professional_showcases(owner_id,linked_profile_id) WHERE linked_profile_id IS NOT NULL;
          CREATE TABLE IF NOT EXISTS showcase_photos(
            id INTEGER PRIMARY KEY,
            showcase_id BIGINT NOT NULL REFERENCES professional_showcases(id) ON DELETE CASCADE,
            body BLOB NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_showcase_photos_owner ON showcase_photos(showcase_id,id);''')

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
            # Keep old records and API fixtures stable: do not invent photo_id:null on
            # works that never received an image.
            for work in payload['works']:
                if work.get('photo_id') is None:
                    work.pop('photo_id',None)
                else:
                    if not row or not c.execute('SELECT 1 FROM showcase_photos WHERE id=? AND showcase_id=?',
                                              (work['photo_id'],row['id'])).fetchone():
                        error(422,'La photo ne correspond pas à cette présentation.')
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
            retained={w['photo_id'] for w in payload['works'] if w.get('photo_id')}
            for photo in c.execute('SELECT id FROM showcase_photos WHERE showcase_id=?',(id,)).fetchall():
                if photo['id'] not in retained:
                    c.execute('DELETE FROM showcase_photos WHERE id=? AND showcase_id=?',(photo['id'],id))
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',(user['id'],'save_declared_showcase','showcase',id,m.now()))
            c.execute('COMMIT')
            return {'ok':True,'version':body.version+1}

    def photo_scope(c,owner,linked):
        # Never allow another enterprise or manager's work to be modified.
        scope(c,owner,linked)
        record=stored(c,owner,linked)
        if not record:error(404,'Enregistrez d’abord votre présentation et ses réalisations.')
        return record

    def update_photo_payload(c,user,record,payload,action):
        c.execute('UPDATE professional_showcases SET payload=?,version=version+1,updated_at=? WHERE id=?',
                  (json.dumps(payload,ensure_ascii=False),m.now(),record['id']))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],action,'showcase',record['id'],m.now()))

    @app.post('/api/v4/showcase/photos/{work_index}',status_code=201)
    def upload_work_photo(work_index:int,body:WorkPhoto,
                          linked_profile_id:int|None=Query(default=None,ge=1),
                          user=Depends(m.require('professional'))):
        if work_index<0 or work_index>=6:error(404,'Réalisation introuvable')
        try:image=clean_image(body.data)
        except ImageTooLarge:error(413,'Photo limitée à 4 Mo ; image optimisée trop volumineuse.')
        except InvalidImage:error(422,'Photo JPG, PNG ou WebP lisible, au maximum 16 mégapixels.')
        with m.authenticated_db(user,write=True) as c:
            record=photo_scope(c,user['id'],linked_profile_id)
            if body.version!=record['version']:error(409,'La présentation a changé. Rechargez avant de modifier la photo.')
            payload=json.loads(record['payload'])
            works=payload.get('works',[])
            if work_index>=len(works):error(404,'Réalisation introuvable')
            existing=works[work_index].get('photo_id')
            if existing is not None:
                updated=c.execute('UPDATE showcase_photos SET body=? WHERE id=? AND showcase_id=?',
                                  (image,existing,record['id']))
                if updated.rowcount!=1:error(409,'Cette photo n’est plus disponible. Rechargez la présentation.')
                photo_id=existing
            else:
                if c.execute('SELECT COUNT(*) FROM showcase_photos WHERE showcase_id=?',
                             (record['id'],)).fetchone()[0]>=6:
                    error(409,'Maximum six photos par présentation. Supprimez une photo avant d’en ajouter une.')
                photo_id=c.execute('INSERT INTO showcase_photos(showcase_id,body,created_at) VALUES(?,?,?)',
                                   (record['id'],image,m.now())).lastrowid
            works[work_index]['photo_id']=photo_id
            update_photo_payload(c,user,record,payload,'showcase_photo_saved')
            c.execute('COMMIT')
            return {'ok':True,'photo_id':photo_id,'version':body.version+1}

    @app.delete('/api/v4/showcase/photos/{work_index}')
    def remove_work_photo(work_index:int,body:PhotoVersion,
                          linked_profile_id:int|None=Query(default=None,ge=1),
                          user=Depends(m.require('professional'))):
        if work_index<0 or work_index>=6:error(404,'Réalisation introuvable')
        with m.authenticated_db(user,write=True) as c:
            record=photo_scope(c,user['id'],linked_profile_id)
            if body.version!=record['version']:error(409,'La présentation a changé. Rechargez avant de supprimer la photo.')
            payload=json.loads(record['payload']);works=payload.get('works',[])
            if work_index>=len(works):error(404,'Réalisation introuvable')
            photo_id=works[work_index].pop('photo_id',None)
            if photo_id is None:return {'ok':True,'version':body.version,'changed':False}
            c.execute('DELETE FROM showcase_photos WHERE id=? AND showcase_id=?',(photo_id,record['id']))
            update_photo_payload(c,user,record,payload,'showcase_photo_removed')
            c.execute('COMMIT')
            return {'ok':True,'version':body.version+1,'changed':True}

    @app.get('/api/v4/showcase/photos/{photo_id}')
    def own_work_photo(photo_id:int,user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=False) as c:
            photo=c.execute('''SELECT sp.body,s.payload FROM showcase_photos sp
                JOIN professional_showcases s ON s.id=sp.showcase_id
                WHERE sp.id=? AND s.owner_id=?''',(photo_id,user['id'])).fetchone()
            if not photo or not any(w.get('photo_id')==photo_id for w in json.loads(photo['payload']).get('works',[])):
                error(404,'Photo introuvable')
            return Response(photo['body'],media_type='image/jpeg',headers={'Cache-Control':'no-store'})

    def candidate_access(c,project_id,application_id,user):
        row=c.execute('''SELECT a.professional_id,a.linked_profile_id,p.requester_id,p.hidden,
                u.suspended,pr.approved FROM applications a JOIN projects p ON p.id=a.project_id
                JOIN users u ON u.id=a.professional_id JOIN profiles pr ON pr.user_id=u.id
                WHERE a.id=? AND a.project_id=? AND p.requester_id=?''',
                (application_id,project_id,user['id'])).fetchone()
        if not row:error(404,'Présentation introuvable')
        meta=scope(c,row['professional_id'],row['linked_profile_id'])
        if row['hidden'] or row['suspended'] or not row['approved'] or not meta['active']:
            error(404,'Présentation indisponible')
        return row,meta

    @app.get('/api/projects/{project_id}/applications/{application_id}/showcase/photos/{photo_id}')
    def candidate_work_photo(project_id:int,application_id:int,photo_id:int,
                             user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=False) as c:
            row,meta=candidate_access(c,project_id,application_id,user)
            record=stored(c,row['professional_id'],row['linked_profile_id'])
            if not record:error(404,'Photo introuvable')
            data=json.loads(record['payload'])
            if not any(w.get('photo_id')==photo_id and w['trade'] in meta['trades']
                       and m.active_trade(w['trade'],c) for w in data.get('works',[])):
                error(404,'Photo introuvable')
            photo=c.execute('SELECT body FROM showcase_photos WHERE id=? AND showcase_id=?',
                            (photo_id,record['id'])).fetchone()
            if not photo:error(404,'Photo introuvable')
            return Response(photo['body'],media_type='image/jpeg',headers={'Cache-Control':'no-store'})

    @app.get('/api/projects/{project_id}/applications/{application_id}/showcase')
    def candidate(project_id:int,application_id:int,user=Depends(m.require('requester'))):
        with m.authenticated_db(user,write=False) as c:
            row,meta=candidate_access(c,project_id,application_id,user)
            data=view(stored(c,row['professional_id'],row['linked_profile_id']))
            # Scope changes cannot advertise a realization for an undeclared trade.
            works=[w for w in data['works'] if w['trade'] in meta['trades'] and m.active_trade(w['trade'],c)]
            try:
                public=Showcase(intro=data['intro'],works=works,version=data['version']).model_dump()
                for work in public['works']:
                    if work.get('photo_id') is None:work.pop('photo_id',None)
                public['intro']=m.precontact_safe(public['intro']) if public['intro'].strip() else ''
                for work in public['works']:
                    for field in ('title','description','trade'):work[field]=m.precontact_safe(work[field])
            except (ValueError,TypeError):error(404,'Présentation indisponible')
            name,_=m.public_profile_text(meta['name'],'Profil professionnel')
            return {'profile_name':name,'intro':public['intro'],'works':public['works'],'updated_at':data['updated_at'],
                    'declaration':'Informations déclarées, non vérifiées. Aucune certification ni avis client.'}
