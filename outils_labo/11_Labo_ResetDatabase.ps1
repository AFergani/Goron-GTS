# ===============================================
#     RESET COMPLET BASE + schema.sql UNIQUE
# ===============================================
# ATTENTION : efface TOUTES les donnees de goron_gts (labo).
# Recree le schema public puis reapplique schema.sql.

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$ScriptPath\_Labo_Common.ps1"

Write-Host "===============================================" -ForegroundColor Red
Write-Host "   RESET BASE PostgreSQL (LABO)" -ForegroundColor Red
Write-Host "===============================================" -ForegroundColor Red
Write-Host ""
Write-Host "Conteneur : $($script:LaboContainerName)" -ForegroundColor Gray
Write-Host "Base      : $($script:LaboDatabaseName)" -ForegroundColor Gray
Write-Host "Schema    : electron/store/persistence/migrations/schema.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "Cela SUPPRIME toutes les tables / donnees de la base labo," -ForegroundColor Yellow
Write-Host "puis recree un schema vierge a partir du fichier unique." -ForegroundColor Yellow
Write-Host "Les comptes agents, mains courantes, etc. seront perdus." -ForegroundColor Yellow
Write-Host "Au prochain lancement de Goron-GTS, le compte Admin DEV" -ForegroundColor Yellow
Write-Host "sera recree automatiquement si prevu par l'appli." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "Pour confirmer, tapez RESET (autre chose = annuler)"
if ($confirm -ne "RESET") {
    Write-Host "Annule." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    exit 0
}

if (-not (Start-LaboDockerDesktopIfNeeded)) {
    Wait-LaboKey
    exit 1
}

if (-not (Test-LaboContainerRunning)) {
    Write-Host "Conteneur non demarre. Lancez d'abord l'option [1]." -ForegroundColor Red
    Wait-LaboKey
    exit 1
}

$schemaPath = Get-LaboSchemaSqlPath
if (-not (Test-Path $schemaPath)) {
    Write-Host "ERREUR : schema.sql introuvable :" -ForegroundColor Red
    Write-Host "  $schemaPath" -ForegroundColor Gray
    Wait-LaboKey
    exit 1
}

Write-Host ""
Write-Host "1/3 Drop schema public..." -ForegroundColor Cyan
$dropSql = @"
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
GRANT ALL ON SCHEMA public TO $($script:LaboAppUser);
GRANT ALL ON SCHEMA public TO $($script:LaboPgSuperUser);
"@

$dropSql | docker exec -i $script:LaboContainerName psql -U $script:LaboPgSuperUser -d $script:LaboDatabaseName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec du DROP/CREATE SCHEMA." -ForegroundColor Red
    Wait-LaboKey
    exit 1
}
Write-Host "   Schema public recree." -ForegroundColor Green

Write-Host ""
Write-Host "2/3 Application de schema.sql..." -ForegroundColor Cyan
Get-Content -Path $schemaPath -Raw -Encoding UTF8 | docker exec -i $script:LaboContainerName psql -U $script:LaboPgSuperUser -d $script:LaboDatabaseName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec de l'application du schema." -ForegroundColor Red
    Wait-LaboKey
    exit 1
}
Write-Host "   schema.sql applique." -ForegroundColor Green

Write-Host ""
Write-Host "3/3 Droits pour $($script:LaboAppUser)..." -ForegroundColor Cyan
$grantSql = @"
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $($script:LaboAppUser);
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $($script:LaboAppUser);
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $($script:LaboAppUser);
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $($script:LaboAppUser);
"@
$grantSql | docker exec -i $script:LaboContainerName psql -U $script:LaboPgSuperUser -d $script:LaboDatabaseName -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec des GRANT (schema peut etre OK, verifier a la main)." -ForegroundColor Yellow
} else {
    Write-Host "   Droits OK." -ForegroundColor Green
}

Write-Host ""
Write-Host "Tables creees (extrait) :" -ForegroundColor Gray
docker exec $script:LaboContainerName psql -U $script:LaboPgSuperUser -d $script:LaboDatabaseName -c "\dt" 2>&1 | Select-Object -First 40

Write-Host ""
Write-Host "RESET termine. Relancez Goron-GTS pour recreer le compte Admin / session." -ForegroundColor Green
Wait-LaboKey
