/**
 * Charge et scinde les champs personnalisés (demande / clôture) d’un formulaire.
 */

import { useEffect, useMemo, useState } from "react";
import type { Role, SiteRef } from "../../../types";
import { gtsApiClient } from "../../../infrastructure/api/gtsApiClient";
import type { FormTarget, FormVariableDef } from "../../settings/model/formVariables.types";
import { splitFormVariableDefs, type FormVariableFieldDef } from "../model/formVariableField.types";
import { filterFormVariables } from "../utils/filterFormVariables";

type UseFormVariableFieldsParams = {
  isOpen: boolean;
  requesterRole?: Role;
  formTarget: FormTarget;
  site: SiteRef | null;
  plannedProfileId?: string | null;
  seedValues?: Record<string, string>;
  seedKey?: string;
};

export function useFormVariableFields({
  isOpen,
  requesterRole,
  formTarget,
  site,
  plannedProfileId,
  seedValues,
  seedKey
}: UseFormVariableFieldsParams) {
  const [defs, setDefs] = useState<FormVariableFieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const { requestDefs, closureDefs } = useMemo(() => splitFormVariableDefs(defs), [defs]);

  useEffect(() => {
    if (!isOpen || !requesterRole) {
      setDefs([]);
      return;
    }
    let cancelled = false;
    void gtsApiClient.listFormVariables({ requesterRole }).then((rows) => {
      if (cancelled) return;
      setDefs(filterFormVariables(rows as FormVariableDef[], formTarget, site, plannedProfileId));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, requesterRole, formTarget, site?.id, site?.famille, plannedProfileId]);

  useEffect(() => {
    if (!isOpen) return;
    setValues({ ...(seedValues ?? {}) });
  }, [isOpen, seedKey]);

  useEffect(() => {
    if (!defs.length) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const d of defs) {
        if (next[d.fieldKey] === undefined) next[d.fieldKey] = "";
      }
      return next;
    });
  }, [defs]);

  return { requestDefs, closureDefs, values, setValues };
}
