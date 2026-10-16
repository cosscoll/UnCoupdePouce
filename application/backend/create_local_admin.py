"""Local operator helper, for fictional test accounts only. No internet or billing."""
import getpass
import re
from app import connect, now, pw, demo_email
import secrets

def main():
    print('UCP LAB — CRÉATION ADMINISTRATEUR LOCAL (aucun déploiement)')
    email=input('Email fictif (ex. owner@ucp-lab.example) : ').strip().lower()
    try:
        email = demo_email(email)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    password=getpass.getpass('Mot de passe fort (12 caractères minimum) : ')
    if len(password)<12: raise SystemExit('Mot de passe trop court')
    with connect() as c:
        if c.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
            raise SystemExit('Un administrateur existe déjà, aucun changement effectué')
        salt=secrets.token_hex(16)
        c.execute('INSERT INTO users(email,name,role,pw_salt,pw_hash,created_at) VALUES(?,?,?,?,?,?)',
                  (email,'Administrateur laboratoire','admin',salt,pw(password,salt),now()))
    print('Compte administrateur de laboratoire créé en local ; aucune connexion extérieure.')
if __name__=='__main__':main()
