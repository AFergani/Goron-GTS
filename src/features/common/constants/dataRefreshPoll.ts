/**
 * Intervalle unique de rafraîchissement des listes métier et des badges sidebar.
 *
 * Un écart (ex. 5 s vs 20 s) fait apparaître le badge avant le tableau :
 * l’opérateur croit que la liste ne se met pas à jour.
 */

/** Période de poll partagée (badges navigation + listes interventions / rondes / gardiennage / main courante). */
export const DATA_REFRESH_POLL_MS = 5000;
