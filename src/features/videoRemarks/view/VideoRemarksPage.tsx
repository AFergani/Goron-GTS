/**
 * Page Remarques vidéo : générateur HTML, brouillon local et instantané par site.
 *
 * L'accès est filtré par la coque (profil). L'enregistrement en base est explicite.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, Save, Upload } from "lucide-react";
import { ConfirmModal } from "../../common/components/ConfirmModal";
import { FormModal } from "../../common/components/FormModal";
import { SitePageToolbar, ToolbarTextButton } from "../../common/components/SitePageToolbar";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";
import type { NotifyToast } from "../../common/model/toast.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { Role, SiteRef } from "../../../types";
import { buildVideoRemarkHtml } from "../model/buildVideoRemarkHtml";
import {
  DEFAULT_STYLE_COLORS,
  DEFAULT_SUMMARY_TEXT,
  buildExportFileName,
  defaultVideoRemarkDocument,
  loadVideoRemarkDraft,
  makeField,
  makeSection,
  makeStyle,
  normalizeVideoRemarkDocument,
  resetVideoStyles,
  saveVideoRemarkDraft,
  type VideoRemarkLocalDraft
} from "../model/videoRemarkDocument";
import type { TextStyle, VideoRemarkDocument } from "../model/videoRemarkTypes";
import { VideoRemarkLinksPanel } from "../components/VideoRemarkLinksPanel";
import { VideoRemarkOutput } from "../components/VideoRemarkOutput";
import { VideoRemarkSectionsEditor } from "../components/VideoRemarkSectionsEditor";
import { VideoRemarkStylesPanel } from "../components/VideoRemarkStylesPanel";

type VideoRemarksPageProps = {
  onToast: NotifyToast;
  requesterRole: Role;
  requesterUsername: string;
};

type PendingConfirm = "reset-doc" | "reset-styles" | "delete-section" | null;

/**
 * Applique un style modifié à la bonne cible (titre de section ou style global).
 *
 * @param doc - Document courant.
 * @param targetId - Identifiant de cible (`section:…` ou clé de style).
 * @param next - Nouveau style.
 */
function applyStyle(doc: VideoRemarkDocument, targetId: string, next: TextStyle): VideoRemarkDocument {
  if (targetId.startsWith("section:")) {
    const sectionId = targetId.slice("section:".length);
    return {
      ...doc,
      video: {
        ...doc.video,
        sections: doc.video.sections.map((section) =>
          section.id === sectionId ? { ...section, titleStyle: next } : section
        )
      }
    };
  }
  if (targetId === "link" || targetId === "labels" || targetId === "notice" || targetId === "summary" || targetId === "bottomText") {
    return {
      ...doc,
      video: { ...doc.video, styles: { ...doc.video.styles, [targetId]: next } }
    };
  }
  return doc;
}

/**
 * Générateur de remarques vidéo intégré à l'interface principale.
 */
export function VideoRemarksPage({ onToast, requesterRole, requesterUsername }: VideoRemarksPageProps) {
  const initialDraft = useRef(loadVideoRemarkDraft()).current;
  const [doc, setDoc] = useState<VideoRemarkDocument>(initialDraft.document);
  const [draftMeta, setDraftMeta] = useState<Pick<VideoRemarkLocalDraft, "siteId" | "snapshotUpdatedAt">>({
    siteId: initialDraft.siteId,
    snapshotUpdatedAt: initialDraft.snapshotUpdatedAt
  });
  const draftMetaRef = useRef(draftMeta);
  draftMetaRef.current = draftMeta;
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteRef | null>(null);
  const [saving, setSaving] = useState(false);
  const loadSeq = useRef(0);
  const [pending, setPending] = useState<PendingConfirm>(null);
  const [deleteSectionId, setDeleteSectionId] = useState<string | null>(null);
  const [addFieldSectionId, setAddFieldSectionId] = useState<string | null>(null);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [sectionDraft, setSectionDraft] = useState({
    title: "",
    layout: "inline" as "inline" | "list",
    collapsible: false,
    summaryText: DEFAULT_SUMMARY_TEXT,
    openByDefault: false
  });
  const importRef = useRef<HTMLInputElement>(null);
  const html = useMemo(() => buildVideoRemarkHtml(doc), [doc]);

  const commit = (next: VideoRemarkDocument, meta?: Partial<Pick<VideoRemarkLocalDraft, "siteId" | "snapshotUpdatedAt">>) => {
    const merged = { ...draftMetaRef.current, ...meta };
    draftMetaRef.current = merged;
    setDraftMeta(merged);
    setDoc(next);
    saveVideoRemarkDraft({ ...merged, document: next });
  };

  useEffect(() => {
    const siteId = draftMetaRef.current.siteId;
    let cancelled = false;
    void gtsApiClient.listSites({ requesterRole }).then(
      (rows) => {
        if (cancelled) return;
        setSites(rows);
        setSelectedSite(siteId ? rows.find((site) => site.id === siteId) ?? null : null);
      },
      () => {
        if (!cancelled) onToast("Impossible de charger la liste des sites.", "error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [requesterRole, onToast]);

  const applySelectedSite = (site: SiteRef | null) => {
    setSelectedSite(site);
    const seq = ++loadSeq.current;
    if (!site) {
      commit({ ...doc, siteName: "" }, { siteId: null, snapshotUpdatedAt: null });
      return;
    }
    void gtsApiClient.getVideoRemarkSnapshot({ requesterRole, siteId: site.id }).then(
      (found) => {
        if (seq !== loadSeq.current) return;
        if (!found) {
          const blank = defaultVideoRemarkDocument();
          commit({ ...blank, siteName: site.name }, { siteId: site.id, snapshotUpdatedAt: null });
          return;
        }
        const next = normalizeVideoRemarkDocument(found.payload);
        commit({ ...next, siteName: site.name }, { siteId: site.id, snapshotUpdatedAt: found.updatedAt });
        onToast("Remarque chargée pour ce site.");
      },
      (error: unknown) => {
        if (seq !== loadSeq.current) return;
        const message = error instanceof Error ? error.message : "Impossible de charger la remarque de ce site.";
        onToast(message, "error");
      }
    );
  };

  const saveSnapshot = () => {
    if (!selectedSite) {
      onToast("Choisissez un site avant d'enregistrer.", "error");
      return;
    }
    const site = selectedSite;
    const document = { ...doc, siteName: site.name };
    setSaving(true);
    void gtsApiClient
      .saveVideoRemarkSnapshot({
        requesterRole,
        requesterUsername,
        siteId: site.id,
        expectedUpdatedAt: draftMetaRef.current.snapshotUpdatedAt,
        document
      })
      .then(
        (result) => {
          commit(document, { siteId: site.id, snapshotUpdatedAt: result.updatedAt });
          onToast("Remarque enregistrée pour ce site.");
        },
        (error: unknown) => {
          const message = error instanceof Error ? error.message : "Enregistrement impossible.";
          onToast(message, "error");
        }
      )
      .finally(() => setSaving(false));
  };

  const deleteTitle = doc.video.sections.find((section) => section.id === deleteSectionId)?.title || "cette section";

  return (
    <div className="video-remarks">
      <SitePageToolbar
        sites={sites}
        selectedSite={selectedSite}
        onSelectedSiteChange={applySelectedSite}
        onCopyNotify={(message) => onToast(message)}
      >
        <ToolbarTextButton
          icon={<Save size={16} />}
          label="Sauvegarder"
          title="Enregistrer la remarque pour le site choisi"
          disabled={saving}
          onClick={saveSnapshot}
        />
        <button
          type="button"
          className="icon-btn"
          title="Réinitialiser"
          aria-label="Réinitialiser"
          onClick={() => setPending("reset-doc")}
        >
          <RotateCcw size={16} />
        </button>
        <VideoRemarkStylesPanel
          doc={doc}
          onChangeStyle={(targetId, next) => commit(applyStyle(doc, targetId, next))}
          onReset={() => setPending("reset-styles")}
        />
        <ToolbarTextButton
          icon={<Upload size={16} />}
          label="Exporter"
          title="Exporter"
          onClick={() => {
            const payload = {
              exportVersion: 2,
              exportedAt: new Date().toISOString(),
              generator: "generateur-remarques",
              siteName: doc.siteName,
              activeTab: "video",
              video: doc.video
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = buildExportFileName(doc.siteName);
            link.click();
            URL.revokeObjectURL(url);
            onToast("Informations exportées.");
          }}
        />
        <ToolbarTextButton
          icon={<Download size={16} />}
          label="Charger"
          title="Charger un fichier"
          onClick={() => importRef.current?.click()}
        />
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = JSON.parse(String(reader.result || ""));
                const next = normalizeVideoRemarkDocument(parsed);
                commit(next);
                onToast("Informations chargées.");
              } catch {
                onToast("Impossible de charger ce fichier. Utilisez une sauvegarde exportée depuis ce générateur.", "error");
              }
            };
            reader.readAsText(file);
          }}
        />
      </SitePageToolbar>

      <div className="vr-layout">
        <div className="vr-editor">
          <VideoRemarkLinksPanel doc={doc} onChange={(video) => commit({ ...doc, video })} />
          <VideoRemarkSectionsEditor
            sections={doc.video.sections}
            onChange={(sections) => commit({ ...doc, video: { ...doc.video, sections } })}
            onRequestDelete={(sectionId) => {
              setDeleteSectionId(sectionId);
              setPending("delete-section");
            }}
            onRequestAddField={setAddFieldSectionId}
            onRequestAddSection={() => {
              setSectionDraft({
                title: "",
                layout: "inline",
                collapsible: false,
                summaryText: DEFAULT_SUMMARY_TEXT,
                openByDefault: false
              });
              setAddSectionOpen(true);
            }}
          />
        </div>
        <VideoRemarkOutput
          html={html}
          onCopy={() => {
            void navigator.clipboard.writeText(html).then(
              () => onToast("HTML copié dans le presse-papiers."),
              () => onToast("La copie a échoué.", "error")
            );
          }}
        />
      </div>

      <ConfirmModal
        isOpen={pending === "reset-doc"}
        title="Réinitialiser"
        message="Réinitialiser toutes les sections, champs et mise en forme ?"
        confirmLabel="Réinitialiser"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const blank = defaultVideoRemarkDocument();
          commit({ ...blank, siteName: selectedSite?.name ?? "" });
          setPending(null);
        }}
      />
      <ConfirmModal
        isOpen={pending === "reset-styles"}
        title="Réinitialiser la mise en forme"
        message="Réinitialiser toute la mise en forme ?"
        confirmLabel="Réinitialiser"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          commit(resetVideoStyles(doc));
          setPending(null);
        }}
      />
      <ConfirmModal
        isOpen={pending === "delete-section"}
        title="Supprimer la section"
        message={`Supprimer « ${deleteTitle} » et tous ses champs ?`}
        confirmLabel="Supprimer"
        confirmClassName="btn-light"
        onCancel={() => {
          setPending(null);
          setDeleteSectionId(null);
        }}
        onConfirm={() => {
          commit({
            ...doc,
            video: {
              ...doc.video,
              sections: doc.video.sections.filter((section) => section.id !== deleteSectionId)
            }
          });
          setPending(null);
          setDeleteSectionId(null);
        }}
      />

      <FormModal
        isOpen={addFieldSectionId !== null}
        title="Ajouter un champ"
        onClose={() => setAddFieldSectionId(null)}
        cancelLabel="Fermer"
      >
        <p className="muted">
          Section : {doc.video.sections.find((section) => section.id === addFieldSectionId)?.title || ""}
        </p>
        <div className="vr-type-choice">
          <button
            type="button"
            onClick={() => {
              if (!addFieldSectionId) return;
              commit({
                ...doc,
                video: {
                  ...doc.video,
                  sections: doc.video.sections.map((section) =>
                    section.id === addFieldSectionId
                      ? { ...section, fields: [...section.fields, makeField()] }
                      : section
                  )
                }
              });
              setAddFieldSectionId(null);
            }}
          >
            Classique
          </button>
          <button
            type="button"
            onClick={() => {
              if (!addFieldSectionId) return;
              commit({
                ...doc,
                video: {
                  ...doc.video,
                  sections: doc.video.sections.map((section) =>
                    section.id === addFieldSectionId
                      ? {
                          ...section,
                          fields: [
                            ...section.fields,
                            makeField({ label: "Consigne importante", type: "notice", wrapAlarms: true })
                          ]
                        }
                      : section
                  )
                }
              });
              setAddFieldSectionId(null);
            }}
          >
            Consigne importante
          </button>
        </div>
      </FormModal>

      <FormModal
        isOpen={addSectionOpen}
        title="Ajouter une section"
        submitLabel="Ajouter"
        submitDisabled={!sectionDraft.title.trim()}
        onClose={() => setAddSectionOpen(false)}
        onSubmit={() => {
          const title = sectionDraft.title.trim();
          if (!title) return;
          commit({
            ...doc,
            video: {
              ...doc.video,
              sections: [
                ...doc.video.sections,
                makeSection({
                  title,
                  layout: sectionDraft.layout,
                  collapsible: sectionDraft.collapsible,
                  summaryText: sectionDraft.summaryText.trim() || DEFAULT_SUMMARY_TEXT,
                  openByDefault: sectionDraft.openByDefault,
                  titleStyle: makeStyle({ colorOn: true, colorValue: DEFAULT_STYLE_COLORS.connexionTitle, size: 19 })
                })
              ]
            }
          });
          setAddSectionOpen(false);
        }}
      >
        <label className="vr-field">
          <span>Titre</span>
          <input
            type="text"
            value={sectionDraft.title}
            placeholder="Titre de la section"
            onChange={(event) => setSectionDraft((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>
        <label className="vr-field">
          <span>Type d'affichage</span>
          <select
            value={sectionDraft.layout}
            onChange={(event) =>
              setSectionDraft((prev) => ({ ...prev, layout: event.target.value === "list" ? "list" : "inline" }))
            }
          >
            <option value="inline">Lignes</option>
            <option value="list">Liste à puces</option>
          </select>
        </label>
        <ToggleSwitch
          label="Section réductible"
          checked={sectionDraft.collapsible}
          onChange={(collapsible) =>
            setSectionDraft((prev) => ({
              ...prev,
              collapsible,
              openByDefault: collapsible ? prev.openByDefault : false
            }))
          }
        />
        {sectionDraft.collapsible ? (
          <>
            <label className="vr-field">
              <span>Texte du lien d'ouverture</span>
              <input
                type="text"
                value={sectionDraft.summaryText}
                onChange={(event) => setSectionDraft((prev) => ({ ...prev, summaryText: event.target.value }))}
              />
            </label>
            <ToggleSwitch
              label="Ouverte par défaut"
              checked={sectionDraft.openByDefault}
              onChange={(openByDefault) => setSectionDraft((prev) => ({ ...prev, openByDefault }))}
            />
          </>
        ) : null}
      </FormModal>
    </div>
  );
}
