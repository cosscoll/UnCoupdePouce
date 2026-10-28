"""Manual PostgreSQL backup/restore. Never imported by the web application.

Only trusted, locally-created archives; restore requires a separate EMPTY database.
No URLs/passwords in command arguments, logs, metadata or web endpoints.
"""
import argparse, hashlib, json, os, re, stat, subprocess
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlsplit
import psycopg
from psycopg import sql

AUTH_TABLES={'sessions','resets','auth_failures'}
class BackupError(RuntimeError):pass

def schema_name(value):
    if not re.fullmatch(r'ucp_[a-z0-9_]{1,45}',value):raise BackupError('Schéma UCP privé requis.')
    return value

def connection_info(url):
    if any(os.environ.get(k) for k in ('PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGOPTIONS')):
        raise BackupError('Retirez les paramètres PG implicites ; utilisez uniquement les URL opérateur explicites.')
    if urlsplit(url).scheme not in ('postgres','postgresql'):raise BackupError('URL PostgreSQL explicite requise.')
    try:info=psycopg.conninfo.conninfo_to_dict(url)
    except Exception:raise BackupError('Configuration PostgreSQL invalide.') from None
    allowed={'host','hostaddr','port','user','password','dbname','sslmode','sslrootcert','channel_binding','connect_timeout'}
    if set(info)-allowed:raise BackupError('Options de connexion non prises en charge par cet outil.')
    if not info.get('host') or not info.get('user'):raise BackupError('Hôte et utilisateur explicites requis.')
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_$-]{0,62}',info.get('dbname','')):raise BackupError('Nom de base simple explicite requis.')
    local=info['host'] in ('localhost','127.0.0.1','::1')
    if info.get('hostaddr'):
        import ipaddress
        try:local=local and ipaddress.ip_address(info['hostaddr']).is_loopback
        except ValueError:local=False
    if not local and info.get('sslmode')!='verify-full':raise BackupError('TLS verify-full requis pour une base distante.')
    if not local and not info.get('password'):raise BackupError('Identifiants distants explicites requis.')
    # The guard connection and CLI must not inherit a different PGHOSTADDR/service.
    import certifi
    info.setdefault('port','5432');info.setdefault('password','');info.setdefault('hostaddr','')
    info.setdefault('sslmode','prefer');info.setdefault('sslrootcert',certifi.where())
    info.setdefault('channel_binding','prefer')
    info.update(options='',sslcert='',sslkey='',gssencmode='disable',passfile=os.devnull,connect_timeout='10')
    return info

def fingerprint(info):
    return hashlib.sha256(json.dumps([info.get('host',''),info.get('port','5432'),info['dbname']],separators=(',',':')).encode()).hexdigest()

def pg_env(info):
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','UCP_'))}
    mapping={'host':'PGHOST','hostaddr':'PGHOSTADDR','port':'PGPORT','user':'PGUSER','password':'PGPASSWORD','dbname':'PGDATABASE',
             'sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT','channel_binding':'PGCHANNELBINDING','gssencmode':'PGGSSENCMODE','passfile':'PGPASSFILE'}
    for key,name in mapping.items():
        if key in info:env[name]=info[key]
    env['PGCONNECT_TIMEOUT']='10'
    # CI wrappers know only the fictional, dedicated service container.
    if os.getenv('UCP_PG_TEST_CONTAINER'):env['UCP_PG_TEST_CONTAINER']=os.environ['UCP_PG_TEST_CONTAINER']
    return env

def connect(url):
    try:return psycopg.connect(**connection_info(url))
    except Exception:raise BackupError('Connexion PostgreSQL impossible ; vérifiez la configuration opérateur.') from None

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def run(tool,args,info,*,stdin=None,stdout=None):
    binary=os.getenv('UCP_PG_DUMP_BIN' if tool=='pg_dump' else 'UCP_PG_RESTORE_BIN',tool)
    try:
        r=subprocess.run([binary,*args],env=pg_env(info),stdin=stdin,stdout=stdout or subprocess.DEVNULL,
                         stderr=subprocess.PIPE,timeout=300,check=False)
    except (OSError,subprocess.SubprocessError):raise BackupError('Outil PostgreSQL indisponible ou délai dépassé.') from None
    if r.returncode:raise BackupError('Opération PostgreSQL refusée ; aucun détail de connexion n’est journalisé.')

def table_counts(conn,schema):
    names=[r[0] for r in conn.execute('SELECT tablename FROM pg_tables WHERE schemaname=%s ORDER BY tablename',(schema,))]
    return {name:conn.execute(sql.SQL('SELECT COUNT(*) FROM {}.{}').format(sql.Identifier(schema),sql.Identifier(name))).fetchone()[0] for name in names}

def backup(url,archive,schema='ucp_private'):
    schema=schema_name(schema);info=connection_info(url);archive=Path(archive);meta=Path(str(archive)+'.json')
    if archive.exists() or meta.exists():raise BackupError('Sauvegarde existante : aucun écrasement autorisé.')
    created=False;created_meta=False
    try:
        with connect(url) as conn:
            conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            snapshot=conn.execute('SELECT pg_export_snapshot()').fetchone()[0]
            counts=table_counts(conn,schema)
            if not {'users','projects','messages',*AUTH_TABLES}.issubset(counts):raise BackupError('Schéma UCP incomplet ; sauvegarde refusée.')
            expected={t:0 if t in AUTH_TABLES else count for t,count in counts.items()}
            fd=os.open(archive,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);created=True
            with os.fdopen(fd,'wb') as stream:
                args=['--format=custom','--no-owner','--no-privileges','--strict-names','--schema='+schema,'--snapshot='+snapshot]
                args+=['--exclude-table-data='+schema+'.'+t for t in sorted(AUTH_TABLES)]
                run('pg_dump',args,info,stdout=stream);stream.flush();os.fsync(stream.fileno())
            data={'format':1,'schema':schema,'sha256':digest(archive),'source_fingerprint':fingerprint(info),
                  'created_at':datetime.now(timezone.utc).isoformat(),'tables':expected,'auth_data_excluded':True}
            fd=os.open(meta,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);created_meta=True
            with os.fdopen(fd,'w') as stream:
                json.dump(data,stream,indent=2);stream.flush();os.fsync(stream.fileno())
            return data
    except Exception as exc:
        if created:archive.unlink(missing_ok=True)
        if created_meta:meta.unlink(missing_ok=True)
        if isinstance(exc,BackupError):raise
        raise BackupError('Sauvegarde interrompue ; aucun fichier de base existant modifié.') from None

def trusted_file(path):
    try:mode=path.lstat().st_mode
    except OSError:raise BackupError('Archive ou manifeste absent.') from None
    if not stat.S_ISREG(mode) or mode&0o077:raise BackupError('Fichier régulier privé (mode 600) requis, sans lien symbolique.')

def restore(url,archive,*,confirm_empty=False):
    if not confirm_empty:raise BackupError('Confirmation explicite de cible vide requise.')
    info=connection_info(url);archive=Path(archive);meta=Path(str(archive)+'.json')
    trusted_file(archive);trusted_file(meta)
    try:data=json.loads(meta.read_text())
    except Exception:raise BackupError('Manifeste invalide.') from None
    if data.get('format')!=1 or not data.get('auth_data_excluded') or data.get('sha256')!=digest(archive):raise BackupError('Archive altérée ou manifeste incompatible.')
    tables=data.get('tables')
    if not isinstance(tables,dict) or not {'users','projects','messages',*AUTH_TABLES}.issubset(tables) or any(not isinstance(k,str) or not re.fullmatch(r'[a-z_][a-z0-9_]{0,62}',k) or type(v) is not int or v<0 for k,v in tables.items()):
        raise BackupError('Volumes de référence invalides.')
    with archive.open('rb') as stream:
        if stream.read(5)!=b'PGDMP':raise BackupError('Archive PostgreSQL custom requise.')
    schema=schema_name(data.get('schema',''))
    if fingerprint(info)==data.get('source_fingerprint'):raise BackupError('Restauration sur la base source interdite.')
    with connect(url) as conn:
        # No --clean or DROP. Reject ALL non-system schemas/relations/functions/types.
        if conn.execute("SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND left(nspname,3)<>'pg_' LIMIT 1").fetchone():
            raise BackupError('La base cible doit être totalement vide.')
        for catalog in ('pg_class','pg_proc','pg_type'):
            key={'pg_class':'relnamespace','pg_proc':'pronamespace','pg_type':'typnamespace'}[catalog]
            if conn.execute(f"SELECT 1 FROM {catalog} o JOIN pg_namespace n ON n.oid=o.{key} WHERE n.nspname<>'information_schema' AND left(n.nspname,3)<>'pg_' LIMIT 1").fetchone():
                raise BackupError('La base cible contient déjà des objets ; aucun écrasement.')
    with archive.open('rb') as stream:
        run('pg_restore',['--dbname='+info['dbname'],'--single-transaction','--exit-on-error','--no-owner','--no-privileges'],info,stdin=stream)
    with connect(url) as conn:
        for table in AUTH_TABLES:conn.execute(sql.SQL('DELETE FROM {}.{}').format(sql.Identifier(schema),sql.Identifier(table)))
        conn.execute(sql.SQL('REVOKE ALL ON SCHEMA {} FROM PUBLIC').format(sql.Identifier(schema)))
        counts=table_counts(conn,schema)
        if counts!=data['tables']:raise BackupError('Validation des volumes échouée ; ne pas utiliser la copie.')
        for table in counts:conn.execute(sql.SQL('ALTER TABLE {}.{} ENABLE ROW LEVEL SECURITY').format(sql.Identifier(schema),sql.Identifier(table)))
    return {'schema':schema,'tables_verified':len(counts),'auth_sessions_restored':False}

def main():
    parser=argparse.ArgumentParser(description='Sauvegarde manuelle UCP. Archives locales de confiance uniquement ; cible vide distincte.')
    commands=parser.add_subparsers(dest='command',required=True)
    save=commands.add_parser('backup');save.add_argument('archive');save.add_argument('--schema',default='ucp_private')
    load=commands.add_parser('restore');load.add_argument('archive');load.add_argument('--confirm-empty-target',action='store_true')
    args=parser.parse_args()
    try:
        if args.command=='backup':backup(os.environ.get('UCP_BACKUP_SOURCE_URL',''),args.archive,args.schema)
        else:restore(os.environ.get('UCP_BACKUP_TARGET_URL',''),args.archive,confirm_empty=args.confirm_empty_target)
    except BackupError as exc:parser.exit(1,str(exc)+'\n')
    except Exception:parser.exit(1,'Opération interrompue. La copie doit être contrôlée par l’opérateur ; aucun détail de connexion affiché.\n')
    print('Sauvegarde vérifiée.' if args.command=='backup' else 'Copie restaurée et contrôlée ; anciennes sessions exclues.')
if __name__=='__main__':main()
