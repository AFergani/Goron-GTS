# ===============================================
#     DUMP PostgreSQL labo (sans Goron GTS)
# ===============================================
# Fonctionne tant que Docker / goron-pg18 tourne.
# Usage silencieux (tache planifiee) :
#   powershell -ExecutionPolicy Bypass -File 12_Labo_Backup.ps1 -Silent
#
# Enregistrement d'une tache Windows quotidienne a 03:00 :
#   powershell -ExecutionPolicy Bypass -File 12_Labo_Backup.ps1 -RegisterDailyTask -OutDir "D:\sauvegardes-gts"

param(
    [string]$OutDir = "",
    [switch]$Silent,
    [switch]$RegisterDailyTask,
    [switch]$UnregisterDailyTask
)

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

$taskName = Get-LaboBackupTaskName

function New-LaboDumpFileName {
    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    return "goron_gts_manuelle_$stamp.dump"
}

function Invoke-LaboDumpNow {
    param([string]$TargetDir, [switch]$Quiet)
    $dir = Get-LaboBackupOutDir -OutDir $TargetDir
    Save-LaboBackupOutDir -OutDir $dir
    $file = Join-Path $dir (New-LaboDumpFileName)
    if (-not $Quiet) {
        Write-Host "Dossier : $dir" -ForegroundColor Gray
        Write-Host "Fichier : $file" -ForegroundColor Gray
    }
    Invoke-LaboPostgresDump -DestinationFile $file -Silent:$Quiet
    if ($Quiet) {
        Write-Host $file
    }
}

function Register-LaboDailyBackupTask {
    param([string]$TargetDir)
    $dir = Get-LaboBackupOutDir -OutDir $TargetDir
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Save-LaboBackupOutDir -OutDir $dir
    $scriptFile = Join-Path $ScriptPath "12_Labo_Backup.ps1"
    $argTail = '-Silent -OutDir "{0}"' -f $dir
    try {
        Register-LaboScheduledPowershellTask -ScriptFile $scriptFile -ArgumentTail $argTail
    } catch {
        throw "Impossible de creer la tache planifiee Windows ($($taskName)). $($_.Exception.Message)"
    }
    Write-Host "Tache '$taskName' : tous les jours a 03:00 vers $dir" -ForegroundColor Green
    Write-Host "Docker Desktop et le conteneur doivent tourner (auto-restart menu 3)." -ForegroundColor Gray
}

function Unregister-LaboDailyBackupTask {
    if (-not (Unregister-LaboScheduledTask)) {
        Write-Host "Aucune tache '$taskName'." -ForegroundColor Yellow
        return
    }
    Write-Host "Tache '$taskName' supprimee." -ForegroundColor Green
}

if ($UnregisterDailyTask) {
    Unregister-LaboDailyBackupTask
    if (-not $Silent) { Wait-LaboKey }
    exit 0
}

if ($RegisterDailyTask) {
    if (-not $OutDir) {
        $OutDir = Read-Host "Dossier des dumps (vide = Documents\Goron-GTS-backups)"
    }
    Register-LaboDailyBackupTask -TargetDir $OutDir
    if (-not $Silent) { Wait-LaboKey }
    exit 0
}

if ($Silent) {
    if (-not (Start-LaboDockerDesktopIfNeeded)) { exit 1 }
    try {
        Invoke-LaboDumpNow -TargetDir $OutDir -Quiet
        exit 0
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   SAUVEGARDE PG (Docker, sans l'application)" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " [1] Dump maintenant"
Write-Host " [2] Tache Windows quotidienne a 03:00 (PC allume, Docker up)"
Write-Host " [3] Supprimer la tache Windows"
Write-Host " [Q] Retour"
Write-Host ""
$choice = Read-Host "Choix"

switch ($choice) {
    "1" {
        if (-not (Start-LaboDockerDesktopIfNeeded)) { Wait-LaboKey; exit 1 }
        $defaultDir = Get-LaboBackupOutDir
        $dir = Read-Host "Dossier (vide = $defaultDir)"
        try {
            Invoke-LaboDumpNow -TargetDir $dir
        } catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
        Wait-LaboKey
    }
    "2" {
        $dir = Read-Host "Dossier des dumps (vide = Documents\Goron-GTS-backups)"
        try {
            Register-LaboDailyBackupTask -TargetDir $dir
        } catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
        Wait-LaboKey
    }
    "3" {
        Unregister-LaboDailyBackupTask
        Wait-LaboKey
    }
    default { }
}
