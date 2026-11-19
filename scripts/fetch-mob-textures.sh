#!/usr/bin/env bash
set -euo pipefail

# The project owner has permission to redistribute ItsBrian's self-created textures.
# Pin to a known repository commit so production builds are reproducible.
SOURCE_COMMIT="894006ad417c27f767b66bbcfc1afd1b77655531"
BASE="https://raw.githubusercontent.com/ItsBrian/minecraft-textures/${SOURCE_COMMIT}/entity"
OUT="assets/mob-textures"
mkdir -p "$OUT"

download() {
  local source="$1" target="$2"
  curl --fail --location --retry 3 "$BASE/$source" --output "$OUT/$target"
  test -s "$OUT/$target"
}

download "cow/cow.png" "cow.png"
download "pig/pig.png" "pig.png"
download "sheep/sheep.png" "sheep.png"
download "sheep/sheep_fur.png" "sheep_fur.png"
download "chicken.png" "chicken.png"
download "zombie/zombie.png" "zombie.png"
download "skeleton/skeleton.png" "skeleton.png"
download "skeleton/stray.png" "stray.png"
download "creeper/creeper.png" "creeper.png"
download "enderman/enderman.png" "enderman.png"
download "spider/spider.png" "spider.png"
download "spider/cave_spider.png" "cave_spider.png"

# Vanilla villager base + career overlays (composited at runtime by the renderer).
download "villager/villager.png" "villager.png"
for career in farmer fisherman shepherd fletcher librarian cleric armorer toolsmith weaponsmith butcher leatherworker nitwit; do
  download "villager/profession/$career.png" "villager_$career.png"
done

echo "Downloaded $(find "$OUT" -maxdepth 1 -name '*.png' | wc -l) mob skins."
