@echo off
cd /d "%~dp0"
if exist .venv\Scripts\python.exe (
  set "UCP_DEMO_PYTHON=%CD%\.venv\Scripts\python.exe"
) else if exist .test-venv\Scripts\python.exe (
  set "UCP_DEMO_PYTHON=%CD%\.test-venv\Scripts\python.exe"
) else (
  echo Aucun environnement Python prepare. Voir docs\PRESENTATION.md.
  exit /b 1
)
cd backend
"%UCP_DEMO_PYTHON%" presentation.py --port 8876
