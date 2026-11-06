"""Offline tests for read-only UCP beta preflight. No network, tokens, or writes."""
from contextlib import nullcontext
from pathlib import Path
import importlib.util

import pytest

module_path = Path(__file__).resolve().parents[2] / "tools" / "beta_preflight.py"
spec = importlib.util.spec_from_file_location("ucp_beta_preflight", module_path)
beta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(beta)


def test_beta_url_rejects_http_credentials_and_cross_origin_shares():
    assert beta.validate_url(beta.BASE).scheme == "https"
    for address in ("http://ucp-preproduction.vercel.app",
                    "https://user:password@ucp-preproduction.vercel.app",
                    "https://ucp-preproduction.vercel.app/#secret"):
        with pytest.raises(ValueError):
            beta.validate_url(address)
    with pytest.raises(ValueError):
        beta.validate_url("https://other-site.vercel.app/?_vercel_share=token", beta.BASE)


def test_beta_health_requires_staging_postgres_not_public_production():
    good = {"ok": True, "mode": "staging", "storage": "postgresql",
            "production": False}
    assert beta.evaluate_health(good)
    assert not beta.evaluate_health({**good, "storage": "sqlite"})
    assert not beta.evaluate_health({**good, "production": True})
    assert not beta.evaluate_health({**good, "ok": "true"})


def test_beta_home_checks_both_roles_guide_and_security_headers():
    text = ('<button id="space-requester"></button>'
            '<button id="space-professional"></button>'
            '<button id="beta-start"></button>'
            '<button id="beta-help"></button>')
    headers = {"Cache-Control": "no-store",
               "X-Robots-Tag": "noindex,nofollow",
               "Content-Security-Policy": "default-src 'self'"}
    assert beta.evaluate_home(text, headers)
    assert not beta.evaluate_home(text.replace('id="beta-help"', ''), headers)
    assert not beta.evaluate_home(text, {**headers, "Cache-Control": "public"})


class ReadOnlyFake:
    def __init__(self):
        self.requests = []

    def open(self, req, timeout=0):
        self.requests.append((req.full_url, req.get_method()))
        class Response:
            headers = {"Cache-Control": "no-store",
                       "X-Robots-Tag": "noindex,nofollow",
                       "Content-Security-Policy": "default-src 'self'"}

            def read(self, limit=300000):
                if req.full_url.endswith("/api/health"):
                    return b'{"ok":true,"mode":"staging","storage":"postgresql","production":false}'
                return (b'<button id="space-requester"></button>'
                        b'<button id="space-professional"></button>'
                        b'<button id="beta-start"></button>'
                        b'<button id="beta-help"></button>')
        return nullcontext(Response())


def test_beta_preflight_never_writes_or_creates_accounts():
    client = ReadOnlyFake()
    result = beta.preflight(beta.BASE, "A" * 24, opener=client)
    assert result == {"staging_health": True, "private_interface": True}
    assert [u.removeprefix(beta.BASE) for u, _ in client.requests] == [
        "/api/health", "/"]
    assert all(method == "GET" for _, method in client.requests)


def test_beta_preflight_fails_before_network_when_missing_access():
    client = ReadOnlyFake()
    with pytest.raises(ValueError):
        beta.preflight(beta.BASE, "", opener=client)
    assert client.requests == []
