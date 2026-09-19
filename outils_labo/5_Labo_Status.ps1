# ===============================================
#     ETAT DOCKER + CONTENEUR + JOURNAL APP
# ===============================================

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "   ETAT LABO GORON-GTS" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

$dockerOk = Test-LaboDockerReady
Write-Host ("Docker Desktop / moteur : " + $(if ($dockerOk) { "OK" } else { "INDISPONIBLE" })) `
    -ForegroundColor $(if ($dockerOk) { "Green" } else { "Red" })

if (-not $dockerOk) {
    Write-Host "Astuce : option [1] pour demarrer Docker + conteneur." -ForegroundColor Yellow
    Wait-LaboKey
    exit 0
}

$exists = Test-LaboContainerExists
$running = Test-LaboContainerRunning
Write-Host ("Conteneur $($script:LaboContainerName) : " + $(if (-not $exists) { "ABSENT" } elseif ($running) { "EN COURS" } else { "ARRETE" })) `
    -ForegroundColor $(if ($running) { "Green" } elseif ($exists) { "Yellow" } else { "Red" })

if ($exists) {
    Write-Host ""
    docker ps -a --filter "name=$($script:LaboContainerName)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
    $restart = docker inspect -f "{{.HostConfig.RestartPolicy.Name}}" $script:LaboContainerName 2>$null
    Write-Host "Politique restart Docker : $restart" -ForegroundColor Gray
}

$logPath = Get-LaboPgEventsLogPath
Write-Host ""
Write-Host "Journal app (hors UI) :" -ForegroundColor Cyan
Write-Host "  $logPath" -ForegroundColor Gray
if (Test-Path $logPath) {
    $info = Get-Item $logPath
    Write-Host ("  Taille : {0:N1} Ko - Modifie : {1}" -f ($info.Length / 1KB), $info.LastWriteTime.ToString("dd/MM/yyyy HH:mm:ss")) -ForegroundColor Gray
    Write-Host "  Dernieres lignes :" -ForegroundColor DarkGray
    Get-Content $logPath -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "    $_" -ForegroundColor DarkGray
    }
} else {
    Write-Host "  (fichier absent - aucune coupure PG journalisee pour l'instant)" -ForegroundColor Yellow
}

# Sonde TCP rapide
Write-Host ""
try {
    $tnc = Test-NetConnection -ComputerName "127.0.0.1" -Port $script:LaboPgPort -WarningAction SilentlyContinue
    if ($tnc.TcpTestSucceeded) {
        Write-Host "Port $($script:LaboPgPort) local : OUVERT" -ForegroundColor Green
    } else {
        Write-Host "Port $($script:LaboPgPort) local : FERME / injoignable" -ForegroundColor Red
    }
} catch {
    Write-Host "Sonde port $($script:LaboPgPort) : impossible ($($_.Exception.Message))" -ForegroundColor Yellow
}

Wait-LaboKey
