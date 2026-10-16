@echo off
cd /d "%~dp0"
echo UCP - LABORATOIRE INTERNE. Aucune mise en ligne ni aucun paiement.
echo Un environnement Python avec les dependances du fichier requirements.txt est necessaire.
py -3 -m uvicorn app:app --host 127.0.0.1 --port 8765
pause
