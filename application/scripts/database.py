"""Consistent SQLite backup/restore. Never overwrite an existing destination."""
import argparse
import os
from pathlib import Path
import sqlite3

def copy_database(source,destination,restore=False):
    source,destination=Path(source).resolve(),Path(destination).resolve()
    if not source.is_file():raise ValueError('Base source introuvable')
    if source==destination or destination.exists():raise ValueError('La destination doit être un nouveau fichier')
    destination.parent.mkdir(parents=True,exist_ok=True)
    # Exclusive create closes the check/create race and applies private permissions.
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    try:
        with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(destination) as dst:
            if src.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Base source corrompue')
            src.backup(dst)
            if restore:
                dst.execute('DELETE FROM sessions')
                dst.execute('DELETE FROM resets')
                dst.commit()
            if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Copie non intègre')
            if dst.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Relations invalides')
        return destination
    except Exception:
        destination.unlink(missing_ok=True)
        raise

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('operation',choices=['backup','restore']);p.add_argument('source');p.add_argument('destination')
    args=p.parse_args()
    try:print(copy_database(args.source,args.destination,args.operation=='restore'))
    except (ValueError,sqlite3.Error,OSError) as e:raise SystemExit(str(e))
