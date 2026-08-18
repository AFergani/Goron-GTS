/**
 * Helpers UI pour les types / motifs système (seed PG, non modifiables).
 * La source de vérité est le flag `isSystem` renvoyé par l'API.
 */

/**
 * Identifiant du type système à pré-sélectionner (anomalie ou motif de ronde).
 *
 * @param items - Liste référentielle
 * @returns Id du type système, sinon le premier, sinon chaîne vide
 */
export function getDefaultSystemRefId(items: Array<{ id: string; isSystem?: boolean }>): string {
  return items.find((item) => item.isSystem)?.id || items[0]?.id || "";
}
