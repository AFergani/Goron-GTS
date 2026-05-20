import { useEffect, useState } from "react";

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
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEndDate(defaultEndDate);
    setReason("");
    setLocalError("");
    setBusy(false);
  }, [isOpen, defaultEndDate]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
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
    setBusy(true);
    try {
      await Promise.resolve(onConfirm(endDate.trim().slice(0, 10), r));
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section className="modal fransor-help-modal" onClick={(ev) => ev.stopPropagation()}>
        <div className="row">
          <h3>Fin de planification</h3>
        </div>
        <p className="muted">
          Profil <strong>{profileLabel || "—"}</strong> : indiquez jusqu&apos;à quelle date (incluse) le flux reste
          applicable. Cette action est journalisée avec le motif saisi.
        </p>
        <div className="form">
          <label>
            Date de fin du flux
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={busy} />
          </label>
          <label>
            Motif
            <textarea
              className="mc-textarea"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex. changement de prestataire, fin de contrat…"
              disabled={busy}
            />
          </label>
        </div>
        {localError ? <p className="error">{localError}</p> : null}
        <div className="row-actions modal-actions">
          <button type="button" className="btn-light" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" onClick={() => void handleConfirm()} disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer la fin de planification"}
          </button>
        </div>
      </section>
    </div>
  );
}
