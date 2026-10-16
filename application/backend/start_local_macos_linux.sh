#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf '\nUCP laboratoire local uniquement, pas de serveur public.\n\n'
python3 -m uvicorn app:app --host 127.0.0.1 --port 8765
