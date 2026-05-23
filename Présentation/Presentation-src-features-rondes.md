# Goron-GTS — Module `src/features/rondes` (vue responsables)

Présentation **non technique** du module **Rondes** : passages planifiés (contractuels), demandes d’urgence et fiches liées aux interventions.

> **Périmètre** : `src/features/rondes`. Persistance, profils planifiés et audit → Electron (`store/domains` rondes).

---

## 1. Pourquoi ce module existe

Les rondes structurent les **passages de sécurité** sur les sites :

- **Planifiées** : selon des profils (créneaux, récurrences, jours fériés) ;
- **Exceptionnelles** : urgence, suite d’intervention, demande client ;
- **Fiches de passage** : saisie terrain, clôture, variables personnalisées (modèles Word).

Ce module complète la main courante et les interventions : il pilote la **planification** et le **suivi opérationnel** des rondes.

---

## 2. Rôle global en une phrase

**`features/rondes` organise les demandes et fiches de ronde**, du profil contractuel jusqu’à l’export Word/Excel, en respectant l’état writer (file d’attente si le poste maître est indisponible).

---

## 3. Les trois grands volets de l’écran

| Volet | Contenu |
|-------|---------|
| **Urgence / exceptionnel** | Liste des demandes et fiches hors contrat ; lots liés ; filtres et exports |
| **Planifié (jour)** | Calendrier, créneaux du jour, demandes sur un site/créneau |
| **Gestion des profils** | Profils contractuels, lignes, récurrences, champs de clôture |

---

## 4. Parcours opérateur / responsable

| Besoin | Action typique |
|--------|----------------|
| Demander une ronde | Modale « Demande » (planifiée ou urgence, éventuellement plusieurs sites) |
| Saisir / clôturer un passage | Modale « Fiche » avec champs configurables et statut |
| Lier une intervention | Création depuis intervention → panneau lecture seule de l’intervention source |
| Exporter | Excel (liste) ou Word (fiche, modèle par profil si configuré) |
| Nouveau site / prestataire | Proposition en attente de validation (comme les autres modules) |

---

## 5. Planification et calendrier

- **Profils** : sites, types de passage (jour/nuit, aléatoire, récurrence), masques et fériés ;
- **Moteur local** : génération des créneaux applicables pour une date (sans exposer d’identifiants techniques en liste) ;
- **Snapshot de demande** : mémorisation de la saisie pour rejouer une « demande liée » après clôture.

---

## 6. Règles d’interface importantes

- Pas d’**UUID** ni d’identifiants base affichés aux utilisateurs ;
- Dates en **français** dans l’UI ;
- Formulaires ouverts : la saisie ne doit pas être effacée par un rafraîchissement automatique des listes ;
- État **writer** visible (badge, file d’attente) pour les écritures en mode dégradé.

---

## 7. Documentation technique (mai 2026)

29 fichiers documentés (JSDoc, commits `docs(ui):` sur `dev`).

**Nettoyage** : retrait du chargement des listes « sites/intervenants en attente » dans le hook référentiels rondes (doublon avec Paramètres, jamais consommé par la page).

**Fichiers volumineux** (surveillance taille, pas de découpage en cette passe) : `RondePage`, `RondeRequestModal`, `RondeEntryModal`, export Word.

---

## 8. Liens

| Zone | Fiche |
|------|--------|
| UI partagée | [Presentation-src-features-common.md](./Presentation-src-features-common.md) |
| Interventions | [Presentation-src-features-intervention.md](./Presentation-src-features-intervention.md) |
| Aide | Rubrique Rondes dans [Presentation-src-features-help.md](./Presentation-src-features-help.md) |

---

*Document interne — dossier personnel, hors dépôt Git.*
