@echo off
echo ===================================================
echo   ECOSISTEMA SERVICIO TECNICO - LAUNCHER
echo ===================================================
echo.
echo Iniciando Panel Administrativo Web...
echo Asegurate de tener Node.js instalado.
echo.

cd admin_panel_web
if not exist node_modules (
    echo Instalando dependencias (primera vez)...
    call npm install
)
echo Iniciando servidor...
start http://localhost:5173
call npm run dev
