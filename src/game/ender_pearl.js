/** Safe landing selection for Java-style ender pearl impacts. */
export function findEnderPearlLanding(world, hit) {
  if (!world || !hit || !Number.isInteger(hit.x) || !Number.isInteger(hit.y) || !Number.isInteger(hit.z)) return null;
  const face = hit.face || { dx: 0, dy: 1, dz: 0 };
  const x = hit.x + (Number.isInteger(face.dx) ? face.dx : 0);
  const z = hit.z + (Number.isInteger(face.dz) ? face.dz : 0);
  const firstY = hit.y + (Number.isInteger(face.dy) ? face.dy : 1);
  if (world.hasChunk && !world.hasChunk(Math.floor(x / 16), Math.floor(z / 16))) return null;
  for (const offset of [0, 1, -1, 2, -2]) {
    const y = firstY + offset;
    if (y < -63 || y > 319) continue;
    const floor = world.getBlock(x, y - 1, z)?.block;
    const feet = world.getBlock(x, y, z)?.block;
    const head = world.getBlock(x, y + 1, z)?.block;
    if (floor?.solid && !feet?.solid && !head?.solid && !feet?.liquid && !head?.liquid) {
      return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}
