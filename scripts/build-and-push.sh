#!/usr/bin/env bash
# Build Rideality API + admin images on a laptop and push to GHCR.
#
# One-time:
#   Create a GitHub PAT with write:packages (and repo if the packages are private).
#   echo YOUR_PAT | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
#
# Usage (from repo root):
#   ./scripts/build-and-push.sh
#
# Optional env:
#   IMAGE_TAG       default: short git SHA
#   VITE_API_URL    default: http://65.21.177.122:3000/api/v1
#   GHCR_OWNER      default: blinksone
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GHCR_OWNER="${GHCR_OWNER:-blinksone}"
REGISTRY="ghcr.io/${GHCR_OWNER}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
VITE_API_URL="${VITE_API_URL:-http://65.21.177.122:3000/api/v1}"

API_IMAGE="${REGISTRY}/rideality-api"
ADMIN_IMAGE="${REGISTRY}/rideality-admin"

echo "Building ${API_IMAGE}:{${IMAGE_TAG},latest}"
docker build -t "${API_IMAGE}:${IMAGE_TAG}" -t "${API_IMAGE}:latest" \
  "${ROOT}/RidealityBackend"

echo "Building ${ADMIN_IMAGE}:{${IMAGE_TAG},latest}"
docker build \
  --build-arg "VITE_API_URL=${VITE_API_URL}" \
  -t "${ADMIN_IMAGE}:${IMAGE_TAG}" -t "${ADMIN_IMAGE}:latest" \
  "${ROOT}/RidealityAdmin"

echo "Pushing images to ${REGISTRY}"
docker push "${API_IMAGE}:${IMAGE_TAG}"
docker push "${API_IMAGE}:latest"
docker push "${ADMIN_IMAGE}:${IMAGE_TAG}"
docker push "${ADMIN_IMAGE}:latest"

echo "Pushed:"
echo "  ${API_IMAGE}:${IMAGE_TAG}"
echo "  ${API_IMAGE}:latest"
echo "  ${ADMIN_IMAGE}:${IMAGE_TAG}"
echo "  ${ADMIN_IMAGE}:latest"
