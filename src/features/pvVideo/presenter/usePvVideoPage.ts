/**
 * Coordination de la page PV Vidéo : site, chargement, enregistrement, export.
 *
 * Le formulaire n'est rechargé que quand le site choisi change, pas quand la
 * liste des sites est rafraîchie.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Role, SiteRef } from "../../../types";
import type { NotifyToast } from "../../common/model/toast.types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import {
  emptyPvVideoForm,
  normalizePvVideoForm,
  prepareCameras,
  type PvVideoCamera,
  type PvVideoForm,
  type PvVideoImage
} from "../model/pvVideoForm";
import { exportPvVideoWord } from "../export/pvVideoWordExport";
import type { SaveExportFileResult } from "../../common/utils/saveExportBlob";

type PvVideoExportResult = SaveExportFileResult & { archiveCopy: boolean };

type UsePvVideoPageArgs = {
  operatorName: string;
  requesterRole: Role;
  requesterUsername: string;
  onToast: NotifyToast;
};

/**
 * @param error - Rejet IPC ou réseau.
 * @param fallback - Texte si l'erreur n'a pas de message.
 */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * État de la fiche PV pour le site sélectionné.
 *
 * @param args - Profil connecté et notifications.
 */
export function usePvVideoPage({ operatorName, requesterRole, requesterUsername, onToast }: UsePvVideoPageArgs) {
  const [sites, setSites] = useState<SiteRef[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [form, setForm] = useState<PvVideoForm>(() => emptyPvVideoForm(operatorName));
  const [image, setImage] = useState<PvVideoImage | null>(null);
  const [imageChanged, setImageChanged] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [archiveConfigured, setArchiveConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const operatorNameRef = useRef(operatorName);
  operatorNameRef.current = operatorName;
  const loadSeq = useRef(0);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  useEffect(() => {
    let cancelled = false;
    void gtsApiClient.listSites({ requesterRole }).then(
      (rows) => {
        if (!cancelled) setSites(rows);
      },
      () => {
        if (!cancelled) onToast("Impossible de charger la liste des sites.", "error");
      }
    );
    void gtsApiClient.getPvVideoReport({ requesterRole, siteId: "" }).then(
      (result) => {
        if (!cancelled) setArchiveConfigured(result.archiveConfigured);
      },
      () => {
        if (!cancelled) onToast("Impossible de lire l'état du dossier des photos.", "error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [requesterRole, onToast]);

  useEffect(() => {
    const seq = ++loadSeq.current;
    if (!selectedSiteId) {
      setForm(emptyPvVideoForm(operatorNameRef.current));
      setImage(null);
      setImageChanged(false);
      setUpdatedAt(null);
      return;
    }
    const siteId = selectedSiteId;
    void gtsApiClient.getPvVideoReport({ requesterRole, siteId }).then(
      (result) => {
        if (seq !== loadSeq.current) return;
        setArchiveConfigured(result.archiveConfigured);
        setUpdatedAt(result.updatedAt);
        setImage(result.image);
        setImageChanged(false);
        if (!result.form) {
          setForm(emptyPvVideoForm(operatorNameRef.current));
          return;
        }
        setForm(normalizePvVideoForm(result.form));
      },
      (error: unknown) => {
        if (seq !== loadSeq.current) return;
        onToast(errorMessage(error, "Impossible de charger la fiche de ce site."), "error");
      }
    );
  }, [selectedSiteId, requesterRole, onToast]);

  const save = () => {
    if (!selectedSiteId) {
      onToast("Choisissez un site avant d'enregistrer.", "error");
      return;
    }
    setSaving(true);
    void gtsApiClient
      .savePvVideoReport({
        requesterRole,
        requesterUsername,
        siteId: selectedSiteId,
        expectedUpdatedAt: updatedAt,
        form: { ...form, cameras: prepareCameras(form.cameras) },
        image: imageChanged ? image : null,
        imageChanged
      })
      .then(async (result) => {
          setUpdatedAt(result.updatedAt);
          setImageChanged(false);
          const fresh = await gtsApiClient.getPvVideoReport({ requesterRole, siteId: selectedSiteId });
          setArchiveConfigured(fresh.archiveConfigured);
          setUpdatedAt(fresh.updatedAt);
          setImage(fresh.image);
          if (fresh.form) setForm(normalizePvVideoForm(fresh.form));
          onToast("Fiche PV enregistrée.");
        },
        (error: unknown) => onToast(errorMessage(error, "Enregistrement impossible."), "error")
      )
      .finally(() => setSaving(false));
  };

  /**
   * Enregistre le PV Word, puis en dépose une copie dans le dossier des photos.
   *
   * @returns Résultat du dialogue, ou `null` si l’export n’a pas pu démarrer ou a échoué.
   */
  const exportWord = async (): Promise<PvVideoExportResult | null> => {
    if (!selectedSite || !selectedSiteId) {
      onToast("Choisissez un site avant d'exporter.", "error");
      return null;
    }
    setExporting(true);
    try {
      const result = await exportPvVideoWord({
        siteName: selectedSite.name,
        siteCode: selectedSite.code,
        siteAddress: selectedSite.address || "",
        form,
        image
      });
      if (result.canceled || !result.filePath) return { ...result, archiveCopy: false };
      try {
        const backup = await gtsApiClient.archivePvVideoExport({
          requesterRole,
          siteId: selectedSiteId,
          sourcePath: result.filePath
        });
        if (!backup.backedUp) {
          onToast(
            backup.reason === "unconfigured"
              ? "Le dossier des photos n'est pas défini : la copie de secours n'a pas été faite."
              : "La copie de secours n'a pas pu être écrite dans le dossier des photos.",
            "warning"
          );
        }
        return { ...result, archiveCopy: backup.backedUp };
      } catch (error: unknown) {
        onToast(errorMessage(error, "La copie de secours n'a pas pu être écrite dans le dossier des photos."), "warning");
        return { ...result, archiveCopy: false };
      }
    } catch (error: unknown) {
      onToast(errorMessage(error, "Export Word impossible."), "error");
      return null;
    } finally {
      setExporting(false);
    }
  };

  const pickArchiveFolder = () => {
    void gtsApiClient.setPvVideoArchiveFolder({ requesterRole, requesterUsername }).then(
      (result) => {
        if (!result.canceled) {
          setArchiveConfigured(result.archiveConfigured);
          onToast("Dossier des photos enregistré.");
        }
      },
      (error: unknown) => onToast(errorMessage(error, "Impossible de choisir le dossier des photos."), "error")
    );
  };

  return {
    sites,
    selectedSite,
    form,
    image,
    archiveConfigured,
    saving,
    exporting,
    setSelectedSiteId,
    patchForm: (patch: Partial<PvVideoForm>) => setForm((current) => ({ ...current, ...patch })),
    setCameras: (cameras: PvVideoCamera[]) => setForm((current) => ({ ...current, cameras })),
    setImage: (next: PvVideoImage) => {
      setImage(next);
      setImageChanged(true);
    },
    clearImage: () => {
      setImage(null);
      setImageChanged(true);
    },
    save,
    exportWord,
    pickArchiveFolder
  };
}
