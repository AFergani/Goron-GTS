# ===============================================
#     MENU PRODUCTION GORON-GTS
# ===============================================
# Premiere utilisation : acces administrateur, puis responsable (lignes - OK).
# Operateur : 1-3. Responsable : + sauvegarde manuelle.
# Mode Dev : non affiche (saisie DEV + mot de passe administrateur).
# Reset responsable : [S] + mot de passe administrateur (sans ouvrir le mode Dev).

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Prod_Common.ps1"

function Show-ProdMenu {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("operator", "responsable", "dev")]
        [string]$Profile
    )
    Clear-Host
    Write-Host "Goron GTS - console production" -ForegroundColor Cyan
    if ($Profile -eq "responsable") {
        Write-Host "Profil : Responsable" -ForegroundColor Green
    } elseif ($Profile -eq "dev") {
        Write-Host "Profil : Dev (technique, hors production)" -ForegroundColor Yellow
    } else {
        Write-Host "Profil : Operateur" -ForegroundColor DarkGray
    }
    Write-Host ""
    Write-Host " [1] Demarrer le conteneur"
    Write-Host " [2] Redemarrer le conteneur"
    if ($Profile -eq "dev") {
        Write-Host " [3] Auto-restart du conteneur"
        Write-Host " [4] Arreter le conteneur"
        Write-Host " [5] Tester la connexion"
        Write-Host " [6] Ouvrir le dossier goron-gts"
        Write-Host " [7] Logs Docker (live)"
        Write-Host " [8] Etat Docker / PG"
        Write-Host " [9] Dump PG (tache 3 h)"
        Write-Host " [10] Sauvegarde manuelle rapide"
        Write-Host " [R] Revenir au mode operateur"
    } elseif ($Profile -eq "responsable") {
        Write-Host " [3] Tester la connexion"
        Write-Host " [4] Sauvegarde manuelle rapide"
        Write-Host " [R] Revenir au mode operateur"
    } else {
        Write-Host " [3] Tester la connexion"
        Write-Host " [A] Acces responsable"
        Write-Host " [S] Reinitialiser le mot de passe responsable"
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

function Invoke-ProdManualBackupFromMenu {
    try {
        Invoke-ProdBackupManual
    } catch {
        Write-Host "[ERREUR] $($_.Exception.Message)" -ForegroundColor Red
    }
}

$Profile = "operator"

do {
    if (-not (Test-ProdFirstUseComplete)) {
        Show-ProdFirstUseMenu
        $Choice = Read-Host "Choix"
        $Key = if ($null -eq $Choice) { "" } else { $Choice.Trim().ToUpperInvariant() }
        if ($Key -eq "Q") { break }
        Invoke-ProdFirstUseChoice -Key $Key
        continue
    }

    Show-ProdMenu -Profile $Profile
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
            if ($Profile -eq "dev") {
                [void](Set-ProdContainerAutoRestart)
            } else {
                Write-ProdPgStatus
            }
            Wait-ProdKey
        }
        "4" {
            if ($Profile -eq "dev") {
                $confirm = Read-Host "Confirmer l'arret du conteneur ? (O/n)"
                if ($confirm -eq "N" -or $confirm -eq "n") {
                    Write-Host "Annule." -ForegroundColor Gray
                } else {
                    [void](Stop-ProdContainer)
                }
            } elseif ($Profile -eq "responsable") {
                Invoke-ProdManualBackupFromMenu
            } else {
                Write-Host "Option invalide." -ForegroundColor Red
            }
            Wait-ProdKey
        }
        "5" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            Write-ProdPgStatus
            Wait-ProdKey
        }
        "6" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            [void](Open-ProdAppDataFolder)
            Wait-ProdKey
        }
        "7" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            [void](Show-ProdDockerLogsLive)
            Wait-ProdKey
        }
        "8" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            Write-ProdDockerPgState
            Wait-ProdKey
        }
        "9" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            Invoke-ProdCycleFromMenu
            Wait-ProdKey
        }
        "10" {
            if ($Profile -ne "dev") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            Invoke-ProdManualBackupFromMenu
            Wait-ProdKey
        }
        "A" {
            if ($Profile -ne "operator") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            if (Unlock-ProdRoleAccess -Role "responsable") {
                $Profile = "responsable"
            } else {
                Wait-ProdKey
            }
        }
        "S" {
            if ($Profile -ne "operator") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
                break
            }
            [void](Reset-ProdResponsablePassword)
            Wait-ProdKey
        }
        "DEV" {
            if (Unlock-ProdRoleAccess -Role "admin") {
                $Profile = "dev"
            } else {
                Wait-ProdKey
            }
        }
        "R" {
            if ($Profile -eq "operator") {
                Write-Host "Option invalide." -ForegroundColor Red
                Wait-ProdKey
            } else {
                $Profile = "operator"
            }
        }
        "Q" { break }
        default {
            Write-Host "Option invalide." -ForegroundColor Red
            Wait-ProdKey
        }
    }
} while ($Key -ne "Q")
