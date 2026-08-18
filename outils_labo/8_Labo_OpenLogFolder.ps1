# ===============================================
#     OUVRIR LE DOSSIER DES LOGS APP
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

$dir = Get-LaboUserDataDir
Write-Host "Dossier userData Goron-GTS :" -ForegroundColor Cyan
Write-Host "  $dir" -ForegroundColor Gray

if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "Dossier cree (vide pour l'instant)." -ForegroundColor Yellow
}

Start-Process explorer.exe -ArgumentList $dir
Write-Host "Explorateur ouvert." -ForegroundColor Green
Start-Sleep -Seconds 1
