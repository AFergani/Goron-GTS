/**
 * Création de référentiels « en attente » avant l’enregistrement d’une fiche métier.
 *
 * Lorsque l’utilisateur saisit un site ou un prestataire hors catalogue (sans sélection
 * liste), les helpers appellent les callbacks IPC fournis par la modale. En cas de succès,
 * ils renvoient les libellés créés pour alimenter le payload de la fiche (`createdSiteDisplay`,
 * `createdIntervenantName`). Échec API : `ok: false` avec `errorMessage` vide (message géré
 * par la modale / toast).
 *
 * `PENDING_*_CREATE_HINT` : textes d’aide affichés dans `PendingSiteIntervenantRefActions`.
 *
 * Utilisé par : InterventionEntryModal, RondeEntryModal, RondeRequestModal,
 * MainCouranteEntryModal (`createPendingSiteIfNeededForSubmit` uniquement).
 */

/** Résultat site + prestataire avant soumission */
type PendingRefsBeforeSaveResult =
  | { ok: false; errorMessage: string }
  | { ok: true; createdSiteDisplay: string | null; createdIntervenantName: string | null };

/** Infobulle / aide sous le formulaire de proposition de site */
export const PENDING_SITE_CREATE_HINT =
  "En validant la création de la fiche, la proposition de site sera ajoutée en attente de validation si le code et le nom sont renseignés.";

/** Infobulle / aide sous le formulaire de proposition de prestataire */
export const PENDING_INTERVENANT_CREATE_HINT =
  "En validant la création de la fiche, le prestataire sera ajouté en attente de validation si le nom est renseigné.";

/**
 * Site et prestataire en attente si non sélectionnés dans le référentiel.
 * Site : code et nom obligatoires si l’un des deux est saisi.
 */
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

/** Résultat site seul (main courante : prestataire non géré ici) */
type PendingSiteOnlyBeforeSaveResult =
  | { ok: false; errorMessage: string }
  | { ok: true; createdSiteDisplay: string | null };

/**
 * Variante site uniquement : site facultatif ; pas d’erreur si champs vides.
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
