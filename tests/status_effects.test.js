import { describe, it, assertEqual } from './framework.js';
import { PlayerStatusEffects, POTION_ITEMS } from '../src/entity/status_effects.js';

describe('Player potion effects', () => {
  it('registers the five supported drinkable potion types', () => {
    assertEqual(Object.keys(POTION_ITEMS).length, 5);
  });

  it('applies, expires and replaces effects using amplifier priority', () => {
    const effects = new PlayerStatusEffects();
    assertEqual(effects.apply('swiftness', 40, 0), true);
    assertEqual(effects.apply('swiftness', 80, 0), true);
    assertEqual(effects.apply('swiftness', 100, 1), true);
    assertEqual(effects.amplifier('swiftness'), 1);
    assertEqual(effects.apply('swiftness', 200, 0), false);
    for (let i = 0; i < 100; i++) effects.tick({ health: 20 });
    assertEqual(effects.has('swiftness'), false);
  });

  it('regenerates health on effect intervals', () => {
    const effects = new PlayerStatusEffects();
    const player = { health: 17 };
    effects.apply('regeneration', 100, 0);
    for (let i = 0; i < 50; i++) effects.tick(player);
    assertEqual(player.health, 18);
  });

  it('round-trips effects and rejects malformed save entries', () => {
    const source = new PlayerStatusEffects();
    source.apply('fire_resistance', 1200, 0);
    source.apply('strength', 600, 1);
    const restored = new PlayerStatusEffects().loadFrom([
      ...source.toJSON(), { type: 'invalid', duration: 999, amplifier: 0 },
    ]);
    assertEqual(restored.has('fire_resistance'), true);
    assertEqual(restored.amplifier('strength'), 1);
    assertEqual(restored.size, 2);
  });

  it('clears all active effects for milk bucket behavior', () => {
    const effects = new PlayerStatusEffects();
    effects.apply('strength', 100, 0);
    effects.apply('swiftness', 100, 0);
    assertEqual(effects.clear(), true);
    assertEqual(effects.size, 0);
    assertEqual(effects.clear(), false);
  });
});
