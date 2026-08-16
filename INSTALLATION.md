# Installation Goron-GTS — environnement de test (A à Z)

Guide pour recréer **sur un PC portable Windows** un laboratoire identique au poste de développement : application Electron + PostgreSQL 18 en Docker **local**.

Ce Docker est **indépendant** de celui du PC fixe. Les deux machines ne partagent ni conteneur, ni volume, ni données. Si vous voulez les mêmes données de test, il faut un dump/restauration (section 8).

**Version applicative** : voir `package.json`.

---

## 1. Ce que vous installez

| Élément | Rôle | Où il tourne |
|---------|------|----------------|
| Docker Desktop | Héberge PostgreSQL labo | Le portable |
| Conteneur `goron-pg18` | Base `goron_gts` sur `127.0.0.1:5432` | Le portable |
| Node.js 22 LTS + npm | Build / lancement `npm run dev` | Le portable |
| Dépôt Goron-GTS | Code source | Le portable |
| `data/acces_admin.env` | Code maître du compte **Admin** | Le portable (non versionné) |

L’application se connecte à PostgreSQL en **local** (`127.0.0.1`). Elle n’a pas besoin du PC fixe, ni d’un serveur distant, ni d’Internet **pendant l’exploitation** (détail section 9).

Identifiants techniques labo (déjà prévus dans le code, ne pas les changer si vous suivez ce guide) :

| Paramètre | Valeur |
|-----------|--------|
| Hôte | `127.0.0.1` |
| Port | `5432` |
| Base | `goron_gts` |
| Utilisateur | `goron_gts_app` |
| Mot de passe | `dev_app_secret` |

Le schéma SQL est **appliqué automatiquement** au premier lancement de l’appli (`electron/store/persistence/migrations/schema.sql`). Vous n’avez pas à importer le schéma à la main.

---

## 2. Prérequis (à installer une fois, avec Internet)

### 2.1 Windows

- Windows 10 ou 11, 64 bits.
- Virtualisation activée dans le BIOS (nécessaire à Docker Desktop / WSL2).
- Compte Windows avec droits administrateur pour installer Docker et Node.

### 2.2 Git

1. Télécharger [Git pour Windows](https://git-scm.com/download/win).
2. Installer avec les options par défaut.
3. Vérifier dans PowerShell :

```powershell
git --version
```

### 2.3 Node.js 22 LTS

Vite 8 et Electron 41 exigent une version récente (idéalement **Node 22 LTS**).

1. Télécharger [Node.js 22 LTS](https://nodejs.org/).
2. Installer, puis **fermer et rouvrir** PowerShell.
3. Vérifier :

```powershell
node -v
npm -v
```

`node -v` doit afficher `v22.x.x` (ou au minimum `v20.19+`).

### 2.4 Docker Desktop

1. Télécharger [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. Installer, redémarrer si demandé.
3. Lancer Docker Desktop et attendre le statut **Running** (icône baleine stable).
4. Vérifier :

```powershell
docker version
docker compose version
```

Sans Docker Desktop démarré, `docker compose up` échoue.

Alternative possible (hors Docker) : PostgreSQL 18 (ou 17) installé nativement sur Windows, avec la même base / le même utilisateur / le même mot de passe. Le reste du guide suppose Docker.

---

## 3. Récupérer le code

Dans PowerShell (choisissez un dossier local, pas un partage réseau) :

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/AFergani/Goron-GTS.git
cd Goron-GTS
git checkout dev
```

Si le dépôt est privé, connectez-vous d’abord (`gh auth login` ou un PAT GitHub). Vous pouvez aussi copier le dossier du PC fixe via USB : dans ce cas, **ne copiez pas** `node_modules/` (réinstallez avec `npm ci` sur le portable).

---

## 4. Installation automatique (recommandée)

Toujours dans la racine du dépôt, PowerShell :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\install-labo.ps1
```

Le script :

1. vérifie Git, Node, npm et Docker ;
2. démarre `docker compose up -d` (conteneur `goron-pg18`) ;
3. attend que PostgreSQL soit prêt ;
4. installe les dépendances (`npm ci`) ;
5. crée `data/acces_admin.env` s’il n’existe pas encore.

Puis passez à la section 6 (premier lancement).

---

## 5. Installation manuelle (si vous préférez tout contrôler)

### 5.1 PostgreSQL labo

À la racine du dépôt :

```powershell
docker compose up -d
docker compose ps
```

Le service doit être `healthy` (ou au moins `running`). Test rapide :

```powershell
docker compose exec postgres pg_isready -U goron_gts_app -d goron_gts
```

Si le port **5432** est déjà pris (autre PostgreSQL Windows, autre Docker) :

```powershell
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

Arrêtez l’autre service, ou changez le mapping dans `docker-compose.yml` (`"5433:5432"`) **et** exportez `GTS_PG_PORT=5433` avant `npm run dev`.

### 5.2 Code Admin

```powershell
New-Item -ItemType Directory -Force -Path data | Out-Null
Copy-Item acces_admin.env.example data\acces_admin.env
notepad data\acces_admin.env
```

Remplacez `ChangeMoi_Labo2026` par un code d’au moins 8 caractères. C’est le **mot de passe** du compte Admin en développement.

### 5.3 Dépendances Node

```powershell
npm ci
```

Si `npm ci` échoue (lockfile) : `npm install`.

Cette étape a **besoin d’Internet** (registre npm, binaire Electron, paquet SheetJS).

---

## 6. Premier lancement

Docker Desktop doit rester ouvert.

```powershell
npm run dev
```

Cela démarre Vite (`http://localhost:5173`) puis Electron.

Connexion :

| Champ | Valeur |
|-------|--------|
| Nom affiché | `Admin` |
| Mot de passe | la valeur de `GTS_ADMIN_MASTER_CODE` dans `data/acces_admin.env` |

En mode `npm run dev`, l’écran « Initialisation GTS » **n’apparaît pas** : l’appli utilise automatiquement `127.0.0.1` / `goron_gts` / `goron_gts_app` / `dev_app_secret`.

Vérifications :

- badge base en **vert** (DB accessible) dans la barre latérale ;
- vous êtes connecté en profil **DEV** (Admin) ;
- vous pouvez créer des comptes opérateurs / responsables dans Paramètres.

Deuxième instance locale (tests multi-postes sur la même machine) :

```powershell
npm run dev:2
```

(port UI `5174`, même PostgreSQL).

Arrêt : fermer la fenêtre Electron, `Ctrl+C` dans le terminal.

PostgreSQL :

```powershell
docker compose stop          # arrêt, données conservées
docker compose start         # redémarrage
docker compose down          # suppression du conteneur, volume conservé
docker compose down -v       # reset complet (base vide)
```

---

## 7. Après un redémarrage du portable

1. Lancer **Docker Desktop**, attendre qu’il soit prêt.
2. Le conteneur `goron-pg18` redémarre tout seul (`restart: unless-stopped`). Sinon : `docker compose up -d`.
3. Dans le dépôt : `npm run dev`.

Pas besoin de refaire `npm ci` tant que `package-lock.json` n’a pas changé.

---

## 8. Recopier les données du PC fixe (optionnel)

Par défaut, le portable a une **base vide**. Le schéma se recrée au lancement, mais pas vos saisies de test.

Sur le **PC fixe** (Docker déjà lancé) :

```powershell
docker exec goron-pg18 pg_dump -U goron_gts_app -d goron_gts -F c -f /tmp/goron_gts.dump
docker cp goron-pg18:/tmp/goron_gts.dump .\goron_gts.dump
```

Copiez `goron_gts.dump` sur le portable (USB, réseau, etc.), puis :

```powershell
docker compose up -d
docker cp .\goron_gts.dump goron-pg18:/tmp/goron_gts.dump
docker exec goron-pg18 pg_restore -U goron_gts_app -d goron_gts --clean --if-exists /tmp/goron_gts.dump
```

Les identifiants labo doivent être les mêmes des deux côtés (c’est le cas si les deux machines utilisent ce `docker-compose.yml`).

---

## 9. Internet : installation vs exploitation

### Peut-on utiliser l’appli **sans Internet**, sur le même PC que Docker ?

**Oui**, pour l’usage quotidien, dès que l’installation (section 2 à 5) est faite.

- L’appli parle à PostgreSQL en `127.0.0.1:5432` (boucle locale).
- Vite et Electron tournent en local (`localhost:5173`).
- Aucun appel métier vers un cloud n’est requis.
- Le README le confirme : fonctionnement **LAN / local**, pas d’Internet pour l’exploitation courante.

Conditions :

1. **Docker Desktop est démarré** (le moteur tourne en local ; pas besoin du cloud Docker).
2. L’image `postgres:18` a **déjà été téléchargée** (`docker compose up` a réussi une fois avec Internet).
3. `node_modules/` est déjà installé (`npm ci` a réussi une fois).
4. Le code source est déjà sur le disque.

Sans Internet **après** cette préparation :

```powershell
docker compose up -d
npm run dev
```

fonctionne. Couper le Wi-Fi ne coupe pas `127.0.0.1`.

### Ce qui exige encore Internet

| Action | Internet |
|--------|----------|
| Installer Git, Node, Docker Desktop | Oui |
| `git clone` / `git pull` | Oui |
| Premier `docker compose up` (pull de `postgres:18`) | Oui |
| `npm ci` / `npm install` | Oui |
| `npm run dist:*` (téléchargements electron-builder) | Oui |
| `npm run dev` une fois tout installé | **Non** |
| Utiliser l’appli packagée (exe) + PostgreSQL local | **Non** |
| Relier le portable au Docker du PC fixe via Internet | Non concerné : ce n’est **pas** le mode prévu |

Docker Desktop peut afficher un bandeau « hors ligne » : ce n’est pas bloquant si l’image est déjà locale.

Si le badge passe au rouge : PostgreSQL n’est pas joignable (Docker arrêté, conteneur down, mauvais port) — **pas** un problème d’Internet.

---

## 10. Build portable (optionnel)

Pour un `.exe` sans `npm run dev` :

```powershell
npm run dist:portable
```

Le fichier se trouve sous `release-build/`. Au **premier** lancement d’un build packagé, l’écran « Initialisation GTS » demande hôte / port / base / utilisateur / mot de passe. Sur le même PC que Docker labo :

- hôte `127.0.0.1`
- port `5432`
- base `goron_gts`
- utilisateur `goron_gts_app`
- mot de passe `dev_app_secret`

Cette config est chiffrée localement (DPAPI) dans `%APPDATA%\goron-gts\`. Elle ne se copie pas d’un PC à l’autre.

Le build packagé a aussi besoin du code Admin (`data/acces_admin.env` à côté de l’exe, ou code enregistré ensuite dans l’appli).

---

## 11. Dépannage

| Symptôme | Piste |
|----------|--------|
| `docker : impossible de se connecter au moteur` | Docker Desktop n’est pas démarré |
| Port 5432 occupé | Autre PostgreSQL ; voir section 5.1 |
| Badge « Base inaccessible » | `docker compose ps` puis `docker compose logs postgres` |
| `Accès admin désactivé` | Fichier `data/acces_admin.env` manquant ou clé vide |
| `Nom affiché inconnu` | Saisir **Admin** (pas `admin`) ; la base n’est pas encore initialisée si PG était down au 1er lancement : relancer `npm run dev` |
| `npm ci` échoue | Internet, proxy, ou Node trop ancien |
| Fenêtre Electron vide | Vite pas prêt ; laisser `npm run dev` jusqu’à `Local: http://localhost:5173/` |
| Deux PC, données différentes | Normal : deux Docker distincts ; voir section 8 |

Journal local des coupures PG (par poste) :

`%APPDATA%\goron-gts\gts-pg-events.log`

---

## 12. Rappel sécurité labo

Les identifiants `dev_app_secret` et le code Admin d’exemple sont **uniquement pour le laboratoire**. Ne les utilisez pas en production. En production : PostgreSQL dédié, compte technique distinct, écran d’initialisation GTS, pas les défauts Docker.
