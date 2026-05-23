# Goron-GTS — Module `src/features/mainCourante` (vue responsables)

Présentation **non technique** du module **Main courante** : journal d’exploitation des informations et incidents du quotidien.

> **Périmètre** : `src/features/mainCourante`. Persistance et audit → Electron (`store/domains/mainCourante.js`).

---

## 1. Pourquoi ce module existe

La main courante trace ce qui se passe sur l’activité **en dehors** des missions planifiées (rondes, gardiennage) :

- signalement d’un fait par un **opérateur** ;
- analyse et décision d’un **responsable** ;
- clôture avec observation éventuelle.

Ce n’est pas un chat interne : c’est un **registre auditable** des faits utiles à l’exploitation.

---

## 2. Rôle global en une phrase

**`features/mainCourante` est le journal d’exploitation** : consigner, filtrer, traiter et exporter les informations par site, type d’anomalie et statut.

---

## 3. Cycle de vie d’une entrée

| Statut | Signification |
|--------|----------------|
| **En attente** | Nouveau signalement opérateur |
| **En cours** | Marqué « À suivre » par un responsable |
| **Clôturé** | Terminé avec observation responsable |

Un responsable peut **consulter** (marque de lecture), **prendre en compte**, **clôturer** ou **rouvrir** une entrée clôturée.

---

## 4. Parcours opérateur / responsable

| Rôle | Actions typiques |
|------|------------------|
| **Opérateur** | Créer une information (site optionnel, type, texte) ; modifier sa saisie tant que le statut le permet |
| **Responsable** | Traiter : observation, « À suivre » ou clôture ; réouverture si besoin |

---

## 5. Liste et outils

- Filtres : recherche, dates, type, statut, opérateur, responsable (mémorisés sur le poste)
- Export **Excel** (liste filtrée) et **Word** (fiche d’une entrée)
- Proposition de **nouveau site** en attente (workflow partagé Paramètres)
- Recherche site : code ou nom, format « Nom (CODE) »

---

## 6. Utilitaires partagés

Le module fournit aussi des briques réutilisées ailleurs :

- **Recherche site** (`SiteSearchInput`) — interventions, rondes, gardiennage
- **Téléchargement fichier** (`downloadBlob`) — tous les exports Word
- **Format nom de fichier** (`safeExportFilenamePart`) — exports multi-modules

---

## 7. Documentation technique (mai 2026)

12 fichiers documentés (JSDoc, commits `docs(ui):` sur `dev`). Aucun code mort identifié lors de la passe.

---

## 8. Liens

| Zone | Fiche |
|------|--------|
| UI partagée | [Presentation-src-features-common.md](./Presentation-src-features-common.md) |
| Aide | Rubrique Main courante dans [Presentation-src-features-help.md](./Presentation-src-features-help.md) |

---

## 9. Message clé (30 secondes)

> La main courante, c’est le carnet d’exploitation : l’opérateur signale, le responsable traite et clôture, tout reste filtrable et exportable pour le suivi client ou interne.

---

*Fiche responsables — module `src/features/mainCourante` — mai 2026.*
