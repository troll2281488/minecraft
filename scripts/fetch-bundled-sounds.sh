#!/usr/bin/env bash
set -euo pipefail

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OUT="assets/audio"
mkdir -p "$OUT/kenney-impact" "$OUT/kenney-ui"

fetch_pack() {
  local name="$1"
  local url="$2"
  local destination="$3"
  mkdir -p "$TMP/$name"
  curl --fail --location --retry 3 "$url" --output "$TMP/$name.zip"
  unzip -q "$TMP/$name.zip" -d "$TMP/$name"
  find "$TMP/$name" -type f \\( -iname '*.ogg' -o -iname '*.wav' \\) -print0 |
    while IFS= read -r -d '' file; do
      cp "$file" "$destination/$(basename "$file")"
    done
}

fetch_pack "impact" \
  "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip" \
  "$OUT/kenney-impact"
fetch_pack "ui" \
  "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip" \
  "$OUT/kenney-ui"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = 'assets/audio';
const files = [];
for (const pack of ['kenney-impact', 'kenney-ui']) {
  const dir = path.join(root, pack);
  for (const file of fs.readdirSync(dir).sort()) {
    if (/\\.(ogg|wav)$/i.test(file)) files.push({ pack, file });
  }
}
if (!files.length) throw new Error('No bundled audio files were downloaded');
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
  source: 'Kenney Impact Sounds + Kenney UI Audio',
  license: 'CC0-1.0',
  files,
}, null, 2) + '\\n');
console.log(`Prepared ${files.length} built-in CC0 audio files.`);
NODE

cat > "$OUT/LICENSES.txt" <<'EOF'
Built-in sound effects included in the game build:

- Kenney Impact Sounds 1.0 — https://kenney.nl/assets/impact-sounds
  License: Creative Commons CC0 1.0 Universal.
- Kenney UI Audio 1.0 — https://kenney.nl/assets/ui-audio
  License: Creative Commons CC0 1.0 Universal.

The original assets are downloaded during the GitHub Actions build and are not
part of the source repository. No Mojang/Minecraft original audio is included.
EOF
