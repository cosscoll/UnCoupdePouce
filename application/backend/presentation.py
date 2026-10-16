"""Disposable, loopback-only investor demo. Never opens an existing database."""
from pathlib import Path
import argparse
import importlib.util
import os
import secrets
import sys
import tempfile

from fastapi import Request, Response
from fastapi.testclient import TestClient


def build_presentation(database: Path):
    database = Path(database).resolve()
    if database.exists():
        raise FileExistsError('La présentation exige un nouveau fichier SQLite.')
    os.environ['UCP_LOCAL_DB'] = str(database)
    name = 'ucp_presentation_' + secrets.token_hex(6)
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name('app.py'))
    core = importlib.util.module_from_spec(spec)
    sys.modules[name] = core
    spec.loader.exec_module(core)
    password = secrets.token_urlsafe(32)

    def checked(result):
        if result.status_code >= 400:
            raise RuntimeError(f'Préparation fictive impossible : HTTP {result.status_code}')
        return result.json()

    def participant(email, label, role):
        client = TestClient(core.app)
        checked(client.post('/api/register', json=dict(email=email, name=label, role=role, password=password)))
        result = checked(client.post('/api/login', json=dict(email=email, password=password)))
        client.headers['x-ucp-csrf'] = result['csrf']
        return client, result['user_id']

    owner, _ = participant('camille@ucp.test', 'Camille Démo', 'requester')
    artisan, artisan_id = participant('atelier@ucp.test', 'Atelier Horizon Démo', 'professional')
    second, second_id = participant('renovation@ucp.test', 'Maison & Matière Démo', 'professional')
    salt = secrets.token_hex(16)
    with core.connect() as db:
        db.execute('INSERT INTO users(email,name,role,pw_salt,pw_hash,created_at) VALUES(?,?,?,?,?,?)',
                   ('admin@ucp.test', 'Équipe UCP Démo', 'admin', salt, core.pw(password, salt), core.now()))
    admin = TestClient(core.app)
    session = checked(admin.post('/api/login', json=dict(email='admin@ucp.test', password=password)))
    admin.headers['x-ucp-csrf'] = session['csrf']
    for client, uid, trade, extra in [(artisan, artisan_id, 'plomberie', ['carrelage']), (second, second_id, 'carrelage', ['peinture'])]:
        checked(client.post('/api/profile', json=dict(trade=trade, additional_trades=extra, town='Toulouse', service_zones=['Blagnac', 'Colomiers'], siren='123456782')))
        checked(admin.post(f'/api/admin/professionals/{uid}/approve'))
        checked(admin.post(f'/api/admin/professionals/{uid}/activate-test-subscription'))
    projects = [
        ('Une salle de bains plus confortable', ['plomberie', 'carrelage'], 'Toulouse', 'quarter', 'Repenser une salle de bains fictive : remplacer la baignoire par une douche et refaire le carrelage. La pièce mesure environ six mètres carrés.'),
        ('Moderniser les sanitaires', ['plomberie'], 'Blagnac', 'month', 'Remplacer les sanitaires dans un appartement fictif. Les arrivées d’eau sont accessibles et les équipements restent à choisir.'),
        ('Donner une nouvelle vie au salon', ['peinture'], 'Colomiers', 'flexible', 'Rafraîchir les murs et le plafond d’un salon fictif de vingt mètres carrés, avec préparation des supports et choix des finitions.'),
        ('Réparer une fuite sous un évier', ['plomberie'], 'Toulouse', 'urgent', 'Identifier et réparer une fuite fictive sous l’évier. Le meuble est accessible et le raccord devra être examiné par le professionnel.'),
    ]
    ids = []
    for title, trades, town, timing, description in projects:
        draft = checked(owner.post('/api/v4/drafts', json=dict(title=title, trades=trades, town=town, timing=timing, description=description)))
        project = checked(owner.post(f'/api/v4/drafts/{draft["id"]}/publish', json=dict(version=draft['version'])))
        ids.append(project['id'])
    for client in (artisan, second):
        checked(client.post(f'/api/projects/{ids[0]}/apply'))
    application = checked(artisan.post(f'/api/projects/{ids[1]}/apply'))
    checked(owner.post(f'/api/applications/{application["id"]}/accept'))
    checked(artisan.post(f'/api/conversations/{application["id"]}/messages', json=dict(body='Bonjour Camille, quels équipements souhaitez-vous remplacer dans votre projet fictif ?')))
    checked(owner.post(f'/api/conversations/{application["id"]}/messages', json=dict(body='Bonjour, les sanitaires et la robinetterie. Nous pouvons préciser les dimensions ensemble.')))
    checked(owner.post('/api/v4/drafts', json=dict(title='Préparer la rénovation de la cuisine', trades=['plomberie'], town='Toulouse', description='Brouillon fictif à compléter avant de publier.')))
    for client in (owner, artisan, second, admin):
        client.close()
    roles = {'requester': 'camille@ucp.test', 'professional': 'atelier@ucp.test', 'admin': 'admin@ucp.test'}
    core.app.state.presentation = True

    @core.app.get('/api/presentation')
    def presentation_info():
        return {'enabled': True, 'synthetic': True, 'roles': list(roles)}

    @core.app.post('/api/presentation/{role}')
    def presentation_session(role: str, request: Request, response: Response):
        if request.client is None or request.client.host not in {'127.0.0.1', '::1', 'testclient'}:
            core.error(403, 'Présentation locale uniquement')
        if request.headers.get('origin', '').rstrip('/') != str(request.base_url).rstrip('/'):
            core.error(403, 'Origine de présentation invalide')
        if role not in roles:
            core.error(404, 'Rôle inconnu')
        # Drop the prior demo session when switching roles; do not accumulate tokens.
        token = request.cookies.get('ucp_lab_sid')
        if token:
            with core.connect() as db:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (core.hash_token(token),))
        return core.login(core.Login(email=roles[role], password=password), response)

    return core.app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8876)
    options = parser.parse_args()
    directory = Path(tempfile.mkdtemp(prefix='ucp-presentation-'))
    app = build_presentation(directory / 'presentation.sqlite3')
    print(f'UCP — présentation fictive : http://127.0.0.1:{options.port}')
    print('Nouvelle base isolée ; aucun paiement ni accès public. Ctrl+C pour arrêter.')
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=options.port, access_log=False)
