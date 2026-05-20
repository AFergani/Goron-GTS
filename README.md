# Goron-GTS

Application desktop metier pour la gestion operationnelle des activites terrain:
main courante, interventions, rondes et gardiennage, avec fonctionnement local
en environnement station.

## Objectif produit

Goron-GTS centralise la saisie, le suivi et la tracabilite des actions
operationnelles, tout en garantissant:
- une experience simple pour les equipes terrain,
- une continuite de service en cas d'indisponibilite partielle,
- un journal d'audit exploitable pour le support et le controle.

## Modules metier

- `Main courante` : informations operationnelles, suivi, cloture.
- `Intervention` : creation/suivi/statut/facturation des interventions.
- `Rondes` : rondes exceptionnelles et planifiees.
- `Gardiennage` : planification et suivi des demandes.
- `Fransor` : gestion des ouvertures/fermetures par jour/mois.
- `Parametres` : utilisateurs, referentiels, audit, configuration.

## Architecture (vue simple)

- Frontend: React + TypeScript
- Desktop: Electron
- Logique metier: backend local Node.js (dans Electron)
- Base de donnees: SQLite (fichier local/partage selon configuration)
- Principe de conception: separation stricte UI / logique metier

Le `UserStore` agit comme orchestrateur, et la logique metier est deleguee dans
des modules de domaine dedies.

## Fonctionnement reseau (resume)

- Application concue pour un usage LAN (pas internet requis).
- Mode writer avec:
  - un poste Maitre,
  - un poste Backup de secours,
  - des postes clients.
- Le Maitre et le Backup doivent etre ouverts pour assurer la continuite
  d'ecriture.

Pour le detail reseau et securite, voir:
`Z_Dossier_Perso/RESEAU_ADMINISTRATEUR_IT.txt`

## Securite (resume)

- Authentification utilisateur avec hash de mot de passe renforce.
- Sessions limitees dans le temps.
- Audit des actions d'ecriture metier.
- Signature des echanges inter-postes writer.
- Protection anti-rejeu sur les requetes writer.
- Isolation Electron (context isolation + sandbox).

## Prerequis

- Windows 10/11 (environnement cible)
- Acces reseau local station
- Dossier de donnees configure

## Installation et lancement (developpement)

1. Installer les dependances:
   - `npm install`
2. Lancer l'application en dev:
   - `npm run dev`

## Build

- Build application:
  - `npm run build`

Selon le packaging utilise dans le projet, une distribution locale peut etre
preparee pour deploiement poste par poste.

## Bonnes pratiques d'exploitation

- Privilegier une installation locale sur chaque poste de production.
- Eviter l'execution directe depuis un partage reseau.
- Maintenir Maitre et Backup ouverts pendant la plage d'exploitation.
- Verifier regulierement l'etat writer et les logs en cas d'incident.

## Statut du projet

Le projet evolue par increments fonctionnels avec un objectif de stabilite
operationnelle et de maintenance long terme.
