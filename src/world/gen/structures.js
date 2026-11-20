/**
 * Deterministic structure planners ported from the user's worldgen archive.
 * Plans are world-space and chunk writers clip their output, so generation
 * order and worker scheduling cannot change a structure.
 */
import { positionalRandom, normalizeSeed } from '../../core/rng.js';
import { hash01, seedToInt } from './hash.js';
import { CHUNK_SIZE, MIN_Y, MAX_Y } from '../../core/constants.js';

export class ChunkWriter {
  constructor(chunk, baseX, baseZ) { this.chunk=chunk; this.baseX=baseX; this.baseZ=baseZ; }
  inside(x,z) { return x>=this.baseX && x<this.baseX+CHUNK_SIZE && z>=this.baseZ && z<this.baseZ+CHUNK_SIZE; }
  touches(x0,z0,x1,z1) { return x1>=this.baseX && x0<this.baseX+CHUNK_SIZE && z1>=this.baseZ && z0<this.baseZ+CHUNK_SIZE; }
  id(x,y,z) {
    if(!this.inside(x,z)||y<MIN_Y||y>=MAX_Y) return null;
    return this.chunk.getBlock(x-this.baseX,y,z-this.baseZ).block.id;
  }
  set(x,y,z,state) {
    if(state&&this.inside(x,z)&&y>=MIN_Y&&y<MAX_Y) this.chunk.setBlock(x-this.baseX,y,z-this.baseZ,state);
  }
}

const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const overlap=(a,b)=>a.x0<=b.x1&&a.x1>=b.x0&&a.z0<=b.z1&&a.z1>=b.z0;

export function mineshaftPlan(seed, site) {
  const rng=positionalRandom(seed,site.x,7101,site.z,7101), y=site.y;
  const rx=3+rng.nextInt(3), rz=3+rng.nextInt(3);
  const pieces=[{kind:'room',cx:site.x,cz:site.z,rx,rz,y,x0:site.x-rx,x1:site.x+rx,z0:site.z-rz,z1:site.z+rz}];
  const queue=DIRS.map(([dx,dz],d)=>({x:site.x+(dx?dx*(dx>0?rx+1:rx+1):0),z:site.z+(dz?dz*(dz>0?rz+1:rz+1):0),d,depth:0}));
  while(queue.length&&pieces.length<88) {
    const job=queue.shift(); if(job.depth>7&&rng.nextInt(3)===0) continue;
    const [dx,dz]=DIRS[job.d], length=18+6*rng.nextInt(3);
    const ex=job.x+dx*length, ez=job.z+dz*length;
    const box={x0:Math.min(job.x,ex)-(dz?1:0),x1:Math.max(job.x,ex)+(dz?1:0),z0:Math.min(job.z,ez)-(dx?1:0),z1:Math.max(job.z,ez)+(dx?1:0)};
    if(Math.max(Math.abs(box.x0-site.x),Math.abs(box.x1-site.x),Math.abs(box.z0-site.z),Math.abs(box.z1-site.z))>144||pieces.some(p=>overlap(box,p))) continue;
    const p={kind:'corridor',sx:job.x,sz:job.z,d:job.d,length,y,...box,deadEnd:true,chest:rng.nextInt(2)===0};
    pieces.push(p);
    if(job.depth<7&&rng.nextInt(3)!==0) {
      const cx=ex+dx*2,cz=ez+dz*2,cross={kind:'crossing',cx,cz,y,x0:cx-2,x1:cx+2,z0:cz-2,z1:cz+2};
      if(!pieces.some(q=>overlap(cross,q))) {
        pieces.push(cross);
        for(const d of (dx?[2,3]:[0,1])) if(rng.nextInt(4)!==0) {
          const [bx,bz]=DIRS[d]; queue.push({x:cx+bx*3,z:cz+bz*3,d,depth:job.depth+1});
        }
        p.deadEnd=false;
      }
    }
  }
  return {pieces, seedHash:seedToInt(normalizeSeed(seed))};
}

export function placeMineshaftPlan(w,S,plan,heights) {
  const air=S['mc:air'],plank=S['mc:oak_planks'],log=S['mc:oak_log']||plank,torch=S['mc:torch'],chest=S['mc:chest'],moss=S['mc:mossy_cobblestone'],vine=S['mc:vine'];
  if(!air||!plank) return;
  const carve=(x,z,y0,y1,minSurface)=> {
    if(!w.inside(x,z)) return false;
    if(heights&&heights[(z-w.baseZ)*CHUNK_SIZE+(x-w.baseX)]<minSurface) return false;
    for(let y=y0;y<=y1;y++) w.set(x,y,z,air);
    return true;
  };
  for(const p of plan.pieces) {
    if(!w.touches(p.x0,p.z0,p.x1,p.z1)) continue;
    if(p.kind==='room') {
      for(let z=p.z0;z<=p.z1;z++) for(let x=p.x0;x<=p.x1;x++) {
        const dx=(x-p.cx)/(p.rx+0.5),dz=(z-p.cz)/(p.rz+0.5);
        if(dx*dx+dz*dz>1.15) continue;
        for(let y=p.y+1;y<=p.y+4;y++) w.set(x,y,z,air);
        if(w.id(x,p.y,z)==='mc:air'||w.id(x,p.y,z)==='mc:water') w.set(x,p.y,z,plank);
      }
      for(const [ox,oz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) for(let y=1;y<=3;y++) w.set(p.cx+ox,p.y+y,p.cz+oz,log);
    } else if(p.kind==='corridor') {
      const [dx,dz]=DIRS[p.d];
      for(let t=0;t<p.length;t++) for(let side=-1;side<=1;side++) {
        const x=p.sx+dx*t+(dz?side:0),z=p.sz+dz*t+(dx?side:0);
        if(!carve(x,z,p.y+1,p.y+3,p.y+6)) continue;
        if(w.id(x,p.y,z)==='mc:air'||w.id(x,p.y,z)==='mc:water') w.set(x,p.y,z,plank);
        if(t%4===0) { w.set(x,p.y+3,z,plank); if(side!==0) {w.set(x,p.y+1,z,log);w.set(x,p.y+2,z,log);} }
        // A few damp, overgrown supports make some abandoned shafts feel old.
        if(moss&&side!==0&&t%13===6) w.set(x,p.y,z,moss);
        if(vine&&side!==0&&t%17===8&&w.id(x,p.y+3,z)==='mc:air') {
          for(let hang=1;hang<=2+((t/17)|0)%3;hang++) w.set(x,p.y+3-hang,z,vine);
        }
        if(torch&&side===0&&t%9===4) w.set(x,p.y+1,z,torch);
      }
      if(p.deadEnd&&p.chest) w.set(p.sx+dx*(p.length-1),p.y+1,p.sz+dz*(p.length-1),chest);
      // Rare extra loot chest halfway down a long branch.
      if(chest&&!p.deadEnd&&p.length>24&&hash01(plan.seedHash,p.sx,p.y,p.sz,7117)<0.035) w.set(p.sx+dx*(p.length>>1),p.y+1,p.sz+dz*(p.length>>1),chest);
    } else if(p.kind==='crossing') {
      for(let z=p.z0;z<=p.z1;z++) for(let x=p.x0;x<=p.x1;x++) {
        if(carve(x,z,p.y+1,p.y+3,p.y+6)&&(w.id(x,p.y,z)==='mc:air'||w.id(x,p.y,z)==='mc:water')) w.set(x,p.y,z,plank);
      }
    }
  }
}

export function dungeonDims(room) { return {ix:5+2*(room.variant&1),iz:5+2*((room.variant>>1)&1)}; }
export function placeDungeonRoom(w,S,room,seed,heights) {
  const air=S['mc:air'],cobble=S['mc:cobblestone'],moss=S['mc:mossy_cobblestone']||cobble,chest=S['mc:chest'];
  if(!air||!cobble) return;
  const {ix,iz}=dungeonDims(room),x1=room.x+ix+1,z1=room.z+iz+1;
  if(!w.touches(room.x,room.z,x1,z1)) return;
  if(heights) for(const [x,z] of [[room.x,room.z],[x1,z1]]) if(w.inside(x,z)&&heights[(z-w.baseZ)*CHUNK_SIZE+(x-w.baseX)]<room.y+8) return;
  const rng=positionalRandom(seed,room.x,7301,room.z,7301), hs=seedToInt(normalizeSeed(seed));
  for(let z=room.z;z<=z1;z++) for(let x=room.x;x<=x1;x++) {
    const edge=x===room.x||x===x1||z===room.z||z===z1;
    for(let y=room.y;y<=room.y+4;y++) {
      const id=w.id(x,y,z);
      if(y===room.y) w.set(x,y,z,(hash01(hs,x,y,z,7302)<0.25?moss:cobble));
      else if(edge||y===room.y+4) { if(id&&id!=='mc:air'&&id!=='mc:water') w.set(x,y,z,hash01(hs,x,y,z,7303)<0.2?moss:cobble); }
      else w.set(x,y,z,air);
    }
  }
  if(chest) { w.set(room.x+1,room.y+1,room.z+1,chest); if(rng.nextBoolean()) w.set(x1-1,room.y+1,z1-1,chest); }
}

export const VILLAGE_STYLES={
  plains:{log:'mc:oak_log',plank:'mc:oak_planks',path:'mc:coarse_dirt',roof:'mc:oak_stairs'},
  taiga:{log:'mc:spruce_log',plank:'mc:spruce_planks',path:'mc:gravel',roof:'mc:spruce_stairs'},
  savanna:{log:'mc:acacia_log',plank:'mc:acacia_planks',path:'mc:coarse_dirt',roof:'mc:acacia_stairs'},
  desert:{log:'mc:sandstone',plank:'mc:sandstone',path:'mc:sandstone',roof:'mc:sandstone'}
};
export function villageStyleForBiome(biome) {
  if(['mc:plains','mc:sunflower_plains'].includes(biome)) return 'plains';
  if(['mc:taiga','mc:taiga_hills','mc:snowy_taiga','mc:cold_taiga','mc:cold_taiga_hills','mc:mega_taiga','mc:mega_taiga_hills','mc:giant_spruce_taiga','mc:snowy_plains'].includes(biome)) return 'taiga';
  if(['mc:savanna','mc:savanna_plateau','mc:shattered_savanna'].includes(biome)) return 'savanna';
  if(['mc:desert','mc:desert_hills'].includes(biome)) return 'desert';
  return null;
}
export function villagePlan(seed,cx,cz,groundY,style) {
  const rng=positionalRandom(seed,cx,7001,cz,7001),buildings=[],roads=[];
  const arms=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const [dx,dz] of arms) {
    const len=14+rng.nextInt(12);
    roads.push({x0:cx+Math.min(0,dx*len)- (dz?1:0),x1:cx+Math.max(0,dx*len)+(dz?1:0),
      z0:cz+Math.min(0,dz*len)-(dx?1:0),z1:cz+Math.max(0,dz*len)+(dx?1:0)});
  }
  buildings.push({type:'well',x:cx-9,z:cz-9,w:5,d:5});
  // A central smithy gives the settlement a recognizable landmark.
  buildings.push({type:'smithy',x:cx,z:cz,w:7,d:7});
  buildings.push({type:'house',x:cx-16,z:cz-3,w:7,d:7});
  buildings.push({type:'house',x:cx+3,z:cz+15,w:7,d:7});
  buildings.push({type:'farm',x:cx+16,z:cz-4,w:8,d:9});
  return {cx,cz,groundY,style,roads,buildings,x0:cx-42,x1:cx+42,z0:cz-42,z1:cz+42};
}
export function placeVillagePlan(w,S,plan) {
  const style=VILLAGE_STYLES[plan.style]; if(!style) return;
  const gy=plan.groundY,air=S['mc:air'],path=S[style.path],plank=S[style.plank],log=S[style.log],roof=S[style.roof],glass=S['mc:glass'];
  const level=(x,z,top)=>{if(!w.inside(x,z))return;for(let y=gy-1;y>=MIN_Y+1;y--){const id=w.id(x,y,z);if(id==='mc:air'||id==='mc:water')w.set(x,y,z,S['mc:dirt']);else break;}for(let y=gy+1;y<=gy+12;y++)w.set(x,y,z,air);w.set(x,gy,z,top);};
  for(const r of plan.roads) if(w.touches(r.x0,r.z0,r.x1,r.z1)) for(let z=r.z0;z<=r.z1;z++)for(let x=r.x0;x<=r.x1;x++)level(x,z,path);
  for(const b of plan.buildings) {
    if(!w.touches(b.x,b.z,b.x+b.w-1,b.z+b.d-1))continue;
    for(let z=b.z-1;z<=b.z+b.d;z++)for(let x=b.x-1;x<=b.x+b.w;x++)level(x,z,S['mc:grass_block']);
    if(b.type==='well') {
      for(let z=0;z<5;z++)for(let x=0;x<5;x++){const wx=b.x+x,wz=b.z+z,edge=x===0||x===4||z===0||z===4;w.set(wx,gy, wz,edge?S['mc:cobblestone']:S['mc:water']);if(edge)w.set(wx,gy+1,wz,log);}
      continue;
    }
    if(b.type==='farm') {
      for(let z=0;z<b.d;z++)for(let x=0;x<b.w;x++){const wx=b.x+x,wz=b.z+z;if(x===0||x===b.w-1||z===0||z===b.d-1)w.set(wx,gy,wz,log);else w.set(wx,gy,wz,x===Math.floor(b.w/2)?S['mc:water']:S['mc:farmland']);if(x>0&&x<b.w-1&&z>0&&z<b.d-1&&x!==Math.floor(b.w/2)&&S['mc:wheat'])w.set(wx,gy+1,wz,S['mc:wheat']);}
      continue;
    }
    for(let z=0;z<b.d;z++)for(let x=0;x<b.w;x++){
      const edge=x===0||x===b.w-1||z===0||z===b.d-1,corner=(x===0||x===b.w-1)&&(z===0||z===b.d-1);
      w.set(b.x+x,gy,b.z+z,edge?S['mc:cobblestone']:plank);
      for(let y=1;y<=3;y++)w.set(b.x+x,gy+y,b.z+z,edge?(corner?log:plank):air);
      if(glass&&edge&&!corner&&yWindow(x,z,b))w.set(b.x+x,gy+2,b.z+z,glass);
    }
    w.set(b.x+Math.floor(b.w/2),gy+1,b.z,air);w.set(b.x+Math.floor(b.w/2),gy+2,b.z,air);
    for(let z=-1;z<=b.d;z++)for(let x=-1;x<=b.w;x++){
      const centre=x===Math.floor(b.w/2);
      const stair=roof&&typeof roof.with==='function'
        ? roof.with('facing',x<Math.floor(b.w/2)?'east':'west')
        : (roof||plank);
      w.set(b.x+x,gy+5+Math.min(x,b.w-1-x),b.z+z,centre?plank:stair);
    }
    if(b.type==='smithy') {
      if(S['mc:furnace'])w.set(b.x+2,gy+2,b.z+3,S['mc:furnace']);
      if(S['mc:chest'])w.set(b.x+b.w-2,gy+1,b.z+b.d-2,S['mc:chest']);
    }
  }
  const torch=S['mc:torch'];if(torch)for(const r of plan.roads){const x=Math.floor((r.x0+r.x1)/2),z=Math.floor((r.z0+r.z1)/2);if(w.inside(x,z)){w.set(x,gy+1,z,log);w.set(x,gy+2,z,log);w.set(x,gy+3,z,torch);}}
}
function yWindow(x,z,b){return (z===0||z===b.d-1)&&x>0&&x<b.w-1|| (x===0||x===b.w-1)&&z>1&&z<b.d-1;}
