/**
 * Éditeur des sections et champs de la remarque vidéo.
 *
 * L'image d'alarme insérée est toujours le chemin de l'interface externe.
 */

import { ChevronDown, ChevronUp, Plus, Trash2, TriangleAlert } from "lucide-react";
import { ALARM_IMAGE_SRC, alarmImageTag } from "../model/alarmImage";
import { DEFAULT_SUMMARY_TEXT, moveItem } from "../model/videoRemarkDocument";
import type { VideoField, VideoSection } from "../model/videoRemarkTypes";
import { ToggleSwitch } from "../../common/components/ToggleSwitch";

type VideoRemarkSectionsEditorProps = {
  sections: VideoSection[];
  onChange: (sections: VideoSection[]) => void;
  onRequestDelete: (sectionId: string) => void;
  onRequestAddField: (sectionId: string) => void;
  onRequestAddSection: () => void;
};

/**
 * Insère la balise image au curseur du champ.
 *
 * @param value - Valeur actuelle.
 * @param input - Champ focalisé, s'il est encore monté.
 */
function insertAlarmImage(value: string, input: HTMLInputElement | HTMLTextAreaElement | null): string {
  const tag = alarmImageTag();
  if (!input) return `${value}${tag}`;
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  return `${value.slice(0, start)}${tag}${value.slice(end)}`;
}

/**
 * Paire de chevrons pour monter ou descendre un bloc, sans cadre de bouton.
 */
function MoveChevrons({
  upLabel,
  downLabel,
  upDisabled,
  downDisabled,
  onUp,
  onDown
}: {
  upLabel: string;
  downLabel: string;
  upDisabled: boolean;
  downDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <span className="vr-move">
      <button type="button" className="vr-chevron" title={upLabel} aria-label={upLabel} disabled={upDisabled} onClick={onUp}>
        <ChevronUp size={16} />
      </button>
      <button
        type="button"
        className="vr-chevron"
        title={downLabel}
        aria-label={downLabel}
        disabled={downDisabled}
        onClick={onDown}
      >
        <ChevronDown size={16} />
      </button>
    </span>
  );
}

/**
 * Liste des sections, avec réordonnancement et champs.
 */
export function VideoRemarkSectionsEditor({
  sections,
  onChange,
  onRequestDelete,
  onRequestAddField,
  onRequestAddSection
}: VideoRemarkSectionsEditorProps) {
  const updateSection = (sectionId: string, patch: Partial<VideoSection>) => {
    onChange(sections.map((section) => (section.id === sectionId ? { ...section, ...patch } : section)));
  };

  const updateField = (sectionId: string, fieldId: string, patch: Partial<VideoField>) => {
    onChange(
      sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
        };
      })
    );
  };

  const noticeFields = sections.flatMap((section) => section.fields.filter((field) => field.type === "notice"));
  const iconsAuto = noticeFields.length > 0 && noticeFields.every((field) => field.wrapAlarms);

  const setIconsAuto = (wrapAlarms: boolean) => {
    onChange(
      sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => (field.type === "notice" ? { ...field, wrapAlarms } : field))
      }))
    );
  };

  return (
    <details className="vr-panel vr-sections" open>
      <summary>
        Sections et champs
        <span className="vr-badge">{sections.length}</span>
        <span
          className="vr-summary-actions"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <ToggleSwitch
            label="Icônes auto"
            tooltip={`Image : ${ALARM_IMAGE_SRC}`}
            checked={iconsAuto}
            disabled={noticeFields.length === 0}
            onChange={setIconsAuto}
          />
          <button
            type="button"
            className="vr-add"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRequestAddSection();
            }}
          >
            <Plus size={14} /> Ajouter une section
          </button>
        </span>
      </summary>
      <div className="vr-panel__body app-scrollbar">
        {sections.length === 0 ? (
          <p className="vr-empty">Aucune section. Ajoutez-en une pour commencer.</p>
        ) : null}
        {sections.map((section, sectionIndex) => (
          <div key={section.id} className="vr-section-block">
            <MoveChevrons
              upLabel="Monter la section"
              downLabel="Descendre la section"
              upDisabled={sectionIndex === 0}
              downDisabled={sectionIndex === sections.length - 1}
              onUp={() => onChange(moveItem(sections, sectionIndex, -1))}
              onDown={() => onChange(moveItem(sections, sectionIndex, 1))}
            />
            <details className="vr-section" open>
            <summary>
              <input
                className="vr-section__title"
                value={section.title}
                aria-label="Titre de la section"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateSection(section.id, { title: event.target.value })}
              />
              <span className="vr-badge">{section.layout === "list" ? "Liste" : "Lignes"}</span>
              {section.collapsible ? <span className="vr-badge">Réductible</span> : null}
              <button
                type="button"
                className="icon-btn"
                title="Supprimer cette section"
                aria-label={`Supprimer la section ${section.title}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRequestDelete(section.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            </summary>
            <div className="vr-section__body">
              {!section.isDefault ? (
                <div className="vr-section__options">
                  <ToggleSwitch
                    label="Réductible"
                    checked={section.collapsible}
                    onChange={(collapsible) =>
                      updateSection(section.id, {
                        collapsible,
                        openByDefault: collapsible ? section.openByDefault : false
                      })
                    }
                  />
                  <input
                    type="text"
                    value={section.summaryText}
                    disabled={!section.collapsible}
                    aria-label="Texte du lien d'ouverture"
                    placeholder={DEFAULT_SUMMARY_TEXT}
                    onChange={(event) =>
                      updateSection(section.id, { summaryText: event.target.value || DEFAULT_SUMMARY_TEXT })
                    }
                  />
                  <ToggleSwitch
                    label="Ouverte par défaut"
                    checked={section.openByDefault}
                    disabled={!section.collapsible}
                    onChange={(openByDefault) => updateSection(section.id, { openByDefault })}
                  />
                </div>
              ) : null}
              {section.fields.map((field, fieldIndex) => (
                <div key={field.id} className="vr-field-row">
                  <MoveChevrons
                    upLabel="Monter le champ"
                    downLabel="Descendre le champ"
                    upDisabled={fieldIndex === 0}
                    downDisabled={fieldIndex === section.fields.length - 1}
                    onUp={() => updateSection(section.id, { fields: moveItem(section.fields, fieldIndex, -1) })}
                    onDown={() => updateSection(section.id, { fields: moveItem(section.fields, fieldIndex, 1) })}
                  />
                  <select
                    aria-label="Type de champ"
                    value={field.type}
                    onChange={(event) =>
                      updateField(section.id, field.id, {
                        type: event.target.value === "notice" ? "notice" : "normal",
                        label: event.target.value === "notice" ? field.label || "Consigne importante" : field.label
                      })
                    }
                  >
                    <option value="normal">Classique</option>
                    <option value="notice">Consigne</option>
                  </select>
                  <input
                    type="text"
                    value={field.label}
                    placeholder="Libellé"
                    aria-label="Libellé"
                    disabled={field.type === "notice"}
                    onChange={(event) => {
                      const label = event.target.value;
                      updateField(section.id, field.id, {
                        label,
                        multiline: field.type !== "notice" && /^info\.?$/i.test(label)
                      });
                    }}
                  />
                  <textarea
                    rows={1}
                    value={field.value}
                    placeholder="Saisir la valeur"
                    aria-label="Valeur"
                    title="Zone de texte redimensionnable"
                    onChange={(event) => updateField(section.id, field.id, { value: event.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    title="Insérer l'image d'alarme de l'interface externe"
                    aria-label="Insérer l'image d'alarme"
                    onClick={(event) => {
                      const row = event.currentTarget.closest(".vr-field-row");
                      const input = row?.querySelector("textarea[aria-label='Valeur']") as HTMLTextAreaElement | null;
                      updateField(section.id, field.id, { value: insertAlarmImage(field.value, input) });
                    }}
                  >
                    <TriangleAlert className="vr-alarm-icon" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Supprimer le champ"
                    aria-label="Supprimer le champ"
                    onClick={() =>
                      updateSection(section.id, {
                        fields: section.fields.filter((item) => item.id !== field.id)
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button type="button" className="vr-add" onClick={() => onRequestAddField(section.id)}>
                <Plus size={14} /> Ajouter un champ à cette section
              </button>
            </div>
            </details>
          </div>
        ))}
      </div>
    </details>
  );
}
