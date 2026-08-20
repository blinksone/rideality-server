#!/usr/bin/env bash
# Push local RidealityBackend → GitHub blinksone/rideality-code / ridealtity-server
#
# One-time setup:
#   1. Create a fine-grained PAT with:
#        Repository: blinksone/rideality-code
#        Permissions: Contents = Read and write, Metadata = Read
#      OR a classic PAT with "repo" scope
#   2. export GITHUB_TOKEN=github_pat_...
#
# Usage:
#   export GITHUB_TOKEN=...
#   /opt/rideality/RidealityBackend/scripts/push-server.sh
#   /opt/rideality/RidealityBackend/scripts/push-server.sh "Your commit message"
#
# Optional env:
#   SERVER_SRC  default /opt/rideality/RidealityBackend
#   WORK_DIR    default /tmp/rideality-code-push
#   BRANCH      default main
set -euo pipefail

REPO_URL_HOST="github.com/blinksone/rideality-code.git"
BRANCH="${BRANCH:-main}"
SERVER_SRC="${SERVER_SRC:-/opt/rideality/RidealityBackend}"
WORK_DIR="${WORK_DIR:-/tmp/rideality-code-push}"
MSG="${1:-Update ridealtity-server}"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: Set GITHUB_TOKEN (PAT with Contents: Read and write)."
  echo "  export GITHUB_TOKEN=github_pat_..."
  exit 1
fi

if [[ ! -d "$SERVER_SRC" ]]; then
  echo "ERROR: SERVER_SRC not found: $SERVER_SRC"
  exit 1
fi

# Quick write-permission probe (fails early if token is read-only)
PROBE=$(curl -sS -o /tmp/rideality-gh-probe.json -w "%{http_code}" \
  -X PUT \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/blinksone/rideality-code/contents/ridealtity-server/.write-probe" \
  -d "{\"message\":\"probe\",\"content\":\"$(printf ok | base64 -w0 2>/dev/null || printf ok | base64)\"}" || true)
if [[ "$PROBE" == "403" ]]; then
  echo "ERROR: Token cannot write to the repository (HTTP 403)."
  echo "Create a new PAT with Contents: Read and write on blinksone/rideality-code, then:"
  echo "  export GITHUB_TOKEN=..."
  echo "  $0"
  cat /tmp/rideality-gh-probe.json 2>/dev/null | head -c 300; echo
  exit 1
fi
# Delete probe file if we created it (best-effort)
if [[ "$PROBE" == "201" || "$PROBE" == "200" ]]; then
  SHA=$(python3 -c "import json; print(json.load(open('/tmp/rideality-gh-probe.json')).get('content',{}).get('sha',''))" 2>/dev/null || true)
  if [[ -n "${SHA:-}" ]]; then
    curl -sS -X DELETE \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      "https://api.github.com/repos/blinksone/rideality-code/contents/ridealtity-server/.write-probe" \
      -d "{\"message\":\"remove probe\",\"sha\":\"${SHA}\"}" >/dev/null || true
  fi
fi

rm -rf "$WORK_DIR"
git clone --depth 1 "https://x-access-token:${GITHUB_TOKEN}@${REPO_URL_HOST}" "$WORK_DIR"

DEST="$WORK_DIR/ridealtity-server"
mkdir -p "$DEST"

rsync -a --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'uploads' \
  --exclude 'logs' \
  --exclude '.env' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  --exclude 'rideality-admin-portal/node_modules' \
  --exclude 'rideality-admin-portal/dist' \
  "$SERVER_SRC/" "$DEST/"

cd "$WORK_DIR"
git add -A ridealtity-server
# Keep monorepo helper if present
[[ -d scripts ]] && git add -A scripts || true

if git diff --cached --quiet; then
  echo "No changes to push."
  exit 0
fi

git -c user.name="blinksone" -c user.email="blinksone@users.noreply.github.com" commit -m "$MSG"
git push origin "HEAD:${BRANCH}"
git remote set-url origin "https://github.com/blinksone/rideality-code.git"

echo "Pushed: https://github.com/blinksone/rideality-code/tree/${BRANCH}/ridealtity-server"
