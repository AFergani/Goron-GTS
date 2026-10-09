/**
 * Fiche PV vidéo échangée entre l'écran et le processus principal.
 *
 * Le login et le mot de passe circulent en clair sur ce contrat : le chiffrement
 * est fait à l'enregistrement, le déchiffrement à la lecture.
 */

/** Plafond d'enregistrement des lignes caméras. */
export const MAX_PV_CAMERAS = 80;

export type PvVideoCamera = {
  number: string;
  title: string;
  information: string;
  /** Photo de la ligne. Le chemin stocké n'est pas affiché. */
  image: PvVideoImage | null;
};

export type PvVideoForm = {
  connectionDate: string;
  tlsResponsibleName: string;
  technicianContact: string;
  transmitterCode: string;
  connectionMethod: string;
  /** Interrupteur VPN de la méthode de connexion. */
  vpnEnabled: boolean;
  /** Nom du VPN, saisi seulement lorsque l'interrupteur est activé. */
  vpnName: string;
  recorderModel: string;
  recorderIp: string;
  recorderPort: string;
  login: string;
  password: string;
  cameras: PvVideoCamera[];
};

export type PvVideoImage = {
  base64: string;
  mime: "image/png" | "image/jpeg";
  originalName: string;
  /** Chemin relatif déjà enregistré. Absent si la photo vient d'être collée. */
  storedRelpath?: string;
};

/**
 * Fiche vide. Le responsable TLS reprend le nom du profil connecté.
 *
 * @param tlsResponsibleName - Nom affiché du compte connecté.
 */
export function emptyPvVideoForm(tlsResponsibleName: string): PvVideoForm {
  return {
    connectionDate: "",
    tlsResponsibleName,
    technicianContact: "",
    transmitterCode: "",
    connectionMethod: "",
    vpnEnabled: false,
    vpnName: "",
    recorderModel: "",
    recorderIp: "",
    recorderPort: "",
    login: "",
    password: "",
    cameras: []
  };
}

/**
 * Met un libellé de caméra en capitales, accents compris.
 *
 * @param value - Texte saisi.
 */
export function cameraLabelUpper(value: string): string {
  return value.toLocaleUpperCase("fr-FR");
}

/**
 * Numérote les caméras selon leur ordre et met les libellés en capitales.
 *
 * @param cameras - Lignes dans l'ordre affiché.
 */
export function prepareCameras(cameras: PvVideoCamera[]): PvVideoCamera[] {
  return cameras.map((row, index) => ({
    ...row,
    number: String(index + 1),
    title: cameraLabelUpper(row.title),
    information: cameraLabelUpper(row.information)
  }));
}

/**
 * Garantit un tableau de caméras exploitable après lecture base.
 *
 * @param form - Fiche renvoyée par le serveur.
 */
export function normalizePvVideoForm(form: PvVideoForm): PvVideoForm {
  const cameras = Array.isArray(form.cameras) ? form.cameras : [];
  return {
    ...form,
    connectionMethod: String(form.connectionMethod || ""),
    vpnEnabled: form.vpnEnabled === true,
    vpnName: String(form.vpnName || ""),
    cameras: prepareCameras(
      cameras.map((row) => ({
        number: "",
        title: cameraLabelUpper(String(row?.title || "")),
        information: cameraLabelUpper(String(row?.information || "")),
        image: normalizeCameraImage(row?.image)
      }))
    )
  };
}

/**
 * Conserve une photo de caméra déjà lue, ou rien.
 *
 * @param image - Photo renvoyée par le serveur, ou absente.
 */
function normalizeCameraImage(image: PvVideoImage | null | undefined): PvVideoImage | null {
  if (!image || !image.base64) return null;
  const mime = image.mime === "image/png" || image.mime === "image/jpeg" ? image.mime : null;
  if (!mime) return null;
  return {
    base64: String(image.base64),
    mime,
    originalName: String(image.originalName || "capture.jpg"),
    storedRelpath: image.storedRelpath ? String(image.storedRelpath) : undefined
  };
}
