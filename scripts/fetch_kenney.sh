#!/usr/bin/env bash
# OpenMind — Kenney CC0 asset fetcher (macOS/Linux).
# Run from the repo root:  bash scripts/fetch_kenney.sh
#
# Kenney's direct download URLs change occasionally. This script tries the
# conventional URL; when a download fails it tells you which page to visit
# and where to drop the zip, then re-run. Existing zips in scripts/downloads/
# are reused. The shells are fully playable WITHOUT these assets.
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
downloads="$root/scripts/downloads"
mapping="$root/scripts/kenney_mapping.json"
mkdir -p "$downloads"

command -v jq >/dev/null || { echo "[kenney] this script needs jq (brew install jq / apt install jq)"; exit 1; }

missing=()
pack_count=$(jq '.packs | length' "$mapping")

for ((p = 0; p < pack_count; p++)); do
  name=$(jq -r ".packs[$p].name" "$mapping")
  zip=$(jq -r ".packs[$p].zip" "$mapping")
  url=$(jq -r ".packs[$p].url" "$mapping")
  zip_path="$downloads/$zip"

  if [[ ! -f "$zip_path" ]]; then
    try_url="https://kenney.nl/media/pages/assets/$name/$zip"
    echo "[kenney] downloading $name…"
    if ! curl -fsSL "$try_url" -o "$zip_path"; then
      echo "[kenney] auto-download failed for $name."
      echo "         1. open  $url"
      echo "         2. click Download, save as  $zip_path"
      echo "         3. re-run this script"
      missing+=("$name")
      rm -f "$zip_path"
      continue
    fi
  fi

  extract="$downloads/$name"
  [[ -d "$extract" ]] || unzip -q "$zip_path" -d "$extract"

  file_count=$(jq ".packs[$p].files | length" "$mapping")
  for ((f = 0; f < file_count; f++)); do
    from=$(jq -r ".packs[$p].files[$f].from" "$mapping")
    to=$(jq -r ".packs[$p].files[$f].to" "$mapping")
    if [[ -f "$extract/$from" ]]; then
      mkdir -p "$root/$(dirname "$to")"
      cp "$extract/$from" "$root/$to"
      echo "[kenney]   + $to"
    else
      echo "[kenney]   MISSING in pack: $from — fix the path in kenney_mapping.json"
    fi
  done
done

if ((${#missing[@]} > 0)); then
  echo
  echo "[kenney] packs needing manual download: ${missing[*]}"
else
  echo
  echo "[kenney] done. Rebuild the shells:  npm -w shells run build"
fi
