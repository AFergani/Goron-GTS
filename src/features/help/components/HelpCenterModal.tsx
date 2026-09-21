/**
 * Modale « Centre d’aide » : navigation latérale + contenu rubrique.
 *
 * Ouverte depuis `AppShell` (bouton aide sidebar ou lien contextuel `initialTopicId`).
 * Rubriques filtrées par `HelpAccessContext` ; en-tête déplaçable (classe CSS globale modales).
 * En `connectionOnly` (base injoignable), les autres rubriques restent visibles mais grisées.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useModalEscape } from "../../common/hooks/useModalEscape";
import { isHelpTopicAllowed } from "../model/helpAccess";
import {
  buildHelpNavigation,
  OFFLINE_CONNECTION_HELP_TOPIC_ID,
  resolveHelpTopicId,
  type HelpAccessContext,
  type HelpTopicId
} from "../model/helpTopics";
import { renderHelpTopicBody } from "../content/renderHelpTopicBody";
import "../helpCenter.css";

type HelpCenterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  access: HelpAccessContext;
  /** Rubrique à afficher à l&apos;ouverture (ex. depuis un bouton ? contextuel). Ignoré si non autorisée pour le profil. */
  initialTopicId: HelpTopicId | null;
};

/**
 * Choisit la rubrique d'ouverture : lien contextuel si autorisé, sinon accueil.
 *
 * @param requested - Rubrique demandée (peut être nulle).
 * @param navIds - Identifiants présents dans la sidebar.
 * @param access - Droits du profil (ou mode hors session).
 * @returns Rubrique à afficher.
 */
function resolveInitialTopic(
  requested: HelpTopicId | null,
  navIds: Set<HelpTopicId>,
  access: HelpAccessContext
): HelpTopicId {
  if (access.connectionOnly) return OFFLINE_CONNECTION_HELP_TOPIC_ID;
  const mapped = resolveHelpTopicId(requested);
  if (mapped && navIds.has(mapped) && isHelpTopicAllowed(mapped, access)) return mapped;
  return "welcome";
}

/**
 * Classe CSS d'un bouton de rubrique (actif, grisé hors session, ou défaut).
 *
 * @param itemId - Rubrique du bouton.
 * @param selectedTopicId - Rubrique actuellement affichée.
 * @param lockedOut - Vrai si la rubrique est visible mais non sélectionnable.
 * @returns Classes CSS du bouton.
 */
function helpNavItemClassName(itemId: HelpTopicId, selectedTopicId: HelpTopicId, lockedOut: boolean): string {
  const classes = ["help-center-nav-item"];
  if (selectedTopicId === itemId) classes.push("help-center-nav-item--active");
  if (lockedOut) classes.push("help-center-nav-item--disabled");
  return classes.join(" ");
}

export function HelpCenterModal({ isOpen, onClose, access, initialTopicId }: HelpCenterModalProps) {
  const navItems = useMemo(() => buildHelpNavigation(access), [access]);
  const navIdSet = useMemo(() => new Set(navItems.map((i) => i.id)), [navItems]);
  const connectionOnly = Boolean(access.connectionOnly);

  const [selectedTopicId, setSelectedTopicId] = useState<HelpTopicId>(() =>
    access.connectionOnly ? OFFLINE_CONNECTION_HELP_TOPIC_ID : "welcome"
  );

  const helpCenterWasOpenRef = useRef(false);

  useModalEscape(isOpen, onClose);

  useEffect(() => {
    if (isOpen && !helpCenterWasOpenRef.current) {
      setSelectedTopicId(resolveInitialTopic(initialTopicId, navIdSet, access));
    }
    helpCenterWasOpenRef.current = isOpen;
  }, [isOpen, initialTopicId, navIdSet, access]);

  if (!isOpen) return null;

  const topicToRender = connectionOnly
    ? OFFLINE_CONNECTION_HELP_TOPIC_ID
    : navIdSet.has(selectedTopicId) && isHelpTopicAllowed(selectedTopicId, access)
      ? selectedTopicId
      : "welcome";

  return (
    <div className="modal-overlay help-center-overlay" role="presentation" onClick={onClose}>
      <section
        className="modal help-center-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mc-modal-head help-center-modal-head">
          <h3 id="help-center-title" className="mc-modal-title">
            Centre d&apos;aide
          </h3>
          <button type="button" className="mc-modal-close" aria-label="Fermer le centre d'aide" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="help-center-layout">
          <aside className="help-center-sidebar" aria-label="Rubriques du centre d'aide">
            <p className="help-center-sidebar-title">Rubriques</p>
            <nav className="help-center-nav app-scrollbar" aria-label="Liste des rubriques">
              {navItems.map((item) => {
                const lockedOut = connectionOnly && item.id !== OFFLINE_CONNECTION_HELP_TOPIC_ID;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={helpNavItemClassName(item.id, selectedTopicId, lockedOut)}
                    disabled={lockedOut}
                    aria-disabled={lockedOut || undefined}
                    title={lockedOut ? "Rubrique indisponible tant que la base n'est pas accessible" : undefined}
                    onClick={() => {
                      if (lockedOut) return;
                      setSelectedTopicId(item.id);
                    }}
                  >
                    <span className="help-center-nav-emoji" aria-hidden>
                      {item.emoji}
                    </span>
                    <span className="help-center-nav-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="help-center-sidebar-footer">
              <button type="button" className="btn-light help-center-close-sidebar" onClick={onClose}>
                Fermer
              </button>
            </div>
          </aside>
          <div className="help-center-main app-scrollbar">{renderHelpTopicBody(topicToRender, access)}</div>
        </div>
      </section>
    </div>
  );
}
