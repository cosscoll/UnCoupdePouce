@echo off
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe py -3 -m venv .venv
if errorlevel 1 exit /b 1
.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
if errorlevel 1 exit /b 1
echo UCP local : http://127.0.0.1:8765 - Ctrl+C pour arreter
cd backend
..\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8765
pause
