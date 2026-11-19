import { describe, it, assert, assertEqual } from './framework.js';
import { shouldFetchExternalItemTexture } from '../src/render/resource_pack.js';

describe('External item texture selection', () => {
  it('uses built-in generated icons for spawn eggs', () => {
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:cow_spawn_egg', spawnEggMob: 'cow' }), false);
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:zombie_spawn_egg', spawnEggMob: 'zombie' }), false);
  });

  it('does not request textures for block items', () => {
    assertEqual(shouldFetchExternalItemTexture({ id: 'mc:stone', block: 'mc:stone' }), false);
  });

  it('still requests external textures for ordinary non-block items', () => {
    assert(shouldFetchExternalItemTexture({ id: 'mc:apple' }));
    assert(shouldFetchExternalItemTexture({ id: 'mc:iron_ingot' }));
  });
});
