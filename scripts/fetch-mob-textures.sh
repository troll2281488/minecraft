#!/usr/bin/env bash
set -euo pipefail

# Extract the original Java Edition 1.19.4 mob skins directly from Mojang's
# official client JAR. This avoids third-party redraws or placeholder textures.
python3 <<'PY'
import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

VERSION = "1.19.4"
OUT = Path("assets/mob-textures")
OUT.mkdir(parents=True, exist_ok=True)

def get_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "Donorcraft-asset-builder/1.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)

manifest = get_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
version_entry = next((v for v in manifest["versions"] if v["id"] == VERSION), None)
if not version_entry:
    raise SystemExit(f"Mojang version {VERSION} not found")
version_data = get_json(version_entry["url"])
client_url = version_data["downloads"]["client"]["url"]

textures = {
    "cow.png": "cow/cow.png",
    "goat.png": "goat/goat.png",
    "pig.png": "pig/pig.png",
    "sheep.png": "sheep/sheep.png",
    "sheep_fur.png": "sheep/sheep_fur.png",
    "chicken.png": "chicken.png",
    "wolf.png": "wolf/wolf.png",
    "horse.png": "horse/horse_brown.png",
    "rabbit.png": "rabbit/brown.png",
    "polar_bear.png": "bear/polarbear.png",
    "mooshroom.png": "cow/brown_mooshroom.png",
    "zombie.png": "zombie/zombie.png",
    "skeleton.png": "skeleton/skeleton.png",
    "stray.png": "skeleton/stray.png",
    "bat.png": "bat.png",
    "blaze.png": "blaze.png",
    "ghast.png": "ghast/ghast.png",
    "guardian.png": "guardian.png",
    "guardian_elder.png": "guardian_elder.png",
    "endermite.png": "endermite.png",
    "magmacube.png": "slime/magmacube.png",
    "ocelot.png": "cat/ocelot.png",
    "parrot.png": "parrot/parrot_red_blue.png",
    "shulker.png": "shulker/shulker.png",
    "silverfish.png": "silverfish.png",
    "slime.png": "slime/slime.png",
    "snow_golem.png": "snow_golem.png",
    "squid.png": "squid/squid.png",
    "vex.png": "illager/vex.png",
    "witch.png": "witch.png",
    "wither.png": "wither/wither.png",
    "wither_skeleton.png": "skeleton/wither_skeleton.png",
    "zombie_villager.png": "zombie_villager/zombie_villager.png",
    "husk.png": "zombie/husk.png",
    "donkey.png": "horse/donkey.png",
    "mule.png": "horse/mule.png",
    "skeleton_horse.png": "horse/horse_skeleton.png",
    "zombie_horse.png": "horse/horse_zombie.png",
    "llama.png": "llama/creamy.png",
    "creeper.png": "creeper/creeper.png",
    "enderman.png": "enderman/enderman.png",
    "spider.png": "spider/spider.png",
    "cave_spider.png": "spider/cave_spider.png",
    "villager.png": "villager/villager.png",
}
for career in ("farmer", "fisherman", "shepherd", "librarian", "cleric",
               "armorer", "toolsmith", "butcher", "leatherworker", "fletcher", "nitwit"):
    textures[f"villager_{career}.png"] = f"villager/profession/{career}.png"

with tempfile.TemporaryDirectory() as temp_dir:
    jar_path = Path(temp_dir) / "minecraft-client.jar"
    request = urllib.request.Request(client_url, headers={"User-Agent": "Donorcraft-asset-builder/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, jar_path.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)

    with zipfile.ZipFile(jar_path) as client:
        available = set(client.namelist())
        for output_name, relative_path in textures.items():
            archive_path = f"assets/minecraft/textures/entity/{relative_path}"
            if archive_path not in available:
                raise SystemExit(f"Official {VERSION} client texture missing: {archive_path}")
            data = client.read(archive_path)
            if not data:
                raise SystemExit(f"Empty Mojang texture: {archive_path}")
            (OUT / output_name).write_bytes(data)

print(f"Extracted {len(textures)} original Mojang Java {VERSION} mob textures.")
PY
