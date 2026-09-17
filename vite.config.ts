import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Le noyau ronde vit en CommonJS (require Electron). Vite le sert tel quel au renderer,
 * où `module` n’existe pas. On le réécrit en `export default` uniquement pour l’UI.
 */
function rondeKernelCjsForRenderer(): Plugin {
  const isRondeKernelFile = (id: string, fileName: string) =>
    id.replace(/\\/g, "/").includes(`/electron/store/domains/ronde/${fileName}`);

  return {
    name: "ronde-kernel-cjs-for-renderer",
    transform(code, id) {
      const isKernel = isRondeKernelFile(id, "slotTimeKernel.js");
      const isList = isRondeKernelFile(id, "exceptionalSlotList.js");
      if (!isKernel && !isList) return null;

      let next = code;
      if (isList) {
        next = next.replace(
          /const kernel = require\("\.\/slotTimeKernel"\);/,
          'import * as __rondeKernelNs from "./slotTimeKernel.js";\nconst kernel = __rondeKernelNs.default ?? __rondeKernelNs;'
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
