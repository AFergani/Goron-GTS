/**
 * Image d'alarme du HTML collé dans l'interface de télésurveillance.
 *
 * Ce n'est pas un fichier de Goron-GTS : l'autre interface résout ce chemin relatif.
 * Ne pas le remplacer par une URL absolue, un asset local, ni un autre nom de fichier.
 */

export const ALARM_IMAGE_SRC = "jsp/bandeau/themes/default/alarme/images/bandeau/alarme_orange.png";

/**
 * Balise image telle que l'attend l'interface externe (sans alt, sans balise fermante).
 *
 * @returns Fragment HTML prêt à coller.
 */
export function alarmImageTag(): string {
  return `<img src="${ALARM_IMAGE_SRC}" width="24" height="24">`;
}
