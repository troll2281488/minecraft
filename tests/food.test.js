import { describe, it, assert, assertEqual } from './framework.js';
import { PlayerVitals } from '../src/entity/vitals.js';
import '../src/world/blocks/index.js';
import { ITEMS } from '../src/world/item.js';

describe('food items', () => {
  it('registers vanilla-like nutrition for common foods', () => {
    assertEqual(ITEMS.get('mc:apple').food.nutrition, 4);
    assertEqual(ITEMS.get('mc:bread').food.nutrition, 5);
    assertEqual(ITEMS.get('mc:cooked_beef').food.nutrition, 8);
  });

  it('restores food and saturation using nutrition times modifier times two', () => {
    const v = new PlayerVitals();
    v.food = 10;
    v.saturation = 2;
    assert(v.eat(ITEMS.get('mc:bread').food));
    assertEqual(v.food, 15);
    assertEqual(v.saturation, 8);
  });

  it('does not consume ordinary food at a full food bar', () => {
    const v = new PlayerVitals();
    assertEqual(v.eat(ITEMS.get('mc:apple').food), false);
    assertEqual(v.food, 20);
  });

  it('caps saturation at the restored food level', () => {
    const v = new PlayerVitals();
    v.food = 19;
    v.saturation = 19;
    v.eat(ITEMS.get('mc:cooked_beef').food);
    assertEqual(v.food, 20);
    assertEqual(v.saturation, 20);
  });
});
