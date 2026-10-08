/**
 * Routeur de contenu : associe chaque `HelpTopicId` au composant rubrique correspondant.
 *
 * Si la rubrique n’est pas autorisée pour le profil, affiche la page d’accueil (`welcome`).
 */

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
import { HelpSettingsConnectionTopic } from "./HelpSettingsConnectionTopic";
import { HelpSettingsTemplatesTopic } from "./HelpSettingsTemplatesTopic";
import { HelpVideoRemarksTopic } from "./HelpVideoRemarksTopic";
import { HelpPvVideoTopic } from "./HelpPvVideoTopic";
import { HelpAboutTopic } from "./HelpAboutTopic";
import { HelpWelcomeTopic } from "./HelpWelcomeTopic";

export function renderHelpTopicBody(topicId: HelpTopicId, access?: HelpAccessContext) {
  if (topicId === "about" && isHelpTopicAllowed(topicId, access)) {
    return <HelpAboutTopic />;
  }
  if (!isHelpTopicAllowed(topicId, access) || topicId === "welcome") {
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
  if (topicId === "video-remarks") {
    return <HelpVideoRemarksTopic />;
  }
  if (topicId === "pv-video") {
    return <HelpPvVideoTopic />;
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
  if (topicId === "settings-connection") {
    return <HelpSettingsConnectionTopic />;
  }
  if (topicId === "settings-audit") {
    return <HelpSettingsAuditTopic />;
  }
  if (topicId === "settings-templates" || topicId === "settings-variables") {
    return <HelpSettingsTemplatesTopic />;
  }
  return <HelpWelcomeTopic />;
}
