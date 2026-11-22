#!/usr/bin/env bash
set -euo pipefail

# Redistributable CC0 audio only. Original Mojang audio is not bundled.
OUT="assets/audio"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rm -rf "$OUT"
mkdir -p "$OUT"

fetch_zip() {
  local url="$1" name="$2"
  curl --fail --location --retry 3 --retry-all-errors --silent --show-error --user-agent "Mozilla/5.0 (compatible; Donorcraft audio asset fetcher)" --referer "https://kenney.nl/" "$url" -o "$TMP/$name.zip"
  mkdir -p "$TMP/$name"
  python3 - "$TMP/$name.zip" "$TMP/$name" <<'PY'
import pathlib, sys, zipfile
archive, out = sys.argv[1:]
out = pathlib.Path(out)
with zipfile.ZipFile(archive) as z:
    for item in z.infolist():
        if item.is_dir() or pathlib.Path(item.filename).suffix.lower() not in {'.ogg', '.wav'}:
            continue
        # Keep only audio payloads; flatten folder layout while retaining unique names.
        name = pathlib.Path(item.filename).name
        if not name or name.startswith('._'):
            continue
        target = out / name
        if target.exists():
            stem, suffix = target.stem, target.suffix
            i = 2
            while (out / f'{stem}_{i}{suffix}').exists(): i += 1
            target = out / f'{stem}_{i}{suffix}'
        target.write_bytes(z.read(item))
PY
  mkdir -p "$OUT/$name"
  cp "$TMP/$name"/* "$OUT/$name/" 2>/dev/null || true
}

fetch_zip "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip" "kenney-impact"
fetch_zip "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip" "kenney-rpg"
fetch_zip "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip" "kenney-ui"
fetch_zip "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip" "kenney-interface"
fetch_zip "https://opengameart.org/sites/default/files/80-CC0-creature-SFX_0.zip" "oga-creatures"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = 'assets/audio';
const files = [];
function groupOf(file, pack) {
  const n = file.toLowerCase().replace(/\.[^.]+$/, '');
  if (pack === 'oga-creatures') return 'mob:creature';
  if (/^footstep_(carpet|concrete|grass|snow|wood)_/.test(n)) {
    const material = n.match(/^footstep_(carpet|concrete|grass|snow|wood)_/)[1];
    return 'step:' + material;
  }
  if (/^footstep\d+/.test(n)) return null; // skip the short RPG footstep set
  if (/footstep|step/.test(n)) return 'step:generic';
  if (/impactmining/.test(n)) return 'impact:generic';
  if (/impact.*(wood|plank)/.test(n)) return 'impact:wood';
  if (/impact.*(glass)/.test(n)) return 'impact:glass';
  if (/impact.*(metal|plate|tin)/.test(n)) return 'impact:metal';
  if (/impact/.test(n)) return 'impact:generic';
  if (/door|creak/.test(n)) return 'door';
  if (/click|confirm|error|select|toggle|open|close|hover|switch|button/.test(n)) return 'ui';
  if (/coin|pickup|drop|handle|book|cloth|leather|latch|equip/.test(n)) return 'inventory';
  return null;
}
for (const pack of fs.readdirSync(root).sort()) {
  const dir = path.join(root, pack);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/\.(ogg|wav)$/i.test(file)) continue;
    const group = groupOf(file, pack);
    if (group) files.push({ pack, file, group });
  }
}
const counts = new Map();
for (const item of files) counts.set(item.group, (counts.get(item.group) || 0) + 1);
if (files.length < 100) throw new Error(`Expected 100+ classified CC0 sounds, got ${files.length}`);
for (const required of ['step:grass','step:wood','step:snow','impact:generic','door','ui','inventory','mob:creature']) {
  if (!counts.has(required)) throw new Error(`Missing sound group: ${required}`);
}
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
  license: 'CC0-1.0',
  files,
  counts: Object.fromEntries(counts),
}, null, 2) + '\n');
console.log(`Prepared ${files.length} CC0 clips in ${counts.size} event groups.`);
NODE

cat > "$OUT/LICENSES.txt" <<'EOF'
Bundled sound effects:
- Kenney Impact Sounds 1.0 — https://kenney.nl/assets/impact-sounds — CC0 1.0 Universal.
- Kenney RPG Audio 1.0 — https://kenney.nl/assets/rpg-audio — CC0 1.0 Universal.
- Kenney UI Audio 1.0 — https://kenney.nl/assets/ui-audio — CC0 1.0 Universal.
- Kenney Interface Sounds 1.0 — https://kenney.nl/assets/interface-sounds — CC0 1.0 Universal.
- 80 CC0 Creature SFX by rubberduck — https://opengameart.org/content/80-cc0-creature-sfx — CC0.
Only audio files are redistributed. No Mojang/Minecraft original audio is included.
EOF
