#!/usr/bin/env python3
"""Manual, read-only UCP beta readiness check; never logs protected URLs or passwords."""
import base64
import json
import os
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import (
    HTTPCookieProcessor, HTTPRedirectHandler, Request, build_opener,
)

BASE = "https://ucp-preproduction.vercel.app"


def validate_url(value, base=None):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Une URL HTTPS valide est obligatoire")
    if parsed.username or parsed.password or parsed.fragment:
        raise ValueError("La connexion ne peut pas figurer dans une URL")
    if base is not None and parsed.netloc.lower() != urlsplit(base).netloc.lower():
        raise ValueError("Le partage doit utiliser le domaine UCP choisi")
    return parsed


class SameOriginRedirect(HTTPRedirectHandler):
    def __init__(self, hostname):
        self.hostname = hostname

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).hostname != self.hostname:
            raise ValueError("Redirection vers un autre domaine refusée")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def evaluate_health(payload):
    return (
        isinstance(payload, dict)
        and payload.get("ok") is True
        and payload.get("mode") == "staging"
        and payload.get("storage") == "postgresql"
        and payload.get("production") is False
    )


def evaluate_home(html, headers):
    expected = ('id="space-requester"', 'id="space-professional"',
                'id="beta-start"', 'id="beta-help"')
    safe = {str(k).lower(): str(v).lower() for k, v in headers.items()}
    return (
        all(item in html for item in expected)
        and "no-store" in safe.get("cache-control", "")
        and "noindex" in safe.get("x-robots-tag", "")
        and "default-src" in safe.get("content-security-policy", "")
    )


def preflight(base, password, share_url=None, opener=None):
    host = validate_url(base)
    if host.query or host.path not in ("", "/"):
        raise ValueError("La base ne doit pas contenir de chemin ou de query")
    if len(password) < 24:
        raise ValueError("Mot de passe opérateur absent ou trop court")
    share = validate_url(share_url, base) if share_url else None
    client = opener or build_opener(
        HTTPCookieProcessor(CookieJar()), SameOriginRedirect(host.hostname)
    )
    auth = base64.b64encode(("ucp:" + password).encode("utf-8")).decode("ascii")
    headers = {"Authorization": "Basic " + auth,
               "Accept": "application/json,text/html"}

    def get(path):
        request = Request(base.rstrip("/") + path, headers=headers, method="GET")
        with client.open(request, timeout=15) as result:
            return result.read(300_000), dict(result.headers.items())

    if share is not None and opener is None:
        with client.open(Request(share.geturl(), headers=headers, method="GET"),
                         timeout=15) as result:
            result.read(2000)

    payload, _ = get("/api/health")
    try:
        valid_health = evaluate_health(json.loads(payload))
    except (ValueError, UnicodeError):
        valid_health = False
    page, response_headers = get("/")
    try:
        valid_home = evaluate_home(page.decode("utf-8"), response_headers)
    except UnicodeError:
        valid_home = False
    return {"staging_health": valid_health, "private_interface": valid_home}


def main():
    base = os.getenv("UCP_BETA_BASE_URL", BASE).rstrip("/")
    password = os.getenv("UCP_BETA_BASIC_PASSWORD", "")
    share = os.getenv("UCP_BETA_SHARE_URL") or None
    try:
        checks = preflight(base, password, share)
    except (ValueError, HTTPError, URLError, TimeoutError, OSError):
        # Exceptions can include signed URLs or confidential header values.
        print("BLOCKED : accès ou configuration à vérifier (aucun secret affiché).")
        return 2
    for name, passed in checks.items():
        print(("PASS" if passed else "FAIL") + " : " + name)
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
