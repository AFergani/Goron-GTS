import type { HelpTopicId } from "../model/helpTopics";
import { HelpFransorTopic } from "./HelpFransorTopic";
import { HelpGardiennageTopic } from "./HelpGardiennageTopic";
import { HelpInterventionsTopic } from "./HelpInterventionsTopic";
import { HelpMainCouranteTopic } from "./HelpMainCouranteTopic";
import { HelpRondesTopic } from "./HelpRondesTopic";
import { HelpPlaceholderTopic } from "./HelpPlaceholderTopic";
import { HelpSettingsAuditTopic } from "./HelpSettingsAuditTopic";
import { HelpSettingsDatabaseTopic } from "./HelpSettingsDatabaseTopic";
import { HelpSettingsOverviewTopic } from "./HelpSettingsOverviewTopic";
import { HelpSettingsTemplatesTopic } from "./HelpSettingsTemplatesTopic";
import { HelpSettingsVariablesTopic } from "./HelpSettingsVariablesTopic";
import { HelpWelcomeTopic } from "./HelpWelcomeTopic";

const PLACEHOLDER_TOPICS: HelpTopicId[] = [
  "settings-operators",
  "settings-data",
  "settings-data-sites",
  "settings-data-intervenants",
  "settings-data-anomaly-types",
  "settings-data-holidays",
  "settings-data-ronde-motifs",
  "settings-data-fransor",
  "settings-data-pending-sites",
  "settings-data-pending-intervenants"
];

export function renderHelpTopicBody(topicId: HelpTopicId) {
  if (topicId === "welcome") {
    return <HelpWelcomeTopic />;
  }
  if (topicId === "interventions") {
    return <HelpInterventionsTopic />;
  }
  if (topicId === "rondes") {
    return <HelpRondesTopic />;
  }
  if (topicId === "gardiennage") {
    return <HelpGardiennageTopic />;
  }
  if (topicId === "main-courante") {
    return <HelpMainCouranteTopic />;
  }
  if (topicId === "fransor") {
    return <HelpFransorTopic />;
  }
  if (topicId === "settings-overview") {
    return <HelpSettingsOverviewTopic />;
  }
  if (topicId === "settings-database") {
    return <HelpSettingsDatabaseTopic />;
  }
  if (topicId === "settings-audit") {
    return <HelpSettingsAuditTopic />;
  }
  if (topicId === "settings-templates") {
    return <HelpSettingsTemplatesTopic />;
  }
  if (topicId === "settings-variables") {
    return <HelpSettingsVariablesTopic />;
  }
  if (PLACEHOLDER_TOPICS.includes(topicId)) {
    return <HelpPlaceholderTopic topicId={topicId} />;
  }
  return <HelpWelcomeTopic />;
}
