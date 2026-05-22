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
