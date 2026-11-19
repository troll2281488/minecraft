import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { Inventory } from '../src/game/inventory.js';
import {
  VILLAGER_CAREERS, createVillagerProfile, getVillagerOffers, executeVillagerTrade,
} from '../src/entity/villager_trades.js';

describe('Pre-1.14 villager careers', () => {
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
    for (let i = 0; i < 35; i++) inventory.addItem('mc:stone', 64);
    inventory.addItem('mc:wheat', 64);
    const before = inventory.countOf('mc:wheat');
    const result = executeVillagerTrade(villager, 'wheat', inventory);
    assertEqual(result.ok, false);
    assertEqual(inventory.countOf('mc:wheat'), before);
  });

  it('nitwits do not offer trades', () => {
    const villager = { villagerCareer: 'nitwit', villagerTier: 1 };
    assertEqual(getVillagerOffers(villager).length, 0);
  });
});
