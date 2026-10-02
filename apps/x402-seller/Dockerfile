# Kawase's testnet x402 demo seller. Build context: the workspace root (Coolify base directory "/",
# Dockerfile "/apps/x402-seller/Dockerfile"). TypeScript runs with tsx, as in the api image.
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV NODE_ENV=production CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/x402-seller... --prod
USER node
EXPOSE 4021
CMD ["pnpm", "--filter", "@kawase/x402-seller", "start"]
