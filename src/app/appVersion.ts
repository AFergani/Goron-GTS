/**
 * Version affichée de l'application, lue depuis package.json.
 */

import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;
export const APP_DISPLAY_NAME = "Télésurveillance GTS";
