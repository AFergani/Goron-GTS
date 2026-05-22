/**
 * Types transverses du frontend Goron-GTS (comptes, droits, référentiels partagés, Fransor).
 *
 * Les entités métier détaillées (main courante, intervention, ronde, gardiennage) vivent dans
 * les fichiers types de chaque feature (sous-dossier model). Ce fichier centralise ce qui est
 * réutilisé par plusieurs modules
 * et par `gtsApiClient` / `vite-env.d.ts`.
 */

/** Rôles applicatifs alignés sur le backend (`UserStore` / RBAC). */
export type Role = "RESPONSABLE" | "OPERATEUR" | "DEV";

/** Sous-profil des comptes responsables (hiérarchie station). */
export type ManagerProfile = "SUPERVISEUR" | "RESPONSABLE_STATION" | "DIRECTEUR_STATION";

/** Droits d'accès aux pages de la sidebar (persistés en `page_access_json`). */
export type PageAccess = {
  mainCourante: boolean;
  fransor: boolean;
  intervention: boolean;
  rondes: boolean;
  settings: boolean;
  gardiennage: boolean;
};

/** Compte utilisateur exposé à l'UI après authentification ou gestion des comptes. */
export type User = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  managerProfile: ManagerProfile | null;
  pageAccess: PageAccess;
  mustChangePassword: boolean;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
};

/** Formulaire de connexion (nom affiché + mot de passe). */
export type LoginPayload = {
  username: string;
  password: string;
};

/** Ligne du journal d'audit affiché dans Paramètres. */
export type AuditLog = {
  occurredAt: string;
  actorUsername: string;
  action: string;
  targetUsername: string | null;
  status: string;
  details: Record<string, unknown> | null;
};

// --- Référentiels partagés (gestion des données) ---

export type SiteRef = {
  id: string;
  code: string;
  name: string;
  address: string;
  parc: string;
  famille: string;
  createdAt: string;
  updatedAt: string | null;
};

export type IntervenantRef = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
};

export type AnomalyTypeRef = {
  id: string;
  label: string;
  colorHex: string;
  createdAt: string;
  updatedAt: string | null;
};

// --- Fransor ---

export type FransorResponsableRef = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string | null;
};

export type HolidayRef = {
  id: string;
  dateIso: string;
  label: string;
  createdAt: string;
  updatedAt: string | null;
};

export type FransorClosure = {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  mode: "CLOSED" | "OPEN";
  createdAt: string;
  updatedAt: string | null;
};

export type FransorEntry = {
  id: string;
  date: string;
  responsableId: string;
  ouvertureDone: boolean;
  fermetureDone: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

/** Agrégat mensuel pour export récap Fransor. */
export type FransorMonthlyRecap = {
  responsableId: string;
  responsableName: string;
  ouvertures: number;
  fermetures: number;
  totalActions: number;
};
