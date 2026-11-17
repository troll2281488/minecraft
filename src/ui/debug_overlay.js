/**
 * The F3 debug overlay: the one place that decides what diagnostic lines look like.
 *
 * Extracted from main.js as a prototype mixin. The body is unchanged -- it still runs
 * as a Game method with the same `this` -- so this is a file-level move, not a
 * redesign. That matters because main.js has no test coverage: a mixin can be checked
 * by diffing the body, where a rewrite into a collaborator object could not.
 */

import { TICKS_PER_DAY } from '../core/constants.js';
import { prettyName } from './ui.js';
import { DATA_VERSION } from '../save/migrate.js';

export const DebugOverlayMixin = {
  _updateDebug() {
    const p = this.player;
    const r = this.chunkRenderer;
    const held = this.inventory.held;
    const timeOfDay = this.world.time % TICKS_PER_DAY;

    const targetLine = this.hit
      ? `${prettyName(this.hit.state.block.id)} at ${this.hit.x} ${this.hit.y} ${this.hit.z}`
      : 'none';

    this.ui.updateDebug([
      `minecraft-clone v0.1.0 — ${this.fps.toFixed(0)} fps`,
      `XYZ ${p.x.toFixed(2)} / ${p.y.toFixed(2)} / ${p.z.toFixed(2)}`,
      `Chunk ${Math.floor(p.x / 16)} ${Math.floor(p.z / 16)}  Facing ${p.yaw.toFixed(0)}° / ${p.pitch.toFixed(0)}°`,
      `Ground ${p.onGround}  Water ${p.inWater}  Mode ${p.gamemode}${p.flying ? ' (flying)' : ''}`,
      ``,
      `Chunks ${this.world.chunkCount} loaded, ${this.world.pendingCount} pending`,
      `Meshes ${r.meshCount} (${r.stats.drawn} drawn, ${r.stats.culled} culled)`,
      `Mesh VRAM ${r.megabytesUsed.toFixed(1)} / ${r.budgetMegabytes.toFixed(0)} MB` +
        (r.stats.evictedTotal ? `  evicted ${r.stats.evictedTotal}` : ''),
      `Meshed ${r.stats.meshedThisFrame} this frame in ${r.stats.meshTimeMs.toFixed(1)} ms`,
      ``,
      `Time ${timeOfDay} (daylight ${this.daylight.toFixed(2)})`,
      `Held ${held.isEmpty ? 'nothing' : prettyName(held.item.id)}`,
      `Target ${targetLine}`,
      `Seed ${this.worldMeta?.seed}  DataVersion ${DATA_VERSION}`,
    ]);
  },
};
