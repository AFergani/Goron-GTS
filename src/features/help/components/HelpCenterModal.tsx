/**
 * Modale « Centre d’aide » : navigation latérale + contenu rubrique.
 *
 * Ouverte depuis `AppShell` (bouton aide sidebar ou lien contextuel `initialTopicId`).
 * Rubriques filtrées par `HelpAccessContext` ; en-tête déplaçable (classe CSS globale modales).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { isHelpTopicAllowed } from "../model/helpAccess";
import { buildHelpNavigation, resolveHelpTopicId, type HelpAccessContext, type HelpNavItem, type HelpTopicId } from "../model/helpTopics";
import { renderHelpTopicBody } from "../content/renderHelpTopicBody";
import "../helpCenter.css";

type HelpCenterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  access: HelpAccessContext;
  /** Rubrique à afficher à l&apos;ouverture (ex. depuis un bouton ? contextuel). Ignoré si non autorisée pour le profil. */
  initialTopicId: HelpTopicId | null;
};

function resolveInitialTopic(
  requested: HelpTopicId | null,
  navIds: Set<HelpTopicId>,
  access: HelpAccessContext
): HelpTopicId {
  const mapped = resolveHelpTopicId(requested);
  if (mapped && navIds.has(mapped) && isHelpTopicAllowed(mapped, access)) return mapped;
  return "welcome";
}

export function HelpCenterModal({ isOpen, onClose, access, initialTopicId }: HelpCenterModalProps) {
  const navItems = useMemo(() => buildHelpNavigation(access), [access]);
  const navIdSet = useMemo(() => new Set(navItems.map((i) => i.id)), [navItems]);

  const [selectedTopicId, setSelectedTopicId] = useState<HelpTopicId>("welcome");

  const helpCenterWasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !helpCenterWasOpenRef.current) {
      setSelectedTopicId(resolveInitialTopic(initialTopicId, navIdSet, access));
    }
    helpCenterWasOpenRef.current = isOpen;
  }, [isOpen, initialTopicId, navIdSet, access]);

  if (!isOpen) return null;

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
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selectedTopicId === item.id ? "help-center-nav-item help-center-nav-item--active" : "help-center-nav-item"}
                  onClick={() => setSelectedTopicId(item.id)}
                >
                  <span className="help-center-nav-emoji" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="help-center-nav-label">{item.label}</span>
                </button>
              ))}
            </nav>
            <div className="help-center-sidebar-footer">
              <button type="button" className="btn-light help-center-close-sidebar" onClick={onClose}>
                Fermer
              </button>
            </div>
          </aside>
          <div className="help-center-main app-scrollbar">
            {renderHelpTopicBody(
              navIdSet.has(selectedTopicId) && isHelpTopicAllowed(selectedTopicId, access) ? selectedTopicId : "welcome",
              access
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
