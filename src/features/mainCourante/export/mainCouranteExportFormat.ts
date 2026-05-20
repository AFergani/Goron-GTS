import type { MainCouranteStatus } from "../model/mainCourante.types";

export function formatMainCouranteDate(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function statusLabelFr(status: MainCouranteStatus): string {
  if (status === "EN_ATTENTE") return "En attente";
  if (status === "EN_COURS") return "En cours";
  return "Clôturé";
}

export function safeExportFilenamePart(s: string): string {
  const t = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim();
  return t.slice(0, 48) || "entree";
}

export function exportTimestampForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}
