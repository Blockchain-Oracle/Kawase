# The api, built the recommended way for a Node service in production (Abu, 10-16). Build context: the workspace root
# (Coolify base directory "/", Dockerfile "/apps/api/Dockerfile").
#   build:   install the workspace, bundle our own TypeScript to JavaScript (scripts/build.mjs), then `pnpm deploy` a
#            production install with a flat node_modules (the bundle imports every npm package by name).
#   runtime: only the bundle, the email images, the migrations and production node_modules, run by `node` as the
#            unprivileged node user — one process, no TypeScript compiled at runtime (it was tsx, two processes).
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /repo
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/api...
RUN pnpm --filter @kawase/api build
RUN pnpm --filter @kawase/api deploy --prod --legacy --config.node-linker=hoisted /out \
    && node apps/api/scripts/build.mjs --check /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/assets ./assets
USER node
EXPOSE 3000
# Migrations run first; the api starts only if they applied. The heap stays well under the container's memory limit
# (Node does not read the container limit itself).
CMD ["sh", "-c", "node dist/db/migrate.mjs && exec node --max-old-space-size=640 dist/bundle/main.mjs"]
