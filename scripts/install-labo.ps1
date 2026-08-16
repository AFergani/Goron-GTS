#Requires -Version 5.1
<#
.SYNOPSIS
  Démarre le PostgreSQL labo Goron-GTS (Docker) sur un PC Windows.
.DESCRIPTION
  N'installe pas Node ni l'application : destinée à un .exe déjà généré.
  Crée ou démarre le conteneur goron-pg18 (postgres:18) sur 127.0.0.1:5432.
#>
$ErrorActionPreference = "Stop"

function Assert-Command {
  param(
    [string]$Name,
    [string]$Hint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Commande introuvable : $Name. $Hint"
  }
}

Write-Host "Goron-GTS — Docker labo PostgreSQL" -ForegroundColor Green

Assert-Command -Name "docker" -Hint "Installez Docker Desktop : https://www.docker.com/products/docker-desktop/"
try {
  docker info | Out-Null
} catch {
  throw "Docker Desktop n'est pas démarré. Ouvrez Docker Desktop, attendez le voyant vert, puis relancez ce script."
}

$existing = docker ps -a --filter "name=^goron-pg18$" --format "{{.Names}}"
if ($existing -eq "goron-pg18") {
  Write-Host "Conteneur goron-pg18 déjà présent : démarrage..."
  docker start goron-pg18 | Out-Null
} else {
  Write-Host "Création du conteneur goron-pg18 (image postgres:18)..."
  docker run -d --name goron-pg18 --restart unless-stopped `
    -e POSTGRES_DB=goron_gts `
    -e POSTGRES_USER=goron_gts_app `
    -e POSTGRES_PASSWORD=dev_app_secret `
    -e TZ=Europe/Paris `
    -p 5432:5432 `
    -v goron_pg18_data:/var/lib/postgresql `
    postgres:18
  if ($LASTEXITCODE -ne 0) {
    throw "Échec de docker run. Vérifiez que le port 5432 est libre (Get-NetTCPConnection -LocalPort 5432)."
  }
}

Write-Host "Attente de PostgreSQL..."
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  docker exec goron-pg18 pg_isready -U goron_gts_app -d goron_gts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  throw "PostgreSQL n'est pas prêt. Consultez : docker logs goron-pg18"
}

Write-Host ""
Write-Host "PostgreSQL labo joignable sur 127.0.0.1:5432" -ForegroundColor Green
Write-Host "Lancez ensuite le .exe Goron GTS (écran Initialisation GTS si premier lancement)."
Write-Host "Hôte 127.0.0.1 / port 5432 / base goron_gts / utilisateur goron_gts_app / mot de passe dev_app_secret"
