/**
 * Loader for InventivetalentDev's Minecraft 1.20.1 entity-model dataset.
 *
 * The upstream JSON format stores hierarchical model parts, cubes, UV offsets,
 * texture dimensions and animation keyframes. Keep the original JSON intact:
 * the renderer adapter can interpret the complete format without lossy conversion.
 */
const ROOT = new URL('../../assets/vanilla-models/', import.meta.url);

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Entity model asset failed: ${url} (${response.status})`);
  return response.json();
}

function safePath(path) {
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('Invalid entity model asset path');
  }
  return path;
}

export async function loadEntityModelPack() {
  const manifest = await readJson(new URL('manifest.json', ROOT));
  if (manifest.minecraftVersion !== '1.20.1' || !Array.isArray(manifest.models) || !Array.isArray(manifest.animations)) {
    throw new Error('Unsupported or incomplete entity model manifest');
  }

  const models = new Map();
  const animations = new Map();
  const loadAll = async (paths, target) => {
    const concurrency = 12;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
      while (cursor < paths.length) {
        const index = cursor++;
        const path = safePath(paths[index]);
        const data = await readJson(new URL(path, ROOT));
        if (!data || typeof data !== 'object' || typeof data.id !== 'string') continue;
        target.set(data.id, data);
      }
    });
    await Promise.all(workers);
  };

  await Promise.all([
    loadAll(manifest.models, models),
    loadAll(manifest.animations, animations),
  ]);

  const toLegacyParts = (id, color = [0.55, 0.48, 0.40, 1]) => {
    const model = models.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`);
    const root = model?.layers?.main?.root;
    if (!root) return null;
    const parts = [];
    const legIndices = new Set();
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
        parts.push([
          [center[0] / 16, (24 - center[1]) / 16, -center[2] / 16],
          [size[0] / 16, size[1] / 16, size[2] / 16],
          color,
        ]);
        if (/leg|foot|wing/i.test(boneName)) legIndices.add(index);
      }
      for (const [name, child] of Object.entries(bone.children ?? {})) visit(child, offset, name);
    };
    visit(root);
    return parts.length ? { parts, legIndices } : null;
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
