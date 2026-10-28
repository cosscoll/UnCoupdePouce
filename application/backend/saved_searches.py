"""Private search criteria only: never stores results or grants project access."""
import json
from typing import Annotated,Literal
from fastapi import Depends,Path
from pydantic import BaseModel,ConfigDict,Field,field_validator,model_validator
from project_budget import MAX_BUDGET


class Criteria(BaseModel):
    model_config=ConfigDict(extra='forbid')
    q:str=Field(default='',max_length=120)
    trade:str=Field(default='',max_length=61)
    town:str=Field(default='',max_length=90)
    category:str=Field(default='',max_length=80)
    timing:Literal['flexible','month','quarter','urgent']|None=None
    published_within:int|None=Field(default=None,ge=1,le=365,strict=True)
    sort:Literal['newest','oldest']='newest'
    budget_from:int|None=Field(default=None,ge=0,le=MAX_BUDGET,strict=True)
    budget_to:int|None=Field(default=None,ge=0,le=MAX_BUDGET,strict=True)

    @field_validator('q','trade','town','category',mode='before')
    @classmethod
    def trim(cls,value):return value.strip() if isinstance(value,str) else value

    @model_validator(mode='after')
    def budget_order(self):
        if self.budget_from is not None and self.budget_to is not None and self.budget_from>self.budget_to:
            raise ValueError('Le budget minimum ne peut pas dépasser le maximum')
        return self


class SavedSearch(BaseModel):
    model_config=ConfigDict(extra='forbid')
    label:str=Field(min_length=2,max_length=60)
    criteria:Criteria

    @field_validator('label',mode='before')
    @classmethod
    def trim(cls,value):return value.strip() if isinstance(value,str) else value


def serialize(row):
    return {'id':row['id'],'label':row['label'],'criteria':json.loads(row['payload']),'created_at':row['created_at']}


def install(m):
    with m.connect() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS saved_searches(
          id INTEGER PRIMARY KEY,owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT NOT NULL,label_key TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL,
          UNIQUE(owner_id,label_key));
          CREATE INDEX IF NOT EXISTS idx_saved_searches_owner ON saved_searches(owner_id,id DESC);''')

    @m.app.get('/api/saved-searches')
    def list_saved(user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=False) as c:
            return {'items':[serialize(r) for r in c.execute('SELECT id,label,payload,created_at FROM saved_searches WHERE owner_id=? ORDER BY id DESC',(user['id'],))],'limit':10}

    @m.app.post('/api/saved-searches',status_code=201)
    def create_saved(body:SavedSearch,user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=True) as c:
            key=body.label.casefold()
            if c.execute('SELECT 1 FROM saved_searches WHERE owner_id=? AND label_key=?',(user['id'],key)).fetchone():
                m.error(409,'Une recherche porte déjà ce nom. Choisissez un autre nom ou supprimez l’ancienne.')
            if c.execute('SELECT COUNT(*) FROM saved_searches WHERE owner_id=?',(user['id'],)).fetchone()[0]>=10:
                m.error(409,'Maximum 10 recherches enregistrées. Supprimez une recherche avant d’en ajouter une.')
            created=m.now();payload=body.criteria.model_dump()
            result=c.execute('INSERT INTO saved_searches(owner_id,label,label_key,payload,created_at) VALUES(?,?,?,?,?)',(user['id'],body.label,key,json.dumps(payload,ensure_ascii=False),created))
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',(user['id'],'create_saved_search','saved_search',result.lastrowid,created))
            return {'id':result.lastrowid,'label':body.label,'criteria':payload,'created_at':created}

    @m.app.delete('/api/saved-searches/{id}')
    def delete_saved(id:Annotated[int,Path(ge=1,le=9223372036854775807)],user=Depends(m.require('professional'))):
        with m.authenticated_db(user,write=True) as c:
            result=c.execute('DELETE FROM saved_searches WHERE id=? AND owner_id=?',(id,user['id']))
            if not result.rowcount:m.error(404,'Recherche enregistrée introuvable')
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',(user['id'],'delete_saved_search','saved_search',id,m.now()))
        return {'ok':True}
