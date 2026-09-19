# ===============================================
#     REDEMARRER LE CONTENEUR PostgreSQL
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Yellow
Write-Host "   REDEMARRAGE - $($script:LaboContainerName)" -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Yellow
Write-Host ""

$Confirm = Read-Host "Confirmer le redemarrage ? (O/n)"
if ($Confirm -eq "N" -or $Confirm -eq "n") {
    Write-Host "Annule." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Test-LaboContainerExists)) {
    Write-Host "Conteneur absent." -ForegroundColor Red
    Wait-LaboKey
    exit 1
}

Write-Host "Redemarrage..." -ForegroundColor Cyan
docker restart $script:LaboContainerName
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK." -ForegroundColor Green
    docker ps --filter "name=$($script:LaboContainerName)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
} else {
    Write-Host "Echec." -ForegroundColor Red
}

Wait-LaboKey
