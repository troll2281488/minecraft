/**
 * Loader for InventivetalentDev's Minecraft 1.20.1 entity-model dataset.
 *
 * The upstream JSON format stores hierarchical model parts, cubes, UV offsets,
 * texture dimensions and animation keyframes. Keep the original JSON intact:
 * the renderer adapter can interpret the complete format without lossy conversion.
 */
const ROOT = new URL('../../assets/vanilla-models/', import.meta.url);

async function readJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Entity model asset failed: ${url} (${response.status})`);
  return response.json();
}

function safePath(path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('Invalid entity model asset path');
  }
  return path;
}

function emptyEntityModelPack() {
  const models = new Map();
  const animations = new Map();
  return Object.freeze({
    source: null, commit: null, minecraftVersion: null, models, animations,
    getModel() { return null; },
    toLegacyParts() { return null; },
    getAnimations() { return null; },
  });
}

export async function loadEntityModelPack() {
  let manifest;
  try {
    manifest = await readJson(new URL('manifest.json', ROOT));
  } catch (error) {
    console.warn('[models] Model pack unavailable; using built-in mob rendering.', error);
    return emptyEntityModelPack();
  }
  if (manifest.minecraftVersion !== '1.20.1' || !Array.isArray(manifest.models) || !Array.isArray(manifest.animations)) {
    console.warn('[models] Model pack manifest is invalid; using built-in mob rendering.');
    return emptyEntityModelPack();
  }

  const models = new Map();
  const animations = new Map();
  let failedAssets = 0;
  const loadAll = async (paths, target) => {
    const concurrency = 12;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
      while (cursor < paths.length) {
        const index = cursor++;
        try {
          const path = safePath(paths[index]);
          const data = await readJson(new URL(path, ROOT));
          if (!data || typeof data !== 'object' || typeof data.id !== 'string') {
            failedAssets++;
            continue;
          }
          target.set(data.id, data);
        } catch {
          // One missing/corrupt model must not prevent the rest of the game booting.
          failedAssets++;
        }
      }
    });
    await Promise.all(workers);
  };

  await Promise.all([
    loadAll(manifest.models, models),
    loadAll(manifest.animations, animations),
  ]);
  if (failedAssets) console.warn(`[models] Skipped ${failedAssets} unavailable model asset(s).`);

  const toLegacyParts = (id, color = [0.55, 0.48, 0.40, 1]) => {
    const model = models.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`);
    const root = model?.layers?.main?.root;
    if (!root) return null;
    const parts = [];
    const legIndices = new Set();
    const armIndices = new Set();
    const visit = (bone, parentOffset = [0, 0, 0], boneName = 'root') => {
      const pose = bone.pose ?? {};
      const offset = [
        parentOffset[0] + (pose.offset?.[0] ?? 0),
        parentOffset[1] + (pose.offset?.[1] ?? 0),
        parentOffset[2] + (pose.offset?.[2] ?? 0),
      ];
      for (const cube of bone.cubes ?? []) {
        const origin = cube.origin ?? [0, 0, 0];
        const size = cube.size ?? [0, 0, 0];
        const center = [
          offset[0] + origin[0] + size[0] / 2,
          offset[1] + origin[1] + size[1] / 2,
          offset[2] + origin[2] + size[2] / 2,
        ];
        const index = parts.length;
        const partColor = id.replace('minecraft:', '') === 'player'
          ? (/head/i.test(boneName) ? [0.72, 0.48, 0.32, 1]
            : /arm/i.test(boneName) ? [0.12, 0.48, 0.72, 1]
            : /leg/i.test(boneName) ? [0.16, 0.24, 0.48, 1]
            : [0.12, 0.48, 0.72, 1])
          : color;
        parts.push([
          [center[0] / 16, (24 - center[1]) / 16, -center[2] / 16],
          [size[0] / 16, size[1] / 16, size[2] / 16],
          partColor,
        ]);
        if (/leg|foot|wing/i.test(boneName)) legIndices.add(index);
        if (/arm/i.test(boneName)) armIndices.add(index);
      }
      for (const [name, child] of Object.entries(bone.children ?? {})) visit(child, offset, name);
    };
    visit(root);
    return parts.length ? { parts, legIndices, armIndices } : null;
  };

  return Object.freeze({
    source: manifest.source,
    commit: manifest.commit,
    minecraftVersion: manifest.minecraftVersion,
    models,
    animations,
    getModel(id) { return models.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`) ?? null; },
    toLegacyParts,
    getAnimations(id) { return animations.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`) ?? null; },
  });
}
