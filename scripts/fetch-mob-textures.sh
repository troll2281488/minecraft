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
download "wolf/wolf.png" "wolf.png"
download "horse/horse_brown.png" "horse.png"
download "bat.png" "bat.png"
download "blaze.png" "blaze.png"
download "ghast/ghast.png" "ghast.png"
download "guardian.png" "guardian.png"
download "guardian_elder.png" "guardian_elder.png"
download "endermite.png" "endermite.png"
download "slime/magmacube.png" "magmacube.png"
download "cat/ocelot.png" "ocelot.png"
download "parrot/parrot_red_blue.png" "parrot.png"
download "shulker/shulker.png" "shulker.png"
download "silverfish.png" "silverfish.png"
download "slime/slime.png" "slime.png"
download "snow_golem.png" "snow_golem.png"
download "squid/squid.png" "squid.png"
download "illager/vex.png" "vex.png"
download "witch.png" "witch.png"
download "wither/wither.png" "wither.png"
download "skeleton/wither_skeleton.png" "wither_skeleton.png"
download "zombie_villager/zombie_villager.png" "zombie_villager.png"
download "zombie/husk.png" "husk.png"
download "horse/donkey.png" "donkey.png"
download "horse/mule.png" "mule.png"
download "horse/horse_skeleton.png" "skeleton_horse.png"
download "horse/horse_zombie.png" "zombie_horse.png"
download "llama/creamy.png" "llama.png"
download "rabbit/brown.png" "rabbit.png"
download "bear/polarbear.png" "polar_bear.png"
download "cow/brown_mooshroom.png" "mooshroom.png"
download "zombie/zombie.png" "zombie.png"
download "skeleton/skeleton.png" "skeleton.png"
download "skeleton/stray.png" "stray.png"
download "creeper/creeper.png" "creeper.png"
download "enderman/enderman.png" "enderman.png"
download "spider/spider.png" "spider.png"
download "spider/cave_spider.png" "cave_spider.png"

# Vanilla villager base + career overlays (composited at runtime by the renderer).
download "villager/villager.png" "villager.png"
for career in farmer fisherman shepherd librarian cleric armorer toolsmith butcher leatherworker fletcher nitwit; do
  download "villager/profession/$career.png" "villager_$career.png"
done

echo "Downloaded $(find "$OUT" -maxdepth 1 -name '*.png' | wc -l) mob skins."
