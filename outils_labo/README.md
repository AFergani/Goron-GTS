# Outils labo Goron-GTS - Docker PostgreSQL + logs hors UI

Menu interactif pour piloter le conteneur labo et lire les journaux hors appli.

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
| Q | Quitter |

## Logs hors app

| Source | Ou |
|--------|-----|
| Moteur PostgreSQL | option **6** |
| Coupures / retours PG (Goron) | `%APPDATA%\goron-gts\gts-pg-events.log` - option **7** |
