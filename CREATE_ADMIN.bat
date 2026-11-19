@echo off
title Create JanCare Staff Account
cd /d "%~dp0backend"
echo Create a staff (admin) login for http://localhost:5173/admin
echo.
set /p ADMIN_EMAIL=Staff email: 
set /p ADMIN_PASS=Password (8+ characters): 
set /p ADMIN_ID=Employee ID (e.g. STAFF-001): 
echo.
call npm run create-admin -- %ADMIN_EMAIL% %ADMIN_PASS% %ADMIN_ID%
echo.
pause
