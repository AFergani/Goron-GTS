export type Role = "RESPONSABLE" | "OPERATEUR" | "DEV";
export type ManagerProfile = "SUPERVISEUR" | "RESPONSABLE_STATION" | "DIRECTEUR_STATION";
export type PageAccess = {
  mainCourante: boolean;
  fransor: boolean;
  intervention: boolean;
  rondes: boolean;
  settings: boolean;
  gardiennage: boolean;
};

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

export type LoginPayload = {
  username: string;
  password: string;
};

export type AuditLog = {
  occurredAt: string;
  actorUsername: string;
  action: string;
  targetUsername: string | null;
  status: string;
  details: Record<string, unknown> | null;
};

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

export type FransorMonthlyRecap = {
  responsableId: string;
  responsableName: string;
  ouvertures: number;
  fermetures: number;
  totalActions: number;
};
