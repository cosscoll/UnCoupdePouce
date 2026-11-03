"""Operator-only access configuration for the two fictional demonstration accounts."""
import sqlite3
import secrets
from typing import Literal

from fastapi import Depends, Request
from pydantic import BaseModel, Field, SecretStr, ValidationError, field_validator, model_validator
from starlette.concurrency import run_in_threadpool

DEMO_ROLES = {'camille@ucp.test': 'requester', 'atelier@ucp.test': 'professional'}


class DemoAccountAccess(BaseModel):
    email: Literal['camille@ucp.test', 'atelier@ucp.test']
    alias: str = Field(pattern=r'^[a-z0-9][a-z0-9._-]{2,79}$')
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator('alias', mode='before')
    @classmethod
    def normalize_alias(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class DemoAccessUpdate(BaseModel):
    accounts: list[DemoAccountAccess] = Field(min_length=1, max_length=2)

    @model_validator(mode='after')
    def unique_accounts(self):
        if len({a.email for a in self.accounts}) != len(self.accounts) or len({a.alias for a in self.accounts}) != len(self.accounts):
            raise ValueError('Duplicate account or alias')
        return self


def configure(ctx, user, body):
    with ctx.authenticated_db(user, write=True) as c:
        for item in body.accounts:
            account = c.execute('SELECT id,role FROM users WHERE email=?', (item.email,)).fetchone()
            if not account or account['role'] != DEMO_ROLES[item.email]:
                ctx.error(409, 'Compte de démonstration indisponible')
            previous = c.execute('SELECT alias FROM login_aliases WHERE user_id=?', (account['id'],)).fetchone()
            salt = secrets.token_hex(16)
            digest = ctx.pw(item.password.get_secret_value(), salt)
            try:
                c.execute('INSERT INTO login_aliases(alias,user_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET alias=excluded.alias', (item.alias, account['id']))
            except sqlite3.IntegrityError:
                ctx.error(409, 'Identifiant de démonstration indisponible')
            c.execute('UPDATE users SET pw_salt=?,pw_hash=? WHERE id=?', (salt, digest, account['id']))
            c.execute('DELETE FROM sessions WHERE user_id=?', (account['id'],))
            c.execute('DELETE FROM resets WHERE user_id=?', (account['id'],))
            for key in {item.email, item.alias, previous['alias'] if previous else item.alias}:
                c.execute('DELETE FROM auth_failures WHERE email=?', (key,))
            c.execute('INSERT INTO audit(actor_id,action,target_type,target_id,created_at) VALUES(?,?,?,?,?)', (user['id'], 'configure_demo_access', 'user', account['id'], ctx.now()))
    return {'updated': len(body.accounts)}


def install(ctx):
    @ctx.app.post('/api/admin/demo-access')
    async def configure_access(request: Request, user=Depends(ctx.require('admin'))):
        # Validate manually: FastAPI's default validation response can echo a
        # rejected password. No submitted credential is returned or journalled.
        try:
            body = DemoAccessUpdate.model_validate(await request.json())
        except (ValidationError, ValueError, TypeError):
            ctx.error(422, 'Configuration de démonstration invalide')
        return await run_in_threadpool(configure, ctx, user, body)
