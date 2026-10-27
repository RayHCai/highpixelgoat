import { defineConfig } from "vite";

// The dashboard. In development it is served through the API server (see
// src/server/main.ts) in Vite middleware mode; `vite build` emits dist/web for
// `npm start`. Each generated take bundles its own renderer, see
// src/take/site.ts.
export default defineConfig({
  root: "web",
  publicDir: false,
  build: { target: "es2022", outDir: "../dist/web", emptyOutDir: true },
});
