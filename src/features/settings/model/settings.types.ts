/**
 * Types UI Paramètres : onglets, formulaire utilisateur, état modale de confirmation.
 */

import type { ReactNode } from "react";
import type { ManagerProfile, Role } from "../../../types";

export type SettingsTab = "operators" | "data" | "templates" | "database" | "audit";
/** Sous-onglets de Paramètres → Modèles et variables (l’ancien onglet `variables` est redirigé ici). */
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
  mustResetPassword: boolean;
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
 * Responsable : toutes les vues, y compris Paramètres.
 * Opérateur : toutes les vues métier, Paramètres désactivé.
 *
 * @param role - Rôle technique du compte à créer / basculer
 */
export function getDefaultPageAccessByRole(role: Exclude<Role, "DEV">): CreateUserFormState["pageAccess"] {
  if (role === "RESPONSABLE") {
    return {
      mainCourante: true,
      fransor: true,
      intervention: true,
      rondes: true,
      settings: true,
      gardiennage: true
    };
  }
  return {
    mainCourante: true,
    fransor: true,
    intervention: true,
    rondes: true,
    settings: false,
    gardiennage: true
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
  /** Exige un motif non vide (désactivation / réactivation). */
  requireReason?: boolean;
  /** Exige un nom affiché non vide (réactivation). */
  requireDisplayName?: boolean;
  /** Username technique exclu du contrôle d'unicité côté UI. */
  excludeUsername?: string;
  cancelLabel?: string;
  children?: ReactNode;
  onConfirm: null | (() => void | Promise<void>);
};
