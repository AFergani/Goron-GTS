/**
 * Modale arrêt de planification d’un profil ronde planifiée (date de fin, validation).
 */

import { useEffect, useState } from "react";
import { FormModal } from "../../common/components/FormModal";

type RondePlannedStopPlanningModalProps = {
  isOpen: boolean;
  profileLabel: string;
  /** Valeur initiale du champ date (AAAA-MM-JJ) */
  defaultEndDate: string;
  onClose: () => void;
  onConfirm: (planningEndDate: string, reason: string) => void | Promise<void>;
};

export function RondePlannedStopPlanningModal({
  isOpen,
  profileLabel,
  defaultEndDate,
  onClose,
  onConfirm
}: RondePlannedStopPlanningModalProps) {
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEndDate(defaultEndDate);
    setReason("");
    setLocalError("");
  }, [isOpen, defaultEndDate]);

  const handleSubmit = async () => {
    setLocalError("");
    const r = reason.trim();
    if (!endDate.trim()) {
      setLocalError("Indiquez la date de fin de planification.");
      return;
    }
    if (!r) {
      setLocalError("Le motif est obligatoire (traçabilité).");
      return;
    }
    try {
      await Promise.resolve(onConfirm(endDate.trim().slice(0, 10), r));
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      title="Fin de planification"
      onClose={onClose}
      onSubmit={() => handleSubmit()}
      submitLabel="Enregistrer la fin de planification"
      error={localError}
    >
      <p className="muted">
        Profil <strong>{profileLabel || "—"}</strong> : indiquez jusqu&apos;à quelle date (incluse) le flux reste
        applicable. Cette action est journalisée avec le motif saisi.
      </p>
      <div className="form">
        <label>
          Date de fin du flux
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          Motif
          <textarea
            className="mc-textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex. Motif exemple"
          />
        </label>
      </div>
    </FormModal>
  );
}
