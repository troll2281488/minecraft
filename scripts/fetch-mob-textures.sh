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


# Additional Java mobs through 1.19 (including the 1.19 additions).
download "bee/bee.png" "bee.png"
download "enderdragon/dragon.png" "ender_dragon.png"
download "goat/goat.png" "goat.png"
download "axolotl/axolotl_lucy.png" "axolotl.png"
download "allay/allay.png" "allay.png"
download "frog/temperate_frog.png" "frog.png"
download "tadpole/tadpole.png" "tadpole.png"
download "warden/warden.png" "warden.png"
download "fox/fox.png" "fox.png"
download "panda/panda.png" "panda.png"
download "dolphin.png" "dolphin.png"
download "fish/cod.png" "cod.png"
download "fish/salmon.png" "salmon.png"
download "fish/pufferfish.png" "pufferfish.png"
download "phantom.png" "phantom.png"
download "iron_golem/iron_golem.png" "iron_golem.png"
download "illager/pillager.png" "pillager.png"
download "illager/evoker.png" "evoker.png"
download "illager/vindicator.png" "vindicator.png"
download "illager/illusioner.png" "illusioner.png"
download "illager/ravager.png" "ravager.png"
download "piglin/piglin.png" "piglin.png"
download "piglin/zombified_piglin.png" "zombified_piglin.png"
download "piglin/piglin_brute.png" "piglin_brute.png"
download "hoglin/hoglin.png" "hoglin.png"
download "hoglin/zoglin.png" "zoglin.png"

# Vanilla villager base + career overlays (composited at runtime by the renderer).
download "villager/villager.png" "villager.png"
for career in farmer fisherman shepherd librarian cleric armorer toolsmith butcher leatherworker fletcher nitwit; do
  download "villager/profession/$career.png" "villager_$career.png"
done


# Additional Java 1.19 variants and attached entity skins. These are loaded
# alongside the default species textures and selected deterministically by the
# renderer, so different animals no longer all share one identical skin.
mkdir -p "$OUT/variants"
download_variant() {
  local source="$1" target="$2"
  curl --fail --location --retry 3 "$BASE/$source" --output "$OUT/variants/$target"
  test -s "$OUT/variants/$target"
}

# Axolotl colour morphs, all three frog climates, fox coats and sleep poses.
download_variant "axolotl/axolotl_wild.png" "axolotl_wild.png"
download_variant "axolotl/axolotl_gold.png" "axolotl_gold.png"
download_variant "axolotl/axolotl_cyan.png" "axolotl_cyan.png"
download_variant "axolotl/axolotl_blue.png" "axolotl_blue.png"
download_variant "frog/cold_frog.png" "frog_cold.png"
download_variant "frog/warm_frog.png" "frog_warm.png"
download_variant "fox/snow_fox.png" "fox_snow.png"
download_variant "fox/fox_sleep.png" "fox_sleep.png"
download_variant "fox/snow_fox_sleep.png" "fox_snow_sleep.png"

# All Java cat, parrot, rabbit and panda coats/patterns.
for variant in all_black black british_shorthair calico jellie persian ragdoll red siamese tabby white; do
  download_variant "cat/$variant.png" "cat_$variant.png"
done
for variant in blue green grey red_blue yellow_blue; do
  download_variant "parrot/parrot_$variant.png" "parrot_$variant.png"
done
for variant in black brown caerbannog gold salt toast white white_splotched; do
  download_variant "rabbit/$variant.png" "rabbit_$variant.png"
done
for variant in aggressive brown lazy playful weak worried; do
  download_variant "panda/${variant}_panda.png" "panda_$variant.png"
done

# Horse coat/marking variants and equipment overlays.
for variant in black brown chestnut creamy darkbrown gray white; do
  download_variant "horse/horse_$variant.png" "horse_$variant.png"
done
for variant in black white whitedots whitefield; do
  download_variant "horse/horse_markings_$variant.png" "horse_markings_$variant.png"
done
for variant in diamond gold iron leather; do
  download_variant "horse/armor/horse_armor_$variant.png" "horse_armor_$variant.png"
done

# Other visible states: bee anger/nectar, golem damage, pig saddle, ghast attack,
# stray overlay, enderman/phantom/spider eyes, and shulker colour palette.
for variant in bee_angry bee_angry_nectar bee_nectar bee_stinger; do
  download_variant "bee/$variant.png" "$variant.png"
done
for variant in low medium high; do
  download_variant "iron_golem/iron_golem_crackiness_$variant.png" "iron_golem_crackiness_$variant.png"
done
download_variant "pig/pig_saddle.png" "pig_saddle.png"
download_variant "ghast/ghast_shooting.png" "ghast_shooting.png"
download_variant "skeleton/stray_overlay.png" "stray_overlay.png"
download_variant "enderman/enderman_eyes.png" "enderman_eyes.png"
download_variant "phantom_eyes.png" "phantom_eyes.png"
download_variant "spider_eyes.png" "spider_eyes.png"
for color in black blue brown cyan gray green light_blue light_gray lime magenta orange pink purple red white yellow; do
  download_variant "shulker/shulker_$color.png" "shulker_$color.png"
done

# Fish colour/pattern atlases and additional rideable/transport textures.
for variant in tropical_a tropical_b tropical_a_pattern_1 tropical_a_pattern_2 tropical_a_pattern_3 tropical_a_pattern_4 tropical_a_pattern_5 tropical_a_pattern_6 tropical_b_pattern_1 tropical_b_pattern_2 tropical_b_pattern_3 tropical_b_pattern_4 tropical_b_pattern_5 tropical_b_pattern_6; do
  download_variant "fish/$variant.png" "$variant.png"
done
for wood in oak spruce birch jungle acacia dark_oak mangrove; do
  download_variant "boat/$wood.png" "boat_$wood.png"
done
for color in black blue brown cyan gray green light_blue light_gray lime magenta orange pink purple red white yellow; do
  download_variant "bed/$color.png" "bed_$color.png"
done
download_variant "armorstand/wood.png" "armor_stand.png"
download_variant "elytra.png" "elytra.png"
download_variant "minecart.png" "minecart.png"
download_variant "experience_orb.png" "experience_orb.png"
download_variant "fishing_hook.png" "fishing_hook.png"
download_variant "lead_knot.png" "lead_knot.png"
download_variant "llama/brown.png" "llama_brown.png"
download_variant "llama/gray.png" "llama_gray.png"
download_variant "llama/white.png" "llama_white.png"
download_variant "cow/red_mooshroom.png" "red_mooshroom.png"

node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = 'assets/mob-textures';
const files = [];
for (const file of fs.readdirSync(path.join(root, 'variants')).sort()) {
  if (file.endsWith('.png')) files.push(file);
}
fs.writeFileSync(path.join(root, 'variants', 'manifest.json'), JSON.stringify({
  source: 'ItsBrian/minecraft-textures',
  commit: process.env.SOURCE_COMMIT ?? '894006ad417c27f767b66bbcfc1afd1b77655531',
  minecraftVersion: '1.19.x',
  files,
}, null, 2) + '\n');
console.log(`Downloaded ${files.length} additional mob, creature-variant and entity textures.`);
NODE

echo "Downloaded $(find "$OUT" -maxdepth 1 -name '*.png' | wc -l) mob skins."
