#!/bin/sh
# Screenshots the internal gallery and the home sample on the booted iOS simulator, in each theme and in
# Arabic right-to-left. The app must be installed and the dev server running.
# Run: sh plan/design/gallery/shoot-ios.sh [simulator name]
set -e
DEVICE="${1:-iPhone 17 Pro}"
OUT="$(cd "$(dirname "$0")" && pwd)"
shoot() { # route, query, file
  xcrun simctl openurl "$DEVICE" "kawase://$1?$2"
  sleep "${WAIT:-5}"
  xcrun simctl io "$DEVICE" screenshot "$OUT/$3" >/dev/null 2>&1
  sips -Z 1311 "$OUT/$3" >/dev/null 2>&1 # half size keeps the repository small
  echo "$3"
}
shoot dev/home-sample "mode=dark&network=mainnet&lang=en" ios-home-dark-mainnet-en.png
shoot dev/home-sample "mode=light&network=testnet&lang=ar" ios-home-light-testnet-ar.png
shoot dev/home-sample "mode=dark&network=testnet&lang=en" ios-home-dark-testnet-en.png
i=0
for scroll in 0 700 1400 2100 2800; do
  i=$((i + 1))
  shoot dev/gallery "mode=dark&network=mainnet&lang=en&scroll=$scroll" "ios-gallery-dark-mainnet-en-$i.png"
  shoot dev/gallery "mode=light&network=testnet&lang=ar&scroll=$scroll" "ios-gallery-light-testnet-ar-$i.png"
done
