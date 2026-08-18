# ===============================================
#     OUTILS LABO GORON-GTS - helpers partagés
# ===============================================

$script:LaboContainerName = "goron-pg18"
$script:LaboPgPort = 5432
$script:LaboDatabaseName = "goron_gts"
$script:LaboPgSuperUser = "postgres"
$script:LaboAppUser = "goron_gts_app"
$script:LaboAppPassword = "dev_app_secret"
$script:LaboAppDataName = "goron-gts"
$script:LaboPgEventsFileName = "gts-pg-events.log"
$script:LaboOutilsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Get-LaboSchemaSqlPath {
    $repoRoot = Split-Path -Parent $script:LaboOutilsDir
    return (Join-Path $repoRoot "electron\store\persistence\migrations\schema.sql")
}

function Get-LaboPgEventsLogPath {
    $base = Join-Path $env:APPDATA $script:LaboAppDataName
    return (Join-Path $base $script:LaboPgEventsFileName)
}

function Get-LaboUserDataDir {
    return (Join-Path $env:APPDATA $script:LaboAppDataName)
}

function Test-LaboDockerReady {
    docker info 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Start-LaboDockerDesktopIfNeeded {
    if (Test-LaboDockerReady) {
        return $true
    }

    Write-Host "Docker n'est pas encore pret. Demarrage de Docker Desktop..." -ForegroundColor Yellow
    $candidates = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LocalAppData\Docker\Docker Desktop.exe"
    )
    $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) {
        Write-Host "ERREUR : Docker Desktop introuvable." -ForegroundColor Red
        return $false
    }

    Start-Process -FilePath $exe | Out-Null
    Write-Host "Attente du moteur Docker (30 a 90 s possibles)..." -ForegroundColor Gray
    for ($i = 1; $i -le 60; $i++) {
        Start-Sleep -Seconds 2
        if (Test-LaboDockerReady) {
            Write-Host "Docker OK." -ForegroundColor Green
            return $true
        }
    }

    Write-Host "ERREUR : Docker ne repond toujours pas." -ForegroundColor Red
    Write-Host "Ouvrez Docker Desktop, attendez Engine running, puis reessayez." -ForegroundColor Yellow
    return $false
}

function Test-LaboContainerExists {
    docker inspect $script:LaboContainerName 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Test-LaboContainerRunning {
    if (-not (Test-LaboContainerExists)) { return $false }
    $running = docker inspect -f "{{.State.Running}}" $script:LaboContainerName 2>$null
    return ($running -eq "true")
}

function Wait-LaboKey {
    Write-Host ""
    try {
        # ReadKey bloque / plante dans le terminal Cursor/VS Code : Entrée = fiable partout.
        [void](Read-Host "Appuyez sur ENTREE pour continuer")
    } catch {
        Start-Sleep -Seconds 2
    }
}
