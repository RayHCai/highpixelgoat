// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Layers, lowest first. A layer may import from the layers before it, never
 * from the ones after it (see AGENTS.md, "Architecture"):
 *
 *   shared -> starter -> script, voice, render -> take -> agent -> project -> server, cli
 */
const LAYERS = ["shared", "starter", "script", "voice", "render", "take", "agent", "project", "server", "cli"];
/** Layers that sit side by side and must not import each other. */
const PEERS = {
  script: ["voice", "render"],
  voice: ["script", "render"],
  render: ["script", "voice"],
  server: ["cli"],
  cli: ["server"],
};

/** no-restricted-imports for one layer one level under src/: everything above it, plus its peers. */
function layerRule(layer) {
  const above = LAYERS.slice(LAYERS.indexOf(layer) + 1);
  const forbidden = [...new Set([...above, ...(PEERS[layer] ?? [])])];
  return {
    files: [`src/${layer}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: forbidden.map((l) => `../${l}/*`),
              message: `src/${layer} may not depend on ${forbidden.join(", ")} (layering, see AGENTS.md).`,
            },
          ],
        },
      ],
    },
  };
}

export default tseslint.config(
  { ignores: ["dist/", "out/", "coverage/", "node_modules/", "music/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        { allowForKnownSafeCalls: [{ from: "package", name: ["test", "describe", "it"], package: "node:test" }] },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": "off",
      "prefer-const": "error",
    },
  },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },

  // Node: the server, the pipeline, CLIs, tests and config.
  { files: ["src/**/*.ts", "tests/**/*.ts", "*.ts", "*.js"], languageOptions: { globals: globals.node } },
  // Browser: the starter renderer (bundled into every take) and the dashboard.
  { files: ["src/starter/**/*.ts", "web/**/*.ts"], languageOptions: { globals: globals.browser } },

  // Layering.
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["../*"], message: "src/shared depends on nothing else in src." }] },
      ],
    },
  },
  {
    // The starter is copied into every take and bundled for the browser on its own.
    files: ["src/starter/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*"],
              message: "The starter is copied into every take: it may only import itself, three and zod.",
            },
            { group: ["node:*"], message: "The starter runs in the browser." },
          ],
        },
      ],
    },
  },
  ...["script", "voice", "render", "take", "agent", "project", "server", "cli"].map(layerRule),
  {
    files: ["web/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./\\.\\./src/(?!project/records$|shared/text$)",
              message: "The dashboard may only import src/project/records (types) and src/shared/text.",
            },
          ],
        },
      ],
    },
  },

  // Determinism: a frame must be a pure function of t. The player shell owns the clock.
  {
    files: ["src/starter/**/*.ts"],
    ignores: ["src/starter/player/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Frames must be deterministic: use makeRng(seed) from scene/noise.",
        },
        { object: "Date", property: "now", message: "Frames must be a function of t, not the wall clock." },
        { object: "performance", property: "now", message: "Frames must be a function of t, not the wall clock." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date']",
          message: "Frames must be a function of t, not the wall clock.",
        },
      ],
    },
  },

  prettier,
  // After prettier, which turns curly off: braces whenever a body spans more than one line.
  { rules: { curly: ["error", "multi-line"] } },
);
