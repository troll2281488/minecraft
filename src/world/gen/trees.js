/**
 * Tree shapes.
 *
 * A tree is described as a list of relative blocks, independent of any chunk.
 * The terrain generator evaluates the trees of every column near a chunk and
 * writes only the part that falls inside that chunk, so a canopy that crosses a
 * chunk border is identical on both sides regardless of generation order.
 *
 * Silhouettes follow vanilla 1.12.2: oak/birch are a trunk with a 4-layer
 * rounded canopy, spruce is a cone with alternating radii, jungle is tall with a
 * wide crown, acacia bends sideways, dark oak has a 2x2 trunk and a heavy crown.
 */

/** Largest horizontal distance a tree block can be from its origin column. */
export const TREE_MARGIN = 5;

function layer(leaves, y, radius, rng, trimCorners) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
      if (corner && radius > 0) {
        if (trimCorners === 'always') continue;
        if (trimCorners === 'random' && rng.nextInt(2) === 0) continue;
      }
      leaves.push([dx, y, dz]);
    }
  }
}

function roundTree(species, rng) {
  const h = species === 'birch' ? 5 + rng.nextInt(3) : 4 + rng.nextInt(3);
  const logs = [], leaves = [];
  for (let y = 0; y < h; y++) logs.push([0, y, 0]);
  layer(leaves, h - 3, 2, rng, 'random');
  layer(leaves, h - 2, 2, rng, 'random');
  layer(leaves, h - 1, 1, rng, 'random');
  layer(leaves, h, 1, rng, 'always');
  return { logs, leaves };
}

function spruceTree(rng) {
  const h = 6 + rng.nextInt(4);
  const logs = [], leaves = [];
  for (let y = 0; y < h; y++) logs.push([0, y, 0]);
  const bare = 1 + rng.nextInt(2);
  const maxR = 2 + rng.nextInt(2);
  let r = 0;
  for (let y = h; y >= bare + 1; y--) {
    layer(leaves, y, r, rng, r >= 2 ? 'always' : 'none');
    r = r >= maxR ? 1 : r + 1;
  }
  return { logs, leaves };
}

function jungleTree(rng) {
  // Jungle canopy rises well above the forest floor and spreads in several
  // irregular tiers; a minority are giant 2x2-trunk specimens.
  const giant = rng.nextInt(4) === 0;
  const h = giant ? 18 + rng.nextInt(7) : 13 + rng.nextInt(8);
  const logs = [], leaves = [];
  const trunk = giant ? [[0,0],[1,0],[0,1],[1,1]] : [[0,0]];
  for (let y = 0; y < h; y++) for (const [tx,tz] of trunk) logs.push([tx,y,tz]);
  const crown = (y, radius) => {
    for (let dx = -radius; dx <= radius + (giant ? 1 : 0); dx++) {
      for (let dz = -radius; dz <= radius + (giant ? 1 : 0); dz++) {
        const ex = dx < 0 ? -dx : dx > (giant ? 1 : 0) ? dx - (giant ? 1 : 0) : 0;
        const ez = dz < 0 ? -dz : dz > (giant ? 1 : 0) ? dz - (giant ? 1 : 0) : 0;
        if (ex === radius && ez === radius && rng.nextInt(3) === 0) continue;
        if (ex <= radius && ez <= radius) leaves.push([dx,y,dz]);
      }
    }
  };
  crown(h - 3, 3);
  crown(h - 2, 4);
  crown(h - 1, 4);
  crown(h, 3);
  crown(h + 1, 2);
  return { logs, leaves };
}

function jungleBush(rng) {
  const h = 2 + rng.nextInt(2);
  const logs = [], leaves = [];
  for (let y = 0; y < h; y++) logs.push([0, y, 0]);
  layer(leaves, h - 1, 2, rng, 'random');
  layer(leaves, h, 1, rng, 'always');
  return { logs, leaves };
}

function acaciaTree(rng) {
  const h = 5 + rng.nextInt(2);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const [bx, bz] = dirs[rng.nextInt(4)];
  const logs = [], leaves = [];
  const bend = h - 3;
  let x = 0, z = 0;
  for (let y = 0; y < h; y++) {
    if (y >= bend) { x += bx; z += bz; }
    logs.push([x, y, z]);
  }
  const addCrown = (cx, cy, cz, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
      leaves.push([cx + dx, cy, cz + dz]);
    }
  };
  addCrown(x, h - 1, z, 2);
  addCrown(x, h, z, 1);
  const [sx, sz] = [-bx || (rng.nextBoolean() ? 1 : -1), -bz];
  logs.push([sx, h - 2, sz]);
  logs.push([sx * 2, h - 2, sz * 2]);
  addCrown(sx * 2, h - 1, sz * 2, 1);
  return { logs, leaves };
}

function darkOakTree(rng) {
  const h = 6 + rng.nextInt(3);
  const logs = [], leaves = [];
  for (let y = 0; y < h; y++) for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) logs.push([ox, y, oz]);
  const crown = (y, r) => {
    for (let dx = -r; dx <= r + 1; dx++) for (let dz = -r; dz <= r + 1; dz++) {
      const ex = dx < 0 ? -dx : dx > 1 ? dx - 1 : 0;
      const ez = dz < 0 ? -dz : dz > 1 ? dz - 1 : 0;
      if (ex === r && ez === r && rng.nextInt(2) === 0) continue;
      if (ex > r || ez > r) continue;
      leaves.push([dx, y, dz]);
    }
  };
  crown(h - 2, 2);
  crown(h - 1, 3);
  crown(h, 2);
  crown(h + 1, 1);
  return { logs, leaves };
}

function iceSpike(rng) {
  const h = 7 + rng.nextInt(14);
  const logs = [];
  for (let y = 0; y < h; y++) {
    const r = y < h * 0.35 ? 1 : 0;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (r === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
      logs.push([dx, y, dz]);
    }
  }
  return { logs, leaves: [], material: 'mc:packed_ice' };
}

function boulder(rng) {
  const r = 1 + rng.nextInt(2);
  const logs = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
    if (dx * dx + dy * dy + dz * dz <= r * r + 1 && dy + r >= 0) logs.push([dx, dy + r - 1, dz]);
  }
  return { logs, leaves: [], material: 'mc:mossy_cobblestone' };
}

/** Build a relative tree shape from a seeded random source. */
export function buildTree(species, rng) {
  switch (species) {
    case 'ice_spike': return iceSpike(rng);
    case 'boulder': return boulder(rng);
    case 'spruce': return spruceTree(rng);
    case 'jungle': return rng.nextInt(3) === 0 ? jungleBush(rng) : jungleTree(rng);
    case 'acacia': return acaciaTree(rng);
    case 'dark_oak': return darkOakTree(rng);
    case 'birch': return roundTree('birch', rng);
    default: return roundTree('oak', rng);
  }
}

