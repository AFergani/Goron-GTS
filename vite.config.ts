import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Le noyau ronde vit en CommonJS (require Electron). Vite le sert tel quel au renderer,
 * où `module` / `require` n’existent pas. On le réécrit en ESM uniquement pour l’UI.
 */
function rondeKernelCjsForRenderer(): Plugin {
  const isElectronFile = (id: string, fragment: string) =>
    id.replace(/\\/g, "/").includes(`/electron/store/${fragment}`);

  return {
    name: "ronde-kernel-cjs-for-renderer",
    transform(code, id) {
      const isKernel = isElectronFile(id, "domains/ronde/slotTimeKernel.js");
      const isList = isElectronFile(id, "domains/ronde/exceptionalSlotList.js");
      const isAlign = isElectronFile(id, "core/alignRequestValidity.js");
      const isJournal = isElectronFile(id, "core/activityJournal.js");
      if (!isKernel && !isList && !isAlign && !isJournal) return null;

      let next = code;
      if (isList) {
        next = next.replace(
          /const kernel = require\("\.\/slotTimeKernel"\);/,
          'import * as __rondeKernelNs from "./slotTimeKernel.js";\nconst kernel = __rondeKernelNs.default ?? __rondeKernelNs;'
        );
        next = next.replace(
          /const \{ floorValidityStartToRequest \} = require\("\.\.\/\.\.\/core\/alignRequestValidity"\);/,
          'import * as __alignValidityNs from "../../core/alignRequestValidity.js";\nconst { floorValidityStartToRequest } = __alignValidityNs.default ?? __alignValidityNs;'
        );
      }
      if (!/\bmodule\.exports\s*=/.test(next)) return null;
      next = next.replace(/\bmodule\.exports\s*=\s*/, "export default ");
      return { code: next, map: null };
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [rondeKernelCjsForRenderer(), react()],
  server: {
    port: 5173,
    strictPort: true
  }
});
