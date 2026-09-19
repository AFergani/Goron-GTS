# ===============================================
#     AUTO-RESTART CONTENEUR (apres reboot PC)
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   POLITIQUE RESTART DOCKER" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Active 'unless-stopped' sur $($script:LaboContainerName)." -ForegroundColor Gray
Write-Host "Des que Docker Desktop demarre, le conteneur repart tout seul." -ForegroundColor Gray
Write-Host "(Pense a laisser Docker Desktop demarrer avec Windows.)" -ForegroundColor Yellow
Write-Host ""

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Test-LaboContainerExists)) {
    Write-Host "Conteneur absent." -ForegroundColor Red
    Wait-LaboKey
    exit 1
}

$current = docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" $script:LaboContainerName 2>$null
Write-Host "Politique actuelle : $current" -ForegroundColor Gray
Write-Host ""

$Confirm = Read-Host "Appliquer unless-stopped ? (O/n)"
if ($Confirm -eq "N" -or $Confirm -eq "n") {
    Write-Host "Annule." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

docker update --restart unless-stopped $script:LaboContainerName
if ($LASTEXITCODE -eq 0) {
    $new = docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" $script:LaboContainerName 2>$null
    Write-Host "OK - nouvelle politique : $new" -ForegroundColor Green
} else {
    Write-Host "Echec docker update." -ForegroundColor Red
}

Wait-LaboKey
