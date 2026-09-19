# ===============================================
#     OUTILS LABO GORON-GTS - helpers partagés
# ===============================================

$script:LaboContainerName = "goron-pg18"
$script:LaboPgPort = 5432
$script:LaboDatabaseName = "goron_gts"
# Image postgres:18 avec POSTGRES_USER : pas de role "postgres" dans le conteneur.
$script:LaboPgSuperUser = "goron_gts_app"
$script:LaboAppUser = "goron_gts_app"
$script:LaboDockerImage = "postgres:18"
$script:LaboVolumeName = "goron_gts"
$script:LaboAppPassword = "dev_app_secret"
$script:LaboAppDataName = "goron-gts"
$script:LaboPgEventsFileName = "gts-pg-events.log"
$script:LaboOutilsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Get-LaboSchemaSqlPath {
    # Pack de release : schema.sql est copié à côté des scripts.
    $besideTools = Join-Path $script:LaboOutilsDir "schema.sql"
    if (Test-Path -LiteralPath $besideTools) {
        return $besideTools
    }
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

function Wait-LaboPostgresReady {
    for ($i = 1; $i -le 40; $i++) {
        docker exec $script:LaboContainerName pg_isready -U $script:LaboAppUser -d $script:LaboDatabaseName 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Ensure-LaboContainer {
    if (Test-LaboContainerExists) {
        return $true
    }

    Write-Host "Premiere installation sur ce poste : creation du conteneur $($script:LaboContainerName)..." -ForegroundColor Cyan
    docker run -d --name $script:LaboContainerName --restart unless-stopped `
        -e POSTGRES_DB=$script:LaboDatabaseName `
        -e POSTGRES_USER=$script:LaboAppUser `
        -e POSTGRES_PASSWORD=$script:LaboAppPassword `
        -e TZ=Europe/Paris `
        -p "$($script:LaboPgPort):5432" `
        -v "$($script:LaboVolumeName):/var/lib/postgresql" `
        $script:LaboDockerImage

    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERREUR : echec de docker run. Verifiez que le port $($script:LaboPgPort) est libre." -ForegroundColor Red
        return $false
    }

    Write-Host "Attente de PostgreSQL..." -ForegroundColor Gray
    if (-not (Wait-LaboPostgresReady)) {
        Write-Host "ERREUR : PostgreSQL ne repond pas. Consultez : docker logs $($script:LaboContainerName)" -ForegroundColor Red
        return $false
    }

    Write-Host "Conteneur cree et pret." -ForegroundColor Green
    return $true
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
