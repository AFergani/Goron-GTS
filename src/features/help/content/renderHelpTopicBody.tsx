import type { HelpAccessContext, HelpTopicId } from "../model/helpTopics";
import { isHelpTopicAllowed } from "../model/helpAccess";
import { HelpFransorTopic } from "./HelpFransorTopic";
import { HelpGardiennageTopic } from "./HelpGardiennageTopic";
import { HelpInterventionsTopic } from "./HelpInterventionsTopic";
import { HelpMainCouranteTopic } from "./HelpMainCouranteTopic";
import { HelpRondesTopic } from "./HelpRondesTopic";
import { HelpSettingsDataTopic } from "./HelpSettingsDataTopic";
import { HelpSettingsOperatorsTopic } from "./HelpSettingsOperatorsTopic";
import { HelpSettingsAuditTopic } from "./HelpSettingsAuditTopic";
import { HelpSettingsDatabaseTopic } from "./HelpSettingsDatabaseTopic";
import { HelpSettingsTemplatesTopic } from "./HelpSettingsTemplatesTopic";
import { HelpSettingsVariablesTopic } from "./HelpSettingsVariablesTopic";
import { HelpWelcomeTopic } from "./HelpWelcomeTopic";

function welcomeTopic() {
  return <HelpWelcomeTopic />;
}

export function renderHelpTopicBody(topicId: HelpTopicId, access?: HelpAccessContext) {
  if (!isHelpTopicAllowed(topicId, access)) {
    return welcomeTopic();
  }

  if (topicId === "welcome") {
    return welcomeTopic();
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
  if (topicId === "settings-data") {
    return <HelpSettingsDataTopic />;
  }
  if (topicId === "settings-operators") {
    return <HelpSettingsOperatorsTopic />;
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
  return welcomeTopic();
}
