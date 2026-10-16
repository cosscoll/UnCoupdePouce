#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install -r backend/requirements-lock.txt
echo 'UCP local : http://127.0.0.1:8765 — Ctrl+C pour arrêter'
cd backend
exec ../.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765
