import type { Session } from "../../../app/session/SessionProvider";
import type { User } from "../../../types";
import { KeyRound, LockOpen, Pencil, UserX } from "lucide-react";
import { canSessionResetPasswordOrUnlockForUser } from "../model/userHierarchy";

type UsersTableProps = {
  users: User[];
  activeUsernames: string[];
  onDeleteUser: (username: string) => void;
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
  onDeleteUser,
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

  function formatManagerProfile(user: User) {
    if (user.role !== "RESPONSABLE") return "-";
    if (user.managerProfile === "SUPERVISEUR") return "Superviseur";
    if (user.managerProfile === "RESPONSABLE_STATION") return "Responsable de station";
    if (user.managerProfile === "DIRECTEUR_STATION") return "Directeur de station";
    return "-";
  }

  function canActOnUser(target: User): boolean {
    return Boolean(session && canSessionResetPasswordOrUnlockForUser(session, target));
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Nom</th>
          <th>Rôle</th>
          <th>Profil</th>
          <th>Statut</th>
          <th>Désactivé le</th>
          <th>Dernière mise à jour</th>
          <th>Par</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const isOnline = u.isActive && activeSet.has(u.fullName.toLowerCase());
          const canAct = canActOnUser(u);
          return (
            <tr key={u.id}>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {isOnline && (
                    <span
                      title="Connecté"
                      aria-label="Connecté"
                      style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }}
                    />
                  )}
                  {u.fullName}
                </span>
              </td>
              <td>{formatRole(u.role)}</td>
              <td>{formatManagerProfile(u)}</td>
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
                          onClick={() => onDeleteUser(u.username)}
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
