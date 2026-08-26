@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "..\package.json" cd /d "%~dp0.."
if exist "package.json" goto ok
echo Place ce fichier dans le dossier afripoks (avec package.json)
pause
exit /b 1
:ok
node AJOUTER-API-ME.js
if errorlevel 1 (
  if exist "afripoks-mise-a-jour\AJOUTER-API-ME.js" node afripoks-mise-a-jour\AJOUTER-API-ME.js
)
echo.
pause
