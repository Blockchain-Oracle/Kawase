#!/bin/sh
# Screenshots the direction board (Lime on Ink) on the booted iOS simulator: the five story panels, home, the
# voice overlay, the quick-action fan and receive, in dark/mainnet/English and light/testnet/Arabic.
# The app must be installed and the dev server running. Run: sh plan/design/board/shoot-ios.sh [simulator name]
set -e
DEVICE="${1:-iPhone 17 Pro}"
OUT="$(cd "$(dirname "$0")" && pwd)"
shoot() { # frame, query, file
  xcrun simctl openurl "$DEVICE" "kawase://dev/board/$1?$2"
  sleep "${WAIT:-7}"
  xcrun simctl io "$DEVICE" screenshot "$OUT/$3" >/dev/null 2>&1
  sips -Z 1311 "$OUT/$3" >/dev/null 2>&1 # half size keeps the repository small
  echo "$3"
}
for variant in "dark mainnet en" "light testnet ar"; do
  set -- $variant
  mode=$1; network=$2; lang=$3
  for panel in 0 1 2 3 4; do
    shoot story "mode=$mode&network=$network&lang=$lang&panel=$panel" "story-$panel-$mode-$network-$lang.png"
  done
  shoot home "mode=$mode&network=$network&lang=$lang" "home-$mode-$network-$lang.png"
  shoot voice "mode=$mode&network=$network&lang=$lang" "voice-$mode-$network-$lang.png"
  shoot fan "mode=$mode&network=$network&lang=$lang" "fan-$mode-$network-$lang.png"
  shoot receive "mode=$mode&network=$network&lang=$lang" "receive-$mode-$network-$lang.png"
done
