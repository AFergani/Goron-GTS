@echo off
REM Lance le menu labo Goron-GTS (Docker PG + logs locaux).
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0\0_Labo_Menu.ps1"
