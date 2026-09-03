/**
 * Types du module authentification (formulaires connexion et premier mot de passe).
 *
 * Les identifiants de connexion réutilisent `LoginPayload` de `src/types.ts` ;
 * ce fichier nomme les états locaux des vues et du presenter auth.
 */

import type { LoginPayload } from "../../../types";

/** État du formulaire de connexion (nom affiché + mot de passe). */
export type LoginFormState = LoginPayload;

/** État de la modale de définition du mot de passe définitif (première connexion). */
export type PasswordUpdateFormState = {
  newPassword: string;
  confirmPassword: string;
};

/**
 * État de la modale « mot de passe oublié », validée par un collègue présent.
 * Le nom affiché servant d'identifiant est public : c'est le collègue qui atteste
 * de la légitimité de la demande, en s'authentifiant lui-même.
 */
export type PeerResetFormState = {
  fullName: string;
  validatorFullName: string;
  validatorPassword: string;
  reason: string;
};
