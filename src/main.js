/**
 * Entry point: startup, the game loop, input, and rendering.
 *
 * THE LOOP
 *
 * Simulation runs at a fixed 20 ticks per second with an accumulator; rendering
 * runs as fast as the display allows. This separation is why every physics
 * constant in core/constants.js can be Minecraft's real per-tick value with no
 * rescaling, and why movement feels identical at 60 fps and 144 fps.
 *
 * The accumulator is clamped. Without a clamp, a tab left in the background for
 * a minute returns owing 1200 ticks, runs them all in one frame, and either
 * freezes for several seconds or teleports the player through the world. Losing
 * that time is strictly better than either.
 */

import { MS_PER_TICK, RENDER, TICKS_PER_DAY, SAVE } from './core/constants.js';
import { Frustum } from './core/mat4.js';

import './world/blocks/index.js';
import { freezeRegistries } from './world/blocks/index.js';
import { BLOCKS } from './world/block.js';
import { ITEMS } from './world/item.js';

import { buildTextures, buildBlockTextureTable, TILE_SIZE } from './render/atlas.js';
import { buildItemIconCache } from './render/item_icons.js';
import { loadItsBrianTextures, setMinecraftUiTextures } from './render/resource_pack.js';
import { setHudSprites } from './ui/hud_bars.js';
import { loadEntityModelPack } from './render/entity_models.js';
import { createContext, createTextureArray } from './render/gl.js';

import { GAMEMODE, Player } from './entity/player.js';
import { World } from './world/world.js';
import { Inventory, CraftingGrid } from './game/inventory.js';
import { RECIPES } from './game/recipes.js';
import { raycast, MiningState } from './game/interaction.js';

import { UI } from './ui/ui.js';
// Still used here: start() requests storage persistence, and the tick loop encodes
// and writes evicted chunks. Everything else storage-related moved to the session mixin.
import * as storage from './save/storage.js';
import { encodeChunk } from './save/format.js';
import { DebugOverlayMixin } from './ui/debug_overlay.js';
import { ScreensMixin } from './ui/screens.js';
import { InputMixin } from './game/input.js';
import { InventoryControllerMixin } from './game/inventory_controller.js';
import { BlockActionsMixin } from './game/block_actions.js';
import { ContainerScreensMixin } from './game/container_screens.js';
import { RendererMixin, SELECTION_EDGES } from './render/renderer.js';
import { SessionMixin } from './game/session.js';
import { Multiplayer } from './game/multiplayer.js';
import { MobSystem } from './entity/mobs.js';
import { growNearbyWheat } from './game/farming.js';
import { isDown } from './game/keybinds.js';

const AUTOSAVE_TICKS = SAVE.AUTOSAVE_INTERVAL_TICKS;
const MAX_CATCHUP_TICKS = 10;


// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

export async function boot() {
  freezeRegistries();

  const canvas = document.getElementById('canvas');
  const gl = createContext(canvas);

  // Load available ItsBrian textures; missing files fall back to the built-in art.
  const [remoteTextures, entityModels] = await Promise.all([
    loadItsBrianTextures(BLOCKS, ITEMS),
    loadEntityModelPack(),
  ]);
  setHudSprites(remoteTextures.hud);
  setMinecraftUiTextures(remoteTextures.ui);
  const textures = buildTextures(remoteTextures.blocks);
  const textureArray = createTextureArray(gl, textures, TILE_SIZE);
  const textureTable = buildBlockTextureTable(BLOCKS, textures.index);
  const icons = buildItemIconCache(ITEMS, BLOCKS, textures.data, textures.index, remoteTextures.items);

  const game = new Game({ canvas, gl, textureArray, textureTable, icons, textures, entityModels });

  // Development handle. Cheap, and the alternative when something looks wrong
  // in a running world is adding one temporarily and reloading, which loses the
  // state you were trying to inspect.
  window.game = game;

  await game.start();
  return game;
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

class Game {
  constructor({ canvas, gl, textureArray, textureTable, icons, textures, entityModels }) {
    this.canvas = canvas;
    this.gl = gl;
    this.textureArray = textureArray;
    this.textureTable = textureTable;
    this.textures = textures;
    this.entityModels = entityModels; // Full upstream geometry + animation data, loaded locally.

    this.ui = new UI(icons);
    this.multiplayer = new Multiplayer(this);
    this.entities = new MobSystem(this);
    this.frustum = new Frustum();

    this.world = null;
    this.player = null;
    this.inventory = new Inventory();
    this.craftingGrid = new CraftingGrid(2, RECIPES);
    this.mining = new MiningState();

    this.worldMeta = null;
    this.running = false;
    this.paused = true;
    this.inventoryOpen = false;
    this.showDebug = false;

    this.renderDistance = RENDER.DEFAULT_DISTANCE;
    this.accumulator = 0;
    this.lastFrameTime = 0;
    this.tickCount = 0;
    this.fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;

    this.keys = new Set();
    this.mouseButtons = new Set();
    this.hit = null;

    // Preallocated render scratch. 24 line vertices for the block-selection
    // outline, and one fog colour -- both were freshly allocated every frame.
    this._selectionVertices = new Float32Array(SELECTION_EDGES.length * 3);
    this._fogColor = new Float32Array(3);

    this._setupPrograms();
    this._setupBuffers();
    this._setupInput();
    this._setupScreens();
  }

  _startTitlePreview() {
    if (this.running || this._titlePreviewActive) return;
    this._titlePreviewActive = true;
    this.titlePreviewWorld = new World({ seed: 'title-panorama-112', textureTable: this.textureTable });
    // Hold the title panorama at vanilla sunset (12,000 ticks) for a warm golden-hour scene.
    this.titlePreviewWorld.time = 12000;
    this.world = this.titlePreviewWorld;
    this.player = new Player();
    this.player.teleport(0, 90, 0);
    this.player.pitch = 13;
    this.world.requestAround(0, 0, 4, 64);
    this.titlePreviewAngle = 0;
    const fallback = document.getElementById('title-world-bg');
    const orbit = () => {
      if (!this._titlePreviewActive || this.running || this.world !== this.titlePreviewWorld) return;
      this.titlePreviewAngle += 0.0012;
      const centerX = 0, centerZ = 0, radius = 17;
      const x = centerX + Math.cos(this.titlePreviewAngle) * radius;
      const z = centerZ + Math.sin(this.titlePreviewAngle) * radius;
      // Reveal the 3D panorama only after every preview chunk has a finished mesh.
      // This prevents the old one-chunk-at-a-time flashing/pop-in on the title screen.
      const expectedChunks = 49;
      if (this.world.generatedCount >= expectedChunks && this.world.dirtyMeshes.size === 0 && this.chunkRenderer.meshes.size > 0 && fallback) fallback.style.display = 'none';
      const ground = this.world.getHeight(Math.floor(x), Math.floor(z));
      const targetY = ground > -60 ? ground + 5.5 : 78;
      this.player.x = x;
      this.player.y = targetY;
      this.player.z = z;
      this.player.yaw = Math.atan2(centerX - x, centerZ - z) * 180 / Math.PI;
      this.player.pitch = 12;
      this._render();
      requestAnimationFrame(orbit);
    };
    requestAnimationFrame(orbit);
  }

  _stopTitlePreview() {
    this._titlePreviewActive = false;
    if (this.world === this.titlePreviewWorld) {
      this.titlePreviewWorld?.dispose();
      this.world = null;
      this.player = null;
    }
    this.titlePreviewWorld = null;
    const fallback = document.getElementById('title-world-bg');
    if (fallback) fallback.style.display = '';
  }

  /** Show the title screen and ask the browser not to evict saved worlds. */
  async start() {
    this.ui.showScreen('title');
    this.ui.setHudVisible(false);
    this._startTitlePreview();

    // Without persistence, a browser low on disk may silently discard
    // IndexedDB -- which for this project means deleting someone's world. The
    // request can be declined, so failure is not fatal.
    try {
      await storage.requestPersistence();
    } catch {
      // Not available in every context (private windows in particular).
    }
    return this;
  }

  // -- GPU setup ----------------------------------------------------------

  // -- Screens ------------------------------------------------------------

  /** Write an imported save into local storage, then open it. */

  // -- World lifecycle ----------------------------------------------------

  /**
   * Block until enough terrain exists to stand on.
   *
   * Without this the player spawns into ungenerated space and falls, which
   * reads as the game being broken even though the chunks arrive a moment later.
   */

  // -- Saving -------------------------------------------------------------

  /**
   * Attach failure handling to background persistence.
   *
   * Storage can fail for reasons entirely outside the game -- a full disk, a
   * private window, a quota refusal. Losing that silently is the worst outcome,
   * because the player keeps building in a world that is no longer being saved.
   */

  // -- Input --------------------------------------------------------------

  // -- Inventory ----------------------------------------------------------

  /** (Re)build the inventory DOM for the current crafting grid size. */

  /** Open the personal inventory with its 2x2 crafting grid. */

  /**
   * Open the 3x3 crafting grid of a crafting table.
   *
   * This is what makes every tool, weapon, and armour recipe reachable -- the
   * 2x2 personal grid can only make 2x2 recipes (planks, sticks, the table
   * itself). Without a table UI those 3x3 recipes existed in data but could
   * never be crafted in-game.
   */

  /**
   * Open the creative inventory: a palette of every block, click to grab a
   * stack. This is what makes the hundreds of variety blocks reachable at all --
   * most are not craftable (coloured concrete needs water, wool needs string),
   * so without this they could only be seen via commands.
   */

  // -- Block interaction --------------------------------------------------

  /**
   * Right-click: use the targeted block if it has an interaction, otherwise
   * place the held block.
   *
   * Sneaking suppresses the use and forces placement -- exactly vanilla's rule,
   * and what lets you place a block against a chest or table instead of opening
   * it. As more interactive blocks arrive (furnace, chest) they join USABLE.
   */

  /** Middle-click: put the targeted block in hand if it is already carried. */

  // -- Loop ---------------------------------------------------------------

  _frame(now) {
    requestAnimationFrame((t) => this._frame(t));
    if (!this.running) return;

    const deltaMs = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this._fpsFrames++;
    this._fpsTime += deltaMs;
    if (this._fpsTime >= 500) {
      this.fps = (this._fpsFrames * 1000) / this._fpsTime;
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }

    if (!this.paused) {
      this.accumulator += deltaMs;
      // Clamped: see the note at the top of this file about backgrounded tabs.
      const maxAccumulated = MAX_CATCHUP_TICKS * MS_PER_TICK;
      if (this.accumulator > maxAccumulated) this.accumulator = maxAccumulated;

      while (this.accumulator >= MS_PER_TICK) {
        this.accumulator -= MS_PER_TICK;
        this._tick();
      }
    }

    this._render();
  }

  _tick() {
    this.tickCount++;
    const world = this.world;
    const player = this.player;
    if (!world || !player) return;

    world.time = (world.time + 1) % (TICKS_PER_DAY * 8);
    this._tickFurnaces?.();

    if (!this.inventoryOpen) {
      player.input.forward =
        (isDown(this.keys, 'forward') ? 1 : 0) - (isDown(this.keys, 'back') ? 1 : 0);
      player.input.strafe =
        (isDown(this.keys, 'right') ? 1 : 0) - (isDown(this.keys, 'left') ? 1 : 0);
      player.input.jump = isDown(this.keys, 'jump');
      player.input.sneak = isDown(this.keys, 'sneak');
      player.input.sprint = isDown(this.keys, 'sprint');
    } else {
      player.input.forward = 0;
      player.input.strafe = 0;
      player.input.jump = false;
    }

    // Preserve the previous simulation position so rendering can interpolate
    // between 20 TPS physics steps instead of visibly snapping at 20 Hz.
    player.prevX = player.x;
    player.prevY = player.y;
    player.prevZ = player.z;
    // Repeat the first-person mining swing while the mouse button is held.
    if (this.mouseButtons.has(0) && !this.inventoryOpen && this.hit && this.tickCount % 10 < 5) {
      player.attackTime = 8;
    }
    player.tick(world);
    this.entities?.tick();
    if (player.health <= 0 && !this.deathScreenOpen) {
      this.deathScreenOpen = true;
      this.paused = true;
      this.keys.clear();
      this.mouseButtons.clear();
      document.exitPointerLock?.();
      document.getElementById('death-screen')?.classList.remove('hidden');
      document.body.classList.add('menu-active');
    }
    for (const change of growNearbyWheat(world, player, this.tickCount)) {
      this.multiplayer?.pushBlockChange(change.x, change.y, change.z, change.state);
    }
    this.multiplayer?.tick(MS_PER_TICK / 1000);

    this.hit = raycast(
      world, player.x, player.eyeY, player.z, player.yaw, player.pitch, player.reach,
    );

    if (this.mouseButtons.has(0) && !this.inventoryOpen) {
      // Entity hits take priority over mining blocks behind the creature.
      const hitMob = this.entities?.attackFromPlayer();
      if (!hitMob && this.hit) {
        const conditions = {
          underwater: player.inWater,
          airborne: !player.onGround,
        };
        if (this.player.gamemode === GAMEMODE.CREATIVE) {
          this._breakBlock();
        } else if (this.mining.tick(world, this.hit, this.inventory.held, conditions)) {
          this._breakBlock();
        }
      } else {
        this.mining.reset();
      }
    } else if (!this.mouseButtons.has(0)) {
      this.mining.reset();
    }

    world.requestAround(player.x, player.z, this.renderDistance, 4);

    // Unloading trails the render distance so chunks at the edge are not
    // repeatedly dropped and regenerated as the player walks back and forth.
    if (this.tickCount % 40 === 0) {
      const evicted = world.unloadBeyond(player.x, player.z, this.renderDistance + 3);
      if (evicted.length > 0) {
        const entries = evicted.map((chunk) => {
          this.chunkRenderer.remove(chunk.cx, chunk.cz);
          return { cx: chunk.cx, cz: chunk.cz, bytes: encodeChunk(chunk) };
        });
        // One transaction for the batch, and the rejection is handled. A bare
        // floating promise per chunk meant a storage failure surfaced as an
        // unhandled rejection with no context, and silently lost the chunk.
        this._persist(
          storage.putChunks(this.worldMeta.id, 'mc:overworld', entries),
          `saving ${entries.length} unloaded chunk(s)`,
        );
      }
    }

    if (this.tickCount % AUTOSAVE_TICKS === 0) {
      this._persist(this._save(false), 'autosave');
    }
  }

  // -- Rendering ----------------------------------------------------------

  /**
   * Sky brightness, 0..1.
   *
   * Deliberately NOT a sine over the whole day. Minecraft is at FULL brightness
   * for the entire day and only dims across the roughly one-minute dusk and dawn
   * windows -- a smooth sinusoid instead makes mid-morning look like twilight,
   * which reads as the game being broken rather than as a time of day.
   *
   * Boundaries are the vanilla tick marks: dusk at 12000, night from 13000,
   * dawn beginning at 23000.
   */
  get daylight() {
    const t = this.world.time % TICKS_PER_DAY;
    const NIGHT = 0.22;

    if (t < 12000) return 1;                                   // day
    if (t < 13000) return 1 - (1 - NIGHT) * ((t - 12000) / 1000); // dusk
    if (t < 23000) return NIGHT;                               // night
    return NIGHT + (1 - NIGHT) * ((t - 23000) / 1000);         // dawn
  }

  /** The 10-stage crack overlay on the block currently being mined. */
}

// ---------------------------------------------------------------------------
// Concern mixins
//
// Game's methods live in per-concern modules and are attached to the prototype
// here. They are mixins rather than collaborator objects on purpose: the bodies
// move between files unchanged, so each extraction is verifiable by diffing the
// body. main.js has no test coverage, and a rewrite into injected collaborators
// could not be checked that way. Turning these into real collaborators is the
// follow-up, once Game itself is under test.
// ---------------------------------------------------------------------------

Object.assign(
  Game.prototype,
  SessionMixin,
  ScreensMixin,
  InputMixin,
  InventoryControllerMixin,
  BlockActionsMixin,
  ContainerScreensMixin,
  RendererMixin,
  DebugOverlayMixin,
);

// Exported so the class and its methods can be exercised without booting a real
// GL context. Previously nothing outside this file could reach Game at all.
export { Game };
