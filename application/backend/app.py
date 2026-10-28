"""UCP: local SQLite lab or explicitly configured, gated PostgreSQL staging.
Fictional accounts only. No payments, commercial signup or external messaging.
"""
from __future__ import annotations
import os, sqlite3, hashlib, hmac, secrets, re, time, json
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Annotated

from fastapi import FastAPI, Request, Response, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

ROOT = Path(__file__).parent
import sys
sys.path.insert(0, str(ROOT))
from hosting import Hosting, database_url
HOSTING = Hosting.from_env()
DATABASE_URL = database_url()
DATABASE_SCHEMA = os.getenv('UCP_DATABASE_SCHEMA', 'ucp_private')
DB = Path(os.getenv('UCP_LOCAL_DB', str(ROOT / 'ucp_local.sqlite3')))
ROLES = {'requester', 'professional'}
TRADES = {row['id'] for row in json.loads((ROOT/'taxonomy.json').read_text())}
def project_trades(row):
    return set(json.loads(row['trades_json'] or '[]') or [row['trade']])
def active_trade(value, connection=None):
    # Reuse the publication transaction when supplied by model validation.
    if connection is not None:
        return bool(connection.execute('SELECT 1 FROM taxonomy WHERE id=? AND active=1',(value,)).fetchone())
    # Read the live catalog so additions work across processes and restarts.
    with connect() as c:
        return bool(c.execute('SELECT 1 FROM taxonomy WHERE id=? AND active=1',(value,)).fetchone())
SESSION_SECONDS = 12*3600
SINGLE_ACCEPT = True  # Demo rule; founder to arbitrate multiple acceptance in real MVP.

app = FastAPI(title='UCP LAB — API locale non publique', docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware('http')
async def security_headers(request: Request, call_next):
    denied = HOSTING.reject(request)
    if denied is not None:
        return denied
    response = await call_next(request)
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    if HOSTING.staging:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; object-src 'none'; worker-src 'self'; manifest-src 'self'"
    return response

@contextmanager
def connect():
    if DATABASE_URL:
        from postgres import Connection
        conn = Connection(DATABASE_URL, DATABASE_SCHEMA)
        try:
            yield conn
        finally:
            conn.close()
        return
    DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB), timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=5000')
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with connect() as c:
        c.executescript('''
          PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('requester','professional','admin')),
            pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            csrf_hash TEXT NOT NULL, expires INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS auth_failures(email TEXT PRIMARY KEY,
            attempts INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER NOT NULL DEFAULT 0,
            locked_until INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE IF NOT EXISTS profiles(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            trade TEXT NOT NULL, town TEXT NOT NULL, siren TEXT, approved INTEGER NOT NULL DEFAULT 0,
            subscription_active INTEGER NOT NULL DEFAULT 0, approved_at TEXT);
          CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, requester_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL, description TEXT NOT NULL, trade TEXT NOT NULL, town TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','selected','closed')),
            created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
            professional_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending','accepted','rejected','withdrawn')),
            created_at TEXT NOT NULL, UNIQUE(project_id, professional_id));
          CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id),
            sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS beta_interest(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            wants_interview TEXT NOT NULL CHECK(wants_interview IN ('yes','maybe','no')),
            consent INTEGER NOT NULL CHECK(consent=1), consent_version TEXT NOT NULL, consent_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
            action TEXT NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,
            recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL, entity_id INTEGER NOT NULL, created_at TEXT NOT NULL,
            read_at TEXT);
          CREATE TABLE IF NOT EXISTS enterprise_accounts(id INTEGER PRIMARY KEY,
            owner_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            label TEXT NOT NULL, created_at TEXT NOT NULL,
            manager_artisan_active INTEGER NOT NULL DEFAULT 0 CHECK(manager_artisan_active IN (0,1)));
          CREATE TABLE IF NOT EXISTS enterprise_artisans(id INTEGER PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES enterprise_accounts(id) ON DELETE CASCADE,
            alias TEXT NOT NULL, service_trades TEXT NOT NULL, service_areas TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
            created_at TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS idx_linked_artisans_parent ON enterprise_artisans(enterprise_id);
          CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(recipient_id,id DESC);
          CREATE INDEX IF NOT EXISTS idx_project_matching ON projects(trade,town,status);
          CREATE INDEX IF NOT EXISTS idx_applications_pid ON applications(project_id);
          CREATE INDEX IF NOT EXISTS idx_messages_app ON messages(application_id);
        ''')
        cols=[r['name'] for r in c.execute('PRAGMA table_info(profiles)').fetchall()]
        if 'service_areas' not in cols:
            c.execute("ALTER TABLE profiles ADD COLUMN service_areas TEXT NOT NULL DEFAULT '[]'")
        if 'service_trades' not in cols:
            c.execute("ALTER TABLE profiles ADD COLUMN service_trades TEXT NOT NULL DEFAULT '[]'")
        application_cols=[r['name'] for r in c.execute('PRAGMA table_info(applications)').fetchall()]
        if 'linked_profile_id' not in application_cols:
            c.execute('ALTER TABLE applications ADD COLUMN linked_profile_id INTEGER REFERENCES enterprise_artisans(id)')
        # Existing v3.5 lab databases are migrated in place; no deletion or production migration.
        enterprise_cols=[r['name'] for r in c.execute('PRAGMA table_info(enterprise_accounts)').fetchall()]
        if 'manager_artisan_active' not in enterprise_cols:
            c.execute('ALTER TABLE enterprise_accounts ADD COLUMN manager_artisan_active INTEGER NOT NULL DEFAULT 0 CHECK(manager_artisan_active IN (0,1))')


def demo_email(value: str) -> str:
    """Require RFC 2606 / RFC 6761 reserved test domains. No real prospects in this lab."""
    value = value.strip().lower()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', value):
        raise ValueError('Email de laboratoire non valide')
    domain = value.rsplit('@', 1)[1]
    if not domain.endswith(('.example', '.test', '.invalid')):
        raise ValueError('Utilisez un email fictif en .example, .test ou .invalid ; jamais un email réel')
    return value



# Conservative local guard: block obvious direct contact details and street addresses
# in pre-selection project fields. Not a substitute for moderation, DLP or human review.
_EMAIL_CONTACT = re.compile(r"(?<![\w.])[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}")
_WEB_CONTACT = re.compile(r"(?i)(?:https?://|www\.|(?:wa\.me|t\.me|instagram\.com|facebook\.com)/)")
_PHONE_CONTACT = re.compile(r"(?<!\d)(?:(?:\+33|0033)[\s.\-]?[1-9]|0[1-9])(?:[\s.\-]?\d{2}){4}(?!\d)")
_STREET_ADDRESS = re.compile(r"(?i)(?<!\w)\d{1,4}\s*(?:bis|ter)?\s+(?:rue|avenue|av\.?|boulevard|bd\.?|impasse|chemin|route|all[ée]e|place)\b")


def precontact_safe(value: str) -> str:
    # Lab-only protection in addition to existing role gating; intentionally fail closed.
    normal = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", value).strip()
    if not normal:
        raise ValueError('Ce champ doit contenir du texte, et non uniquement des espaces')
    if any(rule.search(normal) for rule in (_EMAIL_CONTACT, _WEB_CONTACT, _PHONE_CONTACT, _STREET_ADDRESS)):
        raise ValueError("Avant la sélection, ne renseignez ni téléphone, ni email, ni URL, ni adresse postale précise")
    return normal


def siren_checksum_ok(value: str) -> bool:
    """Only validate the checksum. This is not an official registration lookup."""
    if not re.fullmatch(r'\d{9}', value):
        return False
    total = 0
    for pos, character in enumerate(reversed(value)):
        digit = int(character)
        if pos % 2:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def now(): return datetime.now(timezone.utc).isoformat(timespec='seconds')
def pw(password,salt): return hashlib.pbkdf2_hmac('sha256',password.encode(), bytes.fromhex(salt), 350_000).hex()
def hash_token(t): return hashlib.sha256(t.encode()).hexdigest()
def error(status,detail): raise HTTPException(status_code=status,detail=detail)

NOTIFICATION_TYPES = {
    'new_application': 'Une candidature a été reçue sur votre projet fictif.',
    'application_accepted': 'Votre candidature de test a été acceptée.',
    'application_rejected': 'Une de vos candidatures de test a été refusée.',
    'application_withdrawn': 'Une candidature sur votre projet a été retirée.',
    'project_closed': 'Un projet auquel vous avez candidaté a été clôturé.',
    'new_message': 'Un nouveau message fictif vous attend dans une conversation.',
    'support_resolved': 'Une réponse à votre demande d’assistance est disponible dans Assistance.',
    'report_resolved': 'Une réponse à votre signalement est disponible dans Assistance.',
}

def queue_notice(connection, recipient_id, event_type, entity_id):
    """Internal-only notice. No SMTP, no push service, no personal data in text."""
    if event_type not in NOTIFICATION_TYPES:
        raise ValueError('Unknown internal notification')
    connection.execute('INSERT INTO notifications(recipient_id,event_type,entity_id,created_at) VALUES(?,?,?,?)',
                       (recipient_id,event_type,entity_id,now()))

def get_user(request:Request):
    t = request.cookies.get('ucp_lab_sid','')
    if not t: error(401,'Connexion requise')
    with connect() as c:
        user=c.execute('''SELECT users.id,users.name,users.email,users.role,users.suspended,sessions.csrf_hash,sessions.expires,sessions.token_hash AS session_token_hash
               FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=?''',(hash_token(t),)).fetchone()
    if user and user['suspended']: error(403,'Compte suspendu')
    if not user or user['expires'] <= int(time.time()): error(401,'Session expirée')
    if request.method not in ('GET','HEAD','OPTIONS'):
        csrf=request.headers.get('x-ucp-csrf','')
        if not csrf or not hmac.compare_digest(hash_token(csrf),user['csrf_hash']): error(403,'Protection CSRF : jeton invalide')
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/') != str(request.base_url).rstrip('/'):
            error(403,'Origine non autorisée')
    return user

@contextmanager
def authenticated_db(user,write=False):
    """Recheck the authenticated session within the operation's SQL transaction.

    A revocation committed while an operation waits for the write lock must win.
    Read operations use a consistent snapshot for permission and data reads.
    """
    with connect() as c:
        c.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        try:
            current=c.execute('''SELECT users.role,users.suspended,sessions.csrf_hash,sessions.expires
                FROM sessions JOIN users ON users.id=sessions.user_id
                WHERE sessions.token_hash=? AND users.id=?''',(user['session_token_hash'],user['id'])).fetchone()
            if not current or current['expires']<=int(time.time()):error(401,'Session expirée ou révoquée')
            if current['suspended'] or current['role']!=user['role']:error(403,'Accès au compte modifié')
            if write and not hmac.compare_digest(current['csrf_hash'],user['csrf_hash']):error(403,'Session modifiée, rechargez cette page')
            yield c
            if c.in_transaction:c.commit()
        except BaseException:
            c.rollback()
            raise

@app.get('/api/notifications')
def list_notifications(user=Depends(get_user)):
    with authenticated_db(user,write=False) as c:
        records=c.execute('SELECT id,event_type,entity_id,created_at,read_at FROM notifications WHERE recipient_id=? ORDER BY id DESC LIMIT 100',
                          (user['id'],)).fetchall()
        unread=c.execute('SELECT COUNT(*) FROM notifications WHERE recipient_id=? AND read_at IS NULL',
                         (user['id'],)).fetchone()[0]
    return {'unread':unread, 'items':[dict(r)|{'message':NOTIFICATION_TYPES[r['event_type']]} for r in records],
            'channel':'LAB_LOCAL_ONLY'}

@app.post('/api/notifications/{notification_id}/read')
def mark_notification_read(notification_id:int,user=Depends(get_user)):
    with authenticated_db(user,write=True) as c:
        row=c.execute('SELECT read_at FROM notifications WHERE id=? AND recipient_id=?',
                      (notification_id,user['id'])).fetchone()
        if row is None:error(404,'Notification introuvable')
        if row['read_at'] is None:
            c.execute('UPDATE notifications SET read_at=? WHERE id=? AND recipient_id=?',
                      (now(),notification_id,user['id']))
    return {'ok':True}

@app.post('/api/notifications/read-all')
def mark_all_notifications_read(user=Depends(get_user)):
    with authenticated_db(user,write=True) as c:
        result=c.execute('UPDATE notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL',
                         (now(),user['id']))
    return {'ok':True,'count':result.rowcount}


def require(role):
    def dep(user=Depends(get_user)):
        if user['role'] != role: error(403,'Rôle interdit')
        return user
    return dep

class Register(BaseModel):
    email: str = Field(min_length=5,max_length=254)
    name: str = Field(min_length=2,max_length=100)
    password: str = Field(min_length=12,max_length=128)
    role: Literal['requester','professional']
    @field_validator('name')
    @classmethod
    def public_name_without_contact(cls,v):
        clean=precontact_safe(v)
        if len(clean)<2:raise ValueError('Nom fictif trop court')
        return clean
    @field_validator('email')
    @classmethod
    def email_validation(cls,v):
        return demo_email(v)

class Login(BaseModel):
    email: str = Field(min_length=5,max_length=254)
    password: str = Field(min_length=1,max_length=128)

class Profile(BaseModel):
    trade: str
    town: str = Field(min_length=2,max_length=90)
    siren: str = Field(pattern=r'^\d{9}$')
    service_zones: list[str] = Field(default_factory=list, max_length=20)
    additional_trades: list[str] = Field(default_factory=list, max_length=5)
    @field_validator('town')
    @classmethod
    def town_not_a_contact(cls,v):
        clean=precontact_safe(v)
        if len(clean)<2:raise ValueError('Commune trop courte')
        return clean
    @field_validator('additional_trades')
    @classmethod
    def additional_trades_valid(cls,trades):
        if any(not active_trade(t) or t=="inconnu" for t in trades): raise ValueError('Métier secondaire inconnu ou désactivé')
        return trades
    @field_validator('service_zones')
    @classmethod
    def service_zones_valid(cls,zones):
        if any(not z.strip() or len(z)>90 for z in zones): raise ValueError('Commune non valide')
        clean=[precontact_safe(z) for z in zones]
        if any(len(z)<2 for z in clean):raise ValueError('Commune trop courte')
        return clean
    @field_validator('siren')
    @classmethod
    def siren_valid(cls,v):
        if not siren_checksum_ok(v): raise ValueError('SIREN fictif invalide : clé de contrôle incorrecte')
        return v

    @field_validator('trade')
    @classmethod
    def trade_valid(cls,v):
        if not active_trade(v) or v=="inconnu": raise ValueError('métier inconnu ou désactivé')
        return v

class BetaInterest(BaseModel):
    wants_interview: Literal['yes','maybe','no']
    consent: Literal[True]

class Project(BaseModel):
    title: str = Field(min_length=5,max_length=120)
    description: str = Field(min_length=20,max_length=5000)
    trade: str
    town: str = Field(min_length=2,max_length=90)
    @field_validator('title','description','town')
    @classmethod
    def block_precontact(cls,v,info):
        clean=precontact_safe(v)
        required={'title':5,'description':20,'town':2}[info.field_name]
        if len(clean)<required:raise ValueError('Texte trop court après suppression des espaces')
        return clean
    @field_validator('trade')
    @classmethod
    def trade_valid(cls,v,info):
        connection = (info.context or {}).get('connection')
        if not active_trade(v,connection): raise ValueError('métier inconnu ou désactivé')
        return v

class Message(BaseModel):
    body: str = Field(min_length=1,max_length=2000)

class EditProject(BaseModel):
    title: str = Field(min_length=5,max_length=120)
    description: str = Field(min_length=20,max_length=5000)
    trade: str
    town: str = Field(min_length=2,max_length=90)
    @field_validator('title','description','town')
    @classmethod
    def block_precontact(cls,v,info):
        clean=precontact_safe(v)
        required={'title':5,'description':20,'town':2}[info.field_name]
        if len(clean)<required:raise ValueError('Texte trop court après suppression des espaces')
        return clean
    @field_validator('trade')
    @classmethod
    def trade_valid(cls,v):
        if not active_trade(v): raise ValueError('Métier inconnu ou désactivé')
        return v


class EnterpriseAccountCreate(BaseModel):
    label: str = Field(min_length=3,max_length=100)
    @field_validator('label')
    @classmethod
    def safe_label(cls,v):
        clean=precontact_safe(v)
        if len(clean)<3:raise ValueError('Nom de société fictive trop court')
        return clean

class ManagerArtisanMode(BaseModel):
    active: bool


class LinkedArtisanCreate(BaseModel):
    alias: str = Field(min_length=3,max_length=70)
    trades: list[str] = Field(min_length=1,max_length=5)
    zones: list[str] = Field(min_length=1,max_length=20)
    @field_validator('trades')
    @classmethod
    def valid_trades(cls,items):
        if len(set(items))!=len(items) or any(not active_trade(t) or t=="inconnu" for t in items):
            raise ValueError('Métiers non reconnus ou répétés')
        return items
    @field_validator('zones')
    @classmethod
    def valid_zones(cls,items):
        if any(len(z.strip())<2 or len(z)>90 for z in items):raise ValueError('Zone invalide')
        clean=[precontact_safe(z) for z in items]
        if any(len(z)<2 for z in clean):raise ValueError('Commune trop courte')
        if len({z.casefold() for z in clean})!=len(clean):raise ValueError('Zone répétée')
        return clean
    @field_validator('alias')
    @classmethod
    def safe_alias(cls,v):
        clean=precontact_safe(v)
        if len(clean)<3:raise ValueError('Alias trop court')
        return clean

@app.post('/api/enterprise',status_code=201)
def create_enterprise(body:EnterpriseAccountCreate,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        profile=c.execute('SELECT approved FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        if not profile or not profile['approved']:
            error(403,'Seul un gestionnaire de test approuvé peut créer un compte Entreprise fictif')
        try:
            cur=c.execute('INSERT INTO enterprise_accounts(owner_id,label,created_at) VALUES(?,?,?)',
                          (user['id'],body.label,now()))
            c.execute('COMMIT')
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            error(409,'Un compte Entreprise de test existe déjà pour ce gestionnaire')
    return {'id':cur.lastrowid,'label':body.label,'simulation':True}

@app.get('/api/enterprise')
def my_enterprise(user=Depends(require('professional'))):
    with authenticated_db(user,write=False) as c:
        account=c.execute('SELECT id,label,manager_artisan_active FROM enterprise_accounts WHERE owner_id=?',(user['id'],)).fetchone()
        if not account:return {'enterprise':None,'members':[],'pricing':None}
        items=c.execute('''SELECT id,alias,service_trades,service_areas,is_active FROM enterprise_artisans
                           WHERE enterprise_id=? ORDER BY id''',(account['id'],)).fetchall()
        manager=c.execute('SELECT approved FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
    members=[]
    for r in items:
        item=dict(r)
        item['trades']=json.loads(item.pop('service_trades'))
        item['zones']=json.loads(item.pop('service_areas'))
        members.append(item)
    manager_active=bool(account['manager_artisan_active']) and bool(manager and manager['approved'])
    linked_count=sum(int(x['is_active']) for x in members)
    count=linked_count+int(manager_active)
    return {'enterprise':dict(account),'members':members,
            'pricing':{'currency':'EUR','monthly_ht':20+15*count,'base_ht':20,
                       'per_active_artisan_ht':15,'active_artisans':count,
                       'linked_artisans_active':linked_count,
                       'manager_counted_as_artisan':manager_active,'billing':'SIMULATION — AUCUN STRIPE'}}

@app.post('/api/enterprise/manager-profile')
def set_enterprise_manager_artisan(body:ManagerArtisanMode,user=Depends(require('professional'))):
    # Explicit opt-in to an ACTIVE artisan seat; an administrative login alone is free.
    with authenticated_db(user,write=True) as c:
        row=c.execute('''SELECT e.id,e.manager_artisan_active,p.approved
            FROM enterprise_accounts e JOIN profiles p ON p.user_id=e.owner_id
            WHERE e.owner_id=?''',(user['id'],)).fetchone()
        if not row:error(404,'Compte Entreprise de laboratoire absent')
        if body.active and not row['approved']:error(403,'Profil artisan gestionnaire non approuvé')
        if bool(row['manager_artisan_active'])==body.active:error(409,'Profil gestionnaire déjà dans cet état')
        c.execute('UPDATE enterprise_accounts SET manager_artisan_active=? WHERE id=?',
                  (int(body.active),row['id']))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'toggle_manager_lab_artisan','enterprise',row['id'],now()))
        c.execute('COMMIT')
    return {'ok':True,'manager_counted_as_artisan':body.active,
            'note':'Simulation du nombre de sièges sans facturation Stripe, TVA ou prorata'}

@app.post('/api/enterprise/artisans',status_code=201)
def create_linked_artisan(body:LinkedArtisanCreate,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        owner=c.execute('''SELECT e.id, p.approved FROM enterprise_accounts e
            JOIN profiles p ON p.user_id=e.owner_id WHERE e.owner_id=?''',(user['id'],)).fetchone()
        if not owner or not owner['approved']:error(403,'Compte gestionnaire de test non approuvé')
        count=c.execute('SELECT COUNT(*) FROM enterprise_artisans WHERE enterprise_id=?',(owner['id'],)).fetchone()[0]
        if count>=25:error(409,'Maximum 25 artisans de démonstration')
        cur=c.execute('''INSERT INTO enterprise_artisans(enterprise_id,alias,service_trades,service_areas,created_at)
            VALUES(?,?,?,?,?)''',(owner['id'],body.alias,json.dumps(body.trades),json.dumps(body.zones,ensure_ascii=False),now()))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'create_linked_lab_artisan','linked_artisan',cur.lastrowid,now()))
        c.execute('COMMIT')
    return {'id':cur.lastrowid,'active':True,'note':'Profil d’artisan fictif, aucun login individuel'}

@app.post('/api/enterprise/artisans/{linked_id}/set-active')
def set_linked_artisan_active(linked_id:int,body:dict,user=Depends(require('professional'))):
    if type(body.get('active')) is not bool:error(422,'Paramètre booléen active obligatoire')
    with authenticated_db(user,write=True) as c:
        row=c.execute('''SELECT a.id,a.is_active,e.owner_id FROM enterprise_artisans a
             JOIN enterprise_accounts e ON e.id=a.enterprise_id WHERE a.id=?''',(linked_id,)).fetchone()
        if not row:error(404,'Profil lié introuvable')
        if row['owner_id']!=user['id']:error(403,'Un autre compte Entreprise possède ce profil')
        if bool(row['is_active'])==body['active']:error(409,'Ce profil est déjà dans cet état')
        c.execute('UPDATE enterprise_artisans SET is_active=? WHERE id=?',(int(body['active']),linked_id))
        if not body['active']:
            c.execute("UPDATE applications SET status='withdrawn' WHERE linked_profile_id=? AND status='pending'",(linked_id,))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'toggle_linked_lab_artisan','linked_artisan',linked_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'active':body['active'],'note':'Aucune facture réelle et aucun prélèvement Stripe'}

@app.post('/api/projects/{project_id}/apply-linked/{linked_id}',status_code=201)
def apply_with_enterprise_profile(project_id:int,linked_id:int,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        profile=c.execute('SELECT approved FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        if not profile or not profile['approved']:error(403,'Gestionnaire non approuvé')
        linked=c.execute('''SELECT a.*,e.owner_id FROM enterprise_artisans a JOIN enterprise_accounts e
            ON e.id=a.enterprise_id WHERE a.id=?''',(linked_id,)).fetchone()
        if not linked:error(404,'Profil artisan lié introuvable')
        if linked['owner_id']!=user['id']:error(403,'Profil lié à un autre gestionnaire')
        if not linked['is_active']:error(403,'Profil artisan lié inactif')
        proj=c.execute('SELECT * FROM projects WHERE id=?',(project_id,)).fetchone()
        if not proj:error(404,'Projet inconnu')
        if c.execute('SELECT suspended FROM users WHERE id=?',(proj['requester_id'],)).fetchone()[0]:error(403,'Projet indisponible')
        try:
            precontact_safe(' '.join(str(proj[key]) for key in ('title','description','town')))
        except ValueError:
            error(403,'Ancien projet fictif bloqué : données de contact directes')
        trades=json.loads(linked['service_trades']);zones={z.casefold() for z in json.loads(linked['service_areas'])}
        if proj['hidden'] or proj['status']!='open' or not (project_trades(proj) & set(trades)) or proj['town'].casefold() not in zones:
            error(403,'Projet hors métier, hors zone ou clos')
        try:
            cur=c.execute('''INSERT INTO applications(project_id,professional_id,linked_profile_id,created_at)
                     VALUES(?,?,?,?)''',(project_id,user['id'],linked_id,now()))
        except sqlite3.IntegrityError as exc:
            c.execute('ROLLBACK')
            if exc.sqlite_errorcode != sqlite3.SQLITE_CONSTRAINT_UNIQUE:raise
            error(409,'Une entreprise ne candidate qu’une fois par projet dans cette simulation')
        queue_notice(c,proj['requester_id'],'new_application',cur.lastrowid)
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'apply_enterprise','application',cur.lastrowid,now()))
        c.execute('COMMIT')
    return {'id':cur.lastrowid,'status':'pending','linked_profile_id':linked_id}

@app.get('/api/health')
def health():
    with connect() as c:
        c.execute('SELECT 1').fetchone()
    return {'ok':True,'mode':'staging' if HOSTING.staging else 'local_only',
            'storage':'postgresql' if DATABASE_URL else 'sqlite',
            'production':False,'release':'v4.1-preproduction'}

@app.post('/api/register',status_code=201)
def register(body:Register):
    salt=secrets.token_hex(16)
    with connect() as c:
        try:
            c.execute('BEGIN IMMEDIATE')
            cur=c.execute('INSERT INTO users(email,name,role,pw_salt,pw_hash,created_at) VALUES(?,?,?,?,?,?)',
                     (body.email,body.name.strip(),body.role,salt,pw(body.password,salt),now()))
            c.execute('COMMIT')
            return {'user_id':cur.lastrowid,'message':'Compte local créé, aucune publication sur internet'}
        except sqlite3.IntegrityError:
            c.execute('ROLLBACK')
            error(409,'Cet email existe déjà')

@app.post('/api/login')
def login(body:Login,response:Response):
    email=body.email.strip().lower()
    stamp=int(time.time())
    with connect() as c:
        attempts=c.execute('SELECT attempts,last_attempt,locked_until FROM auth_failures WHERE email=?',(email,)).fetchone()
        if attempts and attempts['locked_until']>stamp:
            error(429,'Trop de tentatives de démonstration. Réessayez plus tard.')
        user=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
        # Same KDF for known and unknown accounts: avoids trivial email enumeration.
        digest=pw(body.password,user['pw_salt'] if user else '00'*16)
        if not user or user['suspended'] or not hmac.compare_digest(digest,user['pw_hash']):
            c.execute('BEGIN IMMEDIATE')
            # Time-boxed lab guard only; a real preproduction also needs network-level rate limiting.
            old=c.execute('SELECT attempts,last_attempt,locked_until FROM auth_failures WHERE email=?',(email,)).fetchone()
            if old and old['locked_until']>stamp:
                c.execute('ROLLBACK');error(429,'Trop de tentatives de démonstration. Réessayez plus tard.')
            attempts_count=old['attempts']+1 if old and old['last_attempt']>=stamp-900 else 1
            lock=stamp+900 if attempts_count>=5 else 0
            c.execute('''INSERT INTO auth_failures(email,attempts,last_attempt,locked_until) VALUES(?,?,?,?)
               ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,last_attempt=excluded.last_attempt,
               locked_until=excluded.locked_until''',(email,attempts_count,stamp,lock))
            c.execute('COMMIT')
            if lock:error(429,'Trop de tentatives de démonstration. Réessayez plus tard.')
            error(401,'Identifiants invalides')
        c.execute('BEGIN IMMEDIATE')
        current=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
        # Password work happens before the write lock; reset/suspension must not
        # let an earlier credential snapshot mint a fresh session afterwards.
        if not current or current['suspended'] or not hmac.compare_digest(current['pw_hash'],digest) or current['pw_salt']!=user['pw_salt']:
            error(401,'Identifiants invalides')
        locked=c.execute('SELECT locked_until FROM auth_failures WHERE email=?',(email,)).fetchone()
        stamp=int(time.time())
        if locked and locked['locked_until']>stamp:error(429,'Trop de tentatives de démonstration. Réessayez plus tard.')
        user=current
        c.execute('DELETE FROM auth_failures WHERE email=?',(email,))
        t=secrets.token_urlsafe(32); csrf=secrets.token_urlsafe(32)
        c.execute('INSERT INTO sessions(token_hash,user_id,csrf_hash,expires) VALUES(?,?,?,?)',
                  (hash_token(t),user['id'],hash_token(csrf),stamp+SESSION_SECONDS))
        c.execute('COMMIT')
    response.set_cookie('ucp_lab_sid',t,max_age=SESSION_SECONDS,httponly=True,samesite='strict',secure=HOSTING.staging,path='/')
    return {'user_id':user['id'],'role':user['role'],'name':user['name'],'csrf':csrf}

@app.get('/api/me')
def me(user=Depends(get_user)):
    with authenticated_db(user) as c:
        current=c.execute('SELECT id,email,name,role FROM users WHERE id=?',(user['id'],)).fetchone()
        return dict(current)

@app.get('/api/account/sessions')
def own_sessions(request:Request,user=Depends(get_user)):
    # Only counts are shared; session tokens, hashes, IP addresses are never returned.
    with authenticated_db(user,write=False) as c:
        total=c.execute('SELECT COUNT(*) FROM sessions WHERE user_id=? AND expires>?',
                        (user['id'],int(time.time()))).fetchone()[0]
    return {'active_sessions':total,'current':True,'laboratory':True}

@app.post('/api/account/sessions/revoke-others')
def revoke_other_sessions(request:Request,user=Depends(get_user)):
    current=hash_token(request.cookies['ucp_lab_sid'])
    with authenticated_db(user,write=True) as c:
        deleted=c.execute('DELETE FROM sessions WHERE user_id=? AND token_hash!=?',
                          (user['id'],current)).rowcount
    return {'ok':True,'revoked':deleted,'current_session_preserved':True}

@app.get('/api/account/activity')
def own_activity(user=Depends(get_user)):
    # No cross-account audit visibility: only actions actually performed by this user.
    with authenticated_db(user,write=False) as c:
        records=c.execute('''SELECT action,target_type,target_id,created_at FROM audit
            WHERE actor_id=? ORDER BY id DESC LIMIT 50''',(user['id'],)).fetchall()
    return {'laboratory':True,'items':[dict(r) for r in records]}

@app.get('/api/admin/audit')
def admin_audit(user=Depends(require('admin'))):
    with authenticated_db(user,write=False) as c:
        records=c.execute('''SELECT id,actor_id,action,target_type,target_id,created_at
            FROM audit ORDER BY id DESC LIMIT 100''').fetchall()
    return {'laboratory':True,'items':[dict(r) for r in records]}


@app.get('/api/session')
def renew_csrf(request:Request,user=Depends(get_user)):
    token=secrets.token_urlsafe(32)
    with authenticated_db(user,write=True) as c:
        c.execute('UPDATE sessions SET csrf_hash=? WHERE token_hash=?',(hash_token(token),hash_token(request.cookies['ucp_lab_sid'])))
    return {'id':user['id'],'name':user['name'],'email':user['email'],'role':user['role'],'csrf':token}

@app.post('/api/logout')
def logout(response:Response,request:Request,user=Depends(get_user)):
    with authenticated_db(user,write=True) as c:c.execute('DELETE FROM sessions WHERE token_hash=?',(hash_token(request.cookies['ucp_lab_sid']),))
    response.delete_cookie('ucp_lab_sid',path='/')
    return {'ok':True}

@app.post('/api/profile')
def save_profile(body:Profile,user=Depends(require('professional'))):
    zones=[];seen=set()
    for z in [body.town,*body.service_zones]:
        z=z.strip()
        if z.casefold() not in seen: zones.append(z); seen.add(z.casefold())
    if len(zones)>20:error(422,'Maximum 20 communes couvertes')
    secondary=[]
    for trade in body.additional_trades:
        if trade!=body.trade and trade not in secondary: secondary.append(trade)
    if len(secondary)>4:error(422,'Maximum 5 métiers avec métier principal')
    with authenticated_db(user,write=True) as c:
        # Do not let a verified profile modify identity and keep approval.
        c.execute('''INSERT INTO profiles(user_id,trade,town,siren,service_areas,service_trades,approved,subscription_active)
               VALUES(?,?,?,?,?,?,0,0) ON CONFLICT(user_id) DO UPDATE SET
               trade=excluded.trade,town=excluded.town,siren=excluded.siren,service_areas=excluded.service_areas,
               service_trades=excluded.service_trades,approved=0,subscription_active=0,approved_at=NULL''',
               (user['id'],body.trade,body.town.strip(),body.siren,json.dumps(zones,ensure_ascii=False),json.dumps(secondary)))
        # A changed or unapproved manager is not considered an active paid artisan seat.
        c.execute('UPDATE enterprise_accounts SET manager_artisan_active=0 WHERE owner_id=?',(user['id'],))
        # A change of professional scope invalidates pending proposals on earlier terms.
        c.execute("UPDATE applications SET status='rejected' WHERE professional_id=? AND status='pending'",(user['id'],))
        c.execute('COMMIT')
    return {'ok':True,'approved':False,'note':'SIREN saisi non vérifié — revue admin obligatoire'}

@app.post('/api/beta-interest')
def record_interest(body:BetaInterest,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        profile=c.execute('SELECT 1 FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        if not profile:error(409,'Complétez le profil professionnel')
        c.execute('''INSERT INTO beta_interest(user_id,wants_interview,consent,consent_version,consent_at)
           VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET wants_interview=excluded.wants_interview,
           consent=excluded.consent,consent_version=excluded.consent_version,consent_at=excluded.consent_at''',
           (user['id'],body.wants_interview,1,'LAB-2026-10-12',now()))
        return {'ok':True,'message':'Intérêt enregistré uniquement dans la base locale de test'}

@app.get('/api/my-profile')
def my_profile(user=Depends(require('professional'))):
    with authenticated_db(user,write=False) as c:
        p=c.execute('SELECT trade,town,siren,service_areas,service_trades,approved,subscription_active FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        b=c.execute('SELECT wants_interview,consent_at FROM beta_interest WHERE user_id=?',(user['id'],)).fetchone()
    profile=dict(p) if p else None
    if profile:
        profile['service_zones']=json.loads(profile.pop('service_areas') or '[]')
        profile['additional_trades']=json.loads(profile.pop('service_trades') or '[]')
    return {'profile':profile,'beta':dict(b) if b else None}

@app.post('/api/projects',status_code=201)
def create_project(body:Project,user=Depends(require('requester'))):
    with authenticated_db(user,write=True) as c:
        cur=c.execute('INSERT INTO projects(requester_id,title,description,trade,town,created_at) VALUES(?,?,?,?,?,?)',
                  (user['id'],body.title.strip(),body.description.strip(),body.trade,body.town.strip(),now()))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'create_project','project',cur.lastrowid,now()))
        c.execute('COMMIT')
    return {'id':cur.lastrowid,'status':'open'}

@app.put('/api/projects/{project_id}')
def edit_project(project_id:int,body:EditProject,user=Depends(require('requester'))):
    # Do not allow changing an advertised job after any professional applied.
    with authenticated_db(user,write=True) as c:
        project=c.execute('SELECT requester_id,status,trade,trades_json FROM projects WHERE id=?',(project_id,)).fetchone()
        if not project:error(404,'Projet inconnu')
        if project['requester_id']!=user['id']:error(403,'Projet appartenant à un autre demandeur')
        if project['status']!='open' or c.execute('SELECT 1 FROM applications WHERE project_id=?',(project_id,)).fetchone():
            error(409,'Projet non modifiable après une candidature ou sa fermeture')
        if body.trade!=project['trade'] and len(project_trades(project))>1:error(409,'Les métiers d’un projet multi-métiers ne peuvent être modifiés ici')
        if body.trade!=project['trade']:c.execute('UPDATE projects SET trades_json=? WHERE id=?',(json.dumps([body.trade]),project_id))
        c.execute('UPDATE projects SET title=?,description=?,trade=?,town=? WHERE id=?',
                  (body.title.strip(),body.description.strip(),body.trade,body.town.strip(),project_id))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'edit_project','project',project_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'status':'open'}

@app.post('/api/projects/{project_id}/close')
def close_project(project_id:int,user=Depends(require('requester'))):
    # Closing a project also shuts down its chat (see check_conversation).
    with authenticated_db(user,write=True) as c:
        project=c.execute('SELECT requester_id,status,trade,trades_json FROM projects WHERE id=?',(project_id,)).fetchone()
        if not project:error(404,'Projet inconnu')
        if project['requester_id']!=user['id']:error(403,'Projet appartenant à un autre demandeur')
        if project['status']=='closed':error(409,'Projet déjà clôturé')
        targets=c.execute("SELECT professional_id FROM applications WHERE project_id=? AND status IN ('pending','accepted')",
                          (project_id,)).fetchall()
        c.execute("UPDATE projects SET status='closed' WHERE id=?",(project_id,))
        c.execute("UPDATE applications SET status='rejected' WHERE project_id=? AND status='pending'",(project_id,))
        for target in targets:queue_notice(c,target['professional_id'],'project_closed',project_id)
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'close_project','project',project_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'status':'closed','chat_access':False}

@app.get('/api/projects')
def projects(user=Depends(get_user),q:Annotated[str,Query(max_length=120)]='',
             trade:Annotated[str,Query(max_length=61)]='',town:Annotated[str,Query(max_length=90)]='',
             category:Annotated[str,Query(max_length=80)]='',
             timing:Literal['flexible','month','quarter','urgent']|None=None,
             status:Literal['open','selected','closed']|None=None,
             published_within:Annotated[int|None,Query(ge=1,le=365)]=None,
             sort:Literal['newest','oldest']='newest'):
    from project_search import decorate, filter_projects
    columns='''p.id,p.title,p.description,p.trade,p.town,p.status,p.trades_json,p.hidden,p.created_at,
        (SELECT payload FROM drafts WHERE project_id=p.id ORDER BY id LIMIT 1) AS draft_payload'''
    discovery='not_applicable'
    with authenticated_db(user,write=False) as c:
        if user['role']=='requester':
            rs=[decorate(r) for r in c.execute('SELECT '+columns+' FROM projects p WHERE p.requester_id=? ORDER BY p.id DESC',(user['id'],))]
        elif user['role']=='professional':
            p=c.execute('SELECT * FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
            discovery='profile_required' if not p else 'pending_review' if not p['approved'] else 'ready'
            # Authorization precedes all filters. No requester identity or outside counts.
            possible=c.execute('SELECT '+columns+''' FROM projects p JOIN users u ON u.id=p.requester_id
                WHERE p.status=? AND p.hidden=0 AND u.suspended=0 ORDER BY p.id DESC''',('open',)).fetchall() if p and p['approved'] else []
            eligible={zone.casefold() for zone in json.loads(p['service_areas'] or '[]')} if p else set()
            valid_trades={p['trade'],*json.loads(p['service_trades'] or '[]')} if p else set()
            if p:eligible.add(p['town'].casefold())
            members=c.execute('''SELECT a.id,a.alias,a.service_trades,a.service_areas FROM enterprise_artisans a
                JOIN enterprise_accounts e ON e.id=a.enterprise_id WHERE e.owner_id=? AND a.is_active=1 ORDER BY a.id''',
                (user['id'],)).fetchall() if p and p['approved'] else []
            rs=[]
            for pr in possible:
                try:precontact_safe(' '.join(str(pr[key]) for key in ('title','description','town')))
                except ValueError:continue
                scope=project_trades(pr)
                owner_match=bool(scope & valid_trades) and pr['town'].casefold() in eligible
                linked=next((r for r in members if bool(scope & set(json.loads(r['service_trades']))) and
                             pr['town'].casefold() in {t.casefold() for t in json.loads(r['service_areas'])}),None)
                if owner_match or linked:
                    row=decorate(pr)
                    row['matching_linked_profile_id']=linked['id'] if linked else None
                    row['matching_individual_profile']=bool(owner_match)
                    row['match']={'profile':'individual' if owner_match else 'linked',
                                  'alias':None if owner_match else linked['alias'],
                                  'trades':sorted(scope & (valid_trades if owner_match else set(json.loads(linked['service_trades'])))),
                                  'town':pr['town']}
                    rs.append(row)
        else:rs=[]
        taxonomy=[dict(r) for r in c.execute('SELECT id,label,group_name,synonyms FROM taxonomy')]
        filtered=filter_projects(rs,taxonomy,q=q,trade=trade,town=town,category=category,timing=timing,status=status,
                                 published_within=published_within,sort=sort)
    return {'items':filtered,'search_scope':discovery}

@app.post('/api/projects/{project_id}/apply',status_code=201)
def apply(project_id:int,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        p=c.execute('SELECT * FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        if not p or not p['approved']:error(403,'Profil professionnel non vérifié')
        project=c.execute('SELECT * FROM projects WHERE id=?',(project_id,)).fetchone()
        if not project:error(404,'Projet inconnu')
        if c.execute('SELECT suspended FROM users WHERE id=?',(project['requester_id'],)).fetchone()[0]:error(403,'Projet indisponible')
        try:
            precontact_safe(' '.join(str(project[key]) for key in ('title','description','town')))
        except ValueError:
            error(403,'Ancien projet fictif bloqué : données de contact directes')
        eligible={zone.casefold() for zone in json.loads(p['service_areas'] or '[]')}
        eligible.add(p['town'].casefold())
        valid_trades={p['trade'],*json.loads(p['service_trades'] or '[]')}
        if project['hidden'] or project['status']!='open' or not (project_trades(project) & valid_trades) or project['town'].casefold() not in eligible:
            error(403,'Projet non éligible au métier, à la zone ou au statut')
        try:
            cur=c.execute('INSERT INTO applications(project_id,professional_id,created_at) VALUES(?,?,?)',(project_id,user['id'],now()))
        except sqlite3.IntegrityError as exc:
            c.execute('ROLLBACK')
            if exc.sqlite_errorcode != sqlite3.SQLITE_CONSTRAINT_UNIQUE:raise
            error(409,'Candidature déjà enregistrée')
        queue_notice(c,project['requester_id'],'new_application',cur.lastrowid)
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'apply_individual','application',cur.lastrowid,now()))
        c.execute('COMMIT')
        return {'id':cur.lastrowid,'status':'pending'}

@app.post('/api/applications/{application_id}/withdraw')
def withdraw_application(application_id:int,user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        row=c.execute('''SELECT a.professional_id,a.status,p.requester_id FROM applications a
            JOIN projects p ON p.id=a.project_id WHERE a.id=?''',(application_id,)).fetchone()
        if not row:error(404,'Candidature inconnue')
        if row['professional_id']!=user['id']:error(403,'Candidature non autorisée')
        if row['status']!='pending':error(409,'Une candidature traitée ne peut plus être retirée ici')
        c.execute("UPDATE applications SET status='withdrawn' WHERE id=?",(application_id,))
        queue_notice(c,row['requester_id'],'application_withdrawn',application_id)
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'withdraw_application','application',application_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'status':'withdrawn'}

@app.post('/api/applications/{application_id}/reject')
def reject_application(application_id:int,user=Depends(require('requester'))):
    with authenticated_db(user,write=True) as c:
        row=c.execute('''SELECT applications.status,applications.professional_id,projects.requester_id FROM applications
          JOIN projects ON projects.id=applications.project_id WHERE applications.id=?''',(application_id,)).fetchone()
        if not row:error(404,'Candidature inconnue')
        if row['requester_id']!=user['id']:error(403,'Candidature non autorisée')
        if row['status']!='pending':error(409,'Candidature déjà traitée')
        c.execute("UPDATE applications SET status='rejected' WHERE id=?",(application_id,))
        queue_notice(c,row['professional_id'],'application_rejected',application_id)
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                  (user['id'],'reject_application','application',application_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'status':'rejected'}

@app.get('/api/my-applications')
def my_applications(user=Depends(require('professional'))):
    with authenticated_db(user,write=False) as c:
        rows=c.execute('''SELECT applications.id,applications.status,projects.title,projects.trade,projects.town,
        linked.alias AS linked_artisan_alias FROM applications JOIN projects ON projects.id=applications.project_id
        LEFT JOIN enterprise_artisans linked ON linked.id=applications.linked_profile_id
        WHERE applications.professional_id=? ORDER BY applications.id DESC''',(user['id'],)).fetchall()
    return {'items':[dict(r) for r in rows]}

@app.get('/api/projects/{project_id}/applications')
def get_applications(project_id:int,user=Depends(require('requester'))):
    with authenticated_db(user,write=False) as c:
        pr=c.execute('SELECT requester_id,status,hidden FROM projects WHERE id=?',(project_id,)).fetchone()
        if not pr:error(404,'Projet inconnu')
        if pr['requester_id']!=user['id']:error(403,'Vous ne possédez pas ce projet')
        rows=c.execute('''SELECT applications.id,applications.status,applications.created_at,
           applications.linked_profile_id,users.name AS professional_name,users.suspended,
           profiles.trade,profiles.town,profiles.approved,profiles.service_trades,profiles.service_areas,
           linked.alias AS linked_artisan_alias,linked.service_trades AS linked_trades,
           linked.service_areas AS linked_zones,linked.is_active AS linked_active FROM applications
           JOIN users ON applications.professional_id=users.id
           JOIN profiles ON profiles.user_id=users.id
           LEFT JOIN enterprise_artisans linked ON linked.id=applications.linked_profile_id
           WHERE applications.project_id=? ORDER BY applications.id''',(project_id,)).fetchall()
        items=[]
        for row in rows:
            linked=bool(row['linked_profile_id'])
            scope=json.loads(row['linked_trades'] or '[]') if linked else [row['trade'],*json.loads(row['service_trades'] or '[]')]
            zones=json.loads(row['linked_zones'] or '[]') if linked else json.loads(row['service_areas'] or '[]') or [row['town']]
            authorized=bool(row['approved'] and not row['suspended'] and (not linked or row['linked_active']))
            # Public candidate fields only: no email, SIREN, session or billing data.
            items.append({k:row[k] for k in ('id','status','professional_name','trade','town','linked_artisan_alias')} |
                         {'trades':list(dict.fromkeys(scope)),'service_zones':zones,'submitted_at':row['created_at'],
                          'verification_status':'test_authorized' if authorized else 'test_unavailable',
                          'eligible_for_selection':authorized and row['status']=='pending' and pr['status']=='open' and not pr['hidden']})
    return {'items':items}

@app.post('/api/applications/{application_id}/accept')
def accept(application_id:int,user=Depends(require('requester'))):
    with authenticated_db(user,write=True) as c:
        item=c.execute('''SELECT applications.*,projects.requester_id,projects.status AS project_status,projects.hidden
              FROM applications JOIN projects ON projects.id=applications.project_id WHERE applications.id=?''',(application_id,)).fetchone()
        if not item:error(404,'Candidature inconnue')
        if item['requester_id']!=user['id']:error(403,'Vous ne possédez pas ce projet')
        if item['hidden']:error(409,'Projet en cours de modération')
        if item['status']!='pending' or item['project_status']!='open':error(409,'Candidature déjà traitée ou projet fermé')
        p=c.execute('SELECT approved FROM profiles WHERE user_id=?',(item['professional_id'],)).fetchone()
        if c.execute('SELECT suspended FROM users WHERE id=?',(item['professional_id'],)).fetchone()[0]:error(409,'Compte professionnel suspendu')
        if not p or not p['approved']:error(409,'Prestataire non vérifié')
        c.execute('UPDATE applications SET status=? WHERE id=?',('accepted',application_id))
        queue_notice(c,item['professional_id'],'application_accepted',application_id)
        if SINGLE_ACCEPT:
            pending=c.execute("SELECT id,professional_id FROM applications WHERE project_id=? AND id!=? AND status='pending'",
                              (item['project_id'],application_id)).fetchall()
            c.execute('UPDATE projects SET status=? WHERE id=?',('selected',item['project_id']))
            c.execute('UPDATE applications SET status=? WHERE project_id=? AND id!=? AND status=?',('rejected',item['project_id'],application_id,'pending'))
            for other in pending:queue_notice(c,other['professional_id'],'application_rejected',other['id'])
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                   (user['id'],'accept_application','application',application_id,now()))
        c.execute('COMMIT')
    return {'ok':True,'status':'accepted','chat_requires_active_subscription':True}

@app.get('/api/conversations')
def conversations(user=Depends(get_user)):
    with authenticated_db(user,write=False) as c:
        if user['role']=='requester':
            items=c.execute('''SELECT applications.id AS application_id,projects.title,users.name AS peer,
                   profiles.subscription_active,applications.linked_profile_id,linked.is_active AS linked_active
                   FROM applications JOIN projects ON applications.project_id=projects.id
                   JOIN users ON users.id=applications.professional_id JOIN profiles ON profiles.user_id=users.id
                   LEFT JOIN enterprise_artisans linked ON linked.id=applications.linked_profile_id
                   WHERE applications.status=? AND projects.requester_id=? AND projects.status!='closed' ''',('accepted',user['id'])).fetchall()
        elif user['role']=='professional':
            items=c.execute('''SELECT applications.id AS application_id,projects.title,users.name AS peer,
                   profiles.subscription_active,applications.linked_profile_id,linked.is_active AS linked_active
                   FROM applications JOIN projects ON applications.project_id=projects.id
                   JOIN users ON users.id=projects.requester_id JOIN profiles ON profiles.user_id=applications.professional_id
                   LEFT JOIN enterprise_artisans linked ON linked.id=applications.linked_profile_id
                   WHERE applications.status=? AND applications.professional_id=? AND projects.status!='closed' ''',('accepted',user['id'])).fetchall()
        else:items=[]
        visible=[]
        for item in items:
            try:check_conversation(c,item['application_id'],user['id'],allow_locked=True)
            except HTTPException as exc:
                if exc.status_code not in (403,404):raise
            else:visible.append(dict(item))
    return {'items':visible}

def check_conversation(c,aid,uid,allow_locked=False):
    row=c.execute('''SELECT applications.status,applications.professional_id,projects.requester_id,projects.status AS project_status,projects.hidden,profiles.approved,profiles.subscription_active
      ,applications.linked_profile_id,linked.is_active AS linked_active
      FROM applications JOIN projects ON applications.project_id=projects.id
      JOIN profiles ON profiles.user_id=applications.professional_id
      LEFT JOIN enterprise_artisans linked ON linked.id=applications.linked_profile_id
      WHERE applications.id=?''',(aid,)).fetchone()
    if not row:error(404,'Conversation inconnue')
    if uid not in [row['professional_id'],row['requester_id']]:error(403,'Conversation privée')
    if c.execute('SELECT 1 FROM users WHERE id IN (?,?) AND suspended=1',(row['professional_id'],row['requester_id'])).fetchone():error(403,'Compte participant suspendu')
    if row['hidden'] or not row['approved']:error(403,'Accès suspendu par modération')
    if row['status']!='accepted' or row['project_status']=='closed':error(403,'Conversation fermée')
    if not allow_locked and row['linked_profile_id'] and not row['linked_active']:
        error(403,'Accès chat suspendu : artisan lié inactif')
    if not allow_locked and not row['subscription_active']:error(403,'Accès chat suspendu : abonnement de test inactif')
    return row

@app.get('/api/conversations/{aid}/messages')
def read_messages(aid:int,user=Depends(get_user)):
    with authenticated_db(user,write=False) as c:
        check_conversation(c,aid,user['id'])
        items=c.execute('SELECT id,sender_id,body,created_at FROM messages WHERE application_id=? ORDER BY id',(aid,)).fetchall()
    return {'items':[dict(x) for x in items]}

@app.post('/api/conversations/{aid}/messages',status_code=201)
def send_message(aid:int,body:Message,request:Request,user=Depends(get_user)):
    key=request.headers.get('Idempotency-Key')
    if key is not None and not re.fullmatch(r'[A-Za-z0-9_-]{16,128}',key):error(422,'Clé de réessai invalide')
    content=body.body.strip()
    if not content:error(422,'Le message ne peut pas être vide')
    digest=hashlib.sha256(content.encode()).hexdigest()
    with authenticated_db(user,write=True) as c:
        row=check_conversation(c,aid,user['id'])
        if key:
            previous=c.execute('SELECT message_id,body_hash FROM message_retries WHERE application_id=? AND sender_id=? AND retry_key=?',
                               (aid,user['id'],key)).fetchone()
            if previous:
                if previous['body_hash']!=digest:error(409,'Cette clé a déjà servi pour un autre message')
                c.execute('COMMIT')
                return {'id':previous['message_id'],'ok':True}
        cur=c.execute('INSERT INTO messages(application_id,sender_id,body,created_at) VALUES(?,?,?,?)',
                      (aid,user['id'],content,now()))
        if key:
            c.execute('INSERT INTO message_retries VALUES(?,?,?,?,?)',(aid,user['id'],key,cur.lastrowid,digest))
        other_id=row['requester_id'] if row['professional_id']==user['id'] else row['professional_id']
        queue_notice(c,other_id,'new_message',aid)
        c.execute('COMMIT')
    return {'id':cur.lastrowid,'ok':True}

@app.get('/api/account/export')
def account_export(user=Depends(get_user)):
    # Limited lab export: only the authenticated participant's records, never another user's messages.
    with authenticated_db(user,write=False) as c:
        projects_owned=[dict(r) for r in c.execute('SELECT id,title,description,trade,trades_json,town,status,created_at FROM projects WHERE requester_id=?',(user['id'],))]
        own_drafts=[dict(r) for r in c.execute('SELECT id,payload,version,project_id,updated_at FROM drafts WHERE owner_id=?',(user['id'],))]
        import base64
        own_photos=[{'id':r['id'],'draft_id':r['draft_id'],'jpeg_base64':base64.b64encode(r['body']).decode()} for r in c.execute('SELECT photos.id,draft_id,body FROM photos JOIN drafts ON drafts.id=photos.draft_id WHERE drafts.owner_id=?',(user['id'],))]
        own_support=[dict(r) for r in c.execute('SELECT id,subject,category,body,status,response,created_at,resolved_at FROM support_tickets WHERE owner_id=?',(user['id'],))]
        own_reports=[dict(r) for r in c.execute('SELECT kind,target_id,reason,status,resolution,created_at FROM reports WHERE reporter_id=?',(user['id'],))]
        applications_owned=[dict(r) for r in c.execute('SELECT id,project_id,status,created_at FROM applications WHERE professional_id=?',(user['id'],))]
        profile=c.execute('SELECT trade,town,siren,service_areas,service_trades,approved,subscription_active FROM profiles WHERE user_id=?',(user['id'],)).fetchone()
        interest=c.execute('SELECT wants_interview,consent,consent_version,consent_at FROM beta_interest WHERE user_id=?',(user['id'],)).fetchone()
        messages_owned=[dict(r) for r in c.execute('SELECT application_id,body,created_at FROM messages WHERE sender_id=?',(user['id'],))]
        own_notices=[dict(r) for r in c.execute('SELECT event_type,entity_id,created_at,read_at FROM notifications WHERE recipient_id=?',(user['id'],))]
        own_activity=[dict(r) for r in c.execute('SELECT action,target_type,target_id,created_at FROM audit WHERE actor_id=? ORDER BY id DESC',(user['id'],))]
        own_enterprise=c.execute('SELECT id,label,created_at FROM enterprise_accounts WHERE owner_id=?',(user['id'],)).fetchone()
        own_linked_artisans=([dict(r) for r in c.execute('SELECT id,alias,service_trades,service_areas,is_active,created_at FROM enterprise_artisans WHERE enterprise_id=?',(own_enterprise['id'],))]
                              if own_enterprise else [])
    return {'laboratory':True,'user':{'email':user['email'],'name':user['name'],'role':user['role']},
            'profile':dict(profile) if profile else None,'beta_interest':dict(interest) if interest else None,
            'own_projects':projects_owned,'own_applications':applications_owned,'own_messages':messages_owned,
            'own_notifications':own_notices,'own_activity':own_activity,'own_enterprise':dict(own_enterprise) if own_enterprise else None,
            'own_linked_artisans':own_linked_artisans,'own_drafts':own_drafts,'own_photos':own_photos,'own_reports':own_reports,'own_support':own_support}

@app.delete('/api/beta-interest')
def revoke_interest(user=Depends(require('professional'))):
    with authenticated_db(user,write=True) as c:
        c.execute('DELETE FROM beta_interest WHERE user_id=?',(user['id'],))
    return {'ok':True,'recontact_interest':False,'note':'Donnée de bêta laboratoire effacée'}

@app.post('/api/admin/bootstrap')
def bootstrap_admin(payload:dict):
    # Disabled unless operator explicitly sets a one-time local secret in environment.
    secret=os.getenv('UCP_LOCAL_ADMIN_BOOTSTRAP','')
    if len(secret)<24 or not hmac.compare_digest(str(payload.get('secret','')),secret):error(403,'Configuration admin absente')
    if len(str(payload.get('password','')))<12:error(422,'Mot de passe admin trop court')
    name='Administrateur laboratoire';salt=secrets.token_hex(16)
    try: email=demo_email(str(payload.get('email','')))
    except ValueError: error(422,'Email administrateur non fictif ou invalide')
    with connect() as c:
        if c.execute("SELECT id FROM users WHERE role='admin'").fetchone():error(409,'Administrateur déjà créé')
        c.execute('INSERT INTO users(email,name,role,pw_salt,pw_hash,created_at) VALUES(?,?,?,?,?,?)',
                  (email,name,'admin',salt,pw(str(payload['password']),salt),now()))
    return {'ok':True}

@app.get('/api/admin/metrics')
def admin_metrics(user=Depends(require('admin'))):
    """Only aggregated, synthetic laboratory metrics; no personal data."""
    with authenticated_db(user,write=False) as c:
        counts = {
            'requesters': c.execute("SELECT COUNT(*) FROM users WHERE role='requester'").fetchone()[0],
            'professionals': c.execute("SELECT COUNT(*) FROM users WHERE role='professional'").fetchone()[0],
            'approved_professionals': c.execute('SELECT COUNT(*) FROM profiles WHERE approved=1').fetchone()[0],
            'demo_subscriptions': c.execute('SELECT COUNT(*) FROM profiles WHERE subscription_active=1').fetchone()[0],
            'beta_interests': c.execute('SELECT COUNT(*) FROM beta_interest').fetchone()[0],
            'projects': c.execute('SELECT COUNT(*) FROM projects').fetchone()[0],
            'open_projects': c.execute("SELECT COUNT(*) FROM projects WHERE status='open'").fetchone()[0],
            'applications': c.execute('SELECT COUNT(*) FROM applications').fetchone()[0],
            'accepted_applications': c.execute("SELECT COUNT(*) FROM applications WHERE status='accepted'").fetchone()[0],
            'messages': c.execute('SELECT COUNT(*) FROM messages').fetchone()[0],
            'notifications_local': c.execute('SELECT COUNT(*) FROM notifications').fetchone()[0],
            'enterprise_accounts_simulated': c.execute('SELECT COUNT(*) FROM enterprise_accounts').fetchone()[0],
            'linked_artisans_simulated': c.execute('SELECT COUNT(*) FROM enterprise_artisans WHERE is_active=1').fetchone()[0]
        }
    return {'mode':'LOCAL_TEST_ONLY','real_participants':0,'live_revenue_eur':0,'counts':counts}

@app.get('/api/admin/queue')
def admin_queue(user=Depends(require('admin'))):
    with authenticated_db(user,write=False) as c:
        items=c.execute('''SELECT users.id,users.name,profiles.trade,profiles.town,profiles.siren,
           profiles.approved,profiles.subscription_active,beta_interest.wants_interview,
           beta_interest.consent_at FROM profiles JOIN users ON profiles.user_id=users.id
           LEFT JOIN beta_interest ON beta_interest.user_id=users.id ORDER BY users.id''').fetchall()
    return {'items':[dict(x) for x in items]}

@app.post('/api/admin/professionals/{uid}/approve')
def approve(uid:int,user=Depends(require('admin'))):
    with authenticated_db(user,write=True) as c:
        p=c.execute('SELECT * FROM profiles WHERE user_id=?',(uid,)).fetchone()
        if not p:error(404,'Profil introuvable')
        c.execute('UPDATE profiles SET approved=1,approved_at=? WHERE user_id=?',(now(),uid))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                   (user['id'],'approve_professional','professional',uid,now()))
    return {'ok':True,'note':'Validation de simulation ; aucun contrôle officiel SIREN intégré'}

@app.post('/api/admin/professionals/{uid}/activate-test-subscription')
def activate_subscription(uid:int,user=Depends(require('admin'))):
    with authenticated_db(user,write=True) as c:
        p=c.execute('SELECT approved FROM profiles WHERE user_id=?',(uid,)).fetchone()
        if not p or not p['approved']:error(409,'Artisan non approuvé')
        c.execute('UPDATE profiles SET subscription_active=1 WHERE user_id=?',(uid,))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                   (user['id'],'activate_simulated_subscription','professional',uid,now()))
    return {'ok':True,'payment':'NONE — simulation uniquement'}

@app.post('/api/admin/professionals/{uid}/suspend')
def suspend(uid:int,user=Depends(require('admin'))):
    with authenticated_db(user,write=True) as c:
        r=c.execute('UPDATE profiles SET approved=0,subscription_active=0 WHERE user_id=?',(uid,))
        if r.rowcount==0:error(404,'Profil introuvable')
        c.execute('UPDATE enterprise_accounts SET manager_artisan_active=0 WHERE owner_id=?',(uid,))
        c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)',
                   (user['id'],'suspend_professional','professional',uid,now()))
    return {'ok':True}

@app.delete('/api/account')
def delete_own_account(user=Depends(get_user)):
    # Explicitly not supported while connected projects/messages exist: preserves integrity and requires manual review.
    with authenticated_db(user,write=True) as c:
        children=c.execute('SELECT COUNT(*) FROM projects WHERE requester_id=?',(user['id'],)).fetchone()[0]
        apps=c.execute('SELECT COUNT(*) FROM applications WHERE professional_id=?',(user['id'],)).fetchone()[0]
        msgs=c.execute('SELECT COUNT(*) FROM messages WHERE sender_id=?',(user['id'],)).fetchone()[0]
        audits=c.execute('SELECT COUNT(*) FROM audit WHERE actor_id=?',(user['id'],)).fetchone()[0]
        support=c.execute('SELECT COUNT(*) FROM support_tickets WHERE owner_id=?',(user['id'],)).fetchone()[0]
        if any([children,apps,msgs,audits,support]):error(409,'Suppression liée à des événements : procédure interne manuelle nécessaire dans ce prototype')
        c.execute('DELETE FROM users WHERE id=?',(user['id'],))
    return {'ok':True}

@app.get('/')
def root():return FileResponse(ROOT/'static'/'index.html')

@app.get('/manifest.webmanifest')
def web_manifest():
    return FileResponse(ROOT/'static'/'manifest.webmanifest',media_type='application/manifest+json')

@app.get('/ucp-sw.js')
def service_worker():
    return FileResponse(ROOT/'static'/'ucp-sw.js',media_type='application/javascript',
                        headers={'Service-Worker-Allowed':'/'})

from features_v4 import install
from support_cases import install as install_support
if DATABASE_URL:
    from postgres import initialize_schema
    initialization = initialize_schema(DATABASE_URL, DATABASE_SCHEMA)
else:
    initialization = nullcontext()
with initialization:
    init_db()
    install(sys.modules[__name__])
    install_support(sys.modules[__name__])
    # Optional, one-time fictional seed under the initialization lock.
    if HOSTING.staging and os.getenv('UCP_DEMO_SEED_PASSWORD'):
        with connect() as c:
            empty_demo = c.execute('SELECT 1 FROM users').fetchone() is None
        if empty_demo:
            from demo import seed
            seed(sys.modules[__name__], os.environ['UCP_DEMO_SEED_PASSWORD'])

app.mount('/assets', StaticFiles(directory=ROOT/'static'),name='static')
