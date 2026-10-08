/**
 * Page PV Vidéo : recherche de site, fiche préremplie, photo et export Word.
 *
 * Accès : Admin, superviseur, responsable, directeur, Opérateur +.
 */

import { Download, ExternalLink, FolderOpen, Save } from "lucide-react";
import type { Role } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { SitePageToolbar, ToolbarTextButton } from "../../common/components/SitePageToolbar";
import { useWorkstationExports } from "../../common/hooks/useWorkstationExports";
import { exportFileBasename, WORKSTATION_EXPORT_KEYS } from "../../common/utils/workstationExportPaths";
import { PvVideoFormFields } from "../components/PvVideoFormFields";
import { usePvVideoPage } from "../presenter/usePvVideoPage";

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
        fill
      >
        <ToolbarTextButton
          icon={<Save size={16} />}
          label="Enregistrer"
          title="Enregistrer la fiche"
          disabled={!siteReady || page.saving}
          onClick={page.save}
        />
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
          ? "Dossier des photos prêt. Collez une capture ou parcourez un fichier."
          : "Le dossier des photos n'est pas encore choisi. Un responsable doit le définir avant d'enregistrer une image."}
      </p>
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
        />
      ) : (
        <p className="pv-empty">Choisissez un site pour ouvrir ou créer sa fiche de raccordement.</p>
      )}
    </div>
  );
}
