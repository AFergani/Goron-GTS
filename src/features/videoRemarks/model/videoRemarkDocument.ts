/**
 * Document par défaut, normalisation des exports JSON et brouillon local.
 *
 * Le brouillon du poste survit à un changement de page. L'enregistrement
 * partagé passe par l'instantané PostgreSQL (un par site), déclenché explicitement.
 */

import { ALARM_IMAGE_SRC } from "./alarmImage";
import type {
  ExtraLink,
  TextStyle,
  VideoField,
  VideoRemarkDocument,
  VideoSection,
  VideoStyles
} from "./videoRemarkTypes";

const STORAGE_KEY = "gts-video-remarks-v1";
export const DEFAULT_LINK_TEXT = "CLIQUEZ ICI POUR ACCÉDER AUX VIDÉOS !";
export const DEFAULT_SUMMARY_TEXT = "Cliquez ici pour afficher !";

export const DEFAULT_STYLE_COLORS = {
  diversTitle: "#2E7D32",
  link: "#D97B1C",
  connexionTitle: "#2E86C1",
  labels: "#000000",
  notice: "#C62828",
  summary: "#2E86C1",
  bottomText: "#000000"
};

/**
 * Identifiant local d'un champ ou d'une section (pas un identifiant base).
 *
 * @returns Identifiant unique de saisie.
 */
export function createLocalId(): string {
  return `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Style inline avec les valeurs par défaut du générateur, puis les surcharges.
 *
 * @param overrides - Propriétés à remplacer.
 */
/**
 * Taille en pixels. Les anciens brouillons stockaient des em (au plus 4) : 1 em vaut 16 px.
 *
 * @param size - Valeur saisie ou relue.
 */
function fontSizeInPixels(size: number | undefined): number {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return 16;
  if (value <= 4) return Math.round(value * 16);
  return Math.round(value);
}

export function makeStyle(overrides?: Partial<TextStyle>): TextStyle {
  const style: TextStyle = {
    colorOn: false,
    colorValue: "#000000",
    bgOn: false,
    bgValue: "#ffff00",
    size: 19,
    bold: true,
    italic: false,
    underline: true,
    ...overrides
  };
  return { ...style, size: fontSizeInPixels(style.size) };
}

/**
 * Champ de section. L'image d'alarme est toujours le chemin de l'interface externe.
 *
 * @param overrides - Libellé, valeur, type.
 */
export function makeField(overrides?: Partial<VideoField>): VideoField {
  return {
    id: createLocalId(),
    label: "",
    value: "",
    type: "normal",
    multiline: false,
    wrapAlarms: true,
    ...overrides,
    alarmImageSrc: ALARM_IMAGE_SRC
  };
}

/**
 * Lien supplémentaire sous le lien vidéo principal.
 *
 * @param overrides - URL et texte affiché.
 */
export function makeExtraLink(overrides?: Partial<ExtraLink>): ExtraLink {
  return { id: createLocalId(), url: "", text: "", ...overrides };
}

/**
 * Section ajoutée par l'opérateur (non verrouillée comme les deux sections d'origine).
 *
 * @param overrides - Titre, disposition, champs.
 */
export function makeSection(overrides?: Partial<VideoSection>): VideoSection {
  return {
    id: createLocalId(),
    title: "Section",
    layout: "inline",
    isDefault: false,
    collapsible: false,
    summaryText: DEFAULT_SUMMARY_TEXT,
    openByDefault: false,
    titleStyle: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.connexionTitle, size: 19 }),
    fields: [],
    ...overrides
  };
}

/** Styles globaux du rendu vidéo (lien, libellés, consigne, aide). */
export function defaultVideoStyles(): VideoStyles {
  return {
    link: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.link, size: 19, underline: true }),
    labels: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.labels, size: 16 }),
    notice: makeStyle({
      colorOn: true,
      colorValue: DEFAULT_STYLE_COLORS.notice,
      size: 18,
      bold: true,
      underline: false
    }),
    summary: makeStyle({
      colorOn: false,
      colorValue: DEFAULT_STYLE_COLORS.summary,
      size: 16,
      bold: false,
      underline: false
    }),
    bottomText: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.bottomText, size: 16 })
  };
}

/** Deux sections d'origine : informations diverses, puis connexion vidéo. */
export function defaultVideoSections(): VideoSection[] {
  return [
    makeSection({
      id: "sec_divers",
      title: "Informations diverses",
      layout: "inline",
      isDefault: true,
      titleStyle: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.diversTitle, size: 19 }),
      fields: [
        makeField({ label: "Code Inter", value: "" }),
        makeField({ label: "Consigne importante", value: "", type: "notice", wrapAlarms: true }),
        makeField({ label: "Info.", value: "", multiline: true })
      ]
    }),
    makeSection({
      id: "sec_connexion",
      title: "Information de connexion vidéo",
      layout: "list",
      isDefault: true,
      titleStyle: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.connexionTitle, size: 19 }),
      fields: [
        makeField({ label: "Adresse IP", value: "" }),
        makeField({ label: "Port", value: "" }),
        makeField({ label: "Identifiant", value: "" }),
        makeField({ label: "Mot de passe", value: "" }),
        makeField({ label: "Autre information", value: "" })
      ]
    })
  ];
}

/** Document vide, équivalent à une réinitialisation. */
export function defaultVideoRemarkDocument(): VideoRemarkDocument {
  return {
    siteName: "",
    spacing: 0,
    video: {
      url: "",
      linkText: DEFAULT_LINK_TEXT,
      extraLinks: [],
      includeVideoLink: true,
      includeFooterHelp: true,
      sections: defaultVideoSections(),
      styles: defaultVideoStyles()
    }
  };
}

/**
 * Remet les styles par défaut. Les titres de section repassent au bleu de connexion,
 * comme le bouton « Réinitialiser » de la mise en forme d'origine.
 *
 * @param doc - Document courant.
 */
export function resetVideoStyles(doc: VideoRemarkDocument): VideoRemarkDocument {
  return {
    ...doc,
    video: {
      ...doc.video,
      styles: defaultVideoStyles(),
      sections: doc.video.sections.map((section) => ({
        ...section,
        titleStyle: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.connexionTitle, size: 19 })
      }))
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeFields(rawFields: unknown): VideoField[] {
  const fields = Array.isArray(rawFields) ? [...rawFields] : [];
  if (fields.some((field) => isRecord(field) && typeof field.position === "number")) {
    fields.sort((a, b) => {
      const left = isRecord(a) && typeof a.position === "number" ? a.position : 999;
      const right = isRecord(b) && typeof b.position === "number" ? b.position : 999;
      return left - right;
    });
  }
  return fields.filter(isRecord).map((field) => {
    const label = String(field.label || "");
    const type = field.type === "notice" ? "notice" : "normal";
    return makeField({
      id: String(field.id || createLocalId()),
      label,
      value: String(field.value || ""),
      type,
      multiline: Boolean(field.multiline || (/^info\.?$/i.test(label) && type !== "notice")),
      wrapAlarms: field.wrapAlarms !== false
    });
  });
}

function normalizeSections(rawSections: unknown): VideoSection[] {
  const sections = Array.isArray(rawSections) ? rawSections.filter(isRecord) : [];
  const kept = sections.filter((section) => section.layout !== "richtext");
  if (!kept.length) return defaultVideoSections();
  return kept.map((section) => {
    const isDefault = Boolean(section.isDefault);
    return makeSection({
      id: String(section.id || createLocalId()),
      title: String(section.title || "Section"),
      layout: section.layout === "list" ? "list" : "inline",
      isDefault,
      collapsible: isDefault ? false : Boolean(section.collapsible),
      summaryText: String(section.summaryText || DEFAULT_SUMMARY_TEXT),
      openByDefault: isDefault ? false : Boolean(section.openByDefault),
      titleStyle: makeStyle(
        isRecord(section.titleStyle) ? (section.titleStyle as Partial<TextStyle>) : {
          colorOn: true,
          colorValue: DEFAULT_STYLE_COLORS.connexionTitle,
          size: 19
        }
      ),
      fields: normalizeFields(section.fields)
    });
  });
}

function normalizeStyles(raw: unknown): VideoStyles {
  const styles = isRecord(raw) ? raw : {};
  const base = defaultVideoStyles();
  (Object.keys(base) as (keyof VideoStyles)[]).forEach((key) => {
    if (isRecord(styles[key])) base[key] = makeStyle(styles[key] as Partial<TextStyle>);
  });
  return base;
}

function normalizeExtraLinks(raw: unknown): ExtraLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((link) =>
    makeExtraLink({
      id: String(link.id || createLocalId()),
      url: String(link.url || ""),
      text: String(link.text || "")
    })
  );
}

/**
 * Accepte un export du générateur HTML (onglet vidéo ou ancien format à plat).
 * Le texte libre est ignoré. Le chemin d'image est forcé.
 *
 * @param raw - JSON parsé.
 */
export function normalizeVideoRemarkDocument(raw: unknown): VideoRemarkDocument {
  const data = isRecord(raw) ? raw : {};
  const nested = isRecord(data.video) ? data.video : null;
  const source = nested || data;
  const sections = normalizeSections(source.sections);
  const divers = sections.find((section) => section.id === "sec_divers");
  if (divers && !divers.fields.some((field) => field.type === "notice")) {
    const codeIdx = divers.fields.findIndex((field) => /code inter/i.test(field.label));
    const notice = makeField({ label: "Consigne importante", value: "", type: "notice", wrapAlarms: true });
    if (codeIdx !== -1) divers.fields.splice(codeIdx + 1, 0, notice);
    else divers.fields.unshift(notice);
  }
  return {
    siteName: String(data.siteName || ""),
    spacing: 0,
    video: {
      url: String(source.url || ""),
      linkText: String(source.linkText || DEFAULT_LINK_TEXT),
      extraLinks: normalizeExtraLinks(source.extraLinks),
      includeVideoLink: source.includeVideoLink !== false,
      includeFooterHelp: source.includeFooterHelp !== false,
      sections,
      styles: normalizeStyles(source.styles)
    }
  };
}

/**
 * Brouillon du poste : document de saisie, site lié et date du dernier instantané connu.
 */
export type VideoRemarkLocalDraft = {
  siteId: string | null;
  snapshotUpdatedAt: string | null;
  document: VideoRemarkDocument;
};

function emptyLocalDraft(): VideoRemarkLocalDraft {
  return { siteId: null, snapshotUpdatedAt: null, document: defaultVideoRemarkDocument() };
}

/**
 * Relit le brouillon du poste. Repli sur un document vide si le JSON est illisible.
 * Accepte l'ancien format (document seul) et le format avec site lié.
 *
 * @returns Brouillon local, jamais `null`.
 */
export function loadVideoRemarkDraft(): VideoRemarkLocalDraft {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyLocalDraft();
    const parsed = JSON.parse(saved) as unknown;
    if (isRecord(parsed) && isRecord(parsed.document)) {
      const siteId = typeof parsed.siteId === "string" && parsed.siteId.trim() ? parsed.siteId.trim() : null;
      const snapshotUpdatedAt =
        typeof parsed.snapshotUpdatedAt === "string" && parsed.snapshotUpdatedAt ? parsed.snapshotUpdatedAt : null;
      return { siteId, snapshotUpdatedAt, document: normalizeVideoRemarkDocument(parsed.document) };
    }
    return { siteId: null, snapshotUpdatedAt: null, document: normalizeVideoRemarkDocument(parsed) };
  } catch {
    return emptyLocalDraft();
  }
}

/**
 * Enregistre le brouillon sur le poste. L'instantané en base est un geste séparé.
 *
 * @param draft - Document, site lié et date d'instantané connue.
 */
export function saveVideoRemarkDraft(draft: VideoRemarkLocalDraft): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      siteId: draft.siteId,
      snapshotUpdatedAt: draft.snapshotUpdatedAt,
      document: draft.document
    })
  );
}

/**
 * Nom de fichier d'export, à partir du nom de site saisi.
 *
 * @param siteName - Nom libre, peut être vide.
 */
export function buildExportFileName(siteName: string): string {
  const site = String(siteName)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const date = new Date().toISOString().slice(0, 10);
  return site ? `${site}-remarques-${date}.json` : `generateur-remarques-${date}.json`;
}

/**
 * Déplace un élément d'un cran. Retourne la même liste si le déplacement est impossible.
 *
 * @param items - Liste source.
 * @param index - Index courant.
 * @param direction - -1 monter, +1 descendre.
 */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = items.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(nextIndex, 0, item);
  return copy;
}
