# Goron-GTS — Module `src/features/help` (vue responsables)

Présentation **non technique** du **centre d’aide** intégré à l’application : documentation utilisateur par module, filtrée selon les droits de chaque opérateur.

> **Périmètre** : `src/features/help`. Ouverture globale depuis la sidebar ou lien contextuel depuis une page (ex. Paramètres).

---

## 1. Pourquoi ce module existe

Les utilisateurs doivent comprendre :

- comment naviguer dans l’application (sidebar, thème, writer) ;
- le fonctionnement de chaque **module métier** auquel ils ont accès ;
- les écrans **Paramètres** (données, modèles, variables, base, audit, comptes).

Le centre d’aide regroupe ces contenus dans une **fenêtre unique** sans quitter la session.

---

## 2. Rôle global en une phrase

**`features/help` est le manuel utilisateur embarqué** : rubriques par page autorisée, texte en français, cartes et tableaux lisibles.

---

## 3. Fonctionnement pour l’utilisateur

| Élément | Description |
|---------|-------------|
| **Bouton Aide** | Dans la sidebar — ouvre le centre (rubrique d’accueil ou rubrique demandée) |
| **Liste à gauche** | Une entrée par module / onglet Paramètres **visible pour le profil** |
| **Contenu à droite** | Texte structuré (titres, listes, exemples, encadrés conseil) |
| **Liens contextuels** | Depuis Paramètres, ouverture directe sur la rubrique concernée |

Si l’utilisateur n’a pas le droit d’une rubrique, elle n’apparaît pas dans la liste.

---

## 4. Rubriques disponibles (selon droits)

| Rubrique | Sujet |
|----------|--------|
| Sidebar et accessibilité | Navigation, raccourcis, badges writer |
| Interventions | Création, clôture, exports |
| Rondes | Contractuel / exceptionnel, profils |
| Gardiennage | Planification, journée / liste, clôture |
| Main courante | Signalement, suivi, clôture |
| Fransor | Ouvertures / fermetures, récap |
| Gestion opérateur | Comptes, droits, MDP |
| Gestion des données | Référentiels |
| Gestion modèles | Word `.docx` |
| Gestion variables | Champs personnalisés |
| Gestion base de données | Chemin DB, sauvegardes |
| Journal des actions | Audit |

---

## 5. Documentation technique (mai 2026)

18 fichiers documentés (JSDoc + commentaire d’en-tête CSS).

**Nettoyage** :

- `HelpPlaceholderTopic.tsx` **supprimé** (jamais branché ; toutes les rubriques ont un contenu dédié) ;
- `HelpDayListDisplaySection` **branché** dans les rubriques Rondes et Gardiennage (section commune journée / liste).

---

## 6. Ce que ce module ne fait pas

- Pas de formation vidéo ni FAQ externe ;
- Pas de modification des données métier (lecture seule côté aide).

---

## 7. Liens

| Zone | Fiche |
|------|--------|
| Shell | Fiche `src/app` à venir |
| Modules métier | Fiches `features/*` correspondantes |

---

## 8. Message clé (30 secondes)

> Le centre d’aide, c’est le mode d’emploi Goron-GTS dans l’application : chaque utilisateur ne voit que les rubriques de ses pages, avec des explications concrètes pour exploiter interventions, rondes, gardiennage et paramètres.

---

*Fiche responsables — module `src/features/help` — mai 2026.*
