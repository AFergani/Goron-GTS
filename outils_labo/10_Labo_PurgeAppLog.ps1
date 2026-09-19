# ===============================================
#     PURGER LE JOURNAL APP gts-pg-events.log
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

$logPath = Get-LaboPgEventsLogPath

Write-Host "===============================================" -ForegroundColor Yellow
Write-Host "   PURGE JOURNAL APP PG" -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Fichier : $logPath" -ForegroundColor Gray
Write-Host "Une sauvegarde .bak sera creee a cote avant purge." -ForegroundColor Gray
Write-Host ""

if (-not (Test-Path $logPath)) {
    Write-Host "Rien a purger (fichier absent)." -ForegroundColor Green
    Wait-LaboKey
    exit 0
}

$Confirmation = Read-Host "Confirmer la purge ? (o/N)"
if ($Confirmation -ne "o" -and $Confirmation -ne "O") {
    Write-Host "Annule." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

$bak = "$logPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -Path $logPath -Destination $bak -Force
Clear-Content -Path $logPath -Force
Write-Host "Journal vide." -ForegroundColor Green
Write-Host "Sauvegarde : $bak" -ForegroundColor DarkGray
Wait-LaboKey
