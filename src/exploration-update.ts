export const EXPLORATION_BLOCKS = { OBSERVER: 52, SHULKER_BOX: 53 } as const;
export const EXPLORATION_BLOCK_PROPS = {
  [EXPLORATION_BLOCKS.OBSERVER]: { name: "Наблюдатель", solid: true, hardness: 3, mat: "stone", tool: "pickaxe", minTier: 1, drop: EXPLORATION_BLOCKS.OBSERVER },
  [EXPLORATION_BLOCKS.SHULKER_BOX]: { name: "Шалкеровый ящик", solid: true, hardness: 2, mat: "wood", drop: EXPLORATION_BLOCKS.SHULKER_BOX, interactive: "chest" }
};
export const EXPLORATION_ITEMS = {
  shulker_shell: { name: "Панцирь шалкера", cat: "misc", stack: 64 },
  totem_of_undying: { name: "Тотем бессмертия", cat: "misc", stack: 1 },
  iron_nugget: { name: "Железный самородок", cat: "misc", stack: 64 },
  paper: { name: "Бумага", cat: "misc", stack: 64 },
  explorer_map_woodland: { name: "Карта лесного особняка", cat: "misc", stack: 1 },
  explorer_map_ocean: { name: "Карта океанского монумента", cat: "misc", stack: 1 },
  evoker_spawn_egg: { name: "Яйцо призыва заклинателя", cat: "misc", stack: 64 },
  vindicator_spawn_egg: { name: "Яйцо призыва поборника", cat: "misc", stack: 64 },
  vex_spawn_egg: { name: "Яйцо призыва досаждателя", cat: "misc", stack: 64 },
  llama_spawn_egg: { name: "Яйцо призыва ламы", cat: "misc", stack: 64 }
};
export const EXPLORATION_RECIPES = [
  { out: { id: EXPLORATION_BLOCKS.OBSERVER, count: 1 }, req: { [3]: 6, redstone: 2, quartz: 1 } },
  { out: { id: EXPLORATION_BLOCKS.SHULKER_BOX, count: 1 }, req: { shulker_shell: 2, [19]: 1 } },
  { out: { id: "iron_nugget", count: 9 }, req: { iron_ingot: 1 } },
  { out: { id: "iron_ingot", count: 1 }, req: { iron_nugget: 9 } }
];
export const EXPLORATION_PROFESSIONS = {
  cartographer: { title: "Житель — Картограф", hatColor: 0x355d9a, trades: [
    { give: { id: "paper", count: 24 }, get: { id: "emerald", count: 1 } },
    { give: { id: "emerald", count: 7 }, get: { id: "explorer_map_woodland", count: 1 } },
    { give: { id: "emerald", count: 7 }, get: { id: "explorer_map_ocean", count: 1 } }
  ] },
  nitwit: { title: "Житель — Простофиля", hatColor: 0x6f8b54, trades: [] }
};
export const EXPLORATION_MOB_CONFIGS = {
  villager_cartographer: { name: "Картограф", hp: 20, passiveVillager: "cartographer", w: 0.65, h: 1.9 },
  villager_nitwit: { name: "Простофиля", hp: 20, passiveVillager: "nitwit", w: 0.65, h: 1.9 },
  evoker: { name: "Заклинатель", hp: 24, hostile: true, w: 0.65, h: 1.95, dmg: 6, drop: "totem_of_undying" },
  vindicator: { name: "Поборник", hp: 24, hostile: true, w: 0.65, h: 1.95, dmg: 7, drop: "emerald" },
  vex: { name: "Досаждатель", hp: 14, hostile: true, w: 0.45, h: 0.8, dmg: 4, drop: "iron_nugget" },
  llama: { name: "Лама", hp: 15, w: 0.9, h: 1.8, drop: "leather" }
};
export function consumeTotem(player: { inv: ({id: string|number; count: number}|null)[]; offhand: {id:string|number;count:number}|null }): boolean {
  const index = player.inv.findIndex(stack => stack?.id === "totem_of_undying" && stack.count > 0);
  if (index >= 0) {
    const stack = player.inv[index]!;
    if (--stack.count <= 0) player.inv[index] = null;
    return true;
  }
  if (player.offhand?.id === "totem_of_undying" && player.offhand.count > 0) {
    if (--player.offhand.count <= 0) player.offhand = null;
    return true;
  }
  return false;
}
export function createWoodlandMansionPlan(seed: number) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const rooms = Array.from({length:3},()=>Array.from({length:6},()=>1+Math.floor(random()*5)));
  rooms[0][0]=6; rooms[2][5]=7;
  return { width:25, depth:21, floors:3, floorHeight:5, rooms };
}
export function getMansionCoordinates(seed: number) {
  const value = Math.abs(seed | 0);
  return { x:224+(value%5)*32, z:224+(Math.floor(value/7)%5)*32 };
}
