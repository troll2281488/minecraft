#!/usr/bin/env bash
set -euo pipefail

# Pinned upstream snapshot; do not follow a moving branch at build time.
MODEL_PACK_COMMIT="69eab7929d749fa33d64daa8776cce83970ffd12"
MODEL_PACK_URL="https://codeload.github.com/InventivetalentDev/minecraft-entity-models/zip/${MODEL_PACK_COMMIT}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl --fail --location --retry 3 "$MODEL_PACK_URL" --output "$TMP_DIR/models.zip"
unzip -q "$TMP_DIR/models.zip" -d "$TMP_DIR"
SOURCE_DIR="$TMP_DIR/minecraft-entity-models-${MODEL_PACK_COMMIT}"

test -d "$SOURCE_DIR/minecraft"
test -d "$SOURCE_DIR/animations"

mkdir -p assets/vanilla-models
rm -rf assets/vanilla-models/minecraft assets/vanilla-models/animations
cp -R "$SOURCE_DIR/minecraft" assets/vanilla-models/
cp -R "$SOURCE_DIR/animations" assets/vanilla-models/

# Record the exact upstream snapshot and an index for the future WebGL model loader.
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
const root = 'assets/vanilla-models';
const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return collect(full);
  return entry.name.endsWith('.json') ? [full.replaceAll('\\\\', '/').replace(root + '/', '')] : [];
}).sort();
const manifest = {
  source: 'https://github.com/InventivetalentDev/minecraft-entity-models',
  commit: 'a2ce75c09ea64225ce236ddb8f4cafc2715cd651',
  minecraftVersion: '1.17.1',
  models: collect(path.join(root, 'minecraft')),
  animations: collect(path.join(root, 'animations')),
};
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${manifest.models.length} model JSON files and ${manifest.animations.length} animation JSON files.`);
NODE
