#!/usr/bin/env bash
# Regenerate every platform icon from assets/brand/*.svg
# Requires: rsvg-convert, magick (ImageMagick). Run from repo root or anywhere.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAND="$ROOT/assets/brand"
SVG="$BRAND/icon.svg"          # rounded tile (transparent corners) - macOS, extension
SQUARE="$BRAND/icon-square.svg" # full-bleed - iOS
MONO="$BRAND/icon-mono.svg"     # template glyph - menubar

png() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }               # svg size out (RGBA)
png_flat() { rsvg-convert -w "$2" -h "$2" "$1" | magick - -background '#17130c' -alpha remove -alpha off "$3"; }

echo "==> preview"
png "$SVG" 1024 "$BRAND/icon-1024.png"

echo "==> browser extension (packages/extension/public/icon)"
EXT="$ROOT/packages/extension/public/icon"
for s in 16 32 48 128; do png "$SVG" "$s" "$EXT/$s.png"; done

echo "==> mac main AppIcon"
MAC="$ROOT/apps/mac/StashBro/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$MAC"
for s in 16 32 64 128 256 512 1024; do png "$SVG" "$s" "$MAC/icon_$s.png"; done

echo "==> mac menubar template (MenubarIcon.imageset)"
MB="$ROOT/apps/mac/StashBro/Assets.xcassets/MenubarIcon.imageset"
mkdir -p "$MB"
png "$MONO" 16 "$MB/menubar_16.png"
png "$MONO" 32 "$MB/menubar_32.png"
png "$MONO" 48 "$MB/menubar_48.png"

echo "==> mac in-app color logo (BrandLogo.imageset)"
BL="$ROOT/apps/mac/StashBro/Assets.xcassets/BrandLogo.imageset"
mkdir -p "$BL"
png "$SVG" 24 "$BL/logo_24.png"
png "$SVG" 48 "$BL/logo_48.png"
png "$SVG" 72 "$BL/logo_72.png"

echo "==> iOS app icon (flattened, no alpha)"
IOS="$ROOT/apps/mobile/assets"
mkdir -p "$IOS"
png_flat "$SQUARE" 1024 "$IOS/icon.png"

echo "done."
