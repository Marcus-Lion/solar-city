#!/usr/bin/env bash
# Build a single self-contained dist/index.html with the CSS, game code, and the
# Leaflet library all inlined. The result has no same-origin subresources, so the
# only thing it needs from the network is the OpenStreetMap map tiles. This makes
# the deployed game robust against CDNs, caches, or proxies that block .css/.js.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
{
  echo '<!DOCTYPE html>'
  echo '<html lang="en">'
  echo '<head>'
  echo '<meta charset="UTF-8" />'
  echo '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
  echo '<title>SolarCity — Solar Tycoon for a Real Zip</title>'
  echo '<style>'
  cat vendor/leaflet/leaflet.css
  echo
  cat styles.css
  echo '</style>'
  echo '</head>'
  echo '<body>'
  # Body markup (header + main + toasts) extracted from the modular index.html.
  sed -n '11,73p' index.html
  echo '<script>'
  cat vendor/leaflet/leaflet.js
  echo '</script>'
  echo '<script>'
  cat js/data.js js/game.js js/map.js js/ui.js js/main.js
  echo '</script>'
  echo '</body>'
  echo '</html>'
} > dist/index.html
echo "Built dist/index.html ($(wc -c < dist/index.html) bytes)"
