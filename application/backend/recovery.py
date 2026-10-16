"""Issue a 15-minute, single-use reset token for a fictional local account."""
import argparse
import secrets
import time

def issue(email):
    from app import connect, demo_email, hash_token
    email=demo_email(email)
    token=secrets.token_urlsafe(32)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        user=c.execute('SELECT id FROM users WHERE email=?',(email,)).fetchone()
        if not user:raise ValueError('Compte de test introuvable')
        c.execute('DELETE FROM resets WHERE user_id=? OR expires<?',(user['id'],int(time.time())))
        c.execute('INSERT INTO resets VALUES(?,?,?)',(hash_token(token),user['id'],int(time.time())+900))
        c.execute('COMMIT')
    return token

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('email');args=p.parse_args()
    try:print('Code local valable 15 minutes :',issue(args.email))
    except ValueError as e:raise SystemExit(str(e))
