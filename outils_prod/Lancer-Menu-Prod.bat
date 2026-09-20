@echo off
REM Menu console de production Goron GTS (Windows 10 / 11).
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0\0_Prod_Menu.ps1"
