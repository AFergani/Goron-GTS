/**
 * Logo GTS pour les écrans hors session (connexion, bootstrap PG, première connexion).
 *
 * Évite de recopier le même `img` dans `LoginView`, `PostgresBootstrapView` et `FirstLoginModal`.
 */

import logoGts from "../../../assets/logo-gts.png";

type AuthLogoProps = {
  /** Variante compacte (modale première connexion). */
  compact?: boolean;
};

/**
 * Marque GTS (image + classes CSS existantes `logo-slot` / `logo-image`).
 */
export function AuthLogo({ compact = false }: AuthLogoProps) {
  return (
    <div className={compact ? "logo-slot compact" : "logo-slot"}>
      <img src={logoGts} alt="Logo GTS" className={compact ? "logo-image compact" : "logo-image"} />
    </div>
  );
}
