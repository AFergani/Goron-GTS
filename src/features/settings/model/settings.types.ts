/**
 * Types UI Paramètres : onglets, formulaire utilisateur, état modale de confirmation.
 */

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

export type ConfirmDialogState = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClassName?: string;
  onConfirm: null | (() => void | Promise<void>);
};
