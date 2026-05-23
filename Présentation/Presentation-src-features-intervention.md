# Goron-GTS — Module `src/features/intervention` (vue responsables)

Présentation **non technique** du module **Interventions** : suivi des missions terrain de la demande à la clôture et à la facturation.

> **Périmètre** : `src/features/intervention`. Écritures et audit → Electron (`store/domains/intervention.js`).

---

## 1. Pourquoi ce module existe

Une **intervention** est une mission ponctuelle : appel client, passage agent, compte rendu, bon de travail, décision de facturation.

Contrairement aux rondes (séries) ou au gardiennage (planning), chaque intervention est une **fiche unique** qui doit être **clôturée manuellement** par l’exploitation.

---

## 2. Rôle global en une phrase

**`features/intervention` est le dossier des missions terrain** : création, suivi, clôture, facturation, exports et liens vers ronde ou gardiennage si besoin.

---

## 3. Parcours utilisateur

| Étape | Action |
|-------|--------|
| **Créer** | Site, prestataire, date/heure de demande, motif |
| **Terrain** | Saisie arrivée / départ (dates si passage après minuit) |
| **Clôturer** | Compte rendu, n° de bon, champs complémentaires (variables Word) |
| **Facturation** | Marquer facturable / non facturable (motif si besoin) |
| **Exporter** | Excel (liste filtrée) ou Word (fiche) |
| **Lier** | Créer une ronde ou un gardiennage pré-rempli depuis l’intervention (si droits pages) |

---

## 4. Liste et filtres

- Recherche texte, dates Du/Au, statut, famille de site, prestataire
- Pagination et tri des colonnes
- Bandeau statistiques : total, en cours, clôturées, annulées
- Badge **En attente DB** si writer indisponible (saisie conservée)

---

## 5. Référentiels et propositions

- Sites et prestataires issus du référentiel Paramètres
- Possibilité de **proposer** un site (code + nom) ou un prestataire **en attente** avant validation (workflow partagé)

---

## 6. Documentation technique (mai 2026)

11 fichiers documentés (JSDoc, commits `docs(ui):` sur `dev`).

**Nettoyage** : retrait du chargement inutilisé des listes pending dans `useInterventionReferenceData` (gestion pending = écran Paramètres uniquement).

**Taille** : `InterventionEntryModal.tsx` > 1000 lignes — découpage recommandé à terme.

---

## 7. Liens

| Zone | Fiche |
|------|--------|
| UI partagée | [Presentation-src-features-common.md](./Presentation-src-features-common.md) |
| Aide | Rubrique Interventions dans [Presentation-src-features-help.md](./Presentation-src-features-help.md) |
| Rondes / Gardiennage | Fiches modules liés |

---

## 8. Message clé (30 secondes)

> Interventions, c’est le suivi complet d’une mission : qui intervient, où, quand, le compte rendu, la facturation, et l’export pour le client — avec la possibilité de déclencher une ronde ou un gardiennage lié.

---

*Fiche responsables — module `src/features/intervention` — mai 2026.*
