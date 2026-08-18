# ===============================================
#     ARRETER LE CONTENEUR PostgreSQL
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Red
Write-Host "   ARRET - $($script:LaboContainerName)" -ForegroundColor Red
Write-Host "===============================================" -ForegroundColor Red
Write-Host ""
Write-Host "Goron-GTS ne pourra plus ecrire tant que PG est arrete." -ForegroundColor Yellow
Write-Host ""

$Confirmation = Read-Host "Confirmer l'arret ? (o/N)"
if ($Confirmation -ne "o" -and $Confirmation -ne "O") {
    Write-Host "Annule." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Test-LaboContainerExists)) {
    Write-Host "Conteneur absent." -ForegroundColor Yellow
    Wait-LaboKey
    exit 0
}

if (-not (Test-LaboContainerRunning)) {
    Write-Host "Deja arrete." -ForegroundColor Green
    Wait-LaboKey
    exit 0
}

docker stop $script:LaboContainerName
if ($LASTEXITCODE -eq 0) {
    Write-Host "Conteneur arrete." -ForegroundColor Green
} else {
    Write-Host "Echec de l'arret." -ForegroundColor Red
}

Wait-LaboKey
