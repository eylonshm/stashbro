#!/usr/bin/env bash
# Single source of truth for the OpenAPI spec is the server's zod schemas.
# This regenerates apps/server/openapi.json from the code, then copies it to the
# Mac client's spec (apps/mac/StashBro/openapi.yaml, which the swift-openapi
# build plugin consumes). Run this whenever the server API changes.
#
# The openapi.test.ts staleness guards fail CI if either file drifts from the code.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building server + exporting openapi.json from code..."
pnpm --filter @stashbro/server build >/dev/null
pnpm --filter @stashbro/server export-openapi

echo "Copying server spec -> Mac client spec..."
cp apps/server/openapi.json apps/mac/StashBro/openapi.yaml

echo "Done. apps/server/openapi.json and apps/mac/StashBro/openapi.yaml are in sync."
