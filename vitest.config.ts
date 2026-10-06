import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

// Every prior "@/..." import under test happened to be `import type`, which
// esbuild erases before Vite's resolver ever sees it — so the alias was
// never actually exercised and this was never missed. The first real
// (value) "@/..." import exposed that nothing here mirrors tsconfig's
// "@/*": ["./*"] path mapping, so it's added explicitly rather than pulling
// in a vite-tsconfig-paths dependency for one alias.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});
