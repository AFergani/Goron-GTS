/**
 * Mode d’affichage jour/liste par service (rondes), persisté en localStorage.
 */

import { useEffect, useState } from "react";

const RONDE_DISPLAY_MODE_STORAGE_KEY = "rondeDisplayModeByService.v1";

export type RondeDisplayModeByService = {
  planifie: "day" | "list";
  urgence: "day" | "list";
};

const DEFAULT_DISPLAY_MODE: RondeDisplayModeByService = { planifie: "day", urgence: "list" };

function readStoredDisplayMode(): RondeDisplayModeByService {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_MODE;
  try {
    const raw = window.localStorage.getItem(RONDE_DISPLAY_MODE_STORAGE_KEY);
    if (!raw) return DEFAULT_DISPLAY_MODE;
    const parsed = JSON.parse(raw) as Partial<RondeDisplayModeByService>;
    return {
      planifie: parsed.planifie === "list" ? "list" : "day",
      urgence: parsed.urgence === "day" ? "day" : "list"
    };
  } catch {
    return DEFAULT_DISPLAY_MODE;
  }
}

export function useRondeDisplayMode() {
  const [displayModeByService, setDisplayModeByService] =
    useState<RondeDisplayModeByService>(readStoredDisplayMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RONDE_DISPLAY_MODE_STORAGE_KEY, JSON.stringify(displayModeByService));
  }, [displayModeByService]);

  return { displayModeByService, setDisplayModeByService };
}
