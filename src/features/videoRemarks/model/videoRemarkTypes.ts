/**
 * Document du générateur de remarques vidéo.
 *
 * Le HTML produit est collé dans une autre interface, qui résout elle-même
 * l'image d'alarme. Le chemin ne doit pas être réécrit.
 * L'instantané en base est lié au site, pas à ce type.
 */

/** Mise en forme inline d'un fragment HTML. */
export type TextStyle = {
  colorOn: boolean;
  colorValue: string;
  bgOn: boolean;
  bgValue: string;
  /** Taille du texte en pixels. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type FieldType = "normal" | "notice";
export type SectionLayout = "inline" | "list";

export type VideoField = {
  id: string;
  label: string;
  value: string;
  type: FieldType;
  multiline: boolean;
  wrapAlarms: boolean;
  alarmImageSrc: string;
};

export type VideoSection = {
  id: string;
  title: string;
  layout: SectionLayout;
  isDefault: boolean;
  collapsible: boolean;
  summaryText: string;
  openByDefault: boolean;
  titleStyle: TextStyle;
  fields: VideoField[];
};

export type VideoStyles = {
  link: TextStyle;
  labels: TextStyle;
  notice: TextStyle;
  summary: TextStyle;
  bottomText: TextStyle;
};

export type ExtraLink = {
  id: string;
  url: string;
  text: string;
};

export type VideoRemarkDocument = {
  siteName: string;
  /** Toujours 0 : rendu compact, comme le générateur d'origine. */
  spacing: 0;
  video: {
    url: string;
    linkText: string;
    extraLinks: ExtraLink[];
    includeVideoLink: boolean;
    includeFooterHelp: boolean;
    sections: VideoSection[];
    styles: VideoStyles;
  };
};
