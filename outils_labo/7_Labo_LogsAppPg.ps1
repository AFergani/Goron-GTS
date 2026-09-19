# ===============================================
#     JOURNAL APP PG (gts-pg-events.log)
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   JOURNAL APP - evenements PostgreSQL" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Fichier local poste (coupures / retours PG)." -ForegroundColor Gray
Write-Host "Pas affiche tel quel dans les ecrans metier.`n" -ForegroundColor Gray

$logPath = Get-LaboPgEventsLogPath
Write-Host "Chemin : $logPath`n" -ForegroundColor DarkGray

if (-not (Test-Path $logPath)) {
    Write-Host "Fichier introuvable pour l'instant." -ForegroundColor Yellow
    Write-Host "Il se cree quand l'appli detecte une perte / restauration PG." -ForegroundColor Gray
    Wait-LaboKey
    exit 0
}

Write-Host "[1] Afficher les 50 dernieres lignes" -ForegroundColor White
Write-Host "[2] Suivre en direct (tail -f equivalent)" -ForegroundColor White
Write-Host "[3] Ouvrir dans le Bloc-notes" -ForegroundColor White
Write-Host "[Q] Retour" -ForegroundColor White
Write-Host ""
$sub = Read-Host "Choix"

switch ($sub) {
    "1" {
        Write-Host ""
        Get-Content $logPath -Tail 50
        Wait-LaboKey
    }
    "2" {
        Write-Host "`nSuivi en direct - CTRL+C puis ENTREE pour revenir.`n" -ForegroundColor Yellow
        try {
            Get-Content $logPath -Wait -Tail 30
        } catch {
            Write-Host "`nSuivi interrompu." -ForegroundColor Yellow
        }
        Wait-LaboKey
    }
    "3" {
        Start-Process notepad.exe -ArgumentList $logPath
    }
    default {
        return
    }
}
