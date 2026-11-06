#!/usr/bin/env bash
# Generates the map extract from a Protomaps daily build. Requires the pmtiles CLI.
#   npm run data:fetch             GTA      -> public/data/gta.pmtiles
#   npm run data:fetch -- downtown Downtown -> public/data/downtown.pmtiles
# Set BUILD=YYYYMMDD to use another build. Old builds get removed, so pick one from
# https://maps.protomaps.com/builds/ if the default is gone.
set -euo pipefail

BUILD="${BUILD:-20261106}"
AREA="${1:-gta}"

case "$AREA" in
  gta)      BBOX="-79.90,43.47,-78.97,44.00" ;;
  downtown) BBOX="-79.45,43.62,-79.32,43.69" ;;
  *) echo "Unknown area: $AREA (use gta or downtown)" >&2; exit 1 ;;
esac

if ! command -v pmtiles >/dev/null; then
  echo "pmtiles CLI not found. Install it with: brew install pmtiles" >&2
  exit 1
fi

mkdir -p public/data
pmtiles extract "https://build.protomaps.com/${BUILD}.pmtiles" "public/data/${AREA}.pmtiles" \
  --bbox="$BBOX" --maxzoom=15
ls -lh "public/data/${AREA}.pmtiles"
