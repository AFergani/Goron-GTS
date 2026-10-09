/**
 * Page PV Vidéo : recherche de site, fiche préremplie, photo et export Word.
 *
 * Accès : Admin, superviseur, responsable, directeur, Opérateur +.
 */

import { useState } from "react";
import { Download, ExternalLink, FolderOpen, History, RotateCcw, Save } from "lucide-react";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { SitePageToolbar, ToolbarTextButton } from "../../common/components/SitePageToolbar";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { exportFileBasename, WORKSTATION_EXPORT_KEYS } from "../../common/utils/workstationExportPaths";
import { PvVideoFormFields } from "../components/PvVideoFormFields";
import { usePvVideoPage, type PvVideoSnapshotRef } from "../presenter/usePvVideoPage";
import { ConfirmModal } from "../../common/components/ConfirmModal";

/**
 * Libellé français d'une version, sans chemin de fichier.
 *
 * @param row - Version listée pour le site.
 */
function snapshotLabel(row: PvVideoSnapshotRef): string {
  const when = new Date(row.savedAt);
  const dateLabel = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const author = row.savedBy ? ` — ${row.savedBy}` : "";
  return dateLabel ? `Version ${row.version} — ${dateLabel}${author}` : `Version ${row.version}${author}`;
}

type PvVideoPageProps = {
  operatorName: string;
  requesterRole: Role;
  requesterUsername: string;
  /** Responsable ou admin : peut désigner le dossier partagé des photos. */
  canSetArchiveFolder: boolean;
  onToast: NotifyToast;
};

/**
 * Écran de saisie d'une fiche de raccordement vidéo.
 */
export function PvVideoPage({
  operatorName,
  requesterRole,
  requesterUsername,
  canSetArchiveFolder,
  onToast
}: PvVideoPageProps) {
  const page = usePvVideoPage({ operatorName, requesterRole, requesterUsername, onToast });
  const [resetOpen, setResetOpen] = useState(false);
  const workstationExports = useWorkstationExports();
  const siteReady = Boolean(page.selectedSite);
  const reportKey = WORKSTATION_EXPORT_KEYS.wordPvVideo;
  const lastReportPath = workstationExports.getLastPath(reportKey);
  const canOpenReport = workstationExports.canOpenExcelTemporarily(reportKey);
  const openTitle = lastReportPath
    ? `Ouvrir ${exportFileBasename(lastReportPath)} (disponible 20 s après l'export)`
    : "Ouvrir le rapport — exportez pour activer le bouton (20 s)";

  const exportReport = () => {
    void (async () => {
      const result = await page.exportWord();
      if (!result) return;
      await workstationExports.saveAndRemember(
        reportKey,
        async () => result,
        onToast,
        result.archiveCopy
          ? "PV Word enregistré, avec une copie de secours dans le dossier des photos."
          : "PV Word enregistré."
      );
    })().catch((error: unknown) => {
      onToast(error instanceof Error ? error.message : "Export Word impossible.", "error");
    });
  };

  return (
    <div className="pv-video">
      <SitePageToolbar
        sites={page.sites}
        selectedSite={page.selectedSite}
        onSelectedSiteChange={(site) => page.setSelectedSiteId(site?.id ?? null)}
        onCopyNotify={(message) => onToast(message)}
      >
        {siteReady && page.archiveConfigured ? (
          <div className="pv-versions">
            <label htmlFor="pv-version-select">Versions enregistrées</label>
            <div className="pv-versions-row">
              <select
                id="pv-version-select"
                value={page.snapshotKey}
                disabled={page.saving || page.snapshots.length === 0}
                onChange={(event) => page.setSnapshotKey(event.target.value)}
              >
                <option value="">
                  {page.snapshots.length ? "Choisir une version" : "Aucune version pour ce site"}
                </option>
                {page.snapshots.map((row) => (
                  <option key={`${row.version}-${row.savedAt}`} value={row.savedAt}>
                    {snapshotLabel(row)}
                  </option>
                ))}
              </select>
              <ToolbarTextButton
                icon={<History size={16} />}
                label="Recharger"
                title="Recharger la version choisie dans la fiche"
                disabled={!page.snapshotKey || page.saving}
                onClick={() => page.loadSnapshot(page.snapshotKey)}
              />
            </div>
          </div>
        ) : null}
        <ToolbarTextButton
          icon={<Save size={16} />}
          label="Enregistrer"
          title="Enregistrer la fiche"
          disabled={!siteReady || page.saving}
          onClick={page.save}
        />
        <button
          type="button"
          className="icon-btn"
          title="Réinitialiser"
          aria-label="Réinitialiser"
          disabled={!siteReady || page.saving}
          onClick={() => setResetOpen(true)}
        >
          <RotateCcw size={16} />
        </button>
        <ToolbarTextButton
          icon={<Download size={16} />}
          label="Exporter"
          title="Exporter le PV Word"
          disabled={!siteReady || page.exporting}
          onClick={exportReport}
        />
        <ToolbarTextButton
          icon={<ExternalLink size={16} />}
          label="Ouvrir"
          title={openTitle}
          disabled={!canOpenReport}
          onClick={() => void workstationExports.openLastExport(reportKey, onToast)}
        />
        {canSetArchiveFolder ? (
          <ToolbarTextButton
            icon={<FolderOpen size={16} />}
            label="Dossier des photos"
            title="Choisir le dossier partagé des photos"
            onClick={page.pickArchiveFolder}
          />
        ) : null}
      </SitePageToolbar>
      <p className="pv-hint">
        {page.archiveConfigured
          ? "Dossier des photos prêt. Collez une capture, parcourez un fichier, ou importez un lot nommé 01, 02… et global."
          : "Le dossier des photos n'est pas encore choisi. Un responsable doit le définir avant d'enregistrer une image."}
      </p>
      {page.loadedVersion ? (
        <p className="pv-hint">
          Version {page.loadedVersion} chargée. Enregistrez pour en faire la fiche en cours.
        </p>
      ) : null}
      {siteReady && page.selectedSite ? (
        <PvVideoFormFields
          form={page.form}
          siteId={page.selectedSite.id}
          siteName={page.selectedSite.name}
          siteAddress={page.selectedSite.address || ""}
          image={page.image}
          disabled={page.saving}
          onChange={page.patchForm}
          onCameras={page.setCameras}
          onImage={page.setImage}
          onClearImage={page.clearImage}
          onReject={(message) => onToast(message, "error")}
          onNotice={onToast}
        />
      ) : (
        <p className="pv-empty">Choisissez un site pour ouvrir ou créer sa fiche de raccordement.</p>
      )}
      <ConfirmModal
        isOpen={resetOpen}
        title="Réinitialiser"
        message="Réinitialiser la fiche de ce site ? Les champs, les caméras et les photos seront effacés. Les versions déjà enregistrées restent disponibles."
        confirmLabel="Réinitialiser"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          setResetOpen(false);
          page.resetFiche();
        }}
      />
    </div>
  );
}
