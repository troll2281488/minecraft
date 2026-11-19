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

  return Object.freeze({
    source: manifest.source,
    commit: manifest.commit,
    minecraftVersion: manifest.minecraftVersion,
    models,
    animations,
    getModel(id) { return models.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`) ?? null; },
    getAnimations(id) { return animations.get(id.startsWith('minecraft:') ? id : `minecraft:${id}`) ?? null; },
  });
}
