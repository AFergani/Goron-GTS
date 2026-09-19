# ===============================================
#     TEST CONNEXION PostgreSQL LABO
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   TEST CONNEXION PG (labo)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Test-LaboContainerRunning)) {
    Write-Host "Conteneur non demarre - tentative via option logique : demarrez d'abord [1]." -ForegroundColor Yellow
    Wait-LaboKey
    exit 1
}

Write-Host "1) Port TCP 127.0.0.1:$($script:LaboPgPort)..." -ForegroundColor Gray
$tnc = Test-NetConnection -ComputerName "127.0.0.1" -Port $script:LaboPgPort -WarningAction SilentlyContinue
if ($tnc.TcpTestSucceeded) {
    Write-Host "   Port ouvert." -ForegroundColor Green
} else {
    Write-Host "   Port ferme." -ForegroundColor Red
}

Write-Host ""
Write-Host "2) SELECT version() dans le conteneur (utilisateur $($script:LaboAppUser))..." -ForegroundColor Gray
docker exec $script:LaboContainerName psql -U $script:LaboAppUser -d $script:LaboDatabaseName -c "SELECT version();" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Requete OK." -ForegroundColor Green
} else {
    Write-Host "   Echec psql - verifier le conteneur et l'utilisateur labo." -ForegroundColor Red
}

Write-Host ""
Write-Host "3) Bases visibles :" -ForegroundColor Gray
docker exec $script:LaboContainerName psql -U $script:LaboAppUser -d $script:LaboDatabaseName -c "\l" 2>&1 | Select-Object -First 30

Wait-LaboKey
