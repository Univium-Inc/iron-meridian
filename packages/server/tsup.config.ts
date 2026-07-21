import { defineConfig } from "tsup";

// Bundle the server and its @iron/shared dependency into a single ESM file. Production
// runs `node dist/server.js` with no dependency on workspace symlinks or a TS runtime.
// ws is kept external and resolved from node_modules at runtime.
export default defineConfig({
  entry: { server: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  bundle: true,
  noExternal: ["@iron/shared"],
  external: ["ws"],
});
