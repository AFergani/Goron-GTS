# Outils labo Goron-GTS - Docker PostgreSQL + logs hors UI

Menu interactif pour piloter le conteneur labo et lire les journaux hors appli.

Ce dossier est **versionné** : même menu labo sur tous les PC après `git pull`. La release copie ce dossier tel quel (plus `schema.sql` à côté, pour un pack sans le dépôt).

Le mot de passe ci-dessous est le secret **labo** uniquement (identique au guide `00-LIRE-EN-PREMIER.txt`).

## Ou se trouvent les elements (ce poste)

| Element | Emplacement |
|---------|-------------|
| Scripts labo | `outils_labo\` (dépôt ou pack de release) |
| Schema SQL (reset option 11) | dépôt : `electron\store\persistence\migrations\schema.sql` — pack : `outils_labo\schema.sql` |
| Raccourci démarrage PG (dépôt) | `scripts\start-goron-pg18.bat` — en pack : menu labo touche 1 |
| Conteneur Docker | `goron-pg18` (image `postgres:18`, port `127.0.0.1:5432`) |
| Donnees PostgreSQL Docker | volume Docker `goron_gts` (propre a ce PC) |
| Donnees / config appli Electron | `%APPDATA%\goron-gts\` |
| Journal coupure PG (hors UI) | `%APPDATA%\goron-gts\gts-pg-events.log` |
| Config PG chiffree appli | `%APPDATA%\goron-gts\gts-pg.enc` |

Connexion labo par defaut : hote `127.0.0.1`, port `5432`, base `goron_gts`, utilisateur `goron_gts_app`, mot de passe `dev_app_secret`.

## Demarrage

Double-clic : `Lancer-Menu-Labo.bat`  
(Raccourci bureau possible via clic droit -> Envoyer vers -> Bureau.)

## Menu

### Operations
| Touche | Action |
|--------|--------|
| 1 | Demarrer le conteneur PG (+ Docker Desktop si besoin) |
| 2 | Redemarrer le conteneur |
| 3 | Auto-restart (`unless-stopped`) |
| 4 | Arreter le conteneur |

### Etat & logs
| Touche | Action |
|--------|--------|
| 5 | Etat Docker / PG / journal |
| 6 | Logs Docker live (cette fenetre) + **nouveau terminal menu** |
| 7 | Journal app `gts-pg-events.log` |
| 8 | Ouvrir le dossier logs |

### Outils
| Touche | Action |
|--------|--------|
| 9 | Tester la connexion PG |
| 10 | Purger le journal app (avec .bak) |
| 11 | **Reset complet** base `goron_gts` + reapplique `schema.sql` (tapez `RESET`) |
| 12 | Dump PostgreSQL (fichier .dump) + tache Windows quotidienne a 03:00, sans l'application |
| Q | Quitter |

## Logs hors app

| Source | Ou |
|--------|-----|
| Moteur PostgreSQL | option **6** |
| Coupures / retours PG (Goron) | `%APPDATA%\goron-gts\gts-pg-events.log` - option **7** |
