/**
 * Champ mot de passe avec bascule affichage (icône œil Lucide).
 *
 * Réutilisé sur login, première connexion et formulaires techniques.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./PasswordInput.css";

type PasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  id?: string;
  placeholder?: string;
  /** Libellé accessible du champ (transmis à l’input via aria-label si fourni). */
  "aria-label"?: string;
};

/**
 * Input password + bouton icône pour afficher / masquer la saisie.
 */
export function PasswordInput({
  value,
  onChange,
  disabled = false,
  required = false,
  autoComplete = "current-password",
  id,
  placeholder,
  "aria-label": ariaLabel
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-row">
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="btn-light action-icon-btn password-input-toggle"
        disabled={disabled}
        aria-pressed={visible}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}
