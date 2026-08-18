# ===============================================
#     MENU PRINCIPAL : LABO GORON-GTS (Docker PG)
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

function Show-Menu {
    Clear-Host
    Write-Host "+------------------------------+------------------------------+------------------------------+" -ForegroundColor Cyan
    Write-Host "|        OPERATIONS            |        ETAT & LOGS           |           OUTILS             |" -ForegroundColor Cyan
    Write-Host "+------------------------------+------------------------------+------------------------------+" -ForegroundColor Cyan
    Write-Host "| [1] Demarrer le conteneur    | [5] Etat Docker / PG         | [9] Tester la connexion      |" -ForegroundColor Cyan
    Write-Host "| [2] Redemarrer le conteneur  | [6] Logs Docker (live)       | [10] Purger le journal app   |" -ForegroundColor Cyan
    Write-Host "| [3] Auto-restart du conteneur| [7] Journal de l'app         | [11] Reset base + schema     |" -ForegroundColor Cyan
    Write-Host "| [4] Arreter le conteneur     | [8] Ouvrir le dossier logs   |                              |" -ForegroundColor Cyan
    Write-Host "+------------------------------+------------------------------+------------------------------+" -ForegroundColor Cyan
    Write-Host " Conteneur : $($script:LaboContainerName)   Journal : %APPDATA%\$($script:LaboAppDataName)\$($script:LaboPgEventsFileName)" -ForegroundColor DarkGray
    Write-Host "                                                                              [Q] Quitter`n" -ForegroundColor White
}

function Invoke-LaboScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativeName
    )
    $full = Join-Path $ScriptPath $RelativeName
    try {
        & $full
    } catch {
        Write-Host ""
        Write-Host "Erreur : $($_.Exception.Message)" -ForegroundColor Red
        Wait-LaboKey
    }
}

do {
    Show-Menu
    $Choice = Read-Host "Choisissez une option"

    switch ($Choice) {
        "1"  { Invoke-LaboScript "1_Labo_Start.ps1" }
        "2"  { Invoke-LaboScript "2_Labo_Restart.ps1" }
        "3"  { Invoke-LaboScript "3_Labo_EnableAutoRestart.ps1" }
        "4"  { Invoke-LaboScript "4_Labo_Stop.ps1" }
        "5"  { Invoke-LaboScript "5_Labo_Status.ps1" }
        "6"  { Invoke-LaboScript "6_Labo_LogsDocker.ps1" }
        "7"  { Invoke-LaboScript "7_Labo_LogsAppPg.ps1" }
        "8"  { Invoke-LaboScript "8_Labo_OpenLogFolder.ps1" }
        "9"  { Invoke-LaboScript "9_Labo_TestPg.ps1" }
        "10" { Invoke-LaboScript "10_Labo_PurgeAppLog.ps1" }
        "11" { Invoke-LaboScript "11_Labo_ResetDatabase.ps1" }
        "Q" {
            Write-Host "`nA bientot !" -ForegroundColor Cyan
            break
        }
        "q" {
            Write-Host "`nA bientot !" -ForegroundColor Cyan
            break
        }
        default {
            Write-Host "`nOption invalide." -ForegroundColor Red
            Wait-LaboKey
        }
    }

} while ($Choice -ne "Q" -and $Choice -ne "q")
