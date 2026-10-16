import { resolve } from "node:path";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // No generated AGENTS.md / CLAUDE.md in the app folder.
  agentRules: false,
  // The root layout lives under [lang], so unmatched addresses get app/global-not-found.tsx (Next's convention for
  // a dynamic root layout); a nested not-found.tsx never sees them.
  experimental: { globalNotFound: true },
  // A self-contained server for the Docker image (Dockerfile); traced from the workspace root so the
  // @kawase packages it imports are included.
  output: "standalone",
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
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

export default withMDX(config);
