# The voice worker (LiveKit Agents). Build context: the workspace root (Coolify base directory "/", Dockerfile
# "/apps/voice-agent/Dockerfile"). Debian slim, not Alpine: LiveKit's native WebRTC bindings ship for glibc only
# (@livekit/rtc-ffi-bindings: linux-x64-gnu / linux-arm64-gnu). No domain: the worker dials LiveKit Cloud itself and
# serves its health check on :8081.
FROM node:24-bookworm-slim
# Coolify's health check runs curl (or wget) inside the container; the slim image has neither.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.28.2 --activate
WORKDIR /app
ENV NODE_ENV=production CI=true
COPY . .
RUN pnpm install --frozen-lockfile --filter @kawase/voice-agent... --prod
USER node
EXPOSE 8081
CMD ["pnpm", "--filter", "@kawase/voice-agent", "start"]
