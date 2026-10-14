#!/usr/bin/env bash
# Deploy Kawase's voice worker to LiveKit Cloud (agent CA_QF67rYjca7Hy, eu-central). LiveKit's build service needs the
# agent at the root of what it uploads, so this stages a small copy of the workspace: every manifest and the lockfile,
# the worker and the three packages it uses, with Dockerfile.livekit at the top. The root package.json names
# @livekit/agents so the CLI recognises a Node agent; the image's pnpm install updates its own copy of the lockfile.
# Needs LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET (the repo .env). Secrets are set once with
# `lk agent update-secrets` (OPENAI_API_KEY, ELEVENLABS_API_KEY, KAWASE_API_URL); LiveKit Cloud adds its own credentials.
set -euo pipefail
cd "$(dirname "$0")/../../.."
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json "$STAGE"/
for f in apps/*/package.json packages/*/package.json packages/integrations/*/package.json; do
  mkdir -p "$STAGE/$(dirname "$f")" && cp "$f" "$STAGE/$f"
done
for d in apps/voice-agent packages/config packages/money packages/networks; do
  rsync -a --exclude node_modules --exclude .turbo --exclude dist --exclude test --exclude evaluation "$d/" "$STAGE/$d/"
done
node -e '
const fs = require("fs"); const p = process.argv[1]; const d = JSON.parse(fs.readFileSync(p, "utf8"));
d.dependencies = { ...(d.dependencies || {}), "@livekit/agents": require(process.argv[2]).dependencies["@livekit/agents"] };
fs.writeFileSync(p, JSON.stringify(d, null, 2) + "\n");' "$STAGE/package.json" "$PWD/apps/voice-agent/package.json"
cp apps/voice-agent/Dockerfile.livekit "$STAGE/Dockerfile"
cp apps/voice-agent/livekit.toml "$STAGE/livekit.toml"
printf "node_modules\n**/node_modules\nlivekit.toml\n" > "$STAGE/.dockerignore"
set -a
# (eval, not `source <(…)`: macOS's bash 3.2 reads nothing from a process substitution)
eval "$(grep -E '^LIVEKIT_(URL|API_KEY|API_SECRET)=' .env)"
set +a
(cd "$STAGE" && lk agent deploy --yes .)
