#Requires -Version 5.1
<#
.SYNOPSIS
  Installe l'environnement de test Goron-GTS sur un PC Windows (portable ou fixe).
.DESCRIPTION
  Vérifie les prérequis, démarre PostgreSQL labo via Docker Compose, installe
  les dépendances npm et prépare data/acces_admin.env.
  À lancer depuis la racine du dépôt, avec PowerShell.
#>
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
  param(
    [string]$Name,
    [string]$Hint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Commande introuvable : $Name. $Hint"
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "Goron-GTS — installation labo (racine : $repoRoot)" -ForegroundColor Green

Write-Step "Vérification des prérequis"
Assert-Command -Name "git" -Hint "Installez Git pour Windows : https://git-scm.com/download/win"
Assert-Command -Name "node" -Hint "Installez Node.js 22 LTS : https://nodejs.org/"
Assert-Command -Name "npm" -Hint "npm est fourni avec Node.js."
Assert-Command -Name "docker" -Hint "Installez Docker Desktop : https://www.docker.com/products/docker-desktop/"

$nodeVersion = node -v
Write-Host "Node.js : $nodeVersion"
$nodeMajor = [int](($nodeVersion -replace "^v", "").Split(".")[0])
if ($nodeMajor -lt 22) {
  Write-Warning "Node.js 22 LTS est recommandé (Vite 8 / Electron 41). Version détectée : $nodeVersion"
}

try {
  docker info | Out-Null
} catch {
  throw "Docker Desktop n'est pas démarré. Ouvrez Docker Desktop, attendez le voyant vert, puis relancez ce script."
}

Write-Step "Démarrage de PostgreSQL labo (conteneur goron-pg18)"
docker compose up -d
if ($LASTEXITCODE -ne 0) {
  throw "Échec de docker compose up. Vérifiez que le port 5432 est libre (Get-NetTCPConnection -LocalPort 5432)."
}

Write-Host "Attente de la santé PostgreSQL..."
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  docker compose exec -T postgres pg_isready -U goron_gts_app -d goron_gts 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  throw "PostgreSQL n'est pas prêt. Consultez : docker compose logs postgres"
}
Write-Host "PostgreSQL labo joignable sur 127.0.0.1:5432"

Write-Step "Installation des dépendances npm"
npm ci
if ($LASTEXITCODE -ne 0) {
  Write-Warning "npm ci a échoué, tentative avec npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw "Échec de l'installation npm."
  }
}

Write-Step "Préparation du code Admin (data/acces_admin.env)"
$dataDir = Join-Path $repoRoot "data"
$adminEnv = Join-Path $dataDir "acces_admin.env"
$example = Join-Path $repoRoot "acces_admin.env.example"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
if (-not (Test-Path $adminEnv)) {
  Copy-Item $example $adminEnv
  Write-Host "Fichier créé : $adminEnv"
  Write-Host "Modifiez GTS_ADMIN_MASTER_CODE avant de vous connecter (compte Admin)." -ForegroundColor Yellow
} else {
  Write-Host "Fichier déjà présent : $adminEnv (inchangé)"
}

Write-Host ""
Write-Host "Installation terminée." -ForegroundColor Green
Write-Host "Lancement : npm run dev"
Write-Host "Connexion  : nom affiché Admin / mot de passe = GTS_ADMIN_MASTER_CODE"
Write-Host "Hors ligne : une fois Docker et npm installés, Internet n'est plus requis (voir INSTALLATION.md)."
