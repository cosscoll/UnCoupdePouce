"""Create fictional demonstration data, only in an empty local/staging database."""
import secrets
from fastapi.testclient import TestClient
import app

def seed():
    password=secrets.token_urlsafe(20)
    with app.connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM users').fetchone():raise ValueError('Base non vide : aucune donnée remplacée. Choisissez une nouvelle base via UCP_LOCAL_DB.')
        salt=secrets.token_hex(16)
        c.execute('INSERT INTO users(email,name,role,pw_salt,pw_hash,created_at) VALUES(?,?,?,?,?,?)',('admin@ucp.test','Admin Démo','admin',salt,app.pw(password,salt),app.now()))
        c.execute('COMMIT')
    def checked(r):
        if r.status_code>=400:raise ValueError(f'Échec de préparation : {r.status_code} {r.text}')
        return r.json()
    def client(email,name,role=None):
        if app.HOSTING.staging:
            host=sorted(app.HOSTING.hosts)[0]
            c=TestClient(app.app,base_url='https://'+host)
            c.auth=('ucp',app.HOSTING.password)
        else:
            c=TestClient(app.app)
        if role:checked(c.post('/api/register',json={'email':email,'name':name,'role':role,'password':password}))
        data=checked(c.post('/api/login',json={'email':email,'password':password}))
        c.headers['x-ucp-csrf']=data['csrf'];return c,data['user_id']
    admin,_=client('admin@ucp.test','Admin Démo')
    requester,_=client('camille@ucp.test','Camille Démo','requester')
    pro,pid=client('atelier@ucp.test','Atelier Démo','professional')
    checked(pro.post('/api/profile',json={'trade':'plomberie','additional_trades':['carrelage'],'town':'Toulouse','service_zones':['Blagnac'],'siren':'123456782'}))
    checked(admin.post(f'/api/admin/professionals/{pid}/approve'))
    checked(admin.post(f'/api/admin/professionals/{pid}/activate-test-subscription'))
    for title,trades,town,select in [('Rénover ma salle de bains',['plomberie','carrelage'],'Toulouse',False),('Remplacer les sanitaires',['plomberie'],'Blagnac',True),('Comprendre une infiltration',['inconnu'],'Toulouse',False)]:
        d=checked(requester.post('/api/v4/drafts',json={'title':title,'description':'Projet fictif de démonstration. Je souhaite examiner les solutions adaptées à cette pièce.','town':town,'trades':trades,'timing':'month'}))
        p=checked(requester.post(f'/api/v4/drafts/{d["id"]}/publish',json={'version':d['version']}))
        if select:
            a=checked(pro.post(f'/api/projects/{p["id"]}/apply'))
            checked(requester.post(f'/api/applications/{a["id"]}/accept'))
            checked(pro.post(f'/api/conversations/{a["id"]}/messages',json={'body':'Bonjour, pouvons-nous préciser votre projet fictif ?'}))
    checked(requester.post('/api/v4/drafts',json={'title':'Un prochain projet à préciser','trades':['peinture'],'town':'Toulouse'}))
    for c in (admin,requester,pro):c.close()
    return password

if __name__=='__main__':
    try:
        password=seed()
        print('Données fictives créées. Comptes : admin@ucp.test, camille@ucp.test, atelier@ucp.test')
        print('Mot de passe généré pour cette démonstration uniquement :',password)
        print('Conservez-le localement. Aucun email envoyé, aucun paiement, aucune collecte analytics.')
    except ValueError as e:raise SystemExit(str(e))
