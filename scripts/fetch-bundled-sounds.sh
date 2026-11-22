#!/usr/bin/env bash
set -euo pipefail

# Only CC0 footsteps and generic material impacts are bundled. The game never
# downloads or redistributes Mojang's proprietary Minecraft audio.
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OUT="assets/audio"
mkdir -p "$OUT/kenney-footsteps" "$OUT/kenney-impact" "$OUT/oga-rpg-sfx"

BASE="https://raw.githubusercontent.com/euuuuuuan/moonshard-warden-public/897d26af64aab4003b057b3910a7118279b927d8/src/assets"
fetch_one() {
  local source="$1"
  local destination="$2"
  curl --fail --location --retry 3 "$source" --output "$destination"
}

for file in footstep00.ogg footstep02.ogg footstep06.ogg footstep09.ogg; do
  fetch_one "$BASE/kenney-rpg-audio/$file" "$OUT/kenney-footsteps/$file"
done
for file in impactMining_002.ogg impactMetal_heavy_001.ogg; do
  fetch_one "$BASE/kenney-impact/$file" "$OUT/kenney-impact/$file"
done
# CC0 creature ambience from OpenGameArt's 80 CC0 RPG SFX collection.
fetch_one "$BASE/oga-rpg-sfx/creature_monster_02.ogg" "$OUT/oga-rpg-sfx/creature_monster_02.ogg"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = 'assets/audio';
const files = [];
for (const pack of ['kenney-footsteps', 'kenney-impact', 'oga-rpg-sfx']) {
  const dir = path.join(root, pack);
  for (const file of fs.readdirSync(dir).sort()) {
    if (/\.(ogg|wav)$/i.test(file)) files.push({ pack, file });
  }
}
if (files.length < 7) throw new Error(`Expected at least 7 built-in audio files, got ${files.length}`);
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
  source: 'Kenney CC0 footsteps and impact effects; OpenGameArt CC0 creature effect',
  license: 'CC0-1.0',
  files,
}, null, 2) + '\n');
console.log(`Prepared ${files.length} built-in CC0 audio files.`);
NODE

cat > "$OUT/LICENSES.txt" <<'EOF'
Built-in sound effects included in the game build:

- Kenney Impact Sounds 1.0 — https://kenney.nl/assets/impact-sounds
  License: Creative Commons CC0 1.0 Universal.
- Kenney RPG Audio 1.0 (footstep samples only) — https://kenney.nl/assets/rpg-audio
  License: Creative Commons CC0 1.0 Universal.
- "80 CC0 RPG SFX" by rubberduck — https://opengameart.org/content/80-cc0-rpg-sfx
  License: Creative Commons CC0 1.0 Universal. Only creature_monster_02.ogg is included.

Only the named footstep samples, two generic impact samples, and one creature sample are fetched.
No other audio from those packs is included. No Mojang/Minecraft original audio
is included.
EOF
