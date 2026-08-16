# Installation Docker labo + exécutable Goron-GTS (PC portable)

Ce guide installe **uniquement PostgreSQL en Docker** sur un PC portable Windows, puis relie un **`.exe` Goron GTS déjà généré** (portable ou installateur). Pas de Node, pas de Git, pas de `npm run dev`.

Le Docker du portable est **indépendant** de celui du PC fixe : ni conteneur, ni données en commun. Pour recopier les données de test, voir la section 7.

---

## 1. Ce dont vous avez besoin

| Élément | Rôle |
|---------|------|
| Docker Desktop | Fait tourner PostgreSQL labo sur le portable |
| Conteneur `goron-pg18` | Base `goron_gts` sur `127.0.0.1:5432` |
| Dossier de l’appli (déjà créé sur le PC fixe) | `Goron GTS x.x.x.exe` + dossier `data/` |

Identifiants techniques labo (à saisir dans l’écran **Initialisation GTS** du `.exe`) :

| Champ | Valeur |
|-------|--------|
| Hôte | `127.0.0.1` |
| Port | `5432` |
| Base | `goron_gts` |
| Utilisateur | `goron_gts_app` |
| Mot de passe | `dev_app_secret` |

Le schéma SQL est créé **automatiquement** au premier lancement de l’exe dès que PostgreSQL répond. Aucun import SQL à la main.

---

## 2. Installer Docker Desktop (une fois, avec Internet)

1. Windows 10/11 64 bits. Virtualisation activée dans le BIOS (WSL2).
2. Télécharger [Docker Desktop](https://www.docker.com/products/docker-desktop/) et l’installer (droits administrateur). Redémarrer si demandé.
3. Ouvrir Docker Desktop et attendre le statut **Running**.
4. Dans PowerShell :

```powershell
docker version
```

Sans Docker Desktop démarré, les commandes suivantes échouent.

---

## 3. Démarrer PostgreSQL labo

Dans PowerShell (Internet **uniquement** pour le premier téléchargement de l’image `postgres:18`) :

```powershell
docker run -d --name goron-pg18 --restart unless-stopped `
  -e POSTGRES_DB=goron_gts `
  -e POSTGRES_USER=goron_gts_app `
  -e POSTGRES_PASSWORD=dev_app_secret `
  -e TZ=Europe/Paris `
  -p 5432:5432 `
  -v goron_pg18_data:/var/lib/postgresql `
  postgres:18
```

Si le dépôt Goron-GTS est déjà présent sur le portable, équivalent :

```powershell
docker compose up -d
```

Vérifier :

```powershell
docker ps
docker exec goron-pg18 pg_isready -U goron_gts_app -d goron_gts
```

Le résultat attendu contient `accepting connections`.

**Port 5432 déjà pris** (autre PostgreSQL Windows) :

```powershell
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

Arrêtez l’autre service, ou changez `-p 5433:5432` dans `docker run` et saisissez le port **5433** dans l’écran Initialisation GTS.

Commandes utiles :

```powershell
docker start goron-pg18     # redémarrage
docker stop goron-pg18      # arrêt, données conservées
docker logs goron-pg18      # diagnostic
docker rm -f goron-pg18     # suppression du conteneur (le volume reste)
docker volume rm goron_pg18_data   # reset complet (base vide) — après docker rm
```

---

## 4. Copier le `.exe` déjà créé

Sur le PC fixe, le dossier portable ressemble à :

```
Goron GTS 1.0.xx.exe
LISEZ-MOI-DEPLOIEMENT.txt
data\
  templates\
  logs\
```

1. Copier **tout le dossier** sur le portable (USB, disque local). Pas depuis un partage réseau.
2. Exemple : `C:\Users\<vous>\Documents\Goron GTS\`
3. Ne pas lancer l’exe tant que Docker n’est pas **Running** et `goron-pg18` démarré.

Code Admin (compte **Admin**) : créer `data\acces_admin.env` **à côté de l’exe** s’il n’existe pas :

```
GTS_ADMIN_MASTER_CODE=VotreCodeLabo
```

(au moins 8 caractères). C’est le mot de passe du nom affiché `Admin`.

---

## 5. Premier lancement de l’exe

1. Docker Desktop ouvert, conteneur `goron-pg18` démarré.
2. Double-cliquer sur `Goron GTS x.x.x.exe`.
3. Écran **Initialisation GTS** : saisir le tableau de la section 1 (`127.0.0.1`, `5432`, `goron_gts`, `goron_gts_app`, `dev_app_secret`).
4. **Tester la connexion**, puis **Enregistrer**.
5. Connexion : nom affiché `Admin` / mot de passe = `GTS_ADMIN_MASTER_CODE`.

Cette config PostgreSQL est chiffrée **sur ce portable** (`%APPDATA%\goron-gts\`). Elle ne se copie pas depuis le PC fixe.

Vérifications : badge base **vert**, profil Admin (DEV), création des comptes dans Paramètres.

---

## 6. Après un redémarrage du portable

1. Ouvrir **Docker Desktop**, attendre qu’il soit prêt.
2. Le conteneur `goron-pg18` redémarre tout seul (`--restart unless-stopped`). Sinon : `docker start goron-pg18`.
3. Lancer le `.exe`. L’écran Initialisation GTS ne revient pas si la config a déjà été enregistrée.

---

## 7. Recopier les données du PC fixe (optionnel)

Sans cette étape, le portable a une **base vide** (schéma recréé au lancement, pas les saisies de test).

Sur le **PC fixe** :

```powershell
docker exec goron-pg18 pg_dump -U goron_gts_app -d goron_gts -F c -f /tmp/goron_gts.dump
docker cp goron-pg18:/tmp/goron_gts.dump .\goron_gts.dump
```

Copier `goron_gts.dump` sur le portable, puis :

```powershell
docker start goron-pg18
docker cp .\goron_gts.dump goron-pg18:/tmp/goron_gts.dump
docker exec goron-pg18 pg_restore -U goron_gts_app -d goron_gts --clean --if-exists /tmp/goron_gts.dump
```

---

## 8. Internet : Docker + `.exe` sur le même PC

**Oui** : une fois Docker Desktop installé, l’image `postgres:18` déjà téléchargée et le dossier de l’exe copié, **Internet n’est plus nécessaire**.

L’exe parle à PostgreSQL en `127.0.0.1:5432` (boucle locale). Couper le Wi-Fi ne coupe pas cette liaison.

| Action | Internet |
|--------|----------|
| Installer Docker Desktop | Oui |
| Premier `docker run` (téléchargement de `postgres:18`) | Oui |
| Copier le dossier `.exe` (USB) | Non |
| `docker start goron-pg18` + lancer l’exe | **Non** |

Docker Desktop peut afficher « hors ligne » : sans effet si l’image est déjà locale. Un badge base rouge = PostgreSQL arrêté, **pas** une coupure Internet.

---

## 9. Dépannage

| Symptôme | Piste |
|----------|--------|
| `docker : impossible de se connecter au moteur` | Docker Desktop n’est pas démarré |
| Port 5432 occupé | Autre PostgreSQL Windows ; voir section 3 |
| Test connexion échoué dans Initialisation GTS | `docker ps` puis `docker logs goron-pg18` |
| Badge « Base inaccessible » | Conteneur arrêté ; `docker start goron-pg18` |
| `Accès admin désactivé` | `data\acces_admin.env` manquant à côté de l’exe |
| `Nom affiché inconnu` | Saisir **Admin** ; relancer l’exe si PG était down au premier essai |
| Deux PC, données différentes | Normal : deux Docker distincts ; section 7 |

Journal local : `%APPDATA%\goron-gts\gts-pg-events.log`

Les identifiants `dev_app_secret` sont **uniquement pour le laboratoire**.
