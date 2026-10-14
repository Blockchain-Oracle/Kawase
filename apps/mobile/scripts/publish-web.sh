#!/usr/bin/env bash
# Publish the web app: export it here with the production values, copy it to the server as a new release, point
# `current` at it and restart the container (apps/mobile/Dockerfile.prebuilt). Minutes instead of the server's hour.
#   apps/mobile/scripts/publish-web.sh              # export the working tree and go live
#   apps/mobile/scripts/publish-web.sh --no-export  # re-publish apps/mobile/dist as it is
set -euo pipefail
cd "$(dirname "$0")/../../.."
HOST=agari-box
APP=jq8rxr24rbepd17hiyakwh67
SHA=$(git rev-parse --short=12 HEAD)$(git diff --quiet HEAD -- apps/mobile packages || echo -dirty)
if [[ "${1:-}" != "--no-export" ]]; then
  set -a
  # shellcheck disable=SC1091
  source deploy/web.public.env
  set +a
  (cd apps/mobile && NODE_OPTIONS=--max-old-space-size=8192 npx expo export --platform web --clear)
fi
echo "$SHA" > apps/mobile/dist/client/version.txt
ssh "$HOST" "mkdir -p /data/kawase-web/releases/$SHA"
rsync -az --delete apps/mobile/dist/ "$HOST:/data/kawase-web/releases/$SHA/"
# A relative link resolves the same inside the container (/srv/current -> /srv/releases/<sha>). Five releases are kept.
ssh "$HOST" "cd /data/kawase-web && chmod -R a+rX releases/$SHA && ln -sfn releases/$SHA current.tmp && mv -Tf current.tmp current \
  && ls -1t releases | tail -n +6 | xargs -r -I{} rm -rf releases/{} \
  && docker ps --format '{{.Names}}' | grep '^$APP' | xargs -r docker restart"
echo "live: $SHA  (https://app.getkawase.xyz/version.txt)"
