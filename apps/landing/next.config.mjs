import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // A self-contained server for the Docker image; traced from the workspace root so the @kawase packages it
  // imports are included.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Internal packages ship TypeScript source.
  transpilePackages: [
    "@kawase/config",
    "@kawase/i18n",
    "@kawase/identity",
    "@kawase/money",
    "@kawase/networks",
    "@kawase/ui-tokens",
    "@kawase/ui-web",
  ],
};

export default config;
