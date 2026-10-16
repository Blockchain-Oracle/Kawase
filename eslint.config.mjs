// Root ESLint config. D21: no magic numbers; constants live in @kawase/config and @kawase/networks.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
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
    // Constant modules are where numbers are allowed to live; the art objects' geometry is their content.
    files: ["packages/config/**", "packages/networks/src/addresses.ts", "packages/networks/src/contexts.ts", "**/*.config.*", "packages/ui-native/src/components/art/**"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    // Installed registry components (21st.dev, shadcn, React Native Reusables) keep their authors' code style:
    // layout numbers, shader constants and loose types are not rewritten. Code written for Kawase next to
    // them (one folder up) follows the full rule set.
    files: ["packages/ui-web/src/components/ui/**", "packages/ui-native/src/components/ui/**", "apps/landing/src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Hooks run in the same order on every render: a hook below an early return blanks the page when the branch flips
    // (React #300, 10-16: the chat swap card after a swap settled).
    files: ["apps/mobile/**/*.{ts,tsx}", "packages/ui-native/**/*.{ts,tsx}", "apps/landing/**/*.{ts,tsx}", "apps/docs/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error" },
  },
  {
    // Client apps must never import server-only packages (Circle keys, DB, agent).
    files: ["apps/mobile/**", "apps/docs/**", "apps/landing/**"],
    rules: { "no-restricted-imports": ["error", { patterns: SERVER_ONLY_PACKAGES.map((group) => ({ group: [group], message: "Server-only package: not allowed in client apps." })) }] },
  },
);
