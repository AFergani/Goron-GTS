/**
 * Filtre de période Du / Au (bornes inclusives) pour listes horodatées ISO.
 * Utilisé par le journal (applicatif / technique) et la liste des sauvegardes.
 */

/**
 * Indique si un horodatage est dans la période Du/Au.
 *
 * @param iso - Date ISO de la ligne.
 * @param dateFrom - `YYYY-MM-DD` ou vide.
 * @param dateTo - `YYYY-MM-DD` ou vide.
 */
export function matchesIsoDateRange(iso: string, dateFrom: string, dateTo: string): boolean {
  if (!dateFrom && !dateTo) return true;
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return false;
  const fromOk = !dateFrom || stamp >= new Date(`${dateFrom}T00:00:00`);
  const toOk = !dateTo || stamp <= new Date(`${dateTo}T23:59:59`);
  return fromOk && toOk;
}
