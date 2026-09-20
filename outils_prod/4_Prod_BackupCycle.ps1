# ===============================================
#     CYCLE journalier PostgreSQL (production)
# ===============================================
# Usage silencieux (tache Windows 03:00) :
#   powershell -ExecutionPolicy Bypass -File 4_Prod_BackupCycle.ps1 -Silent

param(
    [switch]$Silent,
    [switch]$RegisterDailyTask
)

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Prod_Common.ps1"

if ($RegisterDailyTask) {
    if (-not $Silent) {
        if (-not (Unlock-ProdResponsableAccess)) {
            Wait-ProdKey
            exit 1
        }
    }
    try {
        $dir = Register-ProdDailyBackupTask
        Write-Host "Tache quotidienne a 03:00 vers $dir" -ForegroundColor Green
        if (-not $Silent) { Wait-ProdKey }
        exit 0
    } catch {
        Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
        if (-not $Silent) { Wait-ProdKey }
        exit 1
    }
}

if (-not $Silent) {
    if (-not (Unlock-ProdResponsableAccess)) {
        Wait-ProdKey
        exit 1
    }
}

try {
    if (-not (Start-ProdDockerDesktopIfNeeded)) { exit 1 }
    Invoke-ProdBackupCycle -Quiet:$Silent
    if ($Silent) { exit 0 }
    Wait-ProdKey
    exit 0
} catch {
    Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
    if (-not $Silent) { Wait-ProdKey }
    exit 1
}
