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

function Get-LaboBackupConfigPath {
    return (Join-Path (Get-LaboUserDataDir) "gts-pg-backup-labo.json")
}

function Get-LaboBackupOutDir {
    param([string]$OutDir)
    $chosen = [string]$OutDir
    if (-not $chosen) {
        $cfgPath = Get-LaboBackupConfigPath
        if (Test-Path -LiteralPath $cfgPath) {
            try {
                $raw = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $chosen = [string]$raw.outDir
            } catch {
                $chosen = ""
            }
        }
    }
    if (-not $chosen) {
        $docs = [Environment]::GetFolderPath("MyDocuments")
        $chosen = Join-Path $docs "Goron-GTS-backups"
    }
    return $chosen
}

function Save-LaboBackupOutDir {
    param([Parameter(Mandatory = $true)][string]$OutDir)
    $dir = (Get-LaboUserDataDir)
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
    $payload = @{ outDir = $OutDir } | ConvertTo-Json
    Set-Content -LiteralPath (Get-LaboBackupConfigPath) -Value $payload -Encoding UTF8
}

function Invoke-LaboPostgresDump {
    param(
        [Parameter(Mandatory = $true)][string]$DestinationFile,
        [switch]$Silent
    )
    if (-not (Test-LaboContainerRunning)) {
        throw "Conteneur $($script:LaboContainerName) arrete. Demarrez-le (menu 1) puis reessayez."
    }
    $destDir = Split-Path -Parent $DestinationFile
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    $partial = "$DestinationFile.partial"
    if (Test-Path -LiteralPath $partial) {
        Remove-Item -LiteralPath $partial -Force
    }
    $cmd = 'docker exec {0} pg_dump -U {1} -d {2} -F c --no-owner --no-acl > "{3}"' -f `
        $script:LaboContainerName, $script:LaboAppUser, $script:LaboDatabaseName, $partial
    cmd.exe /c $cmd
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partial)) {
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue }
        throw "pg_dump a echoue (code $LASTEXITCODE). Verifiez Docker et le conteneur."
    }
    $fs = [System.IO.File]::OpenRead($partial)
    try {
        $buf = New-Object byte[] 5
        $read = $fs.Read($buf, 0, 5)
        $header = [System.Text.Encoding]::ASCII.GetString($buf, 0, $read)
        if ($header -ne "PGDMP") {
            throw "Le fichier genere n'est pas une sauvegarde PostgreSQL valide."
        }
    } finally {
        $fs.Close()
    }
    Move-Item -LiteralPath $partial -Destination $DestinationFile -Force
    if (-not $Silent) {
        Write-Host "Dump OK : $DestinationFile" -ForegroundColor Green
    }
}

function Get-LaboBackupTaskName {
    return "GoronGTS-PostgreSQL-backup"
}

function Test-LaboBackupTaskExists {
    return [bool](Get-ScheduledTask -TaskName (Get-LaboBackupTaskName) -ErrorAction SilentlyContinue)
}

function Unregister-LaboScheduledTask {
    $taskName = Get-LaboBackupTaskName
    if (-not (Test-LaboBackupTaskExists)) {
        return $false
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    return $true
}

function Register-LaboScheduledPowershellTask {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptFile,
        [string]$ArgumentTail = ""
    )
    # schtasks /TR casse les chemins du type « 01 - Projet » (le tiret est lu comme une option).
    $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptFile`""
    if ($ArgumentTail) {
        $arg = "$arg $ArgumentTail"
    }
    $action = New-ScheduledTaskAction -Execute $ps -Argument $arg
    $trigger = New-ScheduledTaskTrigger -Daily -At "03:00"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName (Get-LaboBackupTaskName) -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
}
