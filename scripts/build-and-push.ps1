# Build Rideality API + admin images on Windows and push to GHCR.
#
# One-time:
#   docker login ghcr.io -u blinksone
#   (password = GitHub PAT with write:packages and repo)
#
# Usage (from repo root, in PowerShell):
#   .\scripts\build-and-push.ps1
#
# Optional env:
#   $env:IMAGE_TAG, $env:VITE_API_URL, $env:GHCR_OWNER

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$Owner = if ($env:GHCR_OWNER) { $env:GHCR_OWNER } else { "blinksone" }
$Tag = if ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { (git rev-parse --short HEAD).Trim() }
$ViteApiUrl = if ($env:VITE_API_URL) { $env:VITE_API_URL } else { "http://65.21.177.122:3000/api/v1" }

$Api = "ghcr.io/${Owner}/rideality-api"
$Admin = "ghcr.io/${Owner}/rideality-admin"

Write-Host "Building ${Api}:{${Tag},latest}"
docker build -t "${Api}:${Tag}" -t "${Api}:latest" (Join-Path $Root "RidealityBackend")
if ($LASTEXITCODE -ne 0) { throw "API image build failed" }

Write-Host "Building ${Admin}:{${Tag},latest}"
docker build --build-arg "VITE_API_URL=${ViteApiUrl}" `
  -t "${Admin}:${Tag}" -t "${Admin}:latest" `
  (Join-Path $Root "RidealityAdmin")
if ($LASTEXITCODE -ne 0) { throw "Admin image build failed" }

Write-Host "Pushing images to ghcr.io/${Owner}"
docker push "${Api}:${Tag}"
if ($LASTEXITCODE -ne 0) { throw "API tag push failed" }
docker push "${Api}:latest"
if ($LASTEXITCODE -ne 0) { throw "API latest push failed" }
docker push "${Admin}:${Tag}"
if ($LASTEXITCODE -ne 0) { throw "Admin tag push failed" }
docker push "${Admin}:latest"
if ($LASTEXITCODE -ne 0) { throw "Admin latest push failed" }

Write-Host "Pushed:"
Write-Host "  ${Api}:${Tag}"
Write-Host "  ${Api}:latest"
Write-Host "  ${Admin}:${Tag}"
Write-Host "  ${Admin}:latest"
