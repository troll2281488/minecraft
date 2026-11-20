import '../src/world/blocks/index.js';
import { describe, it, assert, assertEqual } from './framework.js';
import { BLOCKS } from '../src/world/block.js';
import { ITEMS, ItemStack } from '../src/world/item.js';
import { Dropper, serializeContainer, deserializeContainer, drainContainer } from '../src/game/containers.js';
import { ContainerScreensMixin } from '../src/game/container_screens.js';
import { RedstoneDevicesMixin, readSignal } from '../src/game/redstone_devices.js';
import { MobSystem } from '../src/entity/mobs.js';
import { RECIPES } from '../src/game/recipes.js';

function makeWorld(entries) {
  const blocks=new Map(entries);
  return {
    blocks,
    world:{
      getBlock(x,y,z){return blocks.get(`${x},${y},${z}`)||BLOCKS.get('mc:air').defaultState;},
      setBlock(x,y,z,state){blocks.set(`${x},${y},${z}`,state);return true;},
    },
  };
}

describe('observer, dropper and target redstone components',()=>{
  it('registers all three blocks and their crafting recipes',()=>{
    for(const id of ['mc:observer','mc:dropper','mc:target']) {
      assert(BLOCKS.get(id),id+' block missing');
      assert(ITEMS.get(id),id+' item missing');
      assert(RECIPES.recipes.some((recipe)=>recipe.result===id),id+' recipe missing');
    }
    assertEqual(BLOCKS.get('mc:observer').defaultState.get('facing'),'south');
    assertEqual(BLOCKS.get('mc:dropper').defaultState.get('facing'),'north');
  });
  it('observer emits a two-tick pulse when its watched block changes',()=>{
    const {blocks,world}=makeWorld([
      ['0,0,0',BLOCKS.get('mc:observer').defaultState],
    ]);
    const game={world,player:{x:0,y:0,z:0},tickCount:0,multiplayer:{pushBlockChange(){}},...RedstoneDevicesMixin};
    game._tickObservers(0,0,0,true);
    blocks.set('0,0,1',BLOCKS.get('mc:stone').defaultState);
    game.tickCount=1;game._tickObservers(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('powered'),true);
    assertEqual(readSignal(world,0,0,0,0,0,-1),15);
    game.tickCount=3;game._tickObservers(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('powered'),false);
    assertEqual(readSignal(world,0,0,0,0,0,-1),0);
  });
  it('target block emits analogue power for a centered arrow hit and resets',()=>{
    const {blocks,world}=makeWorld([['0,0,0',BLOCKS.get('mc:target').defaultState]]);
    const arrow={x:0.5,y:0.5,z:0.5};
    const game={world,player:{x:0,y:0,z:0},entities:{arrows:[arrow]},tickCount:1,multiplayer:{pushBlockChange(){}},...RedstoneDevicesMixin};
    game._tickTargetBlocks(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('power'),15);
    assertEqual(readSignal(world,0,0,0,1,0,0),15);
    assertEqual(arrow.targetScored,true);
    game.tickCount=11;game._tickTargetBlocks(0,0,0,true);
    assertEqual(blocks.get('0,0,0').get('power'),0);
  });
  it('dropper stores nine slots and persists all contents',()=>{
    const dropper=new Dropper();
    assertEqual(dropper.slots.length,9);
    dropper.insert(ItemStack.of('mc:iron_ingot',17));
    const record=serializeContainer('dropper',dropper);
    const restored=deserializeContainer(record);
    assertEqual(restored.type,'dropper');
    assertEqual(restored.data.slots.length,9);
    assertEqual(restored.data.slots[0].count,17);
    const drops=drainContainer('dropper',restored.data);
    assertEqual(drops[0].count,17);
    assertEqual(restored.data.slots.filter((slot)=>!slot.isEmpty).length,0);
  });
  it('ejects exactly one item on a redstone rising edge',()=>{
    const {blocks,world}=makeWorld([
      ['0,0,0',BLOCKS.get('mc:dropper').defaultState],
      ['1,0,0',BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const dropper=new Dropper();dropper.insert(ItemStack.of('mc:coal',3));
    const spawned=[];
    const game={
      world,player:{x:0.5,y:0,z:0.5},tickCount:1,_containers:new Map(),
      entities:{spawnItemStackAt(stack,x,y,z,vx,vy,vz){spawned.push({stack:stack.clone(),x,y,z,vx,vy,vz});}},
      ...ContainerScreensMixin,
    };
    game._dropperAt=()=>dropper;
    game._tickDroppers();
    game.tickCount=5;game._tickDroppers();
    assertEqual(spawned.length,1);
    assertEqual(spawned[0].stack.item.id,'mc:coal');
    assertEqual(dropper.slots[0].count,2);
  });
  it('does not repeatedly eject while the redstone input stays powered',()=>{
    const {world}=makeWorld([
      ['0,0,0',BLOCKS.get('mc:dropper').defaultState],
      ['1,0,0',BLOCKS.get('mc:redstone_block').defaultState],
    ]);
    const dropper=new Dropper();dropper.insert(ItemStack.of('mc:coal',4));
    let spawned=0;
    const game={world,player:{x:0.5,y:0,z:0.5},tickCount:1,_containers:new Map(),
      entities:{spawnItemStackAt(){spawned++;}},...ContainerScreensMixin};
    game._dropperAt=()=>dropper;
    game._tickDroppers();game.tickCount=5;game._tickDroppers();
    game.tickCount=9;game._tickDroppers();game.tickCount=13;game._tickDroppers();
    assertEqual(spawned,1);
    assertEqual(dropper.slots[0].count,3);
  });
});
