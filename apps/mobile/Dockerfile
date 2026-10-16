# The web app: the Expo web export served by a small Node server. Build context: the workspace root
# (Coolify base directory "/", Dockerfile "/apps/mobile/Dockerfile"). EXPO_PUBLIC_* values are read at export
# time, so Coolify passes them as build variables.
FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/mobile...
ARG EXPO_PUBLIC_API_URL
# Privy (D41) signs people in; the web client id is optional. EXPO_PUBLIC_WALLET_PROVIDER=dev is local development only.
ARG EXPO_PUBLIC_PRIVY_APP_ID
ARG EXPO_PUBLIC_PRIVY_CLIENT_ID
ARG EXPO_PUBLIC_PRIVY_WEB_CLIENT_ID
# Tree shaking (apps/mobile/metro.config.js) drops the exports nothing uses: without it the first load is 24.8 MB of
# script instead of ~12 MB (10-16). Both flags apply to production exports only; the bundle needs more than Node's
# default heap.
ENV EXPO_UNSTABLE_TREE_SHAKING=1 EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
RUN cd apps/mobile && NODE_OPTIONS=--max-old-space-size=8192 npx expo export --platform web
# Only the export, the server script and expo-server (no dependencies of its own) reach the final image.
RUN mkdir -p /out/node_modules && cp -r apps/mobile/dist /out/dist && cp -r apps/mobile/server /out/server \
  && cp -rL apps/mobile/node_modules/expo-server /out/node_modules/expo-server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out /app
USER node
EXPOSE 3000
CMD ["node", "server/web.cjs"]
