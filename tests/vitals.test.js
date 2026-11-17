import { describe, it, assert, assertEqual } from './framework.js';
import { PlayerVitals } from '../src/entity/vitals.js';

describe('survival food and exhaustion', () => {
  it('starts with full food and saturation', () => {
    const v = new PlayerVitals();
    assertEqual(v.food, 20);
    assertEqual(v.saturation, 20);
  });

  it('sprinting drains saturation through exhaustion before food', () => {
    const v = new PlayerVitals();
    const player = { gamemode: 'survival', health: 20 };
    for (let i = 0; i < 400; i++) v.tick(player, 1, true, false);
    assert(v.saturation < 20, 'saturation did not decrease');
    assertEqual(v.food, 20, 'food should drain only after saturation');
  });

  it('food decreases after saturation is empty and exhaustion reaches four', () => {
    const v = new PlayerVitals();
    v.saturation = 0;
    v.addExhaustion(4);
    v.tick({ gamemode: 'survival', health: 20 });
    assertEqual(v.food, 19);
    assertEqual(v.exhaustion, 0);
  });

  it('regenerates one health point at full food and saturation', () => {
    const v = new PlayerVitals();
    const player = { gamemode: 'survival', health: 19 };
    for (let i = 0; i < 10; i++) v.tick(player);
    assertEqual(player.health, 20);
  });

  it('starvation on normal difficulty never kills the player', () => {
    const v = new PlayerVitals();
    v.food = 0;
    const player = { gamemode: 'survival', health: 1 };
    for (let i = 0; i < 80; i++) v.tick(player);
    assertEqual(player.health, 1);
  });

  it('does not change food in creative mode', () => {
    const v = new PlayerVitals();
    const player = { gamemode: 'creative', health: 20 };
    v.tick(player, 100, true, true);
    assertEqual(v.food, 20);
    assertEqual(v.exhaustion, 0);
  });

  it('round-trips food state for world saves', () => {
    const a = new PlayerVitals();
    a.food = 7; a.saturation = 2; a.exhaustion = 1.5;
    const b = new PlayerVitals().loadFrom(a.toJSON());
    assertEqual(b.food, 7);
    assertEqual(b.saturation, 2);
    assertEqual(b.exhaustion, 1.5);
  });
});
