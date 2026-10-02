import { resolve } from "node:path";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
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
