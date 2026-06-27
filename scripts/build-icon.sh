#!/usr/bin/env bash
# Regenerate build/icon.icns and resources/icon.png from build/icon.svg.
# Uses only tools that ship with macOS: qlmanage, sips, iconutil.
#
# Usage: ./scripts/build-icon.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/build/icon.svg"
ICONSET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"
PNG_BUILD="$ROOT/build/icon.png"
PNG_RES="$ROOT/resources/icon.png"

[[ -f "$SVG" ]] || { echo "missing $SVG"; exit 1; }

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# Rasterize the SVG once at 1024 via Quick Look.
qlmanage -t -s 1024 -o "$ICONSET" "$SVG" >/dev/null 2>&1
mv "$ICONSET/icon.svg.png" "$ICONSET/icon_1024.png"

# Downsample to every size .icns needs.
sips -z 16 16   "$ICONSET/icon_1024.png" --out "$ICONSET/icon_16x16.png"     >/dev/null
sips -z 32 32   "$ICONSET/icon_1024.png" --out "$ICONSET/icon_16x16@2x.png"  >/dev/null
sips -z 32 32   "$ICONSET/icon_1024.png" --out "$ICONSET/icon_32x32.png"     >/dev/null
sips -z 64 64   "$ICONSET/icon_1024.png" --out "$ICONSET/icon_32x32@2x.png"  >/dev/null
sips -z 128 128 "$ICONSET/icon_1024.png" --out "$ICONSET/icon_128x128.png"   >/dev/null
sips -z 256 256 "$ICONSET/icon_1024.png" --out "$ICONSET/icon_128x128@2x.png">/dev/null
sips -z 256 256 "$ICONSET/icon_1024.png" --out "$ICONSET/icon_256x256.png"   >/dev/null
sips -z 512 512 "$ICONSET/icon_1024.png" --out "$ICONSET/icon_256x256@2x.png">/dev/null
sips -z 512 512 "$ICONSET/icon_1024.png" --out "$ICONSET/icon_512x512.png"   >/dev/null
cp "$ICONSET/icon_1024.png" "$ICONSET/icon_512x512@2x.png"
rm "$ICONSET/icon_1024.png"

iconutil -c icns "$ICONSET" -o "$ICNS"

# 512px PNG fallback for electron-builder / Linux / window icon.
qlmanage -t -s 1024 -o "$ROOT/build" "$SVG" >/dev/null 2>&1
mv "$ROOT/build/icon.svg.png" "$PNG_BUILD"
sips -z 512 512 "$PNG_BUILD" --out "$PNG_BUILD" >/dev/null
cp "$PNG_BUILD" "$PNG_RES"

echo "Wrote:"
echo "  $ICNS"
echo "  $PNG_BUILD"
echo "  $PNG_RES"
