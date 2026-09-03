/**
 * Tableau utilisateurs (édition, MDP, déverrouillage, désactivation selon hiérarchie).
 */

import type { Session } from "../../../app/session/SessionProvider";
import type { User } from "../../../types";
import { canSessionResetPasswordOrUnlockForUser } from "../model/userHierarchy";

/**
 * Bouton d'action de ligne. Masqué (`hidden`), il reste dans le flux pour réserver
 * son emplacement : la colonne Actions garde la même largeur d'une ligne à l'autre.
 */
function ActionButton({
  label,
  onClick,
  hidden = false,
  tone,
  className
}: {
  label: string;
  onClick: () => void;
  hidden?: boolean;
  tone?: "danger" | "validate";
  className?: string;
}) {
  const classes = [
    "table-action-btn",
    "table-action-btn--text",
    tone ? `table-action-btn--${tone}` : "",
    hidden ? "table-action-btn--placeholder" : "",
    className || ""
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      disabled={hidden}
      onClick={hidden ? undefined : onClick}
    >
      {label}
    </button>
  );
}

type UsersTableProps = {
  users: User[];
  activeUsernames: string[];
  onDeactivateUser: (user: User) => void;
  onReactivateUser: (user: User) => void;
  onEditUser: (user: User) => void;
  onUnlockUser: (username: string) => void;
  /** Réinitialisation MDP rapide (superviseur ou administrateurs selon hiérarchie). */
  onRequestPasswordReset?: (user: User) => void;
  session: Session | null;
  /** Superviseur : uniquement réinitialisation MDP / déverrouillage hiérarchiques. */
  variant?: "full" | "passwordDesk";
};

export function UsersTable({
  users,
  activeUsernames,
  onDeactivateUser,
  onReactivateUser,
  onEditUser,
  onUnlockUser,
  onRequestPasswordReset,
  session,
  variant = "full"
}: UsersTableProps) {
  const passwordDesk = variant === "passwordDesk";
  const activeSet = new Set(activeUsernames.map((n) => n.toLowerCase()));

  function formatRole(value: User["role"]) {
    if (value === "DEV") return "Admin";
    if (value === "RESPONSABLE") return "Responsable";
    return "Opérateur";
  }

  function formatManagerProfile(user: User): string | null {
    if (user.role !== "RESPONSABLE") return null;
    if (user.managerProfile === "SUPERVISEUR") return "Superviseur";
    if (user.managerProfile === "RESPONSABLE_STATION") return "Responsable de station";
    if (user.managerProfile === "DIRECTEUR_STATION") return "Directeur de station";
    return null;
  }

  /** Affiche « Rôle (Profil) » ; sans profil, uniquement le rôle (pas de parenthèses vides). */
  function formatRoleAndProfile(user: User) {
    const role = formatRole(user.role);
    const profile = formatManagerProfile(user);
    return profile ? `${role} (${profile})` : role;
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString("fr-FR");
  }

  /** Badge de statut du compte (même gabarit que les badges d'état métier). */
  function StatusBadge({ user }: { user: User }) {
    const { label, variant, title } = user.isLocked
      ? {
          label: "Bloqué",
          variant: "danger",
          title: `Bloqué après ${user.failedLoginAttempts} tentatives`
        }
      : user.isActive
        ? { label: "Actif", variant: "cloture", title: "Compte actif" }
        : { label: "Inactif", variant: "annule", title: "Compte désactivé" };
    return (
      <span className={`mc-status-badge mc-status-badge--${variant}`} title={title}>
        <span className="mc-status-badge__label">{label}</span>
      </span>
    );
  }

  function canActOnUser(target: User): boolean {
    return Boolean(session && canSessionResetPasswordOrUnlockForUser(session, target));
  }

  return (
    <table className="users-table">
      <thead>
        <tr>
          <th scope="col" className="users-table__col-presence" title="Connexion multi-postes">
            Connexion
          </th>
          <th>Nom</th>
          <th>Profil (statut)</th>
          <th>Dernière mise à jour</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          // Sessions = username technique ; présence partagée via PostgreSQL.
          const isOnline = u.isActive && activeSet.has(String(u.username || "").toLowerCase());
          const canAct = canActOnUser(u);
          // Le compte DEV n'est jamais administrable ; ses emplacements restent réservés.
          const manageable = u.role !== "DEV";
          return (
            <tr key={u.id}>
              <td className="users-table__col-presence">
                <span
                  className={`user-presence-dot ${isOnline ? "user-presence-dot--online" : "user-presence-dot--offline"}`}
                  title={isOnline ? "Connecté (tous postes)" : "Déconnecté"}
                  aria-label={isOnline ? "Connecté" : "Déconnecté"}
                  role="img"
                />
              </td>
              <td>{u.fullName}</td>
              <td>
                <div className="users-table__profile-cell">
                  <StatusBadge user={u} />
                  <span>{formatRoleAndProfile(u)}</span>
                </div>
              </td>
              <td>
                {u.updatedAt ? (
                  <>
                    {formatDateTime(u.updatedAt)}
                    {u.updatedBy ? <span className="muted"> ({u.updatedBy})</span> : null}
                  </>
                ) : (
                  "-"
                )}
              </td>
              <td className="users-table__col-actions">
                <div className="row-actions table-row-actions table-row-actions--text">
                  {!passwordDesk && (
                    <ActionButton
                      label="Modifier"
                      hidden={!manageable || !u.isActive}
                      onClick={() => onEditUser(u)}
                    />
                  )}
                  <ActionButton
                    label="Réinit. mot de passe"
                    hidden={!manageable || !u.isActive || !canAct || !onRequestPasswordReset}
                    onClick={() => onRequestPasswordReset?.(u)}
                  />
                  <ActionButton
                    label="Déverrouiller"
                    hidden={!manageable || !u.isActive || !u.isLocked || !canAct}
                    onClick={() => onUnlockUser(u.username)}
                  />
                  {!passwordDesk && (
                    <ActionButton
                      className="users-table__action-slot--activation"
                      label={u.isActive ? "Désactiver" : "Réactiver"}
                      tone={u.isActive ? "danger" : "validate"}
                      hidden={!manageable}
                      onClick={() => (u.isActive ? onDeactivateUser(u) : onReactivateUser(u))}
                    />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
