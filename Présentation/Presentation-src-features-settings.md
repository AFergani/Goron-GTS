# Goron-GTS — Module `src/features/settings` (vue responsables)

Présentation **non technique** du module **Paramètres** : administration de la station, référentiels partagés et outils d’exploitation.

> **Périmètre** : `src/features/settings`. Comptes, données, audit et configuration writer → Electron (`store/domains`, handlers IPC).

---

## 1. Pourquoi ce module existe

Les Paramètres centralisent ce qui ne relève pas d’une saisie métier quotidienne :

- **Comptes** : opérateurs et responsables, mots de passe, accès aux pages ;
- **Données de référence** : sites, prestataires, types, motifs ronde, fériés, responsables Fransor ;
- **Validations** : sites et intervenants proposés depuis les autres écrans ;
- **Modèles et variables** : personnalisation des exports Word et champs de clôture ;
- **Base et writer** : choix de base, archives trimestrielles, fichier de configuration des postes maître/backup ;
- **Traçabilité** : journal d’actions filtrable et exportable.

---

## 2. Rôle global en une phrase

**`features/settings` est le poste d’administration** de Goron-GTS pour la station : qui peut se connecter, quelles pages il voit, quels référentiels alimentent le reste de l’application.

---

## 3. Les onglets de l’écran

| Onglet | Contenu |
|--------|---------|
| **Opérateurs** | Liste des comptes, création, édition des accès pages, réinit. MDP, déverrouillage |
| **Données** | Référentiels + imports Excel + files d’attente sites/intervenants |
| **Modèles** | Fichiers Word (main courante, intervention, ronde, gardiennage) |
| **Variables** | Champs configurables rattachés aux formulaires / profils / sites |
| **Base de données** | Chemin SQLite, bascule, archivage trimestriel, générateur config writer |
| **Journal d’actions** | Audit des écritures métier (filtres, export Excel) |

---

## 4. Profils et droits

| Profil | Capacités typiques |
|--------|-------------------|
| **Directeur / responsable station** | Gestion complète comptes, données, modèles, BDD |
| **Superviseur** | Liste comptes + réinitialisation MDP uniquement |
| **Développeur (DEV)** | Accès étendu (hors périmètre opérationnel standard) |

Les **accès pages** (main courante, Fransor, intervention, rondes, gardiennage, paramètres) se règlent par **interrupteurs** (switches), pas par cases à cocher brutes.

---

## 5. Données et imports

- CRUD des référentiels avec **motif obligatoire** à la suppression ;
- **Import Excel** par type (sites, intervenants, types) avec log agrégé en cas d’échecs partiels ;
- **Sites / intervenants en attente** : validation ou rejet des propositions issues des modules métier.

---

## 6. Règles d’interface importantes

- Journal : libellés en français `[Page] Donnée`, pas d’« action non référencée » pour le métier courant ;
- Pas d’**UUID** affichés dans les tableaux utilisateur ;
- Dates en **français** ;
- Toute nouvelle action d’audit backend doit être ajoutée au référentiel de libellés avant exploitation.

---

## 7. Documentation technique (mai 2026)

30 fichiers documentés (JSDoc + commentaires CSS, commits `docs(ui):` sur `dev`).

**Code mort** : aucune suppression lors de la passe (toutes les exports du presenter sont consommées par `AppShell` / `SettingsPage`).

**Fichiers volumineux** (surveillance, pas de découpage en cette passe) : `useSettingsPresenter`, `DataManagementPanel`, `SettingsPage`, `VariablesManagementPanel`.

---

## 8. Liens

| Zone | Fiche |
|------|--------|
| UI partagée | [Presentation-src-features-common.md](./Presentation-src-features-common.md) |
| Rondes (profils planifiés) | [Presentation-src-features-rondes.md](./Presentation-src-features-rondes.md) |
| Aide | Rubriques Paramètres dans [Presentation-src-features-help.md](./Presentation-src-features-help.md) |

---

*Document interne — dossier personnel, hors dépôt Git.*
