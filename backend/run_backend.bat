@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Virtual environment belum ada. Jalankan:
    echo py -3.12 -m venv .venv
    echo .venv\Scripts\activate
    echo python -m pip install -r requirements.txt
    pause
    exit /b 1
)
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000