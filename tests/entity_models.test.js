import { describe, it, assert, assertEqual } from './framework.js';
import { loadEntityModelPack } from '../src/render/entity_models.js';

describe('Entity model pack startup resilience', () => {
  it('keeps available models when one optional asset is missing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.endsWith('/manifest.json')) {
        return new Response(JSON.stringify({
          minecraftVersion: '1.20.1',
          source: 'test',
          commit: 'test',
          models: ['models/zombie.json', 'models/missing.json'],
          animations: ['animations/missing.json'],
        }), { status: 200 });
      }
      if (path.endsWith('/models/zombie.json')) {
        return new Response(JSON.stringify({
          id: 'minecraft:zombie',
          layers: { main: { root: { cubes: [{ origin: [0, 0, 0], size: [8, 8, 8] }] } } },
        }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };
    try {
      const pack = await loadEntityModelPack();
      assert(pack.getModel('zombie'), 'available zombie model should load');
      assertEqual(pack.getModel('missing'), null);
      assertEqual(pack.getAnimations('zombie'), null);
      assert(pack.toLegacyParts('zombie'), 'available model should still adapt');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a safe empty adapter when the manifest cannot be fetched', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('offline', { status: 503 });
    try {
      const pack = await loadEntityModelPack();
      assertEqual(pack.getModel('zombie'), null);
      assertEqual(pack.getAnimations('zombie'), null);
      assertEqual(pack.toLegacyParts('zombie'), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
