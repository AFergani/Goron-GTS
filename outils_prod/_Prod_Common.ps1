# ===============================================
#     OUTILS PRODUCTION GORON-GTS (helpers)
# ===============================================
# Conteneur : goron-pg18. Aucun secret affiche. Pas de creation de conteneur.

$script:ProdContainerName = "goron-pg18"
$script:ProdPgPort = 5432
$script:ProdDatabaseName = "goron_gts"
$script:ProdAppUser = "goron_gts_app"
$script:ProdAppDataName = "goron-gts"
$script:ProdBackupConfigFileName = "gts-pg-backup.json"
$script:ProdDailyKeep = 14
$script:ProdMonthlyKeep = 12
$script:ProdDumpExt = ".dump"
$script:ProdGateFileName = "gts-prod-gate.json"
$script:ProdPasswordMinLength = 6
$script:ProdPbkdf2Iterations = 100000
$script:ProdOutilsDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Wait-ProdKey {
    Write-Host ""
    try {
        [void](Read-Host "Appuyez sur ENTREE pour continuer")
    } catch {
        Start-Sleep -Seconds 2
    }
}

function Get-ProdUserDataDir {
    return (Join-Path $env:APPDATA $script:ProdAppDataName)
}

function Get-ProdBackupConfigPath {
    return (Join-Path (Get-ProdUserDataDir) $script:ProdBackupConfigFileName)
}

function Get-ProdGatePath {
    return (Join-Path (Get-ProdUserDataDir) $script:ProdGateFileName)
}

function Read-ProdSecret {
    param([string]$Prompt = "Mot de passe responsable")
    $secure = Read-Host $Prompt -AsSecureString
    if (-not $secure -or $secure.Length -eq 0) {
        return ""
    }
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        if ($ptr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
        }
    }
}

function Test-ProdByteEquals {
    param([byte[]]$Left, [byte[]]$Right)
    if ($null -eq $Left -or $null -eq $Right -or $Left.Length -ne $Right.Length) {
        return $false
    }
    $diff = 0
    for ($i = 0; $i -lt $Left.Length; $i++) {
        $diff = $diff -bor ($Left[$i] -bxor $Right[$i])
    }
    return ($diff -eq 0)
}

function Get-ProdPasswordHashBytes {
    param(
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][byte[]]$Salt,
        [int]$Iterations = $script:ProdPbkdf2Iterations
    )
    $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($Password, $Salt, $Iterations)
    try {
        return $derive.GetBytes(32)
    } finally {
        $derive.Dispose()
    }
}

function Get-ProdGateRecord {
    $path = Get-ProdGatePath
    if (-not (Test-Path -LiteralPath $path)) {
        return $null
    }
    try {
        $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $raw.salt -or -not $raw.hash) {
            return $null
        }
        return $raw
    } catch {
        return $null
    }
}

function Test-ProdResponsablePasswordSet {
    return $null -ne (Get-ProdGateRecord)
}

function Save-ProdResponsablePassword {
    param([Parameter(Mandatory = $true)][string]$Password)
    $dir = Get-ProdUserDataDir
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $salt = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($salt)
    } finally {
        $rng.Dispose()
    }
    $hash = Get-ProdPasswordHashBytes -Password $Password -Salt $salt
    $payload = [pscustomobject]@{
        version    = 1
        iterations = $script:ProdPbkdf2Iterations
        salt       = [Convert]::ToBase64String($salt)
        hash       = [Convert]::ToBase64String($hash)
    }
    $json = $payload | ConvertTo-Json -Compress
    Set-Content -LiteralPath (Get-ProdGatePath) -Value $json -Encoding UTF8
}

function Test-ProdResponsablePassword {
    param([Parameter(Mandatory = $true)][string]$Password)
    $record = Get-ProdGateRecord
    if (-not $record) {
        return $false
    }
    try {
        $salt = [Convert]::FromBase64String([string]$record.salt)
        $expected = [Convert]::FromBase64String([string]$record.hash)
        $iterations = [int]$record.iterations
        if ($iterations -lt 10000) {
            $iterations = $script:ProdPbkdf2Iterations
        }
        $actual = Get-ProdPasswordHashBytes -Password $Password -Salt $salt -Iterations $iterations
        return (Test-ProdByteEquals -Left $actual -Right $expected)
    } catch {
        return $false
    }
}

function Register-ProdResponsablePassword {
    Write-Host ""
    Write-Host "Premiere connexion : definissez le mot de passe responsable." -ForegroundColor Cyan
    Write-Host "Il sera demande a chaque acces responsable sur ce poste." -ForegroundColor DarkGray
    Write-Host ""
    $first = Read-ProdSecret -Prompt "Nouveau mot de passe"
    if ($first.Length -lt $script:ProdPasswordMinLength) {
        Write-Host "[ERREUR] Mot de passe trop court (minimum $($script:ProdPasswordMinLength) caracteres)." -ForegroundColor Red
        return $false
    }
    $second = Read-ProdSecret -Prompt "Confirmation"
    if ($first -cne $second) {
        Write-Host "[ERREUR] Les deux saisies ne correspondent pas." -ForegroundColor Red
        return $false
    }
    Save-ProdResponsablePassword -Password $first
    Write-Host "Mot de passe responsable enregistre." -ForegroundColor Green
    return $true
}

function Unlock-ProdResponsableAccess {
    if (-not (Test-ProdResponsablePasswordSet)) {
        return (Register-ProdResponsablePassword)
    }
    Write-Host ""
    $attempt = Read-ProdSecret -Prompt "Mot de passe responsable"
    if (-not $attempt) {
        Write-Host "[ERREUR] Mot de passe incorrect." -ForegroundColor Red
        return $false
    }
    if (Test-ProdResponsablePassword -Password $attempt) {
        Write-Host "Acces responsable active." -ForegroundColor Green
        return $true
    }
    Write-Host "[ERREUR] Mot de passe incorrect." -ForegroundColor Red
    return $false
}

function Test-ProdDockerReady {
    docker info 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Start-ProdDockerDesktopIfNeeded {
    if (Test-ProdDockerReady) {
        return $true
    }
    $candidates = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LocalAppData\Docker\Docker Desktop.exe"
    )
    $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) {
        Write-Host "[ERREUR] Docker Desktop est introuvable." -ForegroundColor Red
        return $false
    }
    Start-Process -FilePath $exe | Out-Null
    for ($i = 1; $i -le 60; $i++) {
        Start-Sleep -Seconds 2
        if (Test-ProdDockerReady) {
            return $true
        }
    }
    Write-Host "[ERREUR] Docker ne repond pas. Ouvrez Docker Desktop puis reessayez." -ForegroundColor Red
    return $false
}

function Test-ProdContainerExists {
    docker inspect $script:ProdContainerName 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Test-ProdContainerRunning {
    if (-not (Test-ProdContainerExists)) { return $false }
    $running = docker inspect -f "{{.State.Running}}" $script:ProdContainerName 2>$null
    return ($running -eq "true")
}

function Wait-ProdPostgresReady {
    for ($i = 1; $i -le 40; $i++) {
        docker exec $script:ProdContainerName pg_isready -U $script:ProdAppUser -d $script:ProdDatabaseName 1>$null 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-ProdContainer {
    if (-not (Start-ProdDockerDesktopIfNeeded)) {
        return $false
    }
    if (-not (Test-ProdContainerExists)) {
        Write-Host "[ERREUR] Conteneur $($script:ProdContainerName) introuvable." -ForegroundColor Red
        return $false
    }
    if (Test-ProdContainerRunning) {
        Write-Host "Le conteneur tourne deja." -ForegroundColor Green
        return $true
    }
    docker start $script:ProdContainerName 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Demarrage du conteneur impossible." -ForegroundColor Red
        return $false
    }
    if (-not (Wait-ProdPostgresReady)) {
        Write-Host "[ERREUR] PostgreSQL ne repond pas." -ForegroundColor Red
        return $false
    }
    Write-Host "Conteneur demarre." -ForegroundColor Green
    return $true
}

function Restart-ProdContainer {
    if (-not (Start-ProdDockerDesktopIfNeeded)) {
        return $false
    }
    if (-not (Test-ProdContainerExists)) {
        Write-Host "[ERREUR] Conteneur $($script:ProdContainerName) introuvable." -ForegroundColor Red
        return $false
    }
    docker restart $script:ProdContainerName 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERREUR] Redemarrage impossible." -ForegroundColor Red
        return $false
    }
    if (-not (Wait-ProdPostgresReady)) {
        Write-Host "[ERREUR] PostgreSQL ne repond pas." -ForegroundColor Red
        return $false
    }
    Write-Host "Conteneur redemarre." -ForegroundColor Green
    return $true
}

function Test-ProdPostgresReachable {
    if (-not (Test-ProdDockerReady)) { return $false }
    if (-not (Test-ProdContainerRunning)) { return $false }
    docker exec $script:ProdContainerName pg_isready -U $script:ProdAppUser -d $script:ProdDatabaseName 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    docker exec $script:ProdContainerName psql -U $script:ProdAppUser -d $script:ProdDatabaseName -tAc "SELECT 1" 1>$null 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Write-ProdPgStatus {
    if (Test-ProdPostgresReachable) {
        Write-Host "[OK] PostgreSQL est joignable" -ForegroundColor Green
    } else {
        Write-Host "[ERREUR] PostgreSQL est inaccessible" -ForegroundColor Red
    }
}

function Get-ProdBackupFolder {
    $cfgPath = Get-ProdBackupConfigPath
    if (-not (Test-Path -LiteralPath $cfgPath)) {
        return ""
    }
    try {
        $raw = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        return [string]$raw.folderPath
    } catch {
        return ""
    }
}

function Assert-ProdBackupFolder {
    $dir = Get-ProdBackupFolder
    if (-not $dir) {
        throw "Aucun dossier de sauvegarde. Choisissez-le d'abord dans Goron GTS (Parametres)."
    }
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    return $dir
}

function Invoke-ProdPostgresDump {
    param([Parameter(Mandatory = $true)][string]$DestinationFile)
    if (-not (Test-ProdContainerRunning)) {
        throw "Conteneur $($script:ProdContainerName) arrete. Demarrez-le (menu 1) puis reessayez."
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
        $script:ProdContainerName, $script:ProdAppUser, $script:ProdDatabaseName, $partial
    cmd.exe /c $cmd
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $partial)) {
        if (Test-Path -LiteralPath $partial) {
            Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
        }
        throw "La sauvegarde a echoue. Verifiez Docker et le conteneur."
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
}

function Get-ProdDumpKind {
    param([Parameter(Mandatory = $true)][string]$FileName)
    # Aligné sur FILE_RE de electron/main/postgresBackupService.js
    $name = [System.IO.Path]::GetFileName($FileName)
    if ($name -match '^goron_gts_(daily|journaliere|journalière)_') { return "daily" }
    if ($name -match '^goron_gts_(monthly|mensuelle)_') { return "monthly" }
    if ($name -match '^goron_gts_(manual|manuelle)_') { return "manual" }
    return "custom"
}

function Invoke-ProdRetention {
    param([Parameter(Mandatory = $true)][string]$Folder)
    $files = @(Get-ChildItem -LiteralPath $Folder -File -Filter "*.dump" -ErrorAction SilentlyContinue)
    $prune = {
        param($Kind, $Keep)
        $subset = @($files | Where-Object { (Get-ProdDumpKind $_.Name) -eq $Kind } | Sort-Object LastWriteTime -Descending)
        if ($subset.Count -le $Keep) { return }
        $subset | Select-Object -Skip $Keep | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
        }
    }
    & $prune "daily" $script:ProdDailyKeep
    & $prune "monthly" $script:ProdMonthlyKeep
}

function Update-ProdBackupConfig {
    param(
        [string]$LastDailyKey,
        [string]$LastMonthlyKey,
        [string]$LastRunKind,
        [string]$LastRunFileName
    )
    $cfgPath = Get-ProdBackupConfigPath
    $obj = $null
    if (Test-Path -LiteralPath $cfgPath) {
        try {
            $obj = Get-Content -LiteralPath $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            $obj = $null
        }
    }
    if (-not $obj) {
        $obj = [pscustomobject]@{ folderPath = (Get-ProdBackupFolder) }
    }
    $now = (Get-Date).ToUniversalTime().ToString("o")
    $obj | Add-Member -NotePropertyName lastDailyKey -NotePropertyValue $LastDailyKey -Force
    if ($LastMonthlyKey) {
        $obj | Add-Member -NotePropertyName lastMonthlyKey -NotePropertyValue $LastMonthlyKey -Force
    }
    $obj | Add-Member -NotePropertyName lastRunAt -NotePropertyValue $now -Force
    $obj | Add-Member -NotePropertyName lastRunKind -NotePropertyValue $LastRunKind -Force
    $obj | Add-Member -NotePropertyName lastRunStatus -NotePropertyValue "ok" -Force
    $obj | Add-Member -NotePropertyName lastRunError -NotePropertyValue $null -Force
    $obj | Add-Member -NotePropertyName lastRunFileName -NotePropertyValue $LastRunFileName -Force
    $json = $obj | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $cfgPath -Value $json -Encoding UTF8
}

function Invoke-ProdBackupCycle {
    param([switch]$Quiet)
    if (-not (Start-ProdDockerDesktopIfNeeded)) {
        throw "Docker est inaccessible."
    }
    $dir = Assert-ProdBackupFolder
    $day = Get-Date -Format "yyyy-MM-dd"
    $month = Get-Date -Format "yyyy-MM"
    $dailyName = "goron_gts_journaliere_$day$($script:ProdDumpExt)"
    $dailyPath = Join-Path $dir $dailyName
    Invoke-ProdPostgresDump -DestinationFile $dailyPath
    $monthlyName = "goron_gts_mensuelle_$month$($script:ProdDumpExt)"
    $monthlyPath = Join-Path $dir $monthlyName
    $wroteMonthly = $false
    if (-not (Test-Path -LiteralPath $monthlyPath)) {
        Copy-Item -LiteralPath $dailyPath -Destination $monthlyPath -Force
        $wroteMonthly = $true
    }
    Invoke-ProdRetention -Folder $dir
    $monthlyKey = if ($wroteMonthly) { $month } else { $null }
    Update-ProdBackupConfig -LastDailyKey $day -LastMonthlyKey $monthlyKey -LastRunKind "daily" -LastRunFileName $dailyName
    if (-not $Quiet) {
        Write-Host "Sauvegarde journaliere : $dailyName" -ForegroundColor Green
        if ($wroteMonthly) {
            Write-Host "Copie mensuelle : $monthlyName" -ForegroundColor Green
        }
    }
}

function Invoke-ProdBackupManual {
    $dir = Assert-ProdBackupFolder
    if (-not (Start-ProdDockerDesktopIfNeeded)) {
        throw "Docker est inaccessible."
    }
    $stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $name = "goron_gts_manuelle_$stamp$($script:ProdDumpExt)"
    $path = Join-Path $dir $name
    Invoke-ProdPostgresDump -DestinationFile $path
    Write-Host "Sauvegarde manuelle : $name" -ForegroundColor Green
}

function Get-ProdBackupTaskName {
    return "GoronGTS-PostgreSQL-sauvegarde"
}

function Test-ProdBackupTaskExists {
    $taskName = Get-ProdBackupTaskName
    return [bool](Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)
}

function Register-ProdDailyBackupTask {
    $dir = Assert-ProdBackupFolder
    $scriptFile = Join-Path $script:ProdOutilsDir "4_Prod_BackupCycle.ps1"
    $ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptFile`" -Silent"
    # schtasks /TR casse les chemins du type « 01 - Projet » (le tiret est lu comme une option).
    $action = New-ScheduledTaskAction -Execute $ps -Argument $arg
    $trigger = New-ScheduledTaskTrigger -Daily -At "03:00"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
    $taskName = Get-ProdBackupTaskName
    try {
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    } catch {
        throw "Impossible d'enregistrer la tache Windows ($taskName). $($_.Exception.Message)"
    }
    return $dir
}
