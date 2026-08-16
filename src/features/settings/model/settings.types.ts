/**
 * Types UI Paramètres : onglets, formulaire utilisateur, état modale de confirmation.
 */

import type { ReactNode } from "react";
import type { AnomalyTypeRef, AuditLog, HolidayRef, IntervenantRef, ManagerProfile, Role, SiteRef, User } from "../../../types";

export type SettingsTab = "operators" | "data" | "templates" | "variables" | "database" | "audit";
export type DataTab =
  | "sites"
  | "intervenants"
  | "types"
  | "rondeMotifs"
  | "holidays"
  | "documentTemplates"
  | "fransorResponsables"
  | "interventionPendingSites"
  | "interventionPendingIntervenants";

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
  confirmLabel: string;
  confirmClassName?: string;
  confirmDisabled?: boolean;
  cancelLabel?: string;
  children?: ReactNode;
  onConfirm: null | (() => void | Promise<void>);
};
