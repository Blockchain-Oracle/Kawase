# The api. Build context: the workspace root (Coolify base directory "/", Dockerfile "/apps/api/Dockerfile").
# Internal packages are TypeScript run just-in-time with tsx, so one install and one copy is the whole build.
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV NODE_ENV=production CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/api... --prod
USER node
EXPOSE 3000
# Migrations run first; the api starts only if they applied. tsx is called directly: through pnpm, corepack
# re-downloaded pnpm on every start (the node user has no cache), which pushed startup past the health check.
CMD ["sh", "-c", "cd /app/packages/db && ./node_modules/.bin/tsx src/migrate.ts && cd /app/apps/api && exec ./node_modules/.bin/tsx src/main.ts"]
