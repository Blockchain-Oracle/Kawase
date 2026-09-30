// Root ESLint config. D21: no magic numbers; constants live in @kawase/config and @kawase/networks.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const SERVER_ONLY_PACKAGES = ["@kawase/env", "@kawase/db", "@kawase/agent", "@kawase/workflows", "@kawase/integrations-*"];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/.expo/**", "context/**", "refs/**", ".firecrawl/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-magic-numbers": [
        "error",
        { ignore: [-1, 0, 1], ignoreEnums: true, ignoreNumericLiteralTypes: true, ignoreReadonlyClassProperties: true, ignoreTypeIndexes: true, ignoreArrayIndexes: true, ignoreDefaultValues: true },
      ],
    },
  },
  {
    // Constant modules are where numbers are allowed to live.
    files: ["packages/config/**", "packages/networks/src/addresses.ts", "packages/networks/src/contexts.ts", "**/*.config.*"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    // Client apps must never import server-only packages (Circle keys, DB, agent).
    files: ["apps/mobile/**", "apps/docs/**", "apps/landing/**"],
    rules: { "no-restricted-imports": ["error", { patterns: SERVER_ONLY_PACKAGES.map((group) => ({ group: [group], message: "Server-only package: not allowed in client apps." })) }] },
  },
);
