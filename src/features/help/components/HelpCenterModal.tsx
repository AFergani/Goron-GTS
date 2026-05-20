import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SETTINGS_DATA_SECTION_CHILD_IDS,
  buildHelpNavigation,
  filterNavItemsForCollapsedParents,
  type HelpAccessContext,
  type HelpNavItem,
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

function resolveInitialTopic(requested: HelpTopicId | null, navIds: Set<HelpTopicId>): HelpTopicId {
  if (requested && navIds.has(requested)) return requested;
  return "welcome";
}

function navItemPaddingLeft(item: HelpNavItem): number {
  return 12 + item.depth * 14;
}

export function HelpCenterModal({ isOpen, onClose, access, initialTopicId }: HelpCenterModalProps) {
  const navItems = useMemo(() => buildHelpNavigation(access), [access]);
  const navIdSet = useMemo(() => new Set(navItems.map((i) => i.id)), [navItems]);

  const [selectedTopicId, setSelectedTopicId] = useState<HelpTopicId>("welcome");
  /** Par défaut « Gestion des données » repliée pour alléger la liste. */
  const [expandedSections, setExpandedSections] = useState<Partial<Record<HelpTopicId, boolean>>>({
    "settings-data": false
  });

  const visibleNavItems = useMemo(
    () => filterNavItemsForCollapsedParents(navItems, expandedSections),
    [navItems, expandedSections]
  );

  /** Ne resynchroniser la rubrique qu'à l'ouverture : sinon tout re-render parent relance l'effet et revient à l'accueil. */
  const helpCenterWasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !helpCenterWasOpenRef.current) {
      setSelectedTopicId(resolveInitialTopic(initialTopicId, navIdSet));
    }
    helpCenterWasOpenRef.current = isOpen;
  }, [isOpen, initialTopicId, navIdSet]);

  /** Déplie « Données » uniquement à l'ouverture si la cible est un sous-onglet. */
  const expandDataSectionOnceRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      expandDataSectionOnceRef.current = false;
      return;
    }
    if (!initialTopicId || expandDataSectionOnceRef.current) return;
    if (SETTINGS_DATA_SECTION_CHILD_IDS.includes(initialTopicId)) {
      setExpandedSections((prev) => ({ ...prev, "settings-data": true }));
      expandDataSectionOnceRef.current = true;
    }
  }, [isOpen, initialTopicId]);

  if (!isOpen) return null;

  const dataSectionOpen = expandedSections["settings-data"] === true;

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
              {visibleNavItems.map((item) => {
                if (item.id === "settings-data") {
                  return (
                    <div key={item.id} className="help-center-nav-parent-row">
                      <button
                        type="button"
                        className="help-center-nav-chevron"
                        aria-expanded={dataSectionOpen}
                        aria-label={
                          dataSectionOpen
                            ? "Replier les sous-rubriques sous Gestion des données"
                            : "Déplier les sous-rubriques sous Gestion des données"
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          setExpandedSections((prev) => ({
                            ...prev,
                            "settings-data": !prev["settings-data"]
                          }));
                        }}
                      >
                        <ChevronRight
                          size={18}
                          aria-hidden
                          className={
                            dataSectionOpen
                              ? "help-center-nav-chevron-icon help-center-nav-chevron-icon--open"
                              : "help-center-nav-chevron-icon"
                          }
                        />
                      </button>
                      <button
                        type="button"
                        className={
                          selectedTopicId === item.id
                            ? "help-center-nav-item help-center-nav-item--active help-center-nav-item--in-parent"
                            : "help-center-nav-item help-center-nav-item--in-parent"
                        }
                        style={{ paddingLeft: navItemPaddingLeft(item) }}
                        onClick={() => setSelectedTopicId(item.id)}
                      >
                        <span className="help-center-nav-emoji" aria-hidden>
                          {item.emoji}
                        </span>
                        <span className="help-center-nav-label">{item.label}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      selectedTopicId === item.id
                        ? "help-center-nav-item help-center-nav-item--active"
                        : "help-center-nav-item"
                    }
                    style={{ paddingLeft: `${navItemPaddingLeft(item)}px` }}
                    onClick={() => setSelectedTopicId(item.id)}
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
          <div className="help-center-main app-scrollbar">{renderHelpTopicBody(selectedTopicId)}</div>
        </div>
      </section>
    </div>
  );
}
