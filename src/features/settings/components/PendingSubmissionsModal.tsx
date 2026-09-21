/**
 * Modale des soumissions site / intervenant en attente.
 * Validation par dépliage inline (champs connus préremplis, données manquantes à saisir).
 */

import { useEffect, useState, Fragment } from "react";
import { ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { SiteDisplayCopyButton } from "../../common/components/SiteDisplayCopyButton";
import { DiscardConfirmModal } from "../../common/components/DiscardConfirmModal";
import { useCreateModalCloseGuard } from "../../common/hooks/useCreateModalCloseGuard";
import { useTableSort } from "../../common/hooks/useTableSort";
import type { PendingIntervenant, PendingSite } from "../../common/model/pendingRefs.types";
import type { NotifyToast } from "../../common/model/toast.types";
import { compareTextFr, tableSortArrow, type OpenDeleteReasonModal, type SyncOrAsync } from "./dataTabs/common";

type PendingSubmissionsModalProps = {
  kind: "sites" | "intervenants";
  pendingSites: PendingSite[];
  pendingIntervenants: PendingIntervenant[];
  onClose: () => void;
  onResolveSite: (payload: { pendingId: string; parc: string; famille: string }) => SyncOrAsync;
  onResolveIntervenant: (payload: { pendingId: string; name: string }) => SyncOrAsync;
  onDeleteSiteSubmission: (payload: { pendingId: string; reason: string }) => SyncOrAsync;
  onDeleteIntervenantSubmission: (payload: { pendingId: string; reason: string }) => SyncOrAsync;
  openDeleteReasonModal: OpenDeleteReasonModal;
  onNotify?: NotifyToast;
};

type PendingSortKey = "label" | "createdBy" | "createdAt";

type SiteDraft = { parc: string; famille: string };
type IntervenantDraft = { name: string };

export function PendingSubmissionsModal(props: PendingSubmissionsModalProps) {
  const isSites = props.kind === "sites";
  const items = isSites ? props.pendingSites : props.pendingIntervenants;
  const title = isSites ? "Sites en attente de validation" : "Intervenants en attente de validation";
  const emptyLabel = isSites ? "Aucun site en attente." : "Aucun intervenant en attente.";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [siteDrafts, setSiteDrafts] = useState<Record<string, SiteDraft>>({});
  const [intervenantDrafts, setIntervenantDrafts] = useState<Record<string, IntervenantDraft>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSiteDrafts((previous) => {
      const next: Record<string, SiteDraft> = {};
      for (const site of props.pendingSites) {
        next[site.id] = previous[site.id] ?? { parc: "", famille: "" };
      }
      return next;
    });
  }, [props.pendingSites]);

  useEffect(() => {
    setIntervenantDrafts((previous) => {
      const next: Record<string, IntervenantDraft> = {};
      for (const item of props.pendingIntervenants) {
        next[item.id] = previous[item.id] ?? { name: item.name };
      }
      return next;
    });
  }, [props.pendingIntervenants]);

  useEffect(() => {
    if (expandedId && !items.some((item) => item.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, items]);

  const siteComparators: Record<PendingSortKey, (a: PendingSite, b: PendingSite) => number> = {
    label: (a, b) => compareTextFr(`${a.name} (${a.code})`, `${b.name} (${b.code})`),
    createdBy: (a, b) => compareTextFr(a.createdBy, b.createdBy),
    createdAt: (a, b) => compareTextFr(a.createdAt, b.createdAt)
  };
  const intervenantComparators: Record<PendingSortKey, (a: PendingIntervenant, b: PendingIntervenant) => number> = {
    label: (a, b) => compareTextFr(a.name, b.name),
    createdBy: (a, b) => compareTextFr(a.createdBy, b.createdBy),
    createdAt: (a, b) => compareTextFr(a.createdAt, b.createdAt)
  };

  const sitesSort = useTableSort<PendingSite, PendingSortKey>(props.pendingSites, siteComparators, {
    key: "createdAt",
    direction: "desc"
  });
  const intervenantsSort = useTableSort<PendingIntervenant, PendingSortKey>(
    props.pendingIntervenants,
    intervenantComparators,
    { key: "createdAt", direction: "desc" }
  );
  const sortedEntries = isSites ? sitesSort.sortedEntries : intervenantsSort.sortedEntries;
  const sortKey = isSites ? sitesSort.sortKey : intervenantsSort.sortKey;
  const sortDirection = isSites ? sitesSort.sortDirection : intervenantsSort.sortDirection;
  const toggleSort = (key: PendingSortKey) => {
    if (isSites) sitesSort.toggleSort(key);
    else intervenantsSort.toggleSort(key);
  };
  const sortLabel = (key: PendingSortKey) => tableSortArrow(sortKey, key, sortDirection);

  const isDirty = isSites
    ? Object.values(siteDrafts).some((draft) => Boolean(draft.parc.trim() || draft.famille.trim()))
    : props.pendingIntervenants.some((item) => {
        const draftName = (intervenantDrafts[item.id]?.name ?? item.name).trim();
        return draftName !== item.name.trim();
      });
  const { requestClose, showDiscardConfirm, confirmDiscardAndClose, cancelDiscard } = useCreateModalCloseGuard({
    enabled: !isSubmitting,
    isDirty,
    onClose: props.onClose
  });

  const toggleExpand = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const submitSite = async (site: PendingSite) => {
    const draft = siteDrafts[site.id] ?? { parc: "", famille: "" };
    if (!draft.parc.trim() || !draft.famille.trim()) {
      props.onNotify?.("Parc et famille sont obligatoires pour valider le site.", "warning");
      return;
    }
    setIsSubmitting(true);
    try {
      await Promise.resolve(
        props.onResolveSite({
          pendingId: site.id,
          parc: draft.parc.trim(),
          famille: draft.famille.trim()
        })
      );
      setExpandedId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitIntervenant = async (item: PendingIntervenant) => {
    const draft = intervenantDrafts[item.id] ?? { name: item.name };
    if (!draft.name.trim()) {
      props.onNotify?.("Le nom est obligatoire pour valider l'intervenant.", "warning");
      return;
    }
    setIsSubmitting(true);
    try {
      await Promise.resolve(
        props.onResolveIntervenant({
          pendingId: item.id,
          name: draft.name.trim()
        })
      );
      setExpandedId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <div className="modal-overlay" onClick={requestClose} role="presentation">
      <section
        className="modal fransor-help-modal data-pending-submissions-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-pending-submissions-title"
      >
        <header className="mc-modal-head mc-modal-head-compact">
          <h3 id="data-pending-submissions-title" className="mc-modal-title">
            {title}
            {items.length > 0 ? (
              <span className="tab-badge" title={`${items.length} soumission(s)`}>
                {items.length}
              </span>
            ) : null}
          </h3>
          <button type="button" className="mc-modal-close" aria-label="Fermer" onClick={requestClose}>
            <X size={16} />
          </button>
        </header>
        <p className="muted data-pending-submissions-hint">
          {isSites
            ? "Étendez une ligne pour renseigner parc et famille. Le code et le nom sont déjà connus."
            : "Étendez une ligne pour confirmer ou ajuster le nom avant validation."}
        </p>
        <div className="table-scroll-x">
          <table
            className={isSites ? "data-table-fixed data-table-sites" : "data-table-fixed data-table-intervenants"}
          >
            <thead>
              <tr>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort("label")}>
                    {isSites ? "Site" : "Nom"} {sortLabel("label")}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort("createdBy")}>
                    Créé par {sortLabel("createdBy")}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort("createdAt")}>
                    Créé le {sortLabel("createdAt")}
                  </button>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isSites
                ? (sortedEntries as PendingSite[]).map((site) => {
                    const expanded = expandedId === site.id;
                    const draft = siteDrafts[site.id] ?? { parc: "", famille: "" };
                    return (
                      <Fragment key={site.id}>
                        <tr>
                          <td className="mc-site-wrap">
                            <SiteDisplayCopyButton
                              variant="table"
                              siteLabel={`${site.name} (${site.code})`}
                              onNotify={props.onNotify}
                            />
                          </td>
                          <td>{site.createdBy}</td>
                          <td>{new Date(site.createdAt).toLocaleString("fr-FR")}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="btn-light"
                                title={expanded ? "Réduire" : "Étendre pour valider"}
                                aria-expanded={expanded}
                                aria-label={expanded ? "Réduire" : "Étendre pour valider"}
                                onClick={() => toggleExpand(site.id)}
                              >
                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {expanded ? "Réduire" : "Étendre"}
                              </button>
                              <button
                                type="button"
                                className="btn-danger action-icon-btn"
                                title="Supprimer la soumission"
                                aria-label="Supprimer la soumission"
                                onClick={() => {
                                  props.openDeleteReasonModal(`site en attente ${site.code}`, (reason) =>
                                    props.onDeleteSiteSubmission({ pendingId: site.id, reason })
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="data-pending-expand-row">
                            <td colSpan={4}>
                              <div className="data-pending-expand-form">
                                <label className="data-pending-expand-field">
                                  <span>Code site</span>
                                  <input value={site.code} readOnly aria-readonly="true" />
                                </label>
                                <label className="data-pending-expand-field">
                                  <span>Nom du site</span>
                                  <input value={site.name} readOnly aria-readonly="true" />
                                </label>
                                <label className="data-pending-expand-field">
                                  <span>
                                    Parc <span className="text-error">*</span>
                                  </span>
                                  <input
                                    value={draft.parc}
                                    placeholder="Ex. Parc exemple"
                                    onChange={(e) =>
                                      setSiteDrafts((prev) => ({
                                        ...prev,
                                        [site.id]: { ...draft, parc: e.target.value }
                                      }))
                                    }
                                  />
                                </label>
                                <label className="data-pending-expand-field">
                                  <span>
                                    Famille <span className="text-error">*</span>
                                  </span>
                                  <input
                                    value={draft.famille}
                                    placeholder="Ex. Famille exemple"
                                    onChange={(e) =>
                                      setSiteDrafts((prev) => ({
                                        ...prev,
                                        [site.id]: { ...draft, famille: e.target.value }
                                      }))
                                    }
                                  />
                                </label>
                                <div className="data-pending-expand-actions">
                                  <button
                                    type="button"
                                    className="btn-light"
                                    onClick={() => setExpandedId(null)}
                                    disabled={isSubmitting}
                                  >
                                    Fermer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void submitSite(site)}
                                    disabled={isSubmitting}
                                  >
                                    Valider l'entrée
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                : (sortedEntries as PendingIntervenant[]).map((item) => {
                    const expanded = expandedId === item.id;
                    const draft = intervenantDrafts[item.id] ?? { name: item.name };
                    return (
                      <Fragment key={item.id}>
                        <tr>
                          <td>{item.name}</td>
                          <td>{item.createdBy}</td>
                          <td>{new Date(item.createdAt).toLocaleString("fr-FR")}</td>
                          <td>
                            <div className="table-actions">
                              <button
                                type="button"
                                className="btn-light"
                                title={expanded ? "Réduire" : "Étendre pour valider"}
                                aria-expanded={expanded}
                                aria-label={expanded ? "Réduire" : "Étendre pour valider"}
                                onClick={() => toggleExpand(item.id)}
                              >
                                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {expanded ? "Réduire" : "Étendre"}
                              </button>
                              <button
                                type="button"
                                className="btn-danger action-icon-btn"
                                title="Supprimer la soumission"
                                aria-label="Supprimer la soumission"
                                onClick={() => {
                                  props.openDeleteReasonModal(`intervenant en attente ${item.name}`, (reason) =>
                                    props.onDeleteIntervenantSubmission({ pendingId: item.id, reason })
                                  );
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="data-pending-expand-row">
                            <td colSpan={4}>
                              <div className="data-pending-expand-form data-pending-expand-form--single">
                                <label className="data-pending-expand-field">
                                  <span>
                                    Nom <span className="text-error">*</span>
                                  </span>
                                  <input
                                    value={draft.name}
                                    placeholder="Ex. Prestataire exemple"
                                    onChange={(e) =>
                                      setIntervenantDrafts((prev) => ({
                                        ...prev,
                                        [item.id]: { name: e.target.value }
                                      }))
                                    }
                                  />
                                </label>
                                <div className="data-pending-expand-actions">
                                  <button
                                    type="button"
                                    className="btn-light"
                                    onClick={() => setExpandedId(null)}
                                    disabled={isSubmitting}
                                  >
                                    Fermer
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void submitIntervenant(item)}
                                    disabled={isSubmitting}
                                  >
                                    Valider l'entrée
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
              {!items.length ? (
                <tr>
                  <td colSpan={4} className="muted">
                    {emptyLabel}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={requestClose}>
            Fermer
          </button>
        </div>
      </section>
    </div>
    <DiscardConfirmModal
      isOpen={showDiscardConfirm}
      onCancel={cancelDiscard}
      onConfirm={confirmDiscardAndClose}
    />
    </>
  );
}
