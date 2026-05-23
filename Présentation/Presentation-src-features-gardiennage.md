# Goron-GTS — Module `src/features/gardiennage` (vue responsables)

Présentation **non technique** du module **Gardiennage** : planification et suivi des prestations de gardiennage par site, avec clôture et exports.

> **Périmètre** : interface `src/features/gardiennage`. Écritures, génération de lots planifiés et audit → Electron `store/domains/gardiennage.js`.

---

## 1. Pourquoi ce module existe

Les équipes doivent :

- **planifier** des gardiennages (ponctuels, récurrents ou couverture continue) ;
- suivre le **jour le jour** ce qui est prévu et ce qui est **clôturé** ;
- lier éventuellement une **intervention** ou une **ronde** ;
- produire des **exports** (Excel liste, Word fiche) pour le reporting.

Ce module centralise ces actions dans une page dédiée de la sidebar.

---

## 2. Rôle global en une phrase

**`features/gardiennage` est l’écran de pilotage des gardiennages** : calendrier du jour, liste planifiée, saisie riche en modale, clôture avec compte rendu, et exports.

---

## 3. Les deux vues principales

| Vue | Usage |
|-----|--------|
| **Du jour** | Naviguer date par date ; voir / saisir / clôturer les prestations du jour sélectionné |
| **Planification** | Liste filtrée (recherche, dates, statut, famille, prestataire) ; création de séries ; export Excel |

Le mode d’affichage (jour / liste) est mémorisé sur le poste.

---

## 4. Types de planification (langage métier)

| Type | Description |
|------|-------------|
| **Ponctuel** | Une journée avec horaires début / fin (nuit possible si fin ≤ début) |
| **Récurrent** | Plusieurs lignes horaires, jours de semaine, fériés / veilles de férié |
| **H24 / continu** | Couverture sur une période avec plage globale début → fin |

Une **prévisualisation** des créneaux générés est proposée avant enregistrement.

---

## 5. Statuts et cycle de vie

| Statut | Sens pour l’utilisateur |
|--------|-------------------------|
| **En cours** (planifié) | Prestation prévue, pas encore activée ou en attente |
| **Actif** | En cours d’exécution |
| **Clôturé** | Terminé avec compte rendu (et éventuellement n° de bon) |
| **Annulé** | Annulé avec motif obligatoire |

**Clôture automatique** : le système peut clôturer avec un libellé fixe lorsque l’horaire de fin est dépassé.

**Writer indisponible** : badge « En attente DB » — la saisie n’est pas perdue.

---

## 6. Parcours utilisateur types

| Situation | Action |
|-----------|--------|
| **Nouveau gardiennage récurrent** | Créer → lignes horaires + période → prévisualiser → enregistrer |
| **Correction du jour** | Clic sur la date → modale préremplie |
| **Fin de prestation** | Clôturer → horaires effectifs + compte rendu |
| **Lien intervention** | Boutons depuis modale clôture / édition (si droits navigation) |
| **Reporting** | Export Excel (liste) ou Word (fiche clôturée) |

---

## 7. Documentation technique (mai 2026)

13 fichiers documentés (JSDoc français, commits `docs(ui):` sur `dev`) :

- **model** : types, calendrier, formulaire → snapshot, moteur de créneaux ;
- **presenter** : liste + API + référentiels ;
- **components** : tableau, modales saisie / clôture, ligne semaine ;
- **export** : Excel, Word ;
- **view** : page à deux onglets.

**Code mort** : aucun export ou composant orphelin identifié lors de la passe.  
**Taille** : `GardiennageEntryModal.tsx` > 1000 lignes — découpage recommandé à terme.

---

## 8. Ce que ce module ne fait pas

- **Référentiel sites / prestataires** (validation des propositions « en attente ») → Paramètres + workflow intervention
- **Rondes / main courante** → modules dédiés (liens possibles depuis une fiche)

---

## 9. Liens

| Zone | Fiche |
|------|--------|
| UI partagée | [Presentation-src-features-common.md](./Presentation-src-features-common.md) |
| Backend | [Presentation-electron-store-domains.md](./Presentation-electron-store-domains.md) |

---

## 10. Message clé (30 secondes)

> Gardiennage, c’est planifier et suivre les prestations sur les sites : par jour ou en liste, avec des horaires simples ou des plannings récurrents, clôturer avec un compte rendu, et exporter pour le reporting — tout en restant aligné avec les interventions et rondes liées.

---

*Fiche responsables — module `src/features/gardiennage` — mai 2026.*
