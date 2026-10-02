# The landing (showcase and judge kit): Next's standalone server. Build context: the workspace root (Coolify base
# directory "/", Dockerfile "/apps/landing/Dockerfile"); Dockerfile.dockerignore next to this file replaces the root
# .dockerignore, which leaves apps/landing out of the other images. NEXT_PUBLIC_* values are inlined at build time,
# so Coolify passes them as build variables; KAWASE_API_URL is read at run time by /live.
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV CI=true NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/landing...
ARG NEXT_PUBLIC_WEB_APP_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_LANDING_URL
ARG NEXT_PUBLIC_TESTFLIGHT_URL
ARG NEXT_PUBLIC_DEMO_VIDEO_URL
RUN pnpm --filter @kawase/landing build && mkdir -p apps/landing/public

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3000
# The standalone tree mirrors the workspace (traced from the root), so the server sits at apps/landing/server.js;
# static assets and public/ are not part of it and go next to it.
COPY --from=build --chown=node:node /app/apps/landing/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/landing/.next/static ./apps/landing/.next/static
COPY --from=build --chown=node:node /app/apps/landing/public ./apps/landing/public
USER node
EXPOSE 3000
CMD ["node", "apps/landing/server.js"]
