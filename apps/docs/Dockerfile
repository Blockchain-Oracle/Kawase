# The docs site (Fumadocs on Next 16, standalone output). Build context: the workspace root
# (Coolify base directory "/", Dockerfile "/apps/docs/Dockerfile"). The root .dockerignore leaves apps/docs out of the
# api's context; this image uses its own ignore file next to this Dockerfile (Dockerfile.dockerignore, BuildKit).
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV CI=true NEXT_TELEMETRY_DISABLED=1
# Public links are baked into the static pages at build time; all optional (defaults: packages/config public-links.ts).
ARG NEXT_PUBLIC_WEB_APP_URL
ARG NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_TESTFLIGHT_URL
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/docs...
RUN pnpm --filter @kawase/docs build

FROM node:24-alpine AS run
WORKDIR /app
# Coolify's health check calls localhost, which resolves to ::1 on alpine: listen on every address, IPv6 included.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3000
COPY --from=build --chown=node:node /app/apps/docs/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=build --chown=node:node /app/apps/docs/public ./apps/docs/public
USER node
EXPOSE 3000
CMD ["node", "apps/docs/server.js"]
