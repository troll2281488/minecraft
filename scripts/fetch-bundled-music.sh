#!/usr/bin/env bash
set -euo pipefail

# Five calm, original game-music tracks by Juhani Junkala (SubspaceAudio).
# The source collection is CC0 1.0; the artist and source are credited below.
# Pinned mirror commit is used only as a stable transport for the CC0 files.
COMMIT="59442b38d82bb3a8d1e69075ec56c68dfecf9407"
BASE="https://raw.githubusercontent.com/ArokhSlade/Brackeys-Jam-2024-2-The-6-Tuplets/${COMMIT}/audio/placeholder/JRPG%20Music%20Pack%20%234%20%5BCalm%5D%20by%20Juhani%20Junkala"
OUT="assets/audio/music"
mkdir -p "$OUT"

fetch_track() {
  local source="$1" target="$2"
  curl --fail --location --retry 3 "$BASE/$source" --output "$OUT/$target"
}

fetch_track "Calm1%20-%20A%20Place%20I%20Call%20Home.ogg" "a-place-i-call-home.ogg"
fetch_track "Calm2%20-%20Childhood%20Friends.ogg" "childhood-friends.ogg"
fetch_track "Calm3%20-%20Peaceful%20Days.ogg" "peaceful-days.ogg"
fetch_track "Calm4%20-%20Sand%20Castles.ogg" "sand-castles.ogg"
fetch_track "Calm5%20-%20Summer%20Memories.ogg" "summer-memories.ogg"

node --input-type=module <<'NODE'
import fs from 'node:fs';
const tracks = [
  { file: 'a-place-i-call-home.ogg', name: 'A Place I Call Home' },
  { file: 'childhood-friends.ogg', name: 'Childhood Friends' },
  { file: 'peaceful-days.ogg', name: 'Peaceful Days' },
  { file: 'sand-castles.ogg', name: 'Sand Castles' },
  { file: 'summer-memories.ogg', name: 'Summer Memories' },
];
for (const track of tracks) {
  if (!fs.existsSync(`assets/audio/music/${track.file}`)) throw new Error(`Missing music: ${track.file}`);
}
fs.writeFileSync('assets/audio/music/manifest.json', JSON.stringify({
  source: 'JRPG Pack 4 Calm',
  artist: 'Juhani Junkala (SubspaceAudio)',
  license: 'CC0-1.0',
  sourceUrl: 'https://opengameart.org/content/jrpg-pack-4-calm',
  tracks,
}, null, 2) + '\n');
console.log(`Prepared ${tracks.length} built-in CC0 music tracks.`);
NODE

cat > "$OUT/LICENSES.txt" <<'EOF'
Background music:
- JRPG Pack 4 Calm by Juhani Junkala (SubspaceAudio)
- Source: https://opengameart.org/content/jrpg-pack-4-calm
- License: CC0 1.0 Universal
- Tracks included: A Place I Call Home, Childhood Friends, Peaceful Days,
  Sand Castles, Summer Memories.
These are original calm game-music compositions, not Minecraft/Mojang music.
EOF
