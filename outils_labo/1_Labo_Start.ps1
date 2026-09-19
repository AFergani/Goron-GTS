# ===============================================
#     DEMARRER DOCKER + CONTENEUR goron-pg18
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   DEMARRAGE LABO PostgreSQL ($($script:LaboContainerName))" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Ensure-LaboContainer)) {
    Wait-LaboKey
    exit 1
}

if (Test-LaboContainerRunning) {
    Write-Host "Le conteneur tourne deja." -ForegroundColor Green
} else {
    Write-Host "Demarrage de $($script:LaboContainerName)..." -ForegroundColor Cyan
    docker start $script:LaboContainerName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Echec du demarrage." -ForegroundColor Red
        Wait-LaboKey
        exit 1
    }
    Write-Host "Conteneur demarre." -ForegroundColor Green
}

Write-Host ""
docker ps --filter "name=$($script:LaboContainerName)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host ""
Write-Host "PostgreSQL labo pret en general sur 127.0.0.1:$($script:LaboPgPort)." -ForegroundColor Gray
Wait-LaboKey
