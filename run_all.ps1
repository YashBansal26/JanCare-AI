# Run from the JanCare project root after installing dependencies and creating backend/.env.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root\ml_service'; python -m uvicorn app:app --reload --port 8000"
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root\backend'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit','-Command',"Set-Location '$root\frontend'; npm run dev"
Write-Host 'Started ML (8000), backend (5000), and frontend (5173). Ensure MongoDB is running.'
