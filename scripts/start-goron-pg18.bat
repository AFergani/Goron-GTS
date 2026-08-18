@echo off
REM Raccourci : demarre uniquement le conteneur (sans menu).
chcp 65001 >nul 2>&1
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0..\outils_labo\1_Labo_Start.ps1"
