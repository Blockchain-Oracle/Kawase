# Kawase's testnet x402 demo seller. Build context: the workspace root (Coolify base directory "/",
# Dockerfile "/apps/x402-seller/Dockerfile"). Built like the api (apps/api/Dockerfile):
#   build:   install, bundle our TypeScript to JavaScript once (scripts/build.mjs), `pnpm deploy` a production install.
#   runtime: the bundle and production node_modules, run by `node` as one process (it was pnpm → tsx → node).
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /repo
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/x402-seller...
RUN pnpm --filter @kawase/x402-seller build
RUN pnpm --filter @kawase/x402-seller deploy --prod --legacy --config.node-linker=hoisted /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 4021
# The heap stays well under the container's memory limit (Node does not read it).
CMD ["node", "--max-old-space-size=160", "--import", "./dist/bundle/register.mjs", "dist/bundle/main.mjs"]
