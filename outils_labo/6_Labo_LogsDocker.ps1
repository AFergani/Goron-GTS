# ===============================================
#     LOGS DOCKER EN TEMPS REEL (postgres)
# ===============================================
# Cette fenetre affiche les logs. Un NOUVEAU terminal
# rouvre le menu pour continuer a piloter sans CTRL+C.

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   LOGS DOCKER - $($script:LaboContainerName)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
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

$menuPs1 = Join-Path $ScriptPath "0_Labo_Menu.ps1"
Write-Host "Ouverture d'un nouveau terminal avec le menu..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-NoProfile",
    "-File", $menuPs1
) | Out-Null

Start-Sleep -Milliseconds 400

Write-Host "Cette fenetre reste sur les logs live." -ForegroundColor Cyan
Write-Host "CTRL+C pour arreter le suivi (le menu est deja dans l'autre fenetre)." -ForegroundColor Yellow
Write-Host "Ces logs ne sont PAS dans l'UI Goron-GTS.`n" -ForegroundColor Gray

try {
    docker logs -f --tail 80 $script:LaboContainerName
} catch {
    Write-Host "`nSuivi interrompu : $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Suivi termine. Vous pouvez fermer cette fenetre." -ForegroundColor Gray
Wait-LaboKey
