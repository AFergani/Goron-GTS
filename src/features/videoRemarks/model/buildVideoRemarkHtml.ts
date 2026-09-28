/**
 * Construit le HTML de remarque vidéo, à coller dans l'interface de télésurveillance.
 *
 * Reprend le rendu de l'onglet vidéo du générateur d'origine (espacement compact).
 * L'image d'alarme reste le chemin relatif `ALARM_IMAGE_SRC`.
 */

import { alarmImageTag } from "./alarmImage";
import { DEFAULT_LINK_TEXT, DEFAULT_SUMMARY_TEXT } from "./videoRemarkDocument";
import type { TextStyle, VideoField, VideoRemarkDocument, VideoSection, VideoStyles } from "./videoRemarkTypes";

/**
 * Échappe le texte inséré dans le HTML généré.
 *
 * @param text - Texte saisi.
 */
function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Détecte un fragment HTML déjà balisé (image insérée, par exemple).
 *
 * @param value - Valeur du champ.
 */
function containsHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Style CSS inline d'un bloc de mise en forme.
 *
 * @param style - Style du générateur.
 */
function inlineStyle(style: TextStyle): string {
  const css = [];
  if (style.colorOn) css.push(`color: ${style.colorValue}`);
  if (style.bgOn) css.push(`background-color: ${style.bgValue}`);
  css.push(`font-size: ${style.size}px`);
  css.push(`font-weight: ${style.bold ? "bold" : "normal"}`);
  if (style.italic) css.push("font-style: italic");
  css.push(`text-decoration: ${style.underline ? "underline" : "none"}`);
  return css.join("; ");
}

function styledSpan(text: string, style: TextStyle): string {
  return `<span style="${inlineStyle(style)}">${text}</span>`;
}

function collapseBreaks(text: string): string {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]*\n+/g, "\n")
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/^\n+|\n+$/g, "");
}

function renderFieldValue(field: VideoField): string {
  if (containsHtml(field.value)) return collapseBreaks(field.value);
  const text = escapeHtml(collapseBreaks(field.value));
  return field.multiline ? text.split("\n").join("<br>") : text;
}

function renderNoticeHtml(field: VideoField, styles: VideoStyles): string {
  const img = alarmImageTag();
  let inner: string;
  if (containsHtml(field.value)) inner = field.value;
  else if (field.wrapAlarms) inner = `${img} ${escapeHtml(field.value)} ${img}`;
  else inner = escapeHtml(field.value);
  return `<strong style="${inlineStyle(styles.notice)}"> ${inner} </strong>`;
}

function renderFieldHtml(field: VideoField, styles: VideoStyles): string {
  if (field.type === "notice") return renderNoticeHtml(field, styles);
  return `${styledSpan(`${escapeHtml(field.label)} :`, styles.labels)} ${renderFieldValue(field)}`;
}

function renderSectionBodyHtml(section: VideoSection, items: VideoField[], styles: VideoStyles): string {
  if (section.layout === "list") {
    return items.map((field) => `• ${renderFieldHtml(field, styles)}`).join("<br>\n");
  }
  return items.map((field) => renderFieldHtml(field, styles)).join("<br>\n");
}

function renderSectionTitleHtml(section: VideoSection): string {
  return styledSpan(`${escapeHtml(section.title)} :`, section.titleStyle);
}

function sectionOuterStyle(): string {
  return "margin: 0; padding: 0; color: #000000; line-height: 1.15";
}

function renderSectionHtml(
  section: VideoSection,
  styles: VideoStyles,
  options: { prependLinkHtml?: string; appendFooterHtml?: string } = {}
): string {
  const outer = sectionOuterStyle();
  const items = section.fields.filter((field) => field.value.trim() !== "");
  const hasBody = items.length > 0;
  const prepend = options.prependLinkHtml ? `${options.prependLinkHtml}<br>\n` : "";
  const append = options.appendFooterHtml || "";

  if (!section.collapsible) {
    const titlePart = renderSectionTitleHtml(section);
    if (!hasBody && !prepend && !append) return `<div style="${outer};">${titlePart}</div>`;
    let inner = prepend;
    inner += hasBody ? `${titlePart}<br>\n${renderSectionBodyHtml(section, items, styles)}` : titlePart;
    inner += append;
    return `<div style="${outer};">${inner}\n</div>`;
  }

  const titlePart = renderSectionTitleHtml(section);
  if (!hasBody) return `<div style="${outer};">${titlePart}</div>`;
  const summaryStyle = `${inlineStyle(styles.summary)}; cursor: pointer; margin: 0; padding: 0`;
  const openAttr = section.openByDefault ? " open" : "";
  const detailsBlock = `<details${openAttr} style="margin: 0; padding: 0;">\n    <summary style="${summaryStyle}">${escapeHtml(section.summaryText || DEFAULT_SUMMARY_TEXT)}</summary>\n${renderSectionBodyHtml(section, items, styles)}\n</details>`;
  return `<div style="${outer};">${titlePart}${detailsBlock}</div>`;
}

function linkAnchor(url: string, text: string, linkStyle: TextStyle): string {
  return `<a href="${escapeHtml(url)}" onclick="window.open(this.href, '_blank', 'width=1000,height=800'); return false;" style="${inlineStyle(linkStyle)}">${escapeHtml(text)}</a>`;
}

function extraLinksHtml(doc: VideoRemarkDocument): string {
  return doc.video.extraLinks
    .filter((link) => (link.url || "").trim() !== "")
    .map((link) => linkAnchor(link.url.trim(), (link.text || "").trim() || link.url.trim(), doc.video.styles.link))
    .join("<br>\n");
}

function linksHtmlFragment(doc: VideoRemarkDocument): string {
  const extra = extraLinksHtml(doc);
  const primary = linkAnchor(doc.video.url, doc.video.linkText || DEFAULT_LINK_TEXT, doc.video.styles.link);
  return extra ? `${primary}<br>\n${extra}` : primary;
}

function footerUrlLines(doc: VideoRemarkDocument): string[] {
  const extras = doc.video.extraLinks.map((link) => (link.url || "").trim()).filter(Boolean);
  if (!(doc.video.url || "").trim() && extras.length) return extras;
  return [doc.video.url || "", ...extras];
}

function footerHtmlFragment(doc: VideoRemarkDocument): string {
  const helpText = styledSpan(
    "Si le lien ne fonctionne pas, copiez l'adresse ci-dessous et collez-la dans le navigateur :",
    doc.video.styles.bottomText
  );
  const urls = footerUrlLines(doc)
    .map((url) => escapeHtml(url))
    .join("<br>\n");
  return `<br>\n${helpText}<br>\n${urls}`;
}

function getConnexionIdx(sections: VideoSection[]): number {
  const byId = sections.findIndex((section) => section.id === "sec_connexion");
  if (byId >= 0) return byId;
  return sections.findIndex((section) => section.isDefault && section.layout === "list");
}

function getFooterIdx(sections: VideoSection[]): number {
  const byId = sections.findIndex((section) => section.id === "sec_connexion");
  if (byId >= 0) return byId;
  let last = -1;
  sections.forEach((section, index) => {
    if (section.isDefault) last = index;
  });
  return last;
}

/**
 * HTML complet de la remarque vidéo, prêt à copier.
 *
 * @param doc - Document saisi.
 * @returns Fragment HTML (sans document englobant).
 */
export function buildVideoRemarkHtml(doc: VideoRemarkDocument): string {
  const sections = doc.video.sections;
  const parts: string[] = [];
  let linkRendered = false;
  let footerRendered = false;
  const connexionIdx = getConnexionIdx(sections);
  const footerIdx = getFooterIdx(sections);
  const groupBlock = connexionIdx >= 0;

  sections.forEach((section, index) => {
    const isConnexion = index === connexionIdx;
    const options: { prependLinkHtml?: string; appendFooterHtml?: string } = {};
    if (groupBlock && isConnexion) {
      if (doc.video.includeVideoLink) {
        options.prependLinkHtml = linksHtmlFragment(doc);
        linkRendered = true;
      }
      if (doc.video.includeFooterHelp && index === footerIdx) {
        options.appendFooterHtml = footerHtmlFragment(doc);
        footerRendered = true;
      }
    }
    const html = renderSectionHtml(section, doc.video.styles, options);
    if (html) parts.push(html);
    if (doc.video.includeFooterHelp && !footerRendered && index === footerIdx) {
      parts.push(`<div style="margin: 0; padding: 0; line-height: 1.15;">${footerHtmlFragment(doc).replace(/^<br>\n/, "")}</div>`);
      footerRendered = true;
    }
  });
  if (doc.video.includeVideoLink && !linkRendered) {
    parts.push(`<div style="margin: 0; padding: 0; line-height: 1.15;">${linksHtmlFragment(doc)}</div>`);
  }
  if (doc.video.includeFooterHelp && !footerRendered) {
    parts.push(`<div style="margin: 0; padding: 0; line-height: 1.15;">${footerHtmlFragment(doc).replace(/^<br>\n/, "")}</div>`);
  }
  return parts.join("\n");
}

/**
 * Document HTML de l'aperçu, toujours sur fond blanc.
 *
 * @param html - Fragment généré.
 */
export function buildPreviewDocument(html: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Segoe UI,sans-serif;padding:14px;margin:0;background:#ffffff;">${html}</body></html>`;
}
