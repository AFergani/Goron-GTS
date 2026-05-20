/**
 * Lors de la création d'une fiche, enregistre d'abord les sites / prestataires proposés
 * « en attente » si l'utilisateur a rempli les champs dédiés sans sélectionner le référentiel.
 */

export type PendingRefsBeforeSaveResult =
  | { ok: false; errorMessage: string }
  | { ok: true; createdSiteDisplay: string | null; createdIntervenantName: string | null };

export const PENDING_SITE_CREATE_HINT =
  "En validant la création de la fiche, la proposition de site sera ajoutée en attente de validation si le code et le nom sont renseignés.";

export const PENDING_INTERVENANT_CREATE_HINT =
  "En validant la création de la fiche, le prestataire sera ajouté en attente de validation si le nom est renseigné.";

export async function createPendingRefsIfNeededForSubmit(params: {
  selectedFromCatalogSite: boolean;
  selectedFromCatalogIntervenant: boolean;
  pendingCode: string;
  pendingName: string;
  pendingIntervenantInput: string;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
  onCreatePendingIntervenant: (name: string) => Promise<boolean>;
}): Promise<PendingRefsBeforeSaveResult> {
  const code = params.pendingCode.trim();
  const name = params.pendingName.trim();
  const intervenantInput = params.pendingIntervenantInput.trim();

  let createdSiteDisplay: string | null = null;
  let createdIntervenantName: string | null = null;

  if (!params.selectedFromCatalogSite) {
    if (code || name) {
      if (!code || !name) {
        return {
          ok: false,
          errorMessage: "Pour proposer un nouveau site, renseignez le code et le nom."
        };
      }
      const siteOk = await params.onCreatePendingSite(code, name);
      if (!siteOk) {
        return { ok: false, errorMessage: "" };
      }
      createdSiteDisplay = `${name} (${code})`;
    }
  }

  if (!params.selectedFromCatalogIntervenant && intervenantInput) {
    const ivOk = await params.onCreatePendingIntervenant(intervenantInput);
    if (!ivOk) {
      return { ok: false, errorMessage: "" };
    }
    createdIntervenantName = intervenantInput;
  }

  return { ok: true, createdSiteDisplay, createdIntervenantName };
}

export type PendingSiteOnlyBeforeSaveResult =
  | { ok: false; errorMessage: string }
  | { ok: true; createdSiteDisplay: string | null };

/**
 * Variante sans prestataire (ex. main courante : site facultatif).
 */
export async function createPendingSiteIfNeededForSubmit(params: {
  selectedFromCatalogSite: boolean;
  pendingCode: string;
  pendingName: string;
  onCreatePendingSite: (code: string, name: string) => Promise<boolean>;
}): Promise<PendingSiteOnlyBeforeSaveResult> {
  const code = params.pendingCode.trim();
  const name = params.pendingName.trim();

  if (params.selectedFromCatalogSite) {
    return { ok: true, createdSiteDisplay: null };
  }
  if (!code && !name) {
    return { ok: true, createdSiteDisplay: null };
  }
  if (!code || !name) {
    return {
      ok: false,
      errorMessage: "Pour proposer un nouveau site, renseignez le code et le nom."
    };
  }
  const siteOk = await params.onCreatePendingSite(code, name);
  if (!siteOk) {
    return { ok: false, errorMessage: "" };
  }
  return { ok: true, createdSiteDisplay: `${name} (${code})` };
}
