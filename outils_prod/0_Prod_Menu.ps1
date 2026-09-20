# ===============================================
#     MENU PRODUCTION GORON-GTS
# ===============================================
# Menu transitoire : 1-3 pour tout le monde.
# Acces responsable : mot de passe a la premiere connexion, verification ensuite.

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Prod_Common.ps1"

function Show-ProdMenu {
    param([bool]$ResponsableUnlocked)
    Clear-Host
    Write-Host "Goron GTS - console production" -ForegroundColor Cyan
    if ($ResponsableUnlocked) {
        Write-Host "Profil : Responsable" -ForegroundColor Green
    } else {
        Write-Host "Profil : Operateur" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host " [1] Demarrer le conteneur"
    Write-Host " [2] Redemarrer le conteneur"
    Write-Host " [3] Tester la connexion"
    if ($ResponsableUnlocked) {
        Write-Host " [4] Executer le dump PG (tache 3 h)"
        Write-Host " [5] Sauvegarde manuelle rapide"
        Write-Host " [R] Revenir au mode operateur"
    } else {
        Write-Host " [A] Acces responsable"
    }
    Write-Host " [Q] Quitter"
    Write-Host ""
}

function Invoke-ProdCycleFromMenu {
    try {
        if (-not (Start-ProdDockerDesktopIfNeeded)) { throw "Docker est inaccessible." }
        Invoke-ProdBackupCycle
        if (-not (Test-ProdBackupTaskExists)) {
            [void](Register-ProdDailyBackupTask)
            Write-Host "Tache Windows quotidienne a 03:00 enregistree." -ForegroundColor Green
        }
    } catch {
        Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
    }
}

$ResponsableUnlocked = $false

do {
    Show-ProdMenu -ResponsableUnlocked $ResponsableUnlocked
    $Choice = Read-Host "Choix"
    $Key = if ($null -eq $Choice) { "" } else { $Choice.Trim().ToUpperInvariant() }

    switch ($Key) {
        "1" {
            [void](Start-ProdContainer)
            Wait-ProdKey
        }
        "2" {
            $confirm = Read-Host "Confirmer le redemarrage ? (O/n)"
            if ($confirm -eq "N" -or $confirm -eq "n") {
                Write-Host "Annule." -ForegroundColor Gray
            } else {
                [void](Restart-ProdContainer)
            }
            Wait-ProdKey
        }
        "3" {
            Write-ProdPgStatus
            Wait-ProdKey
        }
        "A" {
            if ($ResponsableUnlocked) {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            if (Unlock-ProdResponsableAccess) {
                $ResponsableUnlocked = $true
            }
            Wait-ProdKey
        }
        "4" {
            if (-not $ResponsableUnlocked) {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            Invoke-ProdCycleFromMenu
            Wait-ProdKey
        }
        "5" {
            if (-not $ResponsableUnlocked) {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            try {
                Invoke-ProdBackupManual
            } catch {
                Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
            }
            Wait-ProdKey
        }
        "R" {
            $ResponsableUnlocked = $false
        }
        "Q" { break }
        default {
            Write-Host "Option invalide." -ForegroundColor Red
            Wait-ProdKey
        }
    }
} while ($Key -ne "Q")
