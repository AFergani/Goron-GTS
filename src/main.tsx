/**
 * Point d'entrée Vite du renderer Electron : monte React sur `#root`.
 *
 * Charge les styles globaux puis l'arbre `App` (session + coque applicative).
 * Référencé par `index.html` ; exécuté dans la fenêtre BrowserWindow.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Élément #root introuvable : vérifiez index.html.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
