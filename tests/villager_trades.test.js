import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory } from '../src/game/inventory.js';
import { ITEMS } from '../src/world/item.js';
import {
  VILLAGER_CAREERS, createVillagerProfile, getVillagerOffers, executeVillagerTrade,
} from '../src/entity/villager_trades.js';
import { MobSystem } from '../src/entity/mobs.js';

describe('Pre-1.14 villager careers', () => {
  it('references only registered trade items', () => {
    for (const [careerKey, career] of Object.entries(VILLAGER_CAREERS)) {
      for (const entry of career.offers) {
        assert(ITEMS.get(entry.input), `${careerKey} missing input ${entry.input}`);
        assert(ITEMS.get(entry.output), `${careerKey} missing output ${entry.output}`);
        if (entry.input2) assert(ITEMS.get(entry.input2), `${careerKey} missing second input ${entry.input2}`);
      }
    }
  });

  it('provides fixed careers and deterministic spawn profiles', () => {
    assert(Object.keys(VILLAGER_CAREERS).includes('farmer'));
    assert(Object.keys(VILLAGER_CAREERS).includes('librarian'));
    assert(Object.keys(VILLAGER_CAREERS).includes('cleric'));
    assert(Object.keys(VILLAGER_CAREERS).includes('nitwit'));
    const a = createVillagerProfile('trade-seed', 128, -256, 'mc:savanna', 2);
    const b = createVillagerProfile('trade-seed', 128, -256, 'mc:savanna', 2);
    assertEqual(a.villagerCareer, b.villagerCareer);
    assertEqual(a.villagerSeed, b.villagerSeed);
    assertEqual(a.villagerType, 'savanna');
  });

  it('starts with first-tier offers and unlocks the next tier after a new trade', () => {
    const villager = {
      villagerCareer: 'farmer', villagerSeed: 123, villagerTier: 1,
      villagerUsedOffers: [], villagerOfferUses: {}, villagerTradeCount: 0,
    };
    const initial = getVillagerOffers(villager);
    assert(initial.length > 0);
    assert(initial.every((entry) => entry.tier === 1));
    const wheat = initial.find((entry) => entry.id === 'wheat');
    assert(wheat);
    const inventory = new Inventory();
    inventory.addItem('mc:wheat', 64);
    const result = executeVillagerTrade(villager, 'wheat', inventory);
    assertEqual(result.ok, true);
    assertEqual(result.unlocked, true);
    assertEqual(villager.villagerTier, 2);
    assertEqual(villager.villagerTradeCount, 1);
    assert(inventory.countOf('mc:emerald') > 0);
    assert(getVillagerOffers(villager).some((entry) => entry.tier === 2));
  });

  it('does not consume inputs when the player cannot afford a trade', () => {
    const villager = {
      villagerCareer: 'farmer', villagerSeed: 123, villagerTier: 1,
      villagerUsedOffers: [], villagerOfferUses: {}, villagerTradeCount: 0,
    };
    const inventory = new Inventory();
    inventory.addItem('mc:wheat', 1);
    const before = inventory.countOf('mc:wheat');
    const result = executeVillagerTrade(villager, 'wheat', inventory);
    assertEqual(result.ok, false);
    assertEqual(inventory.countOf('mc:wheat'), before);
    assertEqual(villager.villagerTradeCount, 0);
  });

  it('does not consume inputs when the output cannot fit', () => {
    const villager = {
      villagerCareer: 'farmer', villagerSeed: 123, villagerTier: 1,
      villagerUsedOffers: [], villagerOfferUses: {}, villagerTradeCount: 0,
    };
    const inventory = new Inventory();
    for (let i = 0; i < 36; i++) inventory.addItem('mc:wheat', 64);
    const before = inventory.countOf('mc:wheat');
    const result = executeVillagerTrade(villager, 'wheat', inventory);
    assertEqual(result.ok, false);
    assertEqual(inventory.countOf('mc:wheat'), before);
  });

  it('persists villager career progress and populated village markers', () => {
    const system = new MobSystem({});
    system.mobs.push({
      id: 7, type: 'villager', x: 4, y: 65, z: 9, yaw: 0, targetYaw: 0, health: 20,
      villagerCareer: 'farmer', villagerProfession: 'farmer', villagerType: 'plains',
      villagerSeed: 1234, villagerTier: 3, villagerTradeCount: 8,
      villagerUsedOffers: ['wheat'], villagerOfferUses: { wheat: 8 },
      villageKey: '1,-2', villageSlot: 0,
    });
    system.populatedVillages.add('1,-2');
    const restored = new MobSystem({});
    restored.loadFrom(system.toJSON());
    assertEqual(restored.mobs[0].villagerCareer, 'farmer');
    assertEqual(restored.mobs[0].villagerTier, 3);
    assertEqual(restored.mobs[0].villagerTradeCount, 8);
    assert(restored.populatedVillages.has('1,-2'));
  });

  it('offers 16 sticks for one emerald and bow supplies through the archer career', () => {
    const archer = { villagerCareer: 'archer', villagerSeed: 7, villagerTier: 1,
      villagerUsedOffers: [], villagerOfferUses: {}, villagerTradeCount: 0 };
    const offers = getVillagerOffers(archer);
    const sticks = offers.find((entry) => entry.id === 'sticks');
    assert(sticks);
    assertEqual(sticks.input, 'mc:stick');
    assertEqual(sticks.inputCount, 16);
    assertEqual(sticks.output, 'mc:emerald');
    assert(ITEMS.get('mc:bow'));
    assert(ITEMS.get('mc:arrow'));
  });

  it('nitwits do not offer trades', () => {
    const villager = { villagerCareer: 'nitwit', villagerTier: 1 };
    assertEqual(getVillagerOffers(villager).length, 0);
  });
});
