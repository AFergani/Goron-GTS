/**
 * Tableau utilisateurs (édition, MDP, déverrouillage, désactivation selon hiérarchie).
 */

import type { Session } from "../../../app/session/SessionProvider";
import type { User } from "../../../types";
import { KeyRound, LockOpen, Pencil, UserCheck, UserX } from "lucide-react";
import { canSessionResetPasswordOrUnlockForUser } from "../model/userHierarchy";

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
          <th>Profile</th>
          <th>Statut</th>
          <th>Désactivé le</th>
          <th>Dernière mise à jour</th>
          <th>Par</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          // Sessions = username technique ; présence partagée via PostgreSQL.
          const isOnline = u.isActive && activeSet.has(String(u.username || "").toLowerCase());
          const canAct = canActOnUser(u);
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
              <td>{formatRoleAndProfile(u)}</td>
              <td>
                {u.isLocked ? (
                  <span className="badge badge-danger" title={`Bloqué après ${u.failedLoginAttempts} tentatives`}>
                    Bloqué
                  </span>
                ) : u.isActive ? (
                  "Actif"
                ) : (
                  "Désactivé"
                )}
              </td>
              <td>{!u.isActive && u.updatedAt ? new Date(u.updatedAt).toLocaleString("fr-FR") : "-"}</td>
              <td>{u.updatedAt ? new Date(u.updatedAt).toLocaleString("fr-FR") : "-"}</td>
              <td>{u.updatedBy || "-"}</td>
              <td>
                {u.role !== "DEV" && u.isActive && (
                  <div className="row-actions">
                    {passwordDesk ? (
                      <>
                        {u.isLocked && canAct && (
                          <button
                            className="btn-light action-icon-btn"
                            title="Déverrouiller le compte"
                            aria-label="Déverrouiller"
                            onClick={() => onUnlockUser(u.username)}
                          >
                            <LockOpen size={14} />
                          </button>
                        )}
                        {canAct && onRequestPasswordReset ? (
                          <button
                            type="button"
                            className="btn-light action-icon-btn"
                            title="Réinitialiser le mot de passe"
                            aria-label="Réinitialiser le mot de passe"
                            onClick={() => onRequestPasswordReset(u)}
                          >
                            <KeyRound size={14} />
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {u.isLocked && canAct && (
                          <button
                            className="btn-light action-icon-btn"
                            title="Déverrouiller le compte"
                            aria-label="Déverrouiller"
                            onClick={() => onUnlockUser(u.username)}
                          >
                            <LockOpen size={14} />
                          </button>
                        )}
                        <button className="btn-light action-icon-btn" title="Modifier" aria-label="Modifier" onClick={() => onEditUser(u)}>
                          <Pencil size={14} />
                        </button>
                        <button
                          className="btn-danger action-icon-btn"
                          title="Désactiver"
                          aria-label="Désactiver"
                          onClick={() => onDeactivateUser(u)}
                        >
                          <UserX size={14} />
                        </button>
                        {canAct && onRequestPasswordReset ? (
                          <button
                            type="button"
                            className="btn-light action-icon-btn"
                            title="Réinitialiser le mot de passe"
                            aria-label="Réinitialiser le mot de passe"
                            onClick={() => onRequestPasswordReset(u)}
                          >
                            <KeyRound size={14} />
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
                {u.role !== "DEV" && !u.isActive && !passwordDesk && (
                  <div className="row-actions">
                    <button
                      className="btn-light action-icon-btn"
                      title="Réactiver"
                      aria-label="Réactiver"
                      onClick={() => onReactivateUser(u)}
                    >
                      <UserCheck size={14} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
