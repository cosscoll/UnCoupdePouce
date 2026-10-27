"""Explicit staging configuration. The default remains loopback-only."""
import base64
import hmac
import os
from dataclasses import dataclass
from urllib.parse import urlsplit, parse_qs
from fastapi.responses import JSONResponse, Response

@dataclass(frozen=True)
class Hosting:
    staging: bool
    hosts: frozenset[str]
    password: str

    @classmethod
    def from_env(cls):
        mode = os.getenv('UCP_ENV', 'local')
        if mode not in ('local', 'staging'):
            raise RuntimeError('UCP_ENV must be local or staging; commercial production is disabled')
        hosts = frozenset(h.strip().lower() for h in os.getenv('UCP_ALLOWED_HOSTS', '').split(',') if h.strip())
        password = os.getenv('UCP_STAGING_PASSWORD', '')
        if mode == 'staging':
            if not hosts or any('*' in h or '/' in h or ':' in h for h in hosts):
                raise RuntimeError('Staging requires exact UCP_ALLOWED_HOSTS')
            if len(password) < 24:
                raise RuntimeError('Staging requires UCP_STAGING_PASSWORD of at least 24 characters')
            if not os.getenv('UCP_DATABASE_URL'):
                raise RuntimeError('Staging requires persistent UCP_DATABASE_URL; SQLite is local only')
            db = urlsplit(os.environ['UCP_DATABASE_URL'])
            if db.scheme not in ('postgres', 'postgresql') or parse_qs(db.query).get('sslmode') != ['verify-full']:
                raise RuntimeError('Staging requires PostgreSQL with sslmode=verify-full')
            if os.getenv('UCP_LOCAL_ADMIN_BOOTSTRAP'):
                raise RuntimeError('Disable HTTP admin bootstrap in staging')
        return cls(mode == 'staging', hosts, password)

    def reject(self, request):
        hosts = self.hosts if self.staging else {'localhost', '127.0.0.1', 'testserver'}
        if request.url.hostname not in hosts:
            return Response('Hôte non autorisé', status_code=403)
        if self.staging:
            if request.url.scheme != 'https':
                return Response('HTTPS requis', status_code=403)
            # A separate preproduction gate protects assets, signup and API alike.
            # Do not trust a query-string token, client IP or forwarded host header.
            try:
                scheme, encoded = request.headers.get('authorization', '').split(' ', 1)
                user, password = base64.b64decode(encoded, validate=True).decode().split(':', 1)
                valid = (scheme.lower() == 'basic' and
                         hmac.compare_digest(user.encode(), b'ucp') and
                         hmac.compare_digest(password.encode(), self.password.encode()))
            except (ValueError, UnicodeError):
                valid = False
            if not valid:
                return Response('Préproduction privée : accès requis', status_code=401,
                                headers={'WWW-Authenticate': 'Basic realm="UCP preproduction", charset="UTF-8"',
                                         'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'})
        size = request.headers.get('content-length')
        if size:
            try:
                if int(size) < 0 or int(size) > 6_100_000:
                    return JSONResponse({'detail': 'Requête trop volumineuse'}, status_code=413)
            except ValueError:
                return JSONResponse({'detail': 'Taille de requête invalide'}, status_code=400)
        return None
