@echo off
title JanCare Setup
cd /d "%~dp0"

echo ===== Checking tools =====
where node >nul 2>nul || (echo [ERROR] Node.js is not installed. Get it from https://nodejs.org & pause & exit /b)
where python >nul 2>nul || (echo [ERROR] Python is not installed. Get it from https://python.org & pause & exit /b)
node -v
python --version

echo ===== Installing backend =====
if not exist "backend\node_modules" (cd backend & call npm install & cd ..)
echo ===== Adding demo doctors (skipped if they exist; needs MongoDB running) =====
cd backend & call npm run seed-doctors & cd ..

echo ===== Installing frontend =====
if not exist "frontend\node_modules" (cd frontend & call npm install & cd ..)

echo ===== Installing + training AI model =====
cd ml_service
python -m pip install -r requirements.txt
python -m pip install -r requirements-ocr.txt || echo [INFO] OCR for photographed lab reports not installed - PDFs still work.
echo ===== Optional deep-learning model (first time: ~1 GB download, can take a while) =====
python -m pip install -r requirements-dl.txt || echo [INFO] Deep-learning add-on not installed - JanCare will use its other models.
python train_model.py
python noshow.py
python evaluate_triage.py
python waittime.py
python assistant.py
cd ..

echo ===== Starting all services =====
start "JanCare AI (8000)" cmd /k "cd /d "%~dp0ml_service" && python -m uvicorn app:app --port 8000"
start "JanCare Backend (5000)" cmd /k "cd /d "%~dp0backend" && npm run dev"
start "JanCare Website (5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Waiting for servers to start...
timeout /t 15 /nobreak >nul
start http://localhost:5173
echo Doctor portal: http://localhost:5173/doctor  (e.g. gm@jancare.demo / Doctor@123)
echo Done. Keep the 3 black windows open while using the website.
pause
