/**
 * Types UI Paramètres : onglets, formulaire utilisateur, état modale de confirmation.
 */

import type { ReactNode } from "react";
import type { ManagerProfile, Role } from "../../../types";

export type SettingsTab = "operators" | "data" | "templates" | "database" | "audit";
/** Sous-onglets de Paramètres → Modèles et variables. */
export type DocumentsTab = "templates" | "variables";

/** Sous-onglets visibles de Gestion des données. */
export type DataTab =
  | "sites"
  | "intervenants"
  | "types"
  | "rondeMotifs"
  | "holidays"
  | "fransorResponsables";

/**
 * Cibles de rechargement après import / validation pending.
 * Inclut les files d’attente (pas d’onglet UI dédié : affichage inline Sites / Intervenants).
 */
export type DataRefreshTarget = DataTab | "pendingSites" | "pendingIntervenants";

export type CreateUserFormState = {
  username: string;
  role: Exclude<Role, "DEV">;
  managerProfile: ManagerProfile;
  /** Motif d'audit, exigé en modification uniquement (la création est déjà tracée en tant que telle). */
  reason: string;
  pageAccess: {
    mainCourante: boolean;
    fransor: boolean;
    intervention: boolean;
    rondes: boolean;
    settings: boolean;
    gardiennage: boolean;
  };
};

/**
 * Accès pages par défaut selon le rôle (aligné sur `userMapping.normalizePageAccess`).
 * Les vues métier sont toujours ouvertes.
 * Paramètres : oui pour tout non-opérateur (responsable), non pour un opérateur.
 *
 * @param role - Rôle technique du compte à créer / basculer
 */
export function getDefaultPageAccessByRole(role: Exclude<Role, "DEV">): CreateUserFormState["pageAccess"] {
  return {
    mainCourante: true,
    fransor: true,
    intervention: true,
    rondes: true,
    gardiennage: true,
    settings: role !== "OPERATEUR"
  };
}

export type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  /** Message de base (sans alerte de conflit de nom), pour réactivation. */
  baseMessage?: string;
  confirmLabel: string;
  confirmClassName?: string;
  confirmDisabled?: boolean;
  /** Exige un motif d'audit d'au moins `MIN_AUDIT_REASON_LENGTH` caractères. */
  requireReason?: boolean;
  /** Exige un nom affiché non vide (réactivation). */
  requireDisplayName?: boolean;
  /** Username technique exclu du contrôle d'unicité côté UI. */
  excludeUsername?: string;
  cancelLabel?: string;
  children?: ReactNode;
  onConfirm: null | (() => void | Promise<void>);
};
