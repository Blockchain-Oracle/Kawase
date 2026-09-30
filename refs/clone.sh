#!/usr/bin/env bash
# Re-create shallow clones of Circle (circlefin) reference repos used by the Tameion hackathon knowledge library.
# Idempotent: clones missing repos, fast-forwards existing ones (shallow). Usage: bash refs/clone.sh [--update]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)/circlefin"
mkdir -p "$DIR"
UPDATE="${1:-}"
REPOS=(
  # Organizer-listed Arc sample apps (hackathon page "Reference implementations")
  arc-fintech arc-escrow arc-x402-circle-wallets arc-nanopayments arc-multichain-wallet
  arc-stablecoin-fx arc-p2p-payments arc-commerce arc-ecommerce-payments arc-defi-lend-borrow
  # Extra relevant repos (agents, skills, App Kit examples, CCTP, signer, other Arc sample)
  skills agent-stack-starter-kits docs-examples sidequestor arc-prediction-markets
  arc-remote-signer circle-cctp-fulfiller-repayment
)
for r in "${REPOS[@]}"; do
  if [ -d "$DIR/$r/.git" ]; then
    if [ "$UPDATE" = "--update" ]; then
      echo "update $r"; git -C "$DIR/$r" fetch -q --depth 1 origin HEAD && git -C "$DIR/$r" reset -q --hard FETCH_HEAD
    else
      echo "skip   $r (exists)"
    fi
  else
    echo "clone  $r"; git clone -q --depth 1 "https://github.com/circlefin/$r.git" "$DIR/$r"
  fi
done
echo "done: $(ls "$DIR" | wc -l | tr -d ' ') repos in $DIR"

# Canteen repos (ARC CLI + bundled agent context) -> refs/canteen/
CDIR="$(dirname "$DIR")/canteen"; mkdir -p "$CDIR"
for url in https://github.com/the-canteen-dev/ARC-cli.git https://github.com/the-canteen-dev/context-arc.git https://github.com/the-canteen-dev/circle-agent.git; do
  r="$(basename "$url" .git)"
  if [ -d "$CDIR/$r/.git" ]; then
    [ "$UPDATE" = "--update" ] && git -C "$CDIR/$r" fetch -q --depth 1 origin HEAD && git -C "$CDIR/$r" reset -q --hard FETCH_HEAD
    echo "ok     canteen/$r"
  else
    echo "clone  canteen/$r"; git clone -q --depth 1 "$url" "$CDIR/$r"
  fi
done
