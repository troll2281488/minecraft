import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getDatabase, ref, set, get, update, push, remove, onValue, onChildAdded, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

    // =========================================================================
    // 1. FIREBASE REALTIME DATABASE MULTIPLAYER SETUP
    // =========================================================================
    const firebaseConfig = {
      apiKey: "AIzaSyCf1UO6hrlYXR2GYcgGZUfsbit4Zav1m4E",
      authDomain: "trolldonor.firebaseapp.com",
      databaseURL: "https://trolldonor-default-rtdb.firebaseio.com",
      projectId: "trolldonor",
      storageBucket: "trolldonor.firebasestorage.app",
      messagingSenderId: "761197257675",
      appId: "1:761197257675:web:53dc596cf349d0cd474c4e",
      measurementId: "G-B658V7L7ES"
    };

    let fbDb = null;
    try {
      const fbApp = initializeApp(firebaseConfig);
      fbDb = getDatabase(fbApp);
    } catch (err) {
      console.warn("Firebase offline fallback:", err);
    }

    const MP = {
      active: false,
      roomId: null,
      playerId: "p_" + Math.random().toString(36).slice(2, 10),
      nickname: "Steve",
      pingMs: 24,
      remotePlayers: new Map(),
      unsubs: [],
      syncAccum: 0,
      sweepTimer: null,
      pingTimer: null
    };

    // =========================================================================
    // 2. WEB AUDIO API PROCEDURAL SOUND ENGINE
    // =========================================================================
    const SFX = {
      ctx: null,
      volume: 0.7,
      ensure() {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      },
      tone(freq, type = "square", dur = 0.08, gainVal = 0.14, slideTo = null) {
        if (this.volume <= 0) return;
        this.ensure();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
        gain.gain.setValueAtTime(gainVal * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
      },
      click() { this.tone(640, "square", 0.04, 0.11, 410); },
      step(mat = "grass") {
        const f = mat === "stone" ? 155 : mat === "wood" ? 205 : 115;
        this.tone(f + Math.random() * 30, "triangle", 0.05, 0.07, 58);
      },
      breakBlock(mat = "grass") {
        const f = mat === "stone" ? 230 : mat === "wood" ? 280 : 175;
        this.tone(f, "sawtooth", 0.11, 0.15, 68);
      },
      placeBlock() { this.tone(310, "triangle", 0.07, 0.14, 185); },
      hurt() { this.tone(185, "sawtooth", 0.18, 0.22, 72); },
      shieldBlock() { this.tone(420, "square", 0.09, 0.2, 220); },
      bowShoot() { this.tone(520, "triangle", 0.12, 0.16, 190); },
      eyeLaunch() { this.tone(740, "sine", 0.28, 0.16, 1180); },
      pickup() { this.tone(880, "sine", 0.07, 0.11, 1320); },
      levelUp() {
        this.tone(523, "triangle", 0.12, 0.15);
        setTimeout(() => this.tone(659, "triangle", 0.12, 0.15), 90);
        setTimeout(() => this.tone(784, "triangle", 0.22, 0.16), 180);
      },
      explode() { this.tone(92, "sawtooth", 0.55, 0.35, 24); }
    };

    // =========================================================================
    // 3. BLOCKS, ITEMS & MUTED ALPHA/BETA 16x16 PIXEL TEXTURES
    // =========================================================================
    const B = {
      AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLESTONE: 4, BEDROCK: 5,
      OAK_LOG: 6, OAK_PLANKS: 7, OAK_LEAVES: 8, SAND: 9, GRAVEL: 10,
      COAL_ORE: 11, IRON_ORE: 12, GOLD_ORE: 13, DIAMOND_ORE: 14,
      REDSTONE_ORE: 15, LAPIS_ORE: 16, CRAFTING_TABLE: 17, FURNACE: 18,
      CHEST: 19, TORCH: 20, GLASS: 21, WATER: 22, LAVA: 23,
      OBSIDIAN: 24, NETHERRACK: 25, SOUL_SAND: 26, GLOWSTONE: 27,
      NETHER_PORTAL: 28, END_STONE: 29, END_PORTAL_FRAME: 30,
      END_PORTAL_FRAME_EYE: 31, END_PORTAL: 32, FARMLAND: 33,
      WHEAT_1: 34, WHEAT_7: 35, POPPY: 36, DANDELION: 37,
      STONE_BRICKS: 38, DRAGON_EGG: 39, BOOKSHELF: 40, WOOL_WHITE: 41,
      BRICKS: 42, TNT: 43, HAY_BLOCK: 44, SANDSTONE: 45,
      NETHER_BRICKS: 46, QUARTZ_ORE: 47, GOLD_BLOCK: 48,
      BED_FOOT: 49, BED_HEAD: 50, CRYING_OBSIDIAN: 51
    };

    const BLOCK_PROPS = {
      [B.AIR]: { name: "Воздух", solid: false, transparent: true, hardness: 0 },
      [B.GRASS]: { name: "Дёрн", solid: true, hardness: 0.6, mat: "grass", drop: B.DIRT },
      [B.DIRT]: { name: "Земля", solid: true, hardness: 0.5, mat: "grass", drop: B.DIRT },
      [B.STONE]: { name: "Камень", solid: true, hardness: 1.5, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.COBBLESTONE },
      [B.COBBLESTONE]: { name: "Булыжник", solid: true, hardness: 2.0, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.COBBLESTONE },
      [B.BEDROCK]: { name: "Бедрок", solid: true, hardness: -1, mat: "stone" },
      [B.OAK_LOG]: { name: "Дубовое бревно", solid: true, hardness: 1.6, mat: "wood", drop: B.OAK_LOG },
      [B.OAK_PLANKS]: { name: "Дубовые доски", solid: true, hardness: 1.4, mat: "wood", drop: B.OAK_PLANKS },
      [B.OAK_LEAVES]: { name: "Листва дуба", solid: true, transparent: true, hardness: 0.2, mat: "grass", drop: "apple_chance" },
      [B.SAND]: { name: "Песок", solid: true, hardness: 0.5, mat: "grass", drop: B.SAND },
      [B.GRAVEL]: { name: "Гравий", solid: true, hardness: 0.6, mat: "grass", drop: B.GRAVEL },
      [B.COAL_ORE]: { name: "Угольная руда", solid: true, hardness: 2.4, mat: "stone", tool: "pickaxe", minTier: 1, drop: "coal" },
      [B.IRON_ORE]: { name: "Железная руда", solid: true, hardness: 2.8, mat: "stone", tool: "pickaxe", minTier: 2, drop: B.IRON_ORE },
      [B.GOLD_ORE]: { name: "Золотая руда", solid: true, hardness: 2.8, mat: "stone", tool: "pickaxe", minTier: 3, drop: B.GOLD_ORE },
      [B.DIAMOND_ORE]: { name: "Алмазная руда", solid: true, hardness: 3.2, mat: "stone", tool: "pickaxe", minTier: 3, drop: "diamond" },
      [B.REDSTONE_ORE]: { name: "Редстоуновая руда", solid: true, hardness: 2.8, mat: "stone", tool: "pickaxe", minTier: 3, drop: "redstone" },
      [B.LAPIS_ORE]: { name: "Лазуритовая руда", solid: true, hardness: 2.6, mat: "stone", tool: "pickaxe", minTier: 2, drop: "lapis" },
      [B.CRAFTING_TABLE]: { name: "Верстак", solid: true, hardness: 1.5, mat: "wood", drop: B.CRAFTING_TABLE, interactive: "crafting" },
      [B.FURNACE]: { name: "Печь", solid: true, hardness: 2.2, mat: "stone", drop: B.FURNACE, interactive: "furnace" },
      [B.CHEST]: { name: "Сундук", solid: true, hardness: 1.5, mat: "wood", drop: B.CHEST, interactive: "chest" },
      [B.TORCH]: { name: "Факел", solid: false, transparent: true, hardness: 0.05, mat: "wood", drop: B.TORCH },
      [B.GLASS]: { name: "Стекло", solid: true, transparent: true, hardness: 0.3, mat: "stone", drop: null },
      [B.WATER]: { name: "Вода", solid: false, transparent: true, fluid: true, hardness: -1 },
      [B.LAVA]: { name: "Лава", solid: false, transparent: true, fluid: true, hardness: -1 },
      [B.OBSIDIAN]: { name: "Обсидиан", solid: true, hardness: 8.5, mat: "stone", tool: "pickaxe", minTier: 4, drop: B.OBSIDIAN },
      [B.NETHERRACK]: { name: "Незерак", solid: true, hardness: 0.5, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.NETHERRACK },
      [B.SOUL_SAND]: { name: "Песок душ", solid: true, hardness: 0.5, mat: "grass", drop: B.SOUL_SAND },
      [B.GLOWSTONE]: { name: "Светокамень", solid: true, hardness: 0.4, mat: "stone", drop: B.GLOWSTONE },
      [B.NETHER_PORTAL]: { name: "Портал в Нижний мир", solid: false, transparent: true, hardness: -1 },
      [B.END_STONE]: { name: "Эндерняк", solid: true, hardness: 2.4, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.END_STONE },
      [B.END_PORTAL_FRAME]: { name: "Рамка портала в Край", solid: true, hardness: 2.0, mat: "stone", drop: B.END_PORTAL_FRAME },
      [B.END_PORTAL_FRAME_EYE]: { name: "Рамка портала с Оком", solid: true, hardness: 2.0, mat: "stone", drop: B.END_PORTAL_FRAME },
      [B.END_PORTAL]: { name: "Портал в Край", solid: false, transparent: true, hardness: -1 },
      [B.FARMLAND]: { name: "Грядка", solid: true, hardness: 0.5, mat: "grass", drop: B.DIRT },
      [B.WHEAT_1]: { name: "Ростки пшеницы", solid: false, transparent: true, cross: true, hardness: 0.05, drop: "wheat_seeds" },
      [B.WHEAT_7]: { name: "Спелая пшеница", solid: false, transparent: true, cross: true, hardness: 0.05, drop: "wheat" },
      [B.POPPY]: { name: "Мак", solid: false, transparent: true, cross: true, hardness: 0.05, drop: B.POPPY },
      [B.DANDELION]: { name: "Одуванчик", solid: false, transparent: true, cross: true, hardness: 0.05, drop: B.DANDELION },
      [B.STONE_BRICKS]: { name: "Каменные кирпичи", solid: true, hardness: 1.8, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.STONE_BRICKS },
      [B.DRAGON_EGG]: { name: "Яйцо дракона", solid: true, hardness: 1.0, mat: "stone", drop: B.DRAGON_EGG },
      [B.BOOKSHELF]: { name: "Книжная полка", solid: true, hardness: 1.2, mat: "wood", drop: B.BOOKSHELF },
      [B.WOOL_WHITE]: { name: "Белая шерсть", solid: true, hardness: 0.6, mat: "grass", drop: B.WOOL_WHITE },
      [B.BRICKS]: { name: "Кирпичи", solid: true, hardness: 2.0, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.BRICKS },
      [B.TNT]: { name: "Динамит (TNT)", solid: true, hardness: 0.2, mat: "grass", drop: B.TNT },
      [B.HAY_BLOCK]: { name: "Сноп сена", solid: true, hardness: 0.5, mat: "grass", drop: B.HAY_BLOCK },
      [B.SANDSTONE]: { name: "Песчаник", solid: true, hardness: 1.0, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.SANDSTONE },
      [B.NETHER_BRICKS]: { name: "Адские кирпичи", solid: true, hardness: 2.0, mat: "stone", tool: "pickaxe", minTier: 1, drop: B.NETHER_BRICKS },
      [B.QUARTZ_ORE]: { name: "Незер-кварцевая руда", solid: true, hardness: 2.2, mat: "stone", tool: "pickaxe", minTier: 1, drop: "quartz" },
      [B.GOLD_BLOCK]: { name: "Золотой блок", solid: true, hardness: 2.5, mat: "stone", tool: "pickaxe", minTier: 2, drop: B.GOLD_BLOCK },
      [B.BED_FOOT]: { name: "Кровать (низ)", solid: true, hardness: 0.3, mat: "wood", drop: "bed", interactive: "bed" },
      [B.BED_HEAD]: { name: "Кровать (изголовье)", solid: true, hardness: 0.3, mat: "wood", drop: "bed", interactive: "bed" },
      [B.CRYING_OBSIDIAN]: { name: "Плачущий обсидиан", solid: true, hardness: 8.5, mat: "stone", tool: "pickaxe", minTier: 4, drop: B.CRYING_OBSIDIAN }
    };

    const ITEMS = {
      stick: { name: "Палка", cat: "misc", stack: 64 },
      emerald: { name: "Изумруд", cat: "misc", stack: 64 },
      quartz: { name: "Незер-кварц", cat: "misc", stack: 64 },
      wither_skull: { name: "Череп визер-скелета", cat: "misc", stack: 64 },
      bed: { name: "Красная кровать", cat: "misc", stack: 1 },
      coal: { name: "Уголь", cat: "misc", stack: 64 },
      iron_ingot: { name: "Железный слиток", cat: "misc", stack: 64 },
      gold_ingot: { name: "Золотой слиток", cat: "misc", stack: 64 },
      diamond: { name: "Алмаз", cat: "misc", stack: 64 },
      redstone: { name: "Редстоун", cat: "misc", stack: 64 },
      lapis: { name: "Лазурит", cat: "misc", stack: 64 },
      flint_and_steel: { name: "Огниво", cat: "tools", stack: 1 },
      bucket_water: { name: "Ведро воды", cat: "tools", stack: 1 },
      bucket_lava: { name: "Ведро лавы", cat: "tools", stack: 1 },
      ender_pearl: { name: "Жемчуг Эндера", cat: "misc", stack: 16 },
      blaze_rod: { name: "Огненный стержень", cat: "misc", stack: 64 },
      blaze_powder: { name: "Огненный порошок", cat: "misc", stack: 64 },
      ender_eye: { name: "Око Края", cat: "misc", stack: 64 },
      apple: { name: "Яблоко", cat: "armor_food", stack: 64, food: 4 },
      bread: { name: "Хлеб", cat: "armor_food", stack: 64, food: 5 },
      cooked_beef: { name: "Жареная говядина", cat: "armor_food", stack: 64, food: 8 },
      golden_apple: { name: "Золотое яблоко", cat: "armor_food", stack: 64, food: 8 },
      wheat: { name: "Пшеница", cat: "misc", stack: 64 },
      wheat_seeds: { name: "Семена пшеницы", cat: "misc", stack: 64 },
      bone: { name: "Кость", cat: "misc", stack: 64 },
      string: { name: "Нить", cat: "misc", stack: 64 },
      bow: { name: "Лук", cat: "tools", stack: 1 },
      arrow: { name: "Стрела", cat: "tools", stack: 64 },
      shield: { name: "Щит", cat: "armor_food", stack: 1 },
      leather_helmet: { name: "Кожаный шлем", cat: "armor_food", stack: 1, armor: 1, equip: "head" },
      leather_chestplate: { name: "Кожаная куртка", cat: "armor_food", stack: 1, armor: 3, equip: "chest" },
      leather_leggings: { name: "Кожаные поножи", cat: "armor_food", stack: 1, armor: 2, equip: "legs" },
      leather_boots: { name: "Кожаные ботинки", cat: "armor_food", stack: 1, armor: 1, equip: "feet" },
      chainmail_helmet: { name: "Кольчужный шлем", cat: "armor_food", stack: 1, armor: 2, equip: "head" },
      chainmail_chestplate: { name: "Кольчужный нагрудник", cat: "armor_food", stack: 1, armor: 5, equip: "chest" },
      chainmail_leggings: { name: "Кольчужные поножи", cat: "armor_food", stack: 1, armor: 4, equip: "legs" },
      chainmail_boots: { name: "Кольчужные ботинки", cat: "armor_food", stack: 1, armor: 1, equip: "feet" },
      gold_helmet: { name: "Золотой шлем", cat: "armor_food", stack: 1, armor: 2, equip: "head" },
      gold_chestplate: { name: "Золотой нагрудник", cat: "armor_food", stack: 1, armor: 5, equip: "chest" },
      gold_leggings: { name: "Золотые поножи", cat: "armor_food", stack: 1, armor: 3, equip: "legs" },
      gold_boots: { name: "Золотые ботинки", cat: "armor_food", stack: 1, armor: 1, equip: "feet" },
      iron_helmet: { name: "Железный шлем", cat: "armor_food", stack: 1, armor: 2, equip: "head" },
      iron_chestplate: { name: "Железный нагрудник", cat: "armor_food", stack: 1, armor: 6, equip: "chest" },
      diamond_helmet: { name: "Алмазный шлем", cat: "armor_food", stack: 1, armor: 3, equip: "head" },
      diamond_chestplate: { name: "Алмазный нагрудник", cat: "armor_food", stack: 1, armor: 8, equip: "chest" },
      iron_leggings: { name: "Железные поножи", cat: "armor_food", stack: 1, armor: 5, equip: "legs" },
      iron_boots: { name: "Железные ботинки", cat: "armor_food", stack: 1, armor: 2, equip: "feet" },
      diamond_leggings: { name: "Алмазные поножи", cat: "armor_food", stack: 1, armor: 6, equip: "legs" },
      diamond_boots: { name: "Алмазные ботинки", cat: "armor_food", stack: 1, armor: 3, equip: "feet" },
      leather: { name: "Кожа", cat: "misc", stack: 64 },
      ancient_debris: { name: "Древние обломки", cat: "misc", stack: 64 },
      netherite_scrap: { name: "Незеритовый лом", cat: "misc", stack: 64 },
      netherite_ingot: { name: "Незеритовый слиток", cat: "misc", stack: 64 },
      netherite_helmet: { name: "Незеритовый шлем", cat: "armor_food", stack: 1, armor: 3, equip: "head", toughness: 3 },
      netherite_chestplate: { name: "Незеритовый нагрудник", cat: "armor_food", stack: 1, armor: 8, equip: "chest", toughness: 3 },
      netherite_leggings: { name: "Незеритовые поножи", cat: "armor_food", stack: 1, armor: 6, equip: "legs", toughness: 3 },
      netherite_boots: { name: "Незеритовые ботинки", cat: "armor_food", stack: 1, armor: 3, equip: "feet", toughness: 3 },
      elytra: { name: "Элитры", cat: "armor_food", stack: 1, equip: "chest", elytra: true },
      netherite_pickaxe: { name: "Незеритовая кирка", cat: "tools", stack: 1, tool: "pickaxe", tier: 5, speed: 9.5 },
      netherite_sword: { name: "Незеритовый меч", cat: "tools", stack: 1, damage: 9 },
      trident: { name: "Трезубец", cat: "tools", stack: 1, damage: 9, trident: true },
      wood_pickaxe: { name: "Деревянная кирка", cat: "tools", stack: 1, tool: "pickaxe", tier: 1, speed: 2.2 },
      stone_pickaxe: { name: "Каменная кирка", cat: "tools", stack: 1, tool: "pickaxe", tier: 2, speed: 4.0 },
      iron_pickaxe: { name: "Железная кирка", cat: "tools", stack: 1, tool: "pickaxe", tier: 3, speed: 6.0 },
      diamond_pickaxe: { name: "Алмазная кирка", cat: "tools", stack: 1, tool: "pickaxe", tier: 4, speed: 8.5 },
      wood_axe: { name: "Деревянный топор", cat: "tools", stack: 1, tool: "axe", tier: 1, speed: 2.4, damage: 4 },
      stone_axe: { name: "Каменный топор", cat: "tools", stack: 1, tool: "axe", tier: 2, speed: 4.0, damage: 5 },
      iron_axe: { name: "Железный топор", cat: "tools", stack: 1, tool: "axe", tier: 3, speed: 6.0, damage: 6 },
      diamond_axe: { name: "Алмазный топор", cat: "tools", stack: 1, tool: "axe", tier: 4, speed: 8.0, damage: 7 },
      wood_sword: { name: "Деревянный меч", cat: "tools", stack: 1, damage: 4 },
      stone_sword: { name: "Каменный меч", cat: "tools", stack: 1, damage: 5 },
      iron_sword: { name: "Железный меч", cat: "tools", stack: 1, damage: 6 },
      diamond_sword: { name: "Алмазный меч", cat: "tools", stack: 1, damage: 8 },
      wood_hoe: { name: "Деревянная мотыга", cat: "tools", stack: 1, tool: "hoe" }
    };

    const ATLAS = {
      textures: {},
      materials: {},
      icons: {},
      itemTextures: {}
    };

    function makePixelTex(drawFn) {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const ctx = c.getContext("2d");
      drawFn(ctx);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return { tex, dataUrl: c.toDataURL() };
    }

    function noiseFill(ctx, baseHex, altHexes, density = 0.42) {
      ctx.fillStyle = baseHex;
      ctx.fillRect(0, 0, 16, 16);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
          const r = h - Math.floor(h);
          if (r < density) {
            ctx.fillStyle = altHexes[Math.floor((r / density) * altHexes.length)];
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    function initTextures() {
      const grassTop = makePixelTex(ctx => noiseFill(ctx, "#5d8731", ["#527a2b", "#679238", "#4b7026"], 0.55));
      const dirt = makePixelTex(ctx => noiseFill(ctx, "#79553a", ["#684830", "#876043", "#5c3f29"], 0.5));
      const grassSide = makePixelTex(ctx => {
        noiseFill(ctx, "#79553a", ["#684830", "#876043"], 0.45);
        ctx.fillStyle = "#5d8731";
        ctx.fillRect(0, 0, 16, 3);
        for (let x = 0; x < 16; x++) {
          const drop = (x * 7) % 3;
          ctx.fillStyle = x % 2 === 0 ? "#527a2b" : "#679238";
          ctx.fillRect(x, 3, 1, drop);
        }
      });
      const stone = makePixelTex(ctx => noiseFill(ctx, "#7c7c7c", ["#6e6e6e", "#8a8a8a", "#636363"], 0.5));
      const cobble = makePixelTex(ctx => {
        noiseFill(ctx, "#747474", ["#5e5e5e", "#8a8a8a", "#525252"], 0.65);
        ctx.fillStyle = "#484848";
        ctx.fillRect(0, 5, 16, 1); ctx.fillRect(0, 11, 16, 1);
        ctx.fillRect(7, 0, 1, 5); ctx.fillRect(12, 6, 1, 5);
      });
      const bedrock = makePixelTex(ctx => noiseFill(ctx, "#363636", ["#1f1f1f", "#4f4f4f", "#141414"], 0.65));
      const oakSide = makePixelTex(ctx => {
        noiseFill(ctx, "#634b2e", ["#523d24", "#735837"], 0.45);
        ctx.fillStyle = "#45331d";
        for (let x = 2; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
      });
      const oakTop = makePixelTex(ctx => {
        ctx.fillStyle = "#634b2e"; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = "#a38354"; ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = "#876b42"; ctx.fillRect(4, 4, 8, 8);
        ctx.fillStyle = "#a38354"; ctx.fillRect(6, 6, 4, 4);
      });
      const planks = makePixelTex(ctx => {
        noiseFill(ctx, "#9c7f4e", ["#8c7144", "#ab8c57"], 0.4);
        ctx.fillStyle = "#66502d";
        ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1);
        ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
      });
      const leaves = makePixelTex(ctx => {
        ctx.fillStyle = "#486e23";
        ctx.fillRect(0, 0, 16, 16);
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const v = (x * 13 + y * 29) % 11;
            if (v === 0 || v === 1) ctx.clearRect(x, y, 1, 1);
            else if (v < 5) { ctx.fillStyle = "#3a591b"; ctx.fillRect(x, y, 1, 1); }
            else if (v > 8) { ctx.fillStyle = "#56822b"; ctx.fillRect(x, y, 1, 1); }
          }
        }
      });
      const sand = makePixelTex(ctx => noiseFill(ctx, "#cfc695", ["#c2b886", "#dbd2a2"], 0.45));
      const sandstone = makePixelTex(ctx => {
        noiseFill(ctx, "#c7bd8b", ["#b8ae7d", "#d4ca98"], 0.45);
        ctx.fillStyle = "#a3996b";
        ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 11, 16, 1);
      });
      const gravel = makePixelTex(ctx => noiseFill(ctx, "#7d7876", ["#666260", "#918c8a", "#575351"], 0.55));
      const glass = makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.strokeStyle = "#bcd4db";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, 15, 15);
        ctx.fillStyle = "#dcebef";
        ctx.fillRect(2, 2, 3, 1); ctx.fillRect(2, 3, 1, 2);
      });

      const makeOre = (speckHex, base = "#7c7c7c", alts = ["#6e6e6e", "#8a8a8a"]) => makePixelTex(ctx => {
        noiseFill(ctx, base, alts, 0.45);
        ctx.fillStyle = speckHex;
        [[3,3],[4,3],[10,4],[11,5],[5,9],[6,10],[11,11],[12,11],[3,13]].forEach(([x,y]) => ctx.fillRect(x, y, 2, 2));
      });

      const coalOre = makeOre("#262626");
      const ironOre = makeOre("#bfa088");
      const goldOre = makeOre("#d9ca4e");
      const diamondOre = makeOre("#52c7b8");
      const redstoneOre = makeOre("#b82828");
      const lapisOre = makeOre("#28469e");
      const quartzOre = makeOre("#dcd8cc", "#662929", ["#541f1f", "#783232"]);

      const craftTop = makePixelTex(ctx => {
        noiseFill(ctx, "#9c7f4e", ["#856b40"], 0.3);
        ctx.strokeStyle = "#47351b";
        ctx.strokeRect(1.5, 1.5, 13, 13);
        ctx.fillStyle = "#47351b";
        ctx.fillRect(5, 2, 1, 12); ctx.fillRect(10, 2, 1, 12);
        ctx.fillRect(2, 5, 12, 1); ctx.fillRect(2, 10, 12, 1);
      });
      const craftSide = makePixelTex(ctx => {
        noiseFill(ctx, "#9c7f4e", ["#856b40"], 0.3);
        ctx.fillStyle = "#47351b";
        ctx.fillRect(0, 0, 16, 2);
        ctx.fillStyle = "#666666";
        ctx.fillRect(3, 5, 3, 6);
        ctx.fillRect(10, 4, 2, 7);
      });
      const furnaceFront = makePixelTex(ctx => {
        noiseFill(ctx, "#747474", ["#616161", "#858585"], 0.5);
        ctx.fillStyle = "#242424";
        ctx.fillRect(4, 3, 8, 4);
        ctx.fillRect(4, 9, 8, 5);
      });
      const chestFront = makePixelTex(ctx => {
        noiseFill(ctx, "#997032", ["#805c26", "#ad803b"], 0.4);
        ctx.strokeStyle = "#36250d";
        ctx.strokeRect(0.5, 0.5, 15, 15);
        ctx.fillStyle = "#36250d";
        ctx.fillRect(0, 5, 16, 1);
        ctx.fillStyle = "#c4c4c4";
        ctx.fillRect(7, 4, 2, 3);
      });
      const bookshelf = makePixelTex(ctx => {
        noiseFill(ctx, "#9c7f4e", ["#856b40"], 0.3);
        ctx.fillStyle = "#2b2114";
        ctx.fillRect(1, 2, 14, 5); ctx.fillRect(1, 9, 14, 5);
        const cols = ["#8c3232", "#32588c", "#467a36", "#9c8234"];
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = cols[i % 4];
          ctx.fillRect(2 + i * 2, 2, 2, 5);
          ctx.fillStyle = cols[(i + 2) % 4];
          ctx.fillRect(2 + i * 2, 9, 2, 5);
        }
      });
      const wool = makePixelTex(ctx => noiseFill(ctx, "#d4d4d4", ["#c4c4c4", "#e0e0e0"], 0.5));
      const bricks = makePixelTex(ctx => {
        noiseFill(ctx, "#8c4538", ["#78392e", "#9c4f41"], 0.45);
        ctx.fillStyle = "#aba59e";
        ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1);
        ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 0, 1, 3); ctx.fillRect(15, 4, 1, 3);
        ctx.fillRect(7, 8, 1, 3); ctx.fillRect(15, 12, 1, 3);
      });
      const netherBricks = makePixelTex(ctx => {
        noiseFill(ctx, "#381c20", ["#2b1417", "#472429"], 0.45);
        ctx.fillStyle = "#1c0d0f";
        ctx.fillRect(0, 3, 16, 1); ctx.fillRect(0, 7, 16, 1);
        ctx.fillRect(0, 11, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 0, 1, 3); ctx.fillRect(15, 4, 1, 3);
      });
      const goldBlock = makePixelTex(ctx => noiseFill(ctx, "#d9c23b", ["#c7b030", "#e6d25a"], 0.45));
      const tntSide = makePixelTex(ctx => {
        ctx.fillStyle = "#a6382e"; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = "#dcdcdc"; ctx.fillRect(0, 5, 16, 6);
        ctx.fillStyle = "#1c1c1c";
        ctx.fillRect(2, 6, 3, 1); ctx.fillRect(3, 6, 1, 4);
        ctx.fillRect(6, 6, 1, 4); ctx.fillRect(7, 7, 1, 1); ctx.fillRect(8, 8, 1, 1); ctx.fillRect(9, 6, 1, 4);
        ctx.fillRect(11, 6, 3, 1); ctx.fillRect(12, 6, 1, 4);
      });
      const haySide = makePixelTex(ctx => {
        noiseFill(ctx, "#b59d3c", ["#9e8831", "#c4ab47"], 0.5);
        ctx.fillStyle = "#8a382c";
        ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
      });
      const bedBlanket = makePixelTex(ctx => noiseFill(ctx, "#9e3333", ["#872929", "#b33e3e"], 0.45));
      const bedPillow = makePixelTex(ctx => {
        ctx.fillStyle = "#9e3333"; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = "#d9d9d9"; ctx.fillRect(1, 1, 14, 8);
      });
      const poppy = makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#3f6e24"; ctx.fillRect(7, 7, 2, 9); ctx.fillRect(5, 10, 2, 2);
        ctx.fillStyle = "#b82c2c"; ctx.fillRect(5, 2, 6, 5);
        ctx.fillStyle = "#242424"; ctx.fillRect(7, 4, 2, 2);
      });
      const dandelion = makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#3f6e24"; ctx.fillRect(7, 7, 2, 9); ctx.fillRect(9, 11, 2, 2);
        ctx.fillStyle = "#d9c22b"; ctx.fillRect(5, 2, 6, 5);
        ctx.fillStyle = "#b39d1b"; ctx.fillRect(7, 4, 2, 2);
      });
      const wheatTex = makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#bfa43b";
        [3, 7, 11].forEach(x => { ctx.fillRect(x, 3, 2, 13); });
      });
      const water = makePixelTex(ctx => noiseFill(ctx, "#325cb8", ["#294fa3", "#3d69c9"], 0.45));
      const lava = makePixelTex(ctx => noiseFill(ctx, "#c94d14", ["#db781d", "#ad370c", "#e39624"], 0.55));
      const obsidian = makePixelTex(ctx => noiseFill(ctx, "#1b1429", ["#2b2042", "#120d1c", "#392b57"], 0.5));
      const cryingObsidian = makePixelTex(ctx => {
        noiseFill(ctx, "#1b1429", ["#2b2042", "#120d1c"], 0.5);
        ctx.fillStyle = "#6c36b5";
        ctx.fillRect(3, 4, 2, 4); ctx.fillRect(11, 7, 2, 5);
      });
      const netherrack = makePixelTex(ctx => noiseFill(ctx, "#662929", ["#541f1f", "#783232", "#451717"], 0.55));
      const soulSand = makePixelTex(ctx => noiseFill(ctx, "#4a392e", ["#3b2d24", "#594639"], 0.5));
      const glowstone = makePixelTex(ctx => noiseFill(ctx, "#cfa946", ["#9e7929", "#e0c46c", "#7a5919"], 0.6));
      const portal = makePixelTex(ctx => noiseFill(ctx, "#6b2ca3", ["#8441bf", "#511c80"], 0.5));
      const endStone = makePixelTex(ctx => noiseFill(ctx, "#ccce95", ["#b8ba82", "#d9dba4"], 0.5));
      const endFrame = makePixelTex(ctx => {
        noiseFill(ctx, "#456e62", ["#36574d", "#568779"], 0.4);
        ctx.fillStyle = "#ccce95";
        ctx.fillRect(2, 2, 12, 12);
      });
      const endFrameEye = makePixelTex(ctx => {
        noiseFill(ctx, "#456e62", ["#36574d", "#568779"], 0.4);
        ctx.fillStyle = "#48ba7b";
        ctx.fillRect(5, 5, 6, 6);
      });
      const endPortal = makePixelTex(ctx => noiseFill(ctx, "#0b0d17", ["#19243b", "#133632"], 0.35));
      const farmland = makePixelTex(ctx => noiseFill(ctx, "#4d331e", ["#3b2615", "#5c3e26"], 0.5));
      const stoneBricks = makePixelTex(ctx => {
        noiseFill(ctx, "#757575", ["#636363", "#858585"], 0.4);
        ctx.fillStyle = "#474747";
        ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 0, 1, 7); ctx.fillRect(15, 8, 1, 7);
      });
      const torch = makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#704f29"; ctx.fillRect(7, 5, 2, 11);
        ctx.fillStyle = "#db9824"; ctx.fillRect(6, 2, 4, 4);
        ctx.fillStyle = "#f2e699"; ctx.fillRect(7, 3, 2, 2);
      });

      const mat = (t, extra = {}) => new THREE.MeshLambertMaterial({ map: t.tex, ...extra });

      ATLAS.materials[B.GRASS] = [mat(grassSide), mat(grassSide), mat(grassTop), mat(dirt), mat(grassSide), mat(grassSide)];
      ATLAS.icons[B.GRASS] = grassSide.dataUrl;

      ATLAS.materials[B.OAK_LOG] = [mat(oakSide), mat(oakSide), mat(oakTop), mat(oakTop), mat(oakSide), mat(oakSide)];
      ATLAS.icons[B.OAK_LOG] = oakSide.dataUrl;

      ATLAS.materials[B.CRAFTING_TABLE] = [mat(craftSide), mat(craftSide), mat(craftTop), mat(planks), mat(craftSide), mat(craftSide)];
      ATLAS.icons[B.CRAFTING_TABLE] = craftTop.dataUrl;

      ATLAS.materials[B.FURNACE] = [mat(stone), mat(stone), mat(stone), mat(stone), mat(furnaceFront), mat(stone)];
      ATLAS.icons[B.FURNACE] = furnaceFront.dataUrl;

      ATLAS.materials[B.CHEST] = [mat(chestFront), mat(chestFront), mat(planks), mat(planks), mat(chestFront), mat(chestFront)];
      ATLAS.icons[B.CHEST] = chestFront.dataUrl;

      ATLAS.materials[B.BOOKSHELF] = [mat(bookshelf), mat(bookshelf), mat(planks), mat(planks), mat(bookshelf), mat(bookshelf)];
      ATLAS.icons[B.BOOKSHELF] = bookshelf.dataUrl;

      ATLAS.materials[B.TNT] = [mat(tntSide), mat(tntSide), mat(planks), mat(planks), mat(tntSide), mat(tntSide)];
      ATLAS.icons[B.TNT] = tntSide.dataUrl;

      ATLAS.materials[B.BED_FOOT] = [mat(planks), mat(planks), mat(bedBlanket), mat(planks), mat(planks), mat(planks)];
      ATLAS.materials[B.BED_HEAD] = [mat(planks), mat(planks), mat(bedPillow), mat(planks), mat(planks), mat(planks)];
      ATLAS.icons[B.BED_FOOT] = bedPillow.dataUrl;
      ATLAS.icons[B.BED_HEAD] = bedPillow.dataUrl;

      const simple = [
        [B.DIRT, dirt], [B.STONE, stone], [B.COBBLESTONE, cobble], [B.BEDROCK, bedrock],
        [B.OAK_PLANKS, planks], [B.SAND, sand], [B.GRAVEL, gravel],
        [B.COAL_ORE, coalOre], [B.IRON_ORE, ironOre], [B.GOLD_ORE, goldOre],
        [B.DIAMOND_ORE, diamondOre], [B.REDSTONE_ORE, redstoneOre], [B.LAPIS_ORE, lapisOre],
        [B.OBSIDIAN, obsidian], [B.NETHERRACK, netherrack], [B.SOUL_SAND, soulSand],
        [B.GLOWSTONE, glowstone], [B.END_STONE, endStone],
        [B.END_PORTAL_FRAME, endFrame], [B.END_PORTAL_FRAME_EYE, endFrameEye],
        [B.FARMLAND, farmland], [B.STONE_BRICKS, stoneBricks], [B.DRAGON_EGG, obsidian],
        [B.WOOL_WHITE, wool], [B.BRICKS, bricks], [B.HAY_BLOCK, haySide],
        [B.SANDSTONE, sandstone], [B.NETHER_BRICKS, netherBricks], [B.QUARTZ_ORE, quartzOre],
        [B.GOLD_BLOCK, goldBlock], [B.CRYING_OBSIDIAN, cryingObsidian]
      ];
      for (const [id, t] of simple) {
        ATLAS.materials[id] = mat(t);
        ATLAS.icons[id] = t.dataUrl;
      }

      ATLAS.materials[B.OAK_LEAVES] = mat(leaves, { alphaTest: 0.4, side: THREE.DoubleSide });
      ATLAS.icons[B.OAK_LEAVES] = leaves.dataUrl;

      ATLAS.materials[B.GLASS] = mat(glass, { alphaTest: 0.3, transparent: true });
      ATLAS.icons[B.GLASS] = glass.dataUrl;

      ATLAS.materials[B.WATER] = new THREE.MeshLambertMaterial({ map: water.tex, transparent: true, opacity: 0.72 });
      ATLAS.icons[B.WATER] = water.dataUrl;

      ATLAS.materials[B.LAVA] = new THREE.MeshBasicMaterial({ map: lava.tex });
      ATLAS.icons[B.LAVA] = lava.dataUrl;

      ATLAS.materials[B.NETHER_PORTAL] = new THREE.MeshBasicMaterial({ map: portal.tex, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      ATLAS.icons[B.NETHER_PORTAL] = portal.dataUrl;

      ATLAS.materials[B.END_PORTAL] = new THREE.MeshBasicMaterial({ map: endPortal.tex, side: THREE.DoubleSide });
      ATLAS.icons[B.END_PORTAL] = endPortal.dataUrl;

      ATLAS.materials[B.POPPY] = mat(poppy, { alphaTest: 0.5, side: THREE.DoubleSide });
      ATLAS.icons[B.POPPY] = poppy.dataUrl;

      ATLAS.materials[B.DANDELION] = mat(dandelion, { alphaTest: 0.5, side: THREE.DoubleSide });
      ATLAS.icons[B.DANDELION] = dandelion.dataUrl;

      ATLAS.materials[B.WHEAT_1] = mat(wheatTex, { alphaTest: 0.5, side: THREE.DoubleSide });
      ATLAS.materials[B.WHEAT_7] = mat(wheatTex, { alphaTest: 0.5, side: THREE.DoubleSide });
      ATLAS.icons[B.WHEAT_1] = wheatTex.dataUrl;
      ATLAS.icons[B.WHEAT_7] = wheatTex.dataUrl;

      ATLAS.materials[B.TORCH] = mat(torch, { alphaTest: 0.5, side: THREE.DoubleSide });
      ATLAS.icons[B.TORCH] = torch.dataUrl;

      // 16x16 Pixel Icons for Tools, Weapons, Armor, Food & Items
      const tierColors = { wood: "#967444", stone: "#828282", iron: "#c7c7c7", diamond: "#4ec2b4" };
      const drawPickaxe = (headCol) => makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#6e4e2a";
        for (let i = 0; i < 9; i++) ctx.fillRect(3 + i, 12 - i, 2, 2);
        ctx.fillStyle = headCol;
        ctx.fillRect(4, 2, 7, 2); ctx.fillRect(10, 3, 3, 2); ctx.fillRect(12, 5, 2, 5); ctx.fillRect(3, 3, 2, 2);
      });
      const drawAxe = (headCol) => makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#6e4e2a";
        for (let i = 0; i < 10; i++) ctx.fillRect(3 + i, 12 - i, 2, 2);
        ctx.fillStyle = headCol;
        ctx.fillRect(8, 2, 5, 5); ctx.fillRect(7, 3, 2, 4);
      });
      const drawSword = (bladeCol) => makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#6e4e2a";
        ctx.fillRect(2, 12, 2, 2); ctx.fillRect(3, 11, 2, 2);
        ctx.fillStyle = "#4d361d";
        ctx.fillRect(4, 9, 4, 1); ctx.fillRect(6, 10, 1, 3);
        ctx.fillStyle = bladeCol;
        for (let i = 0; i < 7; i++) ctx.fillRect(6 + i, 9 - i, 2, 2);
      });
      const drawHoe = (headCol) => makePixelTex(ctx => {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = "#6e4e2a";
        for (let i = 0; i < 10; i++) ctx.fillRect(3 + i, 12 - i, 2, 2);
        ctx.fillStyle = headCol;
        ctx.fillRect(7, 2, 6, 2);
      });

      for (const t of ["wood", "stone", "iron", "diamond"]) {
        const c = tierColors[t];
        const p = drawPickaxe(c); ATLAS.icons[`${t}_pickaxe`] = p.dataUrl; ATLAS.itemTextures[`${t}_pickaxe`] = p.tex;
        const a = drawAxe(c); ATLAS.icons[`${t}_axe`] = a.dataUrl; ATLAS.itemTextures[`${t}_axe`] = a.tex;
        const s = drawSword(c); ATLAS.icons[`${t}_sword`] = s.dataUrl; ATLAS.itemTextures[`${t}_sword`] = s.tex;
      }
      const hoe = drawHoe(tierColors.wood); ATLAS.icons.wood_hoe = hoe.dataUrl; ATLAS.itemTextures.wood_hoe = hoe.tex;

      const customItems = {
        stick: ctx => { ctx.fillStyle = "#7a5730"; for (let i = 0; i < 10; i++) ctx.fillRect(3 + i, 12 - i, 2, 2); },
        emerald: ctx => { ctx.fillStyle = "#3ba858"; ctx.fillRect(5, 3, 6, 10); ctx.fillRect(4, 5, 8, 6); ctx.fillStyle = "#7be095"; ctx.fillRect(6, 5, 2, 3); },
        quartz: ctx => { ctx.fillStyle = "#dcd8cc"; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = "#f2efe6"; ctx.fillRect(5, 5, 3, 3); },
        wither_skull: ctx => { ctx.fillStyle = "#242424"; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = "#7a7a7a"; ctx.fillRect(5, 6, 2, 2); ctx.fillRect(9, 6, 2, 2); },
        bed: ctx => { ctx.fillStyle = "#9e3333"; ctx.fillRect(2, 6, 12, 6); ctx.fillStyle = "#d9d9d9"; ctx.fillRect(2, 6, 4, 4); ctx.fillStyle = "#6e4e2a"; ctx.fillRect(2, 12, 2, 2); ctx.fillRect(12, 12, 2, 2); },
        coal: ctx => { ctx.fillStyle = "#262626"; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = "#3b3b3b"; ctx.fillRect(5, 5, 3, 3); },
        iron_ingot: ctx => { ctx.fillStyle = "#c7c7c7"; ctx.fillRect(3, 5, 10, 6); ctx.fillStyle = "#dedede"; ctx.fillRect(4, 6, 8, 2); },
        gold_ingot: ctx => { ctx.fillStyle = "#d9c645"; ctx.fillRect(3, 5, 10, 6); ctx.fillStyle = "#ebe078"; ctx.fillRect(4, 6, 8, 2); },
        diamond: ctx => { ctx.fillStyle = "#4ec2b4"; ctx.fillRect(5, 3, 6, 10); ctx.fillRect(3, 5, 10, 6); ctx.fillStyle = "#8ce6db"; ctx.fillRect(6, 5, 3, 3); },
        redstone: ctx => { ctx.fillStyle = "#b52828"; ctx.fillRect(4, 5, 8, 6); ctx.fillRect(6, 4, 4, 8); },
        lapis: ctx => { ctx.fillStyle = "#2b4ca3"; ctx.fillRect(4, 4, 8, 8); },
        flint_and_steel: ctx => { ctx.fillStyle = "#b0b0b0"; ctx.fillRect(4, 3, 6, 3); ctx.fillRect(4, 3, 2, 7); ctx.fillStyle = "#363636"; ctx.fillRect(7, 7, 5, 5); },
        bucket_water: ctx => { ctx.fillStyle = "#9e9e9e"; ctx.fillRect(4, 5, 8, 8); ctx.fillStyle = "#325cb8"; ctx.fillRect(5, 5, 6, 3); },
        bucket_lava: ctx => { ctx.fillStyle = "#9e9e9e"; ctx.fillRect(4, 5, 8, 8); ctx.fillStyle = "#c94d14"; ctx.fillRect(5, 5, 6, 3); },
        ender_pearl: ctx => { ctx.fillStyle = "#1d5952"; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = "#3a8c82"; ctx.fillRect(6, 5, 3, 3); },
        blaze_rod: ctx => { ctx.fillStyle = "#d69422"; for (let i = 0; i < 10; i++) ctx.fillRect(3 + i, 12 - i, 2, 2); },
        blaze_powder: ctx => { ctx.fillStyle = "#d67c1c"; ctx.fillRect(4, 5, 8, 6); ctx.fillStyle = "#e8b438"; ctx.fillRect(6, 6, 4, 3); },
        ender_eye: ctx => { ctx.fillStyle = "#3b8c6e"; ctx.fillRect(3, 3, 10, 10); ctx.fillStyle = "#78c99e"; ctx.fillRect(5, 5, 6, 6); ctx.fillStyle = "#16241d"; ctx.fillRect(7, 5, 2, 6); },
        apple: ctx => { ctx.fillStyle = "#b52b2b"; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = "#5c4022"; ctx.fillRect(7, 2, 2, 2); },
        bread: ctx => { ctx.fillStyle = "#a87638"; ctx.fillRect(3, 5, 10, 6); ctx.fillStyle = "#c4914d"; ctx.fillRect(4, 6, 8, 2); },
        cooked_beef: ctx => { ctx.fillStyle = "#784226"; ctx.fillRect(3, 4, 10, 8); ctx.fillStyle = "#965838"; ctx.fillRect(5, 6, 6, 4); },
        golden_apple: ctx => { ctx.fillStyle = "#d9c236"; ctx.fillRect(4, 4, 8, 8); ctx.fillStyle = "#6e5226"; ctx.fillRect(7, 2, 2, 2); },
        wheat: ctx => { ctx.fillStyle = "#bfa43b"; ctx.fillRect(4, 3, 8, 10); },
        wheat_seeds: ctx => { ctx.fillStyle = "#5c8532"; ctx.fillRect(5, 6, 2, 2); ctx.fillRect(9, 5, 2, 2); ctx.fillRect(7, 9, 2, 2); },
        bone: ctx => { ctx.fillStyle = "#cfccb8"; for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 11 - i, 2, 2); },
        string: ctx => { ctx.fillStyle = "#cfcfcf"; ctx.fillRect(5, 3, 2, 10); ctx.fillRect(7, 5, 2, 6); },
        bow: ctx => { ctx.fillStyle = "#785329"; ctx.fillRect(4, 2, 2, 12); ctx.fillRect(6, 3, 2, 2); ctx.fillRect(6, 11, 2, 2); ctx.fillStyle = "#cfcfcf"; ctx.fillRect(8, 3, 1, 10); },
        arrow: ctx => { ctx.fillStyle = "#785329"; for (let i = 0; i < 8; i++) ctx.fillRect(4 + i, 11 - i, 1, 1); ctx.fillStyle = "#a8a8a8"; ctx.fillRect(10, 3, 3, 3); },
        shield: ctx => { ctx.fillStyle = "#8c6e42"; ctx.fillRect(4, 2, 8, 12); ctx.strokeStyle = "#8a8a8a"; ctx.strokeRect(4.5, 2.5, 7, 11); },
        iron_helmet: ctx => { ctx.fillStyle = "#bdbdbd"; ctx.fillRect(3, 4, 10, 7); ctx.clearRect(5, 8, 6, 3); },
        iron_chestplate: ctx => { ctx.fillStyle = "#bdbdbd"; ctx.fillRect(2, 3, 12, 10); ctx.clearRect(6, 3, 4, 3); },
        diamond_helmet: ctx => { ctx.fillStyle = "#4ec2b4"; ctx.fillRect(3, 4, 10, 7); ctx.clearRect(5, 8, 6, 3); },
        diamond_chestplate: ctx => { ctx.fillStyle = "#4ec2b4"; ctx.fillRect(2, 3, 12, 10); ctx.clearRect(6, 3, 4, 3); }
      };

      for (const [k, fn] of Object.entries(customItems)) {
        const res = makePixelTex(fn);
        ATLAS.icons[k] = res.dataUrl;
        ATLAS.itemTextures[k] = res.tex;
      }
    }

    // =========================================================================
    // 4. RECIPES, SMELTING & VILLAGER TRADES (FLETCHER, FARMER, BLACKSMITH, CLERIC)
    // =========================================================================
    const RECIPES = [
      { out: { id: B.OAK_PLANKS, count: 4 }, req: { [B.OAK_LOG]: 1 } },
      { out: { id: "stick", count: 4 }, req: { [B.OAK_PLANKS]: 2 } },
      { out: { id: B.CRAFTING_TABLE, count: 1 }, req: { [B.OAK_PLANKS]: 4 } },
      { out: { id: B.TORCH, count: 4 }, req: { coal: 1, stick: 1 } },
      { out: { id: B.FURNACE, count: 1 }, req: { [B.COBBLESTONE]: 8 } },
      { out: { id: B.CHEST, count: 1 }, req: { [B.OAK_PLANKS]: 8 } },
      { out: { id: "bed", count: 1 }, req: { [B.WOOL_WHITE]: 3, [B.OAK_PLANKS]: 3 } },
      { out: { id: "shield", count: 1 }, req: { [B.OAK_PLANKS]: 6, iron_ingot: 1 } },
      { out: { id: "wood_pickaxe", count: 1 }, req: { [B.OAK_PLANKS]: 3, stick: 2 } },
      { out: { id: "wood_axe", count: 1 }, req: { [B.OAK_PLANKS]: 3, stick: 2 } },
      { out: { id: "wood_sword", count: 1 }, req: { [B.OAK_PLANKS]: 2, stick: 1 } },
      { out: { id: "wood_hoe", count: 1 }, req: { [B.OAK_PLANKS]: 2, stick: 2 } },
      { out: { id: "stone_pickaxe", count: 1 }, req: { [B.COBBLESTONE]: 3, stick: 2 } },
      { out: { id: "stone_axe", count: 1 }, req: { [B.COBBLESTONE]: 3, stick: 2 } },
      { out: { id: "stone_sword", count: 1 }, req: { [B.COBBLESTONE]: 2, stick: 1 } },
      { out: { id: "iron_pickaxe", count: 1 }, req: { iron_ingot: 3, stick: 2 } },
      { out: { id: "iron_axe", count: 1 }, req: { iron_ingot: 3, stick: 2 } },
      { out: { id: "iron_sword", count: 1 }, req: { iron_ingot: 2, stick: 1 } },
      { out: { id: "iron_helmet", count: 1 }, req: { iron_ingot: 5 } },
      { out: { id: "iron_chestplate", count: 1 }, req: { iron_ingot: 8 } },
      { out: { id: "diamond_pickaxe", count: 1 }, req: { diamond: 3, stick: 2 } },
      { out: { id: "diamond_axe", count: 1 }, req: { diamond: 3, stick: 2 } },
      { out: { id: "diamond_sword", count: 1 }, req: { diamond: 2, stick: 1 } },
      { out: { id: "diamond_helmet", count: 1 }, req: { diamond: 5 } },
      { out: { id: "diamond_chestplate", count: 1 }, req: { diamond: 8 } },
      { out: { id: "iron_leggings", count: 1 }, req: { iron_ingot: 7 } },
      { out: { id: "iron_boots", count: 1 }, req: { iron_ingot: 4 } },
      { out: { id: "diamond_leggings", count: 1 }, req: { diamond: 7 } },
      { out: { id: "diamond_boots", count: 1 }, req: { diamond: 4 } },
      { out: { id: "netherite_scrap", count: 1 }, req: { ancient_debris: 1 } },
      { out: { id: "netherite_ingot", count: 1 }, req: { gold_ingot: 4, netherite_scrap: 4 } },
      { out: { id: "netherite_helmet", count: 1 }, req: { diamond: 1, netherite_ingot: 1 } },
      { out: { id: "netherite_chestplate", count: 1 }, req: { diamond: 1, netherite_ingot: 1 } },
      { out: { id: "netherite_leggings", count: 1 }, req: { diamond: 1, netherite_ingot: 1 } },
      { out: { id: "netherite_boots", count: 1 }, req: { diamond: 1, netherite_ingot: 1 } },
      { out: { id: "netherite_pickaxe", count: 1 }, req: { diamond: 1, netherite_ingot: 1, stick: 2 } },
      { out: { id: "netherite_sword", count: 1 }, req: { diamond: 1, netherite_ingot: 1, stick: 1 } },
      { out: { id: "elytra", count: 1 }, req: { string: 8, leather: 4 } },
      { out: { id: "flint_and_steel", count: 1 }, req: { iron_ingot: 1, [B.GRAVEL]: 1 } },
      { out: { id: "bread", count: 1 }, req: { wheat: 3 } },
      { out: { id: "golden_apple", count: 1 }, req: { apple: 1, gold_ingot: 8 } },
      { out: { id: "bow", count: 1 }, req: { stick: 3, string: 3 } },
      { out: { id: "arrow", count: 4 }, req: { stick: 1, [B.GRAVEL]: 1 } },
      { out: { id: "blaze_powder", count: 2 }, req: { blaze_rod: 1 } },
      { out: { id: "ender_eye", count: 1 }, req: { ender_pearl: 1, blaze_powder: 1 } }
    ];

    const VILLAGER_PROFESSIONS = {
      fletcher: {
        title: "Житель — Лучник (Fletcher)",
        hatColor: 0x6e5232,
        trades: [
          { give: { id: "stick", count: 16 }, get: { id: "emerald", count: 1 } },
          { give: { id: "emerald", count: 1 }, get: { id: "arrow", count: 16 } },
          { give: { id: "emerald", count: 3 }, get: { id: "bow", count: 1 } },
          { give: { id: "emerald", count: 5 }, get: { id: "shield", count: 1 } }
        ]
      },
      farmer: {
        title: "Житель — Фермер",
        hatColor: 0xb59c45,
        trades: [
          { give: { id: "wheat", count: 12 }, get: { id: "emerald", count: 1 } },
          { give: { id: "emerald", count: 1 }, get: { id: "bread", count: 6 } },
          { give: { id: "emerald", count: 1 }, get: { id: "apple", count: 4 } }
        ]
      },
      blacksmith: {
        title: "Житель — Оружейник",
        hatColor: 0x3b3b3b,
        trades: [
          { give: { id: "coal", count: 10 }, get: { id: "emerald", count: 1 } },
          { give: { id: "iron_ingot", count: 4 }, get: { id: "emerald", count: 1 } },
          { give: { id: "emerald", count: 6 }, get: { id: "iron_sword", count: 1 } },
          { give: { id: "emerald", count: 12 }, get: { id: "diamond_pickaxe", count: 1 } }
        ]
      },
      cleric: {
        title: "Житель — Священник",
        hatColor: 0x5c2e78,
        trades: [
          { give: { id: "gold_ingot", count: 3 }, get: { id: "emerald", count: 1 } },
          { give: { id: "emerald", count: 5 }, get: { id: "ender_pearl", count: 1 } },
          { give: { id: "emerald", count: 2 }, get: { id: "redstone", count: 4 } }
        ]
      }
    };

    const SMELT_MAP = {
      [B.IRON_ORE]: "iron_ingot",
      [B.GOLD_ORE]: "gold_ingot",
      [B.COBBLESTONE]: B.STONE,
      [B.SAND]: B.GLASS
    };

    // =========================================================================
    // 5. THREE.JS SCENE, SKY, LIGHTING & CAMERA
    // =========================================================================
    const canvas = document.getElementById("game-canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88aae0);
    scene.fog = new THREE.Fog(0x88aae0, 26, 72);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 160);
    camera.rotation.order = "YXZ";
    camera.rotation.z = 0;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.64);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xf7f2e3, 0.8);
    sunLight.position.set(40, 80, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 160;
    const d = 38;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const sunMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ color: 0xf0e6a8, side: THREE.DoubleSide, fog: false })
    );
    const moonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({ color: 0xcbd4e8, side: THREE.DoubleSide, fog: false })
    );
    scene.add(sunMesh, moonMesh);

    const cloudGroup = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xebebeb, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 18; i++) {
      const cm = new THREE.Mesh(new THREE.BoxGeometry(10 + (i % 3) * 6, 1.1, 6 + (i % 2) * 4), cloudMat);
      cm.position.set((i - 9) * 14, 62, ((i * 19) % 120) - 60);
      cloudGroup.add(cm);
    }
    scene.add(cloudGroup);

    // First-Person Viewmodels: Main Hand (Right) + Off-Hand (Left) + 3D Shield
    const fpGroup = new THREE.Group();
    camera.add(fpGroup);
    scene.add(camera);

    const fpArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), new THREE.MeshLambertMaterial({ color: 0xb58665 }));
    fpArm.position.set(0.46, -0.44, -0.75);
    fpArm.rotation.set(0.45, -0.25, -0.15);
    fpGroup.add(fpArm);

    const fpBlock = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    fpBlock.position.set(0.48, -0.38, -0.78);
    fpBlock.visible = false;
    fpGroup.add(fpBlock);

    const fpItemSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.44),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
    );
    fpItemSprite.position.set(0.45, -0.32, -0.72);
    fpItemSprite.rotation.set(0.1, -0.4, 0.15);
    fpItemSprite.visible = false;
    fpGroup.add(fpItemSprite);

    function create3DShieldMesh() {
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.05), new THREE.MeshLambertMaterial({ color: 0x7d5d38 }));
      const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.35, 0.57, 0.06)), new THREE.LineBasicMaterial({ color: 0x9c9c9c }));
      const boss = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.07), new THREE.MeshLambertMaterial({ color: 0x9c9c9c }));
      g.add(board, rim, boss);
      return g;
    }

    const fpMainShield = create3DShieldMesh();
    fpMainShield.visible = false;
    fpGroup.add(fpMainShield);

    // Off-Hand Viewmodels (Left side)
    const fpOffBlock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    fpOffBlock.position.set(-0.48, -0.4, -0.76);
    fpOffBlock.visible = false;
    fpGroup.add(fpOffBlock);

    const fpOffSprite = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
    );
    fpOffSprite.position.set(-0.46, -0.36, -0.72);
    fpOffSprite.visible = false;
    fpGroup.add(fpOffSprite);

    const fpOffShield = create3DShieldMesh();
    fpOffShield.visible = false;
    fpGroup.add(fpOffShield);

    // Block Selection Wireframe & Break Cracks
    const highlightBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)),
      new THREE.LineBasicMaterial({ color: 0x1a1a1a })
    );
    highlightBox.visible = false;
    scene.add(highlightBox);

    const crackCanvas = document.createElement("canvas");
    crackCanvas.width = 16; crackCanvas.height = 16;
    const crackCtx = crackCanvas.getContext("2d");
    const crackTex = new THREE.CanvasTexture(crackCanvas);
    crackTex.magFilter = THREE.NearestFilter;
    const crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false })
    );
    crackMesh.visible = false;
    scene.add(crackMesh);

    function updateCrackStage(stage) {
      if (stage <= 0) { crackMesh.visible = false; return; }
      crackMesh.visible = true;
      crackCtx.clearRect(0, 0, 16, 16);
      crackCtx.fillStyle = "rgba(18,18,18,0.72)";
      for (let i = 0; i < stage * 5; i++) {
        const x = (i * 7 + stage * 3) % 14 + 1;
        const y = (i * 11 + stage * 5) % 14 + 1;
        crackCtx.fillRect(x, y, 1, 2);
      }
      crackTex.needsUpdate = true;
    }

    // Pooled Particles & Projectiles
    const breakParticles = [];
    function spawnParticles(bx, by, bz, colorOrBlockId, count = 8) {
      let useMat = null;
      if (typeof colorOrBlockId === "number") {
        const m = ATLAS.materials[colorOrBlockId];
        useMat = Array.isArray(m) ? m[2] : m;
      } else {
        useMat = new THREE.MeshBasicMaterial({ color: colorOrBlockId });
      }
      if (!useMat) return;
      for (let i = 0; i < count; i++) {
        const pm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), useMat);
        pm.position.set(bx + (Math.random() - 0.5) * 0.6, by + (Math.random() - 0.5) * 0.6, bz + (Math.random() - 0.5) * 0.6);
        scene.add(pm);
        breakParticles.push({
          mesh: pm,
          vel: new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.4 + Math.random() * 2.4, (Math.random() - 0.5) * 3.5),
          life: 0.45
        });
      }
    }

    // =========================================================================
    // 6. VOXEL WORLD GENERATOR (STRUCTURES, STRONGHOLD <=500 BLOCKS, PORTALS)
    // =========================================================================
    const CHUNK_SIZE = 16;
    const WORLD_HEIGHT = 64;

    function hash2(x, z, seed) {
      let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
      return n - Math.floor(n);
    }

    function valueNoise2D(x, z, seed) {
      const ix = Math.floor(x), iz = Math.floor(z);
      const fx = x - ix, fz = z - iz;
      const ux = fx * fx * (3 - 2 * fx);
      const uz = fz * fz * (3 - 2 * fz);
      const a = hash2(ix, iz, seed);
      const b = hash2(ix + 1, iz, seed);
      const c = hash2(ix, iz + 1, seed);
      const d = hash2(ix + 1, iz + 1, seed);
      return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
    }

    function fbm2D(x, z, seed) {
      return valueNoise2D(x * 0.03, z * 0.03, seed) * 0.65 +
             valueNoise2D(x * 0.08, z * 0.08, seed + 17) * 0.35;
    }

    class VoxelWorld {
      constructor(seed) {
        this.seed = seed;
        this.dimension = "overworld";
        this.chunks = new Map();
        this.meshes = new Map();
        this.meshQueue = [];
        this.meshQueueSet = new Set();
        this.modifications = { overworld: new Map(), nether: new Map(), end: new Map() };
        this.chests = new Map();
        this.generatedRegions = new Set();

        // Guaranteed Underground Stronghold strictly within 320..480 blocks of spawn (0,0)
        const shAngle = (seed % 360) * (Math.PI / 180);
        const shDist = 340 + (seed % 130); // 340..470 blocks
        this.structures = {
          stronghold: {
            x: Math.round(Math.cos(shAngle) * shDist),
            y: 18,
            z: Math.round(Math.sin(shAngle) * shDist)
          },
          villages: [],
          pyramids: [],
          ruinedPortals: []
        };
      }

      chunkKey(cx, cz) { return `${this.dimension}:${cx},${cz}`; }

      getBiome(x, z) {
        if (this.dimension === "nether") return "Пустоши Нижнего мира";
        if (this.dimension === "end") return "Край";
        const m = valueNoise2D(x * 0.012, z * 0.012, this.seed + 99);
        if (m < 0.32) return "Пустыня";
        if (m < 0.68) return "Равнины";
        return "Дубовый лес";
      }

      getSurfaceHeight(x, z) {
        if (this.dimension === "nether") return 28;
        if (this.dimension === "end") return Math.hypot(x, z) < 34 ? 32 : -1;
        return Math.floor(24 + fbm2D(x, z, this.seed) * 14);
      }

      generateChunkData(cx, cz) {
        const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
        const setLocal = (lx, y, lz, id) => {
          if (lx < 0 || lx >= CHUNK_SIZE || y < 0 || y >= WORLD_HEIGHT || lz < 0 || lz >= CHUNK_SIZE) return;
          data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id;
        };

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;

            if (this.dimension === "overworld") {
              const h = this.getSurfaceHeight(wx, wz);
              const biome = this.getBiome(wx, wz);
              setLocal(lx, 0, lz, B.BEDROCK);

              for (let y = 1; y <= h; y++) {
                const cave = valueNoise2D(wx * 0.09 + y * 0.13, wz * 0.09 - y * 0.11, this.seed + 31);
                if (y < h - 3 && y > 2 && cave > 0.78) {
                  setLocal(lx, y, lz, y < 7 ? B.LAVA : B.AIR);
                  continue;
                }
                if (y === h) setLocal(lx, y, lz, (biome === "Пустыня" || h < 27) ? B.SAND : B.GRASS);
                else if (y >= h - 3) setLocal(lx, y, lz, biome === "Пустыня" ? B.SAND : B.DIRT);
                else {
                  const r = hash2(wx * 13 + y, wz * 17 - y, this.seed);
                  if (y < 14 && r < 0.012) setLocal(lx, y, lz, B.DIAMOND_ORE);
                  else if (y < 16 && r < 0.026) setLocal(lx, y, lz, B.REDSTONE_ORE);
                  else if (y < 24 && r < 0.042) setLocal(lx, y, lz, B.GOLD_ORE);
                  else if (y < 26 && r < 0.055) setLocal(lx, y, lz, B.LAPIS_ORE);
                  else if (y < 34 && r < 0.095) setLocal(lx, y, lz, B.IRON_ORE);
                  else if (r < 0.15) setLocal(lx, y, lz, B.COAL_ORE);
                  else setLocal(lx, y, lz, B.STONE);
                }
              }

              for (let y = h + 1; y <= 26; y++) setLocal(lx, y, lz, B.WATER);

              if (h >= 27 && biome !== "Пустыня") {
                const treeNoise = hash2(wx, wz, this.seed + 55);
                const treeChance = biome === "Дубовый лес" ? 0.032 : 0.011;
                if (lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13 && treeNoise < treeChance) {
                  const trunkH = 4 + Math.floor(hash2(wx, wz, 7) * 2);
                  for (let ty = 1; ty <= trunkH; ty++) setLocal(lx, h + ty, lz, B.OAK_LOG);
                  for (let dx = -2; dx <= 2; dx++) {
                    for (let dz = -2; dz <= 2; dz++) {
                      for (let dy = trunkH - 1; dy <= trunkH + 1; dy++) {
                        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH + 1) continue;
                        if (dx === 0 && dz === 0 && dy <= trunkH) continue;
                        setLocal(lx + dx, h + dy, lz + dz, B.OAK_LEAVES);
                      }
                    }
                  }
                } else if (treeNoise > 0.94) {
                  setLocal(lx, h + 1, lz, treeNoise > 0.97 ? B.POPPY : B.DANDELION);
                }
              }
            } else if (this.dimension === "nether") {
              setLocal(lx, 0, lz, B.BEDROCK);
              setLocal(lx, 46, lz, B.BEDROCK);
              const floorH = Math.floor(14 + fbm2D(wx, wz, this.seed + 3) * 14);
              for (let y = 1; y <= floorH; y++) {
                const r = hash2(wx * 11 + y, wz * 19, this.seed);
                if (y < floorH && r < 0.04) setLocal(lx, y, lz, B.QUARTZ_ORE);
                else setLocal(lx, y, lz, (y === floorH && floorH < 18) ? B.SOUL_SAND : B.NETHERRACK);
              }
              for (let y = floorH + 1; y <= 16; y++) setLocal(lx, y, lz, B.LAVA);
              for (let y = 38; y < 46; y++) setLocal(lx, y, lz, B.NETHERRACK);
              if (hash2(wx, wz, 404) < 0.025) setLocal(lx, 37, lz, B.GLOWSTONE);
            } else if (this.dimension === "end") {
              const dist = Math.hypot(wx, wz);
              const islandNoise = hash2(Math.floor(wx / 6), Math.floor(wz / 6), this.seed + 1907);
              const onMainIsland = dist < 34;
              const onOuterIsland = dist > 48 && dist < 155 && islandNoise > 0.28;
              if (onMainIsland || onOuterIsland) {
                const localDist = onMainIsland ? dist : Math.hypot((wx % 38) - 19, (wz % 38) - 19);
                const topY = 32 - Math.floor(Math.min(localDist, 32) * 0.12);
                const botY = 22 + Math.floor(Math.min(localDist, 32) * 0.25);
                for (let y = botY; y <= topY; y++) setLocal(lx, y, lz, B.END_STONE);
              }
            }
          }
        }

        const mods = this.modifications[this.dimension];
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const key = `${wx},${y},${wz}`;
              if (mods.has(key)) setLocal(lx, y, lz, mods.get(key));
            }
          }
        }
        return data;
      }

      getChunk(cx, cz) {
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key)) this.chunks.set(key, this.generateChunkData(cx, cz));
        return this.chunks.get(key);
      }

      getBlock(x, y, z) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (iy < 0 || iy >= WORLD_HEIGHT) return B.AIR;
        const cx = Math.floor(ix / CHUNK_SIZE);
        const cz = Math.floor(iz / CHUNK_SIZE);
        const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const chunk = this.getChunk(cx, cz);
        return chunk[lx + lz * CHUNK_SIZE + iy * CHUNK_SIZE * CHUNK_SIZE];
      }

      enqueueChunkRebuild(cx, cz, priority = false) {
        const key = this.chunkKey(cx, cz);
        if (this.meshQueueSet.has(key)) return;
        this.meshQueueSet.add(key);
        if (priority) this.meshQueue.unshift({ cx, cz, key });
        else this.meshQueue.push({ cx, cz, key });
      }

      setBlock(x, y, z, id, broadcast = false) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (iy < 0 || iy >= WORLD_HEIGHT) return;
        const cx = Math.floor(ix / CHUNK_SIZE);
        const cz = Math.floor(iz / CHUNK_SIZE);
        const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const chunk = this.getChunk(cx, cz);
        chunk[lx + lz * CHUNK_SIZE + iy * CHUNK_SIZE * CHUNK_SIZE] = id;
        this.modifications[this.dimension].set(`${ix},${iy},${iz}`, id);

        if (broadcast && MP.active && fbDb && MP.roomId) {
          push(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/blocks`), {
            dim: this.dimension, x: ix, y: iy, z: iz, id, by: MP.playerId
          });
        }

        // Immediate rebuild for direct player/local changes
        this.rebuildChunkMesh(cx, cz);
        if (lx === 0) this.rebuildChunkMesh(cx - 1, cz);
        if (lx === CHUNK_SIZE - 1) this.rebuildChunkMesh(cx + 1, cz);
        if (lz === 0) this.rebuildChunkMesh(cx, cz - 1);
        if (lz === CHUNK_SIZE - 1) this.rebuildChunkMesh(cx, cz + 1);
      }

      // Silent block write during structure generation (rebuilds once at the end)
      setBlockRaw(x, y, z, id) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (iy < 0 || iy >= WORLD_HEIGHT) return;
        const cx = Math.floor(ix / CHUNK_SIZE);
        const cz = Math.floor(iz / CHUNK_SIZE);
        const lx = ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const chunk = this.getChunk(cx, cz);
        chunk[lx + lz * CHUNK_SIZE + iy * CHUNK_SIZE * CHUNK_SIZE] = id;
        this.modifications[this.dimension].set(`${ix},${iy},${iz}`, id);
      }

      // Build a full Village with houses, farms, Fletcher & Blacksmith Villagers
      buildVillageAt(vx, vz) {
        const vy = Math.max(27, this.getSurfaceHeight(vx, vz));
        this.structures.villages.push({ x: vx, y: vy, z: vz });

        // House 1: Blacksmith / Fletcher Workshop
        for (let dx = -4; dx <= 4; dx++) {
          for (let dz = -4; dz <= 4; dz++) {
            this.setBlockRaw(vx + dx, vy, vz + dz, B.COBBLESTONE);
            for (let dy = 1; dy <= 4; dy++) this.setBlockRaw(vx + dx, vy + dy, vz + dz, B.AIR);
          }
        }
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            this.setBlockRaw(vx + dx, vy + 4, vz + dz, B.OAK_PLANKS);
            if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
              for (let dy = 1; dy <= 3; dy++) this.setBlockRaw(vx + dx, vy + dy, vz + dz, B.COBBLESTONE);
            }
          }
        }
        this.setBlockRaw(vx, vy + 1, vz - 3, B.AIR);
        this.setBlockRaw(vx, vy + 2, vz - 3, B.AIR);
        this.setBlockRaw(vx + 2, vy + 1, vz + 2, B.FURNACE);
        this.setBlockRaw(vx - 2, vy + 1, vz + 2, B.CRAFTING_TABLE);
        this.setBlockRaw(vx, vy + 1, vz + 2, B.CHEST);

        const vChest = new Array(27).fill(null);
        vChest[0] = { id: "emerald", count: 4 };
        vChest[1] = { id: "iron_ingot", count: 5 };
        vChest[2] = { id: "bread", count: 6 };
        vChest[3] = { id: "stick", count: 16 };
        this.chests.set(`overworld:${vx},${vy + 1},${vz + 2}`, vChest);

        // House 2: Oak Cottage
        const hx = vx - 10, hz = vz + 2;
        const hy = Math.max(27, this.getSurfaceHeight(hx, hz));
        for (let dx = -3; dx <= 3; dx++) {
          for (let dz = -3; dz <= 3; dz++) {
            this.setBlockRaw(hx + dx, hy, hz + dz, B.COBBLESTONE);
            for (let dy = 1; dy <= 4; dy++) this.setBlockRaw(hx + dx, hy + dy, hz + dz, B.AIR);
            this.setBlockRaw(hx + dx, hy + 4, hz + dz, B.OAK_LOG);
            if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
              for (let dy = 1; dy <= 3; dy++) this.setBlockRaw(hx + dx, hy + dy, hz + dz, B.OAK_PLANKS);
            }
          }
        }
        this.setBlockRaw(hx, hy + 1, hz - 3, B.AIR);
        this.setBlockRaw(hx, hy + 2, hz - 3, B.AIR);
        this.setBlockRaw(hx + 1, hy + 1, hz + 1, B.BED_FOOT);
        this.setBlockRaw(hx + 1, hy + 1, hz + 2, B.BED_HEAD);

        // Wheat Farm
        for (let fx = 0; fx < 5; fx++) {
          for (let fz = 0; fz < 4; fz++) {
            this.setBlockRaw(vx + 6 + fx, vy, vz + fz, fx === 2 ? B.WATER : B.FARMLAND);
            if (fx !== 2) this.setBlockRaw(vx + 6 + fx, vy + 1, vz + fz, B.WHEAT_7);
          }
        }
      }

      // Build Desert Pyramid with Underground Treasure Chamber & 4 Chests
      buildPyramidAt(px, pz) {
        const py = Math.max(27, this.getSurfaceHeight(px, pz));
        this.structures.pyramids.push({ x: px, y: py, z: pz });

        for (let level = 0; level <= 7; level++) {
          const r = 7 - level;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              const isShell = Math.abs(dx) === r || Math.abs(dz) === r || level === 7;
              this.setBlockRaw(px + dx, py + level, pz + dz, isShell ? B.SANDSTONE : B.AIR);
            }
          }
        }
        // Entrance
        this.setBlockRaw(px, py + 1, pz - 7, B.AIR);
        this.setBlockRaw(px, py + 2, pz - 7, B.AIR);
        this.setBlockRaw(px, py + 1, pz - 6, B.AIR);
        this.setBlockRaw(px, py + 2, pz - 6, B.AIR);

        // Secret Treasure Pit below center
        for (let y = py - 6; y < py; y++) {
          for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
              const wall = Math.abs(dx) === 2 || Math.abs(dz) === 2 || y === py - 6;
              this.setBlockRaw(px + dx, y, pz + dz, wall ? B.SANDSTONE : B.AIR);
            }
          }
        }
        const chestOffsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        chestOffsets.forEach(([ox, oz], idx) => {
          this.setBlockRaw(px + ox, py - 5, pz + oz, B.CHEST);
          const loot = new Array(27).fill(null);
          loot[0] = { id: "diamond", count: 1 + (idx % 2) };
          loot[1] = { id: "emerald", count: 2 + idx };
          loot[2] = { id: "gold_ingot", count: 4 };
          loot[3] = { id: "ender_pearl", count: 1 };
          if (idx === 0) loot[4] = { id: "golden_apple", count: 1 };
          this.chests.set(`overworld:${px + ox},${py - 5},${pz + oz}`, loot);
        });
      }

      // Build Ruined Nether Portal
      buildRuinedPortalAt(rx, rz) {
        const ry = Math.max(27, this.getSurfaceHeight(rx, rz));
        this.structures.ruinedPortals.push({ x: rx, y: ry, z: rz });
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            this.setBlockRaw(rx + dx, ry, rz + dz, (dx + dz) % 2 === 0 ? B.NETHERRACK : B.STONE_BRICKS);
          }
        }
        for (let dy = 1; dy <= 4; dy++) {
          this.setBlockRaw(rx - 1, ry + dy, rz, dy === 3 ? B.CRYING_OBSIDIAN : B.OBSIDIAN);
          if (dy <= 3) this.setBlockRaw(rx + 2, ry + dy, rz, B.OBSIDIAN);
        }
        this.setBlockRaw(rx, ry + 5, rz, B.GOLD_BLOCK);
        this.setBlockRaw(rx - 2, ry + 1, rz + 1, B.CHEST);
        const loot = new Array(27).fill(null);
        loot[0] = { id: B.OBSIDIAN, count: 4 };
        loot[1] = { id: "flint_and_steel", count: 1 };
        loot[2] = { id: "gold_ingot", count: 3 };
        this.chests.set(`overworld:${rx - 2},${ry + 1},${rz + 1}`, loot);
      }

      // Build Multi-Room Underground Stronghold with End Portal Room!
      buildStronghold() {
        const { x: sx, y: sy, z: sz } = this.structures.stronghold;

        // 1. Portal Room (11x6x11)
        for (let dx = -5; dx <= 5; dx++) {
          for (let dz = -5; dz <= 5; dz++) {
            for (let dy = -1; dy <= 5; dy++) {
              const isShell = Math.abs(dx) === 5 || Math.abs(dz) === 5 || dy === -1 || dy === 5;
              this.setBlockRaw(sx + dx, sy + dy, sz + dz, isShell ? B.STONE_BRICKS : B.AIR);
            }
          }
        }
        this.setBlockRaw(sx + 4, sy + 1, sz + 4, B.TORCH);
        this.setBlockRaw(sx - 4, sy + 1, sz - 4, B.TORCH);
        this.setBlockRaw(sx + 4, sy + 1, sz - 4, B.TORCH);
        this.setBlockRaw(sx - 4, sy + 1, sz + 4, B.TORCH);

        // Lava pool beneath End Portal
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) this.setBlockRaw(sx + dx, sy, sz + dz, B.LAVA);
        }

        // 12-Block End Portal Frame Ring (2 pre-filled with Eyes, 10 empty)
        let frameIdx = 0;
        for (let i = -1; i <= 1; i++) {
          this.setBlockRaw(sx + i, sy + 1, sz - 2, frameIdx++ < 2 ? B.END_PORTAL_FRAME_EYE : B.END_PORTAL_FRAME);
          this.setBlockRaw(sx + i, sy + 1, sz + 2, B.END_PORTAL_FRAME);
          this.setBlockRaw(sx - 2, sy + 1, sz + i, B.END_PORTAL_FRAME);
          this.setBlockRaw(sx + 2, sy + 1, sz + i, B.END_PORTAL_FRAME);
        }

        // 2. Corridor + Library Room (to the North: sz - 12)
        for (let dz = -9; dz <= -5; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = 0; dy <= 3; dy++) {
              const wall = Math.abs(dx) === 1 || dy === 0 || dy === 3;
              this.setBlockRaw(sx + dx, sy + dy, sz + dz, wall ? B.STONE_BRICKS : B.AIR);
            }
          }
        }
        const lz = sz - 14;
        for (let dx = -4; dx <= 4; dx++) {
          for (let dz = -4; dz <= 4; dz++) {
            for (let dy = 0; dy <= 4; dy++) {
              const wall = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === 0 || dy === 4;
              this.setBlockRaw(sx + dx, sy + dy, lz + dz, wall ? B.STONE_BRICKS : B.AIR);
            }
          }
        }
        this.setBlockRaw(sx, sy + 1, lz + 4, B.AIR);
        this.setBlockRaw(sx, sy + 2, lz + 4, B.AIR);
        for (let dx = -3; dx <= 3; dx += 2) {
          this.setBlockRaw(sx + dx, sy + 1, lz - 3, B.BOOKSHELF);
          this.setBlockRaw(sx + dx, sy + 2, lz - 3, B.BOOKSHELF);
        }
        this.setBlockRaw(sx, sy + 1, lz - 2, B.CHEST);
        const libLoot = new Array(27).fill(null);
        libLoot[0] = { id: "ender_eye", count: 3 };
        libLoot[1] = { id: "diamond", count: 3 };
        libLoot[2] = { id: "emerald", count: 5 };
        this.chests.set(`overworld:${sx},${sy + 1},${lz - 2}`, libLoot);

        // 3. Surface Stone Brick Tower Beacon above Stronghold so players can also spot it
        const surfY = this.getSurfaceHeight(sx, sz);
        for (let y = sy + 5; y <= surfY + 3; y++) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              const isLadderShaft = dx === 0 && dz === 0;
              this.setBlockRaw(sx + dx, y, sz + dz, isLadderShaft ? B.AIR : B.STONE_BRICKS);
            }
          }
        }
      }

      // Check and activate 3x3 End Portal ring anywhere in the world!
      checkAndActivateEndPortalAround(bx, by, bz) {
        // Test all possible 3x3 centers within 2 blocks of (bx, bz)
        for (let cx = bx - 2; cx <= bx + 2; cx++) {
          for (let cz = bz - 2; cz <= bz + 2; cz++) {
            let all12Filled = true;
            for (let i = -1; i <= 1; i++) {
              if (this.getBlock(cx + i, by, cz - 2) !== B.END_PORTAL_FRAME_EYE) all12Filled = false;
              if (this.getBlock(cx + i, by, cz + 2) !== B.END_PORTAL_FRAME_EYE) all12Filled = false;
              if (this.getBlock(cx - 2, by, cz + i) !== B.END_PORTAL_FRAME_EYE) all12Filled = false;
              if (this.getBlock(cx + 2, by, cz + i) !== B.END_PORTAL_FRAME_EYE) all12Filled = false;
            }
            if (all12Filled) {
              for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                  this.setBlock(cx + dx, by, cz + dz, B.END_PORTAL, true);
                }
              }
              SFX.levelUp();
              showBanner("ПОРТАЛ В КРАЙ ОТКРЫТ! Прыгайте в портал!");
              return true;
            }
          }
        }
        return false;
      }

      buildStructures() {
        // Structures are generated as the player explores distant regions.
        this.buildStronghold();
      }

      buildEndCityAt(cx, cz) {
        const baseY = 31;
        for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
          this.setBlockRaw(cx + dx, baseY, cz + dz, B.END_STONE);
        }
        for (let y = baseY + 1; y <= baseY + 17; y++) {
          for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
            if (edge || y === baseY + 17) this.setBlockRaw(cx + dx, y, cz + dz, B.OBSIDIAN);
          }
        }
        for (let y = baseY + 4; y <= baseY + 12; y += 4) {
          for (let dx = -4; dx <= 4; dx++) this.setBlockRaw(cx + dx, y, cz + 3, B.END_STONE);
          for (let dz = -4; dz <= 4; dz++) this.setBlockRaw(cx + 3, y, cz + dz, B.END_STONE);
        }
        this.setBlockRaw(cx, baseY + 18, cz, B.CHEST);
        const loot = new Array(27).fill(null);
        loot[0] = { id: "diamond", count: 4 };
        loot[1] = { id: "netherite_scrap", count: 2 };
        loot[2] = { id: "elytra", count: 1 };
        this.chests.set(`end:${cx},${baseY + 18},${cz}`, loot);
      }

      ensureStructuresInRegion(wx, wz) {
        if (this.dimension === "end") {
          const rx = Math.floor(wx / 96), rz = Math.floor(wz / 96);
          const key = "end:" + rx + "," + rz;
          if (this.generatedRegions.has(key)) return;
          this.generatedRegions.add(key);
          const h = hash2(rx, rz, this.seed + 4501);
          if ((rx !== 0 || rz !== 0) && h > 0.52) {
            this.buildEndCityAt(rx * 96 + 54, rz * 96 + 54);
          }
          return;
        }
        if (this.dimension !== "overworld") return;
        const rx = Math.floor(wx / 320);
        const rz = Math.floor(wz / 320);
        const rKey = `${rx},${rz}`;
        if (this.generatedRegions.has(rKey)) return;
        this.generatedRegions.add(rKey);
        if (rx === 0 && rz === 0) return;

        const h = hash2(rx, rz, this.seed + 707);
        const cx = rx * 320 + 150;
        const cz = rz * 320 + 150;
        if (h < 0.45) {
          this.buildVillageAt(cx, cz);
          const vy = Math.max(27, this.getSurfaceHeight(cx, cz));
          spawnMob("villager_fletcher", cx + 1, vy + 1, cz - 1);
          spawnMob("villager_blacksmith", cx - 1, vy + 1, cz + 1);
        } else if (h < 0.78) {
          this.buildPyramidAt(cx, cz);
        } else {
          this.buildRuinedPortalAt(cx, cz);
        }
      }

      spawnBonusChestNear(px, pz) {
        const cx = Math.floor(px) + 2;
        const cz = Math.floor(pz);
        const cy = this.getSurfaceHeight(cx, cz) + 1;
        this.setBlock(cx, cy - 1, cz, B.GRASS);
        this.setBlock(cx, cy, cz, B.CHEST);
        for (const [tx, tz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
          const ty = this.getSurfaceHeight(tx, tz) + 1;
          if (this.getBlock(tx, ty, tz) === B.AIR) this.setBlock(tx, ty, tz, B.TORCH);
        }
        const loot = new Array(27).fill(null);
        loot[0] = { id: "wood_pickaxe", count: 1 };
        loot[1] = { id: "wood_axe", count: 1 };
        loot[2] = { id: B.OAK_PLANKS, count: 16 };
        loot[3] = { id: "stick", count: 16 };
        loot[4] = { id: "apple", count: 4 };
        loot[5] = { id: "bread", count: 4 };
        this.chests.set(`${this.dimension}:${cx},${cy},${cz}`, loot);
      }

      rebuildChunkMesh(cx, cz) {
        const key = this.chunkKey(cx, cz);
        if (this.meshes.has(key)) {
          const oldGroup = this.meshes.get(key);
          scene.remove(oldGroup);
          oldGroup.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
          this.meshes.delete(key);
        }

        const group = new THREE.Group();
        const buckets = new Map();
        const crossBuckets = new Map();
        const dirToFaceIdx = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

        const pushFace = (bId, x, y, z, dir, hTop = 1.0) => {
          const fIdx = dirToFaceIdx[dir];
          const bKey = `${bId}_${fIdx}`;
          if (!buckets.has(bKey)) buckets.set(bKey, { bId, fIdx, pos: [], norm: [], uv: [], idx: [] });
          const b = buckets.get(bKey);
          const v0 = b.pos.length / 3;
          const faces = {
            px: [[1,0,1],[1,0,0],[1,hTop,0],[1,hTop,1], [1,0,0]],
            nx: [[0,0,0],[0,0,1],[0,hTop,1],[0,hTop,0], [-1,0,0]],
            py: [[0,hTop,1],[1,hTop,1],[1,hTop,0],[0,hTop,0], [0,1,0]],
            ny: [[0,0,0],[1,0,0],[1,0,1],[0,0,1], [0,-1,0]],
            pz: [[0,0,1],[1,0,1],[1,hTop,1],[0,hTop,1], [0,0,1]],
            nz: [[1,0,0],[0,0,0],[0,hTop,0],[1,hTop,0], [0,0,-1]]
          };
          const f = faces[dir];
          for (let i = 0; i < 4; i++) {
            b.pos.push(x + f[i][0], y + f[i][1], z + f[i][2]);
            b.norm.push(f[4][0], f[4][1], f[4][2]);
          }
          b.uv.push(0,0, 1,0, 1,1, 0,1);
          b.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        };

        const pushCross = (bId, x, y, z) => {
          if (!crossBuckets.has(bId)) crossBuckets.set(bId, { bId, fIdx: 0, pos: [], norm: [], uv: [], idx: [] });
          const b = crossBuckets.get(bId);
          const planes = [
            [[x+0.15,y,z+0.15],[x+0.85,y,z+0.85],[x+0.85,y+0.85,z+0.85],[x+0.15,y+0.85,z+0.15]],
            [[x+0.85,y,z+0.15],[x+0.15,y,z+0.85],[x+0.15,y+0.85,z+0.85],[x+0.85,y+0.85,z+0.15]]
          ];
          for (const p of planes) {
            const v0 = b.pos.length / 3;
            for (const pt of p) {
              b.pos.push(pt[0], pt[1], pt[2]);
              b.norm.push(0, 1, 0);
            }
            b.uv.push(0,0, 1,0, 1,1, 0,1);
            b.idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
          }
        };

        const isOpaque = (id) => id !== B.AIR && !BLOCK_PROPS[id]?.transparent && id !== B.BED_FOOT && id !== B.BED_HEAD;

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = cx * CHUNK_SIZE + lx;
            const wz = cz * CHUNK_SIZE + lz;
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const id = this.getBlock(wx, y, wz);
              if (id === B.AIR) continue;
              const props = BLOCK_PROPS[id];
              if (props?.cross || id === B.TORCH) {
                pushCross(id, wx, y, wz);
                continue;
              }
              const hTop = (id === B.BED_FOOT || id === B.BED_HEAD) ? 0.56 : 1.0;
              const checkNeighbor = (nx, ny, nz) => {
                const nb = this.getBlock(nx, ny, nz);
                if (nb === id && id === B.WATER) return false;
                return !isOpaque(nb);
              };
              if (checkNeighbor(wx + 1, y, wz)) pushFace(id, wx, y, wz, "px", hTop);
              if (checkNeighbor(wx - 1, y, wz)) pushFace(id, wx, y, wz, "nx", hTop);
              if (hTop < 1.0 || checkNeighbor(wx, y + 1, wz)) pushFace(id, wx, y, wz, "py", hTop);
              if (checkNeighbor(wx, y - 1, wz)) pushFace(id, wx, y, wz, "ny", hTop);
              if (checkNeighbor(wx, y, wz + 1)) pushFace(id, wx, y, wz, "pz", hTop);
              if (checkNeighbor(wx, y, wz - 1)) pushFace(id, wx, y, wz, "nz", hTop);
            }
          }
        }

        const buildMeshFromBucket = (data) => {
          if (data.pos.length === 0) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(data.pos, 3));
          geo.setAttribute("normal", new THREE.Float32BufferAttribute(data.norm, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(data.uv, 2));
          geo.setIndex(data.idx);
          const m = ATLAS.materials[data.bId];
          const useMat = Array.isArray(m) ? m[data.fIdx] : m;
          const mesh = new THREE.Mesh(geo, useMat);
          mesh.receiveShadow = true;
          mesh.castShadow = !BLOCK_PROPS[data.bId]?.transparent;
          group.add(mesh);
        };

        for (const data of buckets.values()) buildMeshFromBucket(data);
        for (const data of crossBuckets.values()) buildMeshFromBucket(data);

        scene.add(group);
        this.meshes.set(key, group);
      }

      clearAllMeshes() {
        for (const g of this.meshes.values()) scene.remove(g);
        this.meshes.clear();
        this.meshQueue.length = 0;
        this.meshQueueSet.clear();
      }
    }

    // =========================================================================
    // 7. DETAILED MULTI-PART 3D CHARACTER RIGS & MOBS (VILLAGERS, WITHER SKELETONS, BLAZES)
    // =========================================================================
    const SKIN_PRESETS = {
      steve: { name: "Классический Стив", skin: 0xb58665, hair: 0x3b2818, shirt: 0x268c8c, pants: 0x38388c },
      alex: { name: "Алекс", skin: 0xc99c7a, hair: 0x9c5a2b, shirt: 0x527a32, pants: 0x473829 },
      herobrine: { name: "Херобрин", skin: 0xb58665, hair: 0x3b2818, shirt: 0x268c8c, pants: 0x38388c, whiteEyes: true },
      knight: { name: "Рыцарь", skin: 0x969696, hair: 0x545454, shirt: 0x7a7a7a, pants: 0x595959 }
    };

    function makeNameSprite(text) {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 48;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "rgba(18,18,18,0.62)";
      ctx.fillRect(14, 6, 228, 34);
      ctx.font = "25px VT323, monospace";
      ctx.fillStyle = "#e0e0e0";
      ctx.textAlign = "center";
      ctx.fillText(text, 128, 30);
      const tex = new THREE.CanvasTexture(c);
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(2.1, 0.38, 1);
      sp.position.y = 2.18;
      return sp;
    }

    function createHumanoidRig(skinKey = "steve", nametag = null) {
      const cfg = SKIN_PRESETS[skinKey] || SKIN_PRESETS.steve;
      const root = new THREE.Group();

      const headPivot = new THREE.Group();
      headPivot.position.y = 1.42;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), new THREE.MeshLambertMaterial({ color: cfg.skin }));
      head.position.y = 0.24;
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: cfg.hair }));
      hair.position.y = 0.44;
      const eyeMat = new THREE.MeshBasicMaterial({ color: cfg.whiteEyes ? 0xe6e6e6 : 0x2b2459 });
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeMat);
      eyeL.position.set(-0.11, 0.25, 0.245);
      const eyeR = eyeL.clone(); eyeR.position.x = 0.11;
      headPivot.add(head, hair, eyeL, eyeR);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.72, 0.24), new THREE.MeshLambertMaterial({ color: cfg.shirt }));
      torso.position.y = 1.06;

      const legL = new THREE.Group(); legL.position.set(-0.12, 0.7, 0);
      const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), new THREE.MeshLambertMaterial({ color: cfg.pants }));
      legLMesh.position.y = -0.35; legL.add(legLMesh);

      const legR = new THREE.Group(); legR.position.set(0.12, 0.7, 0);
      const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.22), new THREE.MeshLambertMaterial({ color: cfg.pants }));
      legRMesh.position.y = -0.35; legR.add(legRMesh);

      const armL = new THREE.Group(); armL.position.set(-0.35, 1.38, 0);
      const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), new THREE.MeshLambertMaterial({ color: cfg.skin }));
      armLMesh.position.y = -0.32; armL.add(armLMesh);

      const offShield = create3DShieldMesh();
      offShield.position.set(-0.12, -0.46, 0.1);
      offShield.visible = false;
      armL.add(offShield);

      const armR = new THREE.Group(); armR.position.set(0.35, 1.38, 0);
      const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), new THREE.MeshLambertMaterial({ color: cfg.skin }));
      armRMesh.position.y = -0.32; armR.add(armRMesh);

      root.add(headPivot, torso, legL, legR, armL, armR);
      if (nametag) root.add(makeNameSprite(nametag));
      scene.add(root);

      return { root, headPivot, torso, legL, legR, armL, armR, offShield, phase: 0 };
    }

    function animateHumanoidRig(rig, dt, state) {
      if (!rig) return;
      const speed = state.moving ? (state.sprinting ? 13 : 8) : 0;
      if (speed > 0) rig.phase += dt * speed;
      else rig.phase = 0;

      const swing = Math.sin(rig.phase) * (state.sprinting ? 0.85 : 0.55);
      rig.legL.rotation.x = swing;
      rig.legR.rotation.x = -swing;

      if (rig.offShield) rig.offShield.visible = !!state.hasOffShield;
      if (state.blocking) {
        rig.armL.rotation.x = -0.9;
        rig.armL.rotation.z = -0.3;
      } else {
        rig.armL.rotation.x = -swing;
        rig.armL.rotation.z = 0;
      }

      if (state.swinging) {
        rig.armR.rotation.x = -1.6 + Math.sin(performance.now() * 0.025) * 0.7;
      } else if (state.aimingBow) {
        rig.armR.rotation.x = -1.45;
        rig.armL.rotation.x = -1.35;
      } else {
        rig.armR.rotation.x = swing;
      }

      if (state.sneaking) {
        rig.torso.rotation.x = 0.35;
        rig.headPivot.position.y = 1.32;
      } else {
        rig.torso.rotation.x = 0;
        rig.headPivot.position.y = 1.42;
      }
      rig.headPivot.rotation.x = -(state.pitch || 0);
    }

    function buildDetailedMobModel(type) {
      const g = new THREE.Group();
      const parts = { legs: [], wings: [], rods: [], head: null, body: null };

      const makeQuadruped = (bodyCol, bodySize, headCol, headSize, legH, extraFn) => {
        const body = new THREE.Mesh(new THREE.BoxGeometry(...bodySize), new THREE.MeshLambertMaterial({ color: bodyCol }));
        body.position.y = legH + bodySize[1] / 2;
        g.add(body);
        parts.body = body;

        const head = new THREE.Group();
        head.position.set(0, legH + bodySize[1] * 0.7, bodySize[2] / 2 + headSize[2] * 0.35);
        const hMesh = new THREE.Mesh(new THREE.BoxGeometry(...headSize), new THREE.MeshLambertMaterial({ color: headCol }));
        head.add(hMesh);
        g.add(head);
        parts.head = head;

        const lx = bodySize[0] * 0.3, lz = bodySize[2] * 0.35;
        for (const [sx, sz] of [[-lx, lz], [lx, lz], [-lx, -lz], [lx, -lz]]) {
          const legPivot = new THREE.Group();
          legPivot.position.set(sx, legH, sz);
          const legM = new THREE.Mesh(new THREE.BoxGeometry(0.18, legH, 0.18), new THREE.MeshLambertMaterial({ color: headCol }));
          legM.position.y = -legH / 2;
          legPivot.add(legM);
          g.add(legPivot);
          parts.legs.push(legPivot);
        }
        if (extraFn) extraFn(head, body);
      };

      if (type.startsWith("villager_")) {
        const profKey = type.replace("villager_", "");
        const prof = VILLAGER_PROFESSIONS[profKey] || VILLAGER_PROFESSIONS.fletcher;
        const robe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 0.32), new THREE.MeshLambertMaterial({ color: 0x593d28 }));
        robe.position.y = 0.72;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.46), new THREE.MeshLambertMaterial({ color: 0xb58665 }));
        head.position.y = 1.56;
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.14), new THREE.MeshLambertMaterial({ color: 0x9c6e4e }));
        nose.position.set(0, -0.08, 0.27);
        const hat = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), new THREE.MeshLambertMaterial({ color: prof.hatColor }));
        hat.position.set(0, 0.26, 0);
        head.add(nose, hat);
        const foldedArms = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.22, 0.24), new THREE.MeshLambertMaterial({ color: 0x472f1e }));
        foldedArms.position.set(0, 1.05, 0.16);
        g.add(robe, head, foldedArms, makeNameSprite(prof.title));
        parts.head = head;
      } else if (type === "cow") {
        makeQuadruped(0x543924, [0.75, 0.68, 1.15], 0x4a311e, [0.46, 0.46, 0.44], 0.55, (head, body) => {
          const patch = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.35, 0.45), new THREE.MeshLambertMaterial({ color: 0xcfcfcf }));
          body.add(patch);
          const snout = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.1), new THREE.MeshLambertMaterial({ color: 0xb89c8a }));
          snout.position.set(0, -0.1, 0.24);
          const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), new THREE.MeshLambertMaterial({ color: 0xd4d0c5 }));
          hornL.position.set(-0.24, 0.24, 0);
          const hornR = hornL.clone(); hornR.position.x = 0.24;
          head.add(snout, hornL, hornR);
        });
      } else if (type === "pig") {
        makeQuadruped(0xd48a94, [0.68, 0.56, 1.0], 0xdb959f, [0.46, 0.44, 0.44], 0.42, (head) => {
          const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.12), new THREE.MeshLambertMaterial({ color: 0xc2727d }));
          snout.position.set(0, -0.06, 0.25);
          head.add(snout);
        });
      } else if (type === "sheep") {
        makeQuadruped(0xd6d6d6, [0.78, 0.68, 1.1], 0xbfa38e, [0.42, 0.42, 0.44], 0.5, (head) => {
          const woolCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), new THREE.MeshLambertMaterial({ color: 0xd6d6d6 }));
          woolCap.position.y = 0.2;
          head.add(woolCap);
        });
      } else if (type === "chicken") {
        makeQuadruped(0xdedede, [0.42, 0.38, 0.52], 0xdedede, [0.26, 0.32, 0.26], 0.28, (head, body) => {
          const beak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), new THREE.MeshLambertMaterial({ color: 0xd49b28 }));
          beak.position.set(0, 0, 0.18);
          const wattle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), new THREE.MeshLambertMaterial({ color: 0xb52b2b }));
          wattle.position.set(0, -0.09, 0.15);
          const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.38), new THREE.MeshLambertMaterial({ color: 0xc7c7c7 }));
          wingL.position.set(-0.24, 0, 0);
          const wingR = wingL.clone(); wingR.position.x = 0.24;
          head.add(beak, wattle);
          body.add(wingL, wingR);
          parts.wings.push(wingL, wingR);
        });
      } else if (type === "zombie" || type === "skeleton" || type === "wither_skeleton" || type === "enderman") {
        const isEnd = type === "enderman";
        const isWither = type === "wither_skeleton";
        const isSkel = type === "skeleton" || isWither;
        const bodyCol = isEnd ? 0x181818 : isWither ? 0x262626 : isSkel ? 0xc7c7c7 : 0x397878;
        const headCol = isEnd ? 0x181818 : isWither ? 0x2b2b2b : isSkel ? 0xd4d4d4 : 0x4b783c;
        const legH = isEnd ? 1.35 : isWither ? 0.92 : 0.72;
        const torsoH = isWither ? 0.85 : 0.72;
        const limbW = (isEnd || isSkel) ? 0.11 : 0.2;

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, torsoH, 0.24), new THREE.MeshLambertMaterial({ color: bodyCol }));
        torso.position.y = legH + torsoH / 2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshLambertMaterial({ color: headCol }));
        head.position.y = legH + torsoH + 0.23;
        if (isEnd) {
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb852d9 });
          const eL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), eyeMat); eL.position.set(-0.12, 0, 0.235);
          const eR = eL.clone(); eR.position.x = 0.12;
          head.add(eL, eR);
        }
        g.add(torso, head);
        parts.head = head;

        for (const sx of [-0.13, 0.13]) {
          const lp = new THREE.Group(); lp.position.set(sx, legH, 0);
          const lm = new THREE.Mesh(new THREE.BoxGeometry(limbW, legH, limbW), new THREE.MeshLambertMaterial({ color: isEnd ? 0x181818 : isWither ? 0x262626 : isSkel ? 0xc7c7c7 : 0x383878 }));
          lm.position.y = -legH / 2; lp.add(lm); g.add(lp); parts.legs.push(lp);
        }
        for (const sx of [-0.34, 0.34]) {
          const ap = new THREE.Group(); ap.position.set(sx, legH + torsoH - 0.04, 0);
          const armLen = isEnd ? 1.3 : isWither ? 0.82 : 0.68;
          const am = new THREE.Mesh(new THREE.BoxGeometry(limbW, armLen, limbW), new THREE.MeshLambertMaterial({ color: headCol }));
          am.position.y = -armLen / 2;
          ap.add(am);
          if (type === "zombie") ap.rotation.x = -1.35;
          if (isWither && sx > 0) {
            const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.12), new THREE.MeshLambertMaterial({ color: 0x6e6e6e }));
            sword.position.set(0, -armLen, 0.28);
            sword.rotation.x = Math.PI / 2;
            ap.add(sword);
            ap.rotation.x = -0.9;
          }
          g.add(ap);
        }
      } else if (type === "creeper") {
        const col = 0x488c38;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.85, 0.26), new THREE.MeshLambertMaterial({ color: col }));
        body.position.y = 0.42 + 0.425;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.48, 0.48), new THREE.MeshLambertMaterial({ color: col }));
        head.position.y = 0.42 + 0.85 + 0.24;
        const faceMat = new THREE.MeshBasicMaterial({ color: 0x182614 });
        const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), faceMat); f1.position.set(-0.11, 0.06, 0.245);
        const f2 = f1.clone(); f2.position.x = 0.11;
        const f3 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.02), faceMat); f3.position.set(0, -0.09, 0.245);
        head.add(f1, f2, f3);
        g.add(body, head);
        parts.head = head;
        for (const [sx, sz] of [[-0.14, 0.18], [0.14, 0.18], [-0.14, -0.18], [0.14, -0.18]]) {
          const lp = new THREE.Group(); lp.position.set(sx, 0.42, sz);
          const lm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.2), new THREE.MeshLambertMaterial({ color: col }));
          lm.position.y = -0.21; lp.add(lm); g.add(lp); parts.legs.push(lp);
        }
      } else if (type === "blaze") {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshLambertMaterial({ color: 0xd99b26 }));
        head.position.y = 1.2;
        g.add(head);
        for (let i = 0; i < 6; i++) {
          const rod = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), new THREE.MeshBasicMaterial({ color: 0xe3b838 }));
          const ang = (i / 6) * Math.PI * 2;
          rod.position.set(Math.cos(ang) * 0.55, 0.85 + (i % 2) * 0.25, Math.sin(ang) * 0.55);
          g.add(rod);
          parts.rods.push({ mesh: rod, ang });
        }
      } else if (type === "crystal") {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.65), new THREE.MeshBasicMaterial({ color: 0xc952c9 }));
        core.position.y = 0.8;
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.1, 1.1, 1.1)), new THREE.LineBasicMaterial({ color: 0xe0e0e0 }));
        frame.position.y = 0.8;
        g.add(core, frame);
      } else if (type === "dragon") {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 3.6), new THREE.MeshLambertMaterial({ color: 0x1b1724 }));
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.3), new THREE.MeshLambertMaterial({ color: 0x221d2e }));
        head.position.set(0, 0.3, 2.3);
        const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xc952c9 }));
        eyeL.position.set(-0.3, 0.1, 0.66);
        const eyeR = eyeL.clone(); eyeR.position.x = 0.3;
        head.add(eyeL, eyeR);

        const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.8), new THREE.MeshLambertMaterial({ color: 0x2b2438 }));
        wingL.position.set(-2.3, 0.3, 0.2);
        const wingR = wingL.clone(); wingR.position.x = 2.3;
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 2.6), new THREE.MeshLambertMaterial({ color: 0x1b1724 }));
        tail.position.set(0, 0.1, -2.9);

        g.add(body, head, wingL, wingR, tail);
        parts.wings.push(wingL, wingR);
      }

      return { group: g, parts };
    }

    // =========================================================================
    // 8. GAME STATE, RULES, OFF-HAND & SHIELD/BOW COMBAT STATE
    // =========================================================================
    const WORLD_CONFIG = {
      name: "Новый мир",
      seedInput: "",
      gamemode: "survival",
      difficulty: "normal",
      bonusChest: false,
      keepInventory: false,
      allowCheats: true,
      doDaylightCycle: true
    };

    const GAME = {
      state: "menu",
      gamemode: "survival",
      difficulty: "normal",
      keepInventory: false,
      allowCheats: true,
      doDaylightCycle: true,
      weather: "clear",
      renderDist: 4,
      fov: 75,
      mouseSens: 1.0,
      world: null,
      timeOfDay: 1800,
      dayCount: 1,
      portalTimer: 0,
      swingTimer: 0,
      equipAnim: 0,
      cameraMode: 0,
      skin: "steve"
    };

    const PLAYER = {
      pos: new THREE.Vector3(8.5, 36, 8.5),
      vel: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      onGround: false,
      inWater: false,
      inLava: false,
      flying: false,
      sprinting: false,
      sneaking: false,
      blockingShield: false,
      bowPullTime: 0,
      isPullingBow: false,
      health: 20,
      maxHealth: 20,
      hunger: 20,
      hungerTick: 0,
      regenTick: 0,
      air: 300,
      fireTicks: 0,
      xp: 0,
      level: 0,
      fallStartY: null,
      spawnPos: { dim: "overworld", x: 8.5, y: 36, z: 8.5 },
      hotbarIdx: 0,
      inv: new Array(36).fill(null),
      offhand: null,      inv: new Array(36).fill(null),
      armor: { head: null, chest: null, legs: null, feet: null },
      offhand: null,
      effects: { speed: 0, jump: 0, strength: 0, night_vision: 0 },
      bobTimer: 0,
      stepDist: 0,
      invulnTimer: 0,
      rig: null
    };

    const rainDrops = [];
    const rainGeo = new THREE.BoxGeometry(0.03, 0.45, 0.03);
    const rainMat = new THREE.MeshBasicMaterial({ color: 0x628ec9, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 120; i++) {
      const m = new THREE.Mesh(rainGeo, rainMat);
      m.visible = false;
      scene.add(m);
      rainDrops.push(m);
    }

    // =========================================================================
    // 9. MOBS, THROWN EYES OF ENDER, ARROWS, DROPS & BOSS
    // =========================================================================
    const entities = [];

    function clearAllEntities() {
      for (const e of entities) scene.remove(e.mesh);
      entities.length = 0;
      document.getElementById("boss-bar-wrap").classList.add("hidden");
    }

    function spawnDrop(x, y, z, id, count = 1) {
      if (!id || count <= 0) return;
      const isBlock = typeof id === "number" && ATLAS.materials[id];
      const mat = isBlock
        ? (Array.isArray(ATLAS.materials[id]) ? ATLAS.materials[id][0] : ATLAS.materials[id])
        : new THREE.MeshBasicMaterial({ map: ATLAS.itemTextures[id], transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(
        isBlock ? new THREE.BoxGeometry(0.28, 0.28, 0.28) : new THREE.PlaneGeometry(0.36, 0.36),
        mat
      );
      mesh.position.set(x, y, z);
      scene.add(mesh);
      entities.push({
        type: "drop",
        id,
        count,
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.8, (Math.random() - 0.5) * 2),
        age: 0
      });
    }

    // Physical Flying Eye of Ender entity leading toward Stronghold
    function launchEyeOfEnder() {
      const origin = getEyePos();
      const sh = GAME.world.structures.stronghold;
      const toSh = new THREE.Vector3(sh.x - origin.x, 0, sh.z - origin.z);
      const dist = toSh.length();
      if (dist > 0.1) toSh.normalize();
      else toSh.set(0, 0, -1);

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.45, 0.45),
        new THREE.MeshBasicMaterial({ map: ATLAS.itemTextures.ender_eye, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
      );
      mesh.position.copy(origin).addScaledVector(toSh, 0.8);
      scene.add(mesh);

      SFX.eyeLaunch();
      consumeHeld(1);
      showBanner(`Око Края летит к Крепости (расстояние ~${Math.round(dist)} блоков)...`);

      entities.push({
        type: "thrown_eye",
        mesh,
        target: mesh.position.clone().addScaledVector(toSh, Math.min(15, dist)).add(new THREE.Vector3(0, 4.5, 0)),
        life: 2.2
      });
    }

    // Physical Arrow shot from Bow
    function shootArrow(chargeRatio) {
      const origin = getEyePos();
      const dir = getLookDir();
      const speed = 12 + chargeRatio * 26;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.75),
        new THREE.MeshLambertMaterial({ color: 0x785329 })
      );
      mesh.position.copy(origin).addScaledVector(dir, 0.7);
      mesh.lookAt(mesh.position.clone().add(dir));
      scene.add(mesh);

      SFX.bowShoot();
      entities.push({
        type: "arrow",
        mesh,
        vel: dir.clone().multiplyScalar(speed),
        dmg: Math.round(3 + chargeRatio * 7),
        life: 4.0
      });
    }

    function spawnMob(type, x, y, z) {
      const configs = {
        villager_fletcher: { name: "Лучник", hp: 20, passiveVillager: "fletcher", w: 0.65, h: 1.9 },
        villager_farmer: { name: "Фермер", hp: 20, passiveVillager: "farmer", w: 0.65, h: 1.9 },
        villager_blacksmith: { name: "Оружейник", hp: 20, passiveVillager: "blacksmith", w: 0.65, h: 1.9 },
        villager_cleric: { name: "Священник", hp: 20, passiveVillager: "cleric", w: 0.65, h: 1.9 },
        cow: { name: "Корова", hp: 10, hostile: false, w: 0.85, h: 1.25, drop: "cooked_beef", dropExtra: "leather" },
        pig: { name: "Свинья", hp: 10, hostile: false, w: 0.75, h: 0.95, drop: "apple" },
        sheep: { name: "Овца", hp: 8, hostile: false, w: 0.8, h: 1.2, drop: B.WOOL_WHITE },
        chicken: { name: "Курица", hp: 4, hostile: false, w: 0.5, h: 0.7, drop: "arrow" },
        zombie: { name: "Зомби", hp: 20, hostile: true, w: 0.65, h: 1.85, dmg: 3, drop: "iron_ingot" },
        skeleton: { name: "Скелет", hp: 20, hostile: true, w: 0.65, h: 1.85, dmg: 3, drop: "bone" },
        wither_skeleton: { name: "Визер-скелет", hp: 24, hostile: true, w: 0.7, h: 2.2, dmg: 5, drop: "wither_skull" },
        creeper: { name: "Крипер", hp: 20, hostile: true, w: 0.65, h: 1.75, dmg: 8, drop: "coal" },
        enderman: { name: "Эндермен", hp: 30, hostile: true, w: 0.65, h: 2.6, dmg: 5, drop: "ender_pearl" },
        blaze: { name: "Ифрит", hp: 20, hostile: true, w: 0.75, h: 1.7, dmg: 4, drop: "blaze_rod" },
        crystal: { name: "Кристалл Края", hp: 1, hostile: false, w: 1.2, h: 1.4 },
        dragon: { name: "Дракон Края", hp: 120, maxHp: 120, hostile: true, w: 3.6, h: 2.2, dmg: 6 }
      };
      const cfg = configs[type];
      if (!cfg) return;
      if (cfg.hostile && GAME.difficulty === "peaceful") return;

      const built = buildDetailedMobModel(type);
      built.group.position.set(x, y, z);
      scene.add(built.group);

      const ent = {
        type,
        cfg,
        hp: cfg.hp,
        maxHp: cfg.maxHp || cfg.hp,
        mesh: built.group,
        parts: built.parts,
        vel: new THREE.Vector3(),
        timer: Math.random() * 4,
        walkPhase: Math.random() * 6,
        hurtTimer: 0
      };
      entities.push(ent);

      if (type === "dragon") {
        document.getElementById("boss-bar-wrap").classList.remove("hidden");
        document.getElementById("boss-bar-fill").style.width = "100%";
      }
      return ent;
    }

    function damageEntity(ent, dmg) {
      ent.hp -= dmg;
      ent.hurtTimer = 0.25;
      ent.mesh.traverse(o => { if (o.isMesh && o.material?.emissive) o.material.emissive.setHex(0x661111); });
      SFX.hurt();

      if (ent.type === "dragon") {
        document.getElementById("boss-bar-fill").style.width = `${Math.max(0, (ent.hp / ent.maxHp) * 100)}%`;
      }

      if (ent.hp <= 0) {
        if (ent.type === "crystal") {
          SFX.explode();
          showBanner("Кристалл Края уничтожен!");
        } else if (ent.type === "dragon") {
          SFX.explode();
          document.getElementById("boss-bar-wrap").classList.add("hidden");
          GAME.world.setBlock(0, 33, 0, B.DRAGON_EGG);
          PLAYER.xp += 120;
          updateXP();
          GAME.state = "victory";
          document.exitPointerLock?.();
          document.getElementById("end-poem-screen").classList.remove("hidden");
        } else if (ent.cfg.drop) {
          if (ent.type === "wither_skeleton" && Math.random() > 0.35) {
            spawnDrop(ent.mesh.position.x, ent.mesh.position.y + 0.5, ent.mesh.position.z, "coal", 2);
          } else {
            spawnDrop(ent.mesh.position.x, ent.mesh.position.y + 0.5, ent.mesh.position.z, ent.cfg.drop, 1);
          }
          if (ent.cfg.dropExtra) spawnDrop(ent.mesh.position.x + 0.2, ent.mesh.position.y + 0.5, ent.mesh.position.z, ent.cfg.dropExtra, 1);
          PLAYER.xp += 18;
          updateXP();
        }
        scene.remove(ent.mesh);
        const idx = entities.indexOf(ent);
        if (idx >= 0) entities.splice(idx, 1);
      }
    }

    function launchHostileProjectile(source, kind = "fireball") {
      const start = source.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const target = PLAYER.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
      const direction = target.sub(start).normalize();
      const color = kind === "dragon_breath" ? 0x9b42d6 : 0xff8a24;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(kind === "dragon_breath" ? 0.34 : 0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
      );
      mesh.position.copy(start);
      scene.add(mesh);
      entities.push({
        type: "hostile_projectile", kind, mesh,
        vel: direction.multiplyScalar(kind === "dragon_breath" ? 8 : 10),
        life: kind === "dragon_breath" ? 5 : 4,
        damage: kind === "dragon_breath" ? 5 : 4
      });
    }

    function launchEnderPearl() {
      const start = getEyePos().add(getLookDir().multiplyScalar(0.7));
      const velocity = getLookDir().multiplyScalar(15);
      velocity.y += 2.0;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x287d70 })
      );
      mesh.position.copy(start);
      scene.add(mesh);
      entities.push({ type: "thrown_pearl", mesh, vel: velocity, life: 3.5 });
      consumeHeld(1);
      SFX.eyeLaunch();
    }

    function tickEntities(dt) {
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        if (e.type === "drop") {
          e.age += dt;
          e.mesh.rotation.y += dt * 2.5;
          const bBelow = GAME.world.getBlock(e.mesh.position.x, e.mesh.position.y - 0.2, e.mesh.position.z);
          if (!BLOCK_PROPS[bBelow]?.solid) {
            e.vel.y -= 16 * dt;
            e.mesh.position.addScaledVector(e.vel, dt);
          }
          const dist = e.mesh.position.distanceTo(PLAYER.pos.clone().add(new THREE.Vector3(0, 0.8, 0)));
          if (dist < 2.2 && e.age > 0.35) {
            e.mesh.position.lerp(PLAYER.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), dt * 10);
            if (dist < 0.75 && giveItem(e.id, e.count)) {
              SFX.pickup();
              scene.remove(e.mesh);
              entities.splice(i, 1);
              continue;
            }
          }
          continue;
        }

        if (e.type === "thrown_eye") {
          e.life -= dt;
          e.mesh.position.lerp(e.target, dt * 2.2);
          e.mesh.lookAt(camera.position);
          if (Math.random() < 0.5) spawnParticles(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0x9b4fd4, 1);
          if (e.life <= 0) {
            if (Math.random() < 0.8) spawnDrop(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, "ender_eye", 1);
            else {
              SFX.breakBlock("stone");
              spawnParticles(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0x48ba7b, 10);
            }
            scene.remove(e.mesh);
            entities.splice(i, 1);
          }
          continue;
        }

        if (e.type === "thrown_pearl") {
          e.life -= dt;
          e.vel.y -= 12 * dt;
          e.mesh.position.addScaledVector(e.vel, dt);
          const pearlBlock = GAME.world.getBlock(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z);
          if (BLOCK_PROPS[pearlBlock]?.solid || e.life <= 0) {
            const safe = e.mesh.position.clone();
            safe.y = Math.max(2, safe.y);
            if (!collidesAt(safe)) {
              PLAYER.pos.copy(safe);
              PLAYER.vel.set(0, 0, 0);
              damagePlayer(2, "Телепортация жемчугом Эндера", true);
              updateChunksAroundPlayer(true);
              resolveStuckInBlocks();
            }
            scene.remove(e.mesh);
            entities.splice(i, 1);
          }
          continue;
        }

        if (e.type === "hostile_projectile") {
          e.life -= dt;
          e.mesh.position.addScaledVector(e.vel, dt);
          e.mesh.rotation.x += dt * 4;
          const blockAt = GAME.world.getBlock(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z);
          const hitPlayer = e.mesh.position.distanceTo(PLAYER.pos.clone().add(new THREE.Vector3(0, 0.9, 0))) < 0.85;
          if (hitPlayer) damagePlayer(e.damage, e.kind === "dragon_breath" ? "Дыхание Дракона" : "Огненный шар Ифрита");
          if (hitPlayer || BLOCK_PROPS[blockAt]?.solid || e.life <= 0) {
            if (e.kind === "dragon_breath" && hitPlayer) PLAYER.fireTicks = Math.max(PLAYER.fireTicks, 2.5);
            scene.remove(e.mesh);
            entities.splice(i, 1);
          }
          continue;
        }

        if (e.type === "arrow") {
          e.life -= dt;
          e.vel.y -= 18 * dt;
          e.mesh.position.addScaledVector(e.vel, dt);
          e.mesh.lookAt(e.mesh.position.clone().add(e.vel));
          const hitBlock = BLOCK_PROPS[GAME.world.getBlock(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z)]?.solid;
          let hitMob = false;
          for (const target of entities) {
            if (target === e || target.type === "drop" || target.type === "arrow" || target.type === "thrown_eye") continue;
            const c = target.mesh.position.clone().add(new THREE.Vector3(0, target.cfg.h * 0.5, 0));
            if (c.distanceTo(e.mesh.position) < Math.max(0.8, target.cfg.w * 0.7)) {
              damageEntity(target, e.dmg);
              hitMob = true;
              break;
            }
          }
          if (hitBlock || hitMob || e.life <= 0) {
            scene.remove(e.mesh);
            entities.splice(i, 1);
          }
          continue;
        }

        if (e.hurtTimer > 0) {
          e.hurtTimer -= dt;
          if (e.hurtTimer <= 0) {
            e.mesh.traverse(o => { if (o.isMesh && o.material?.emissive) o.material.emissive.setHex(0x000000); });
          }
        }

        if (e.type === "crystal") {
          e.mesh.rotation.y += dt * 1.5;
          continue;
        }

        if (e.type === "blaze") {
          e.walkPhase += dt * 3;
          e.parts.rods.forEach((r) => {
            const a = r.ang + e.walkPhase;
            r.mesh.position.x = Math.cos(a) * 0.55;
            r.mesh.position.z = Math.sin(a) * 0.55;
          });
          e.shootCooldown = (e.shootCooldown || 1.2) - dt;
          const blazeDistance = e.mesh.position.distanceTo(PLAYER.pos);
          if (blazeDistance < 18 && blazeDistance > 3 && e.shootCooldown <= 0 && GAME.gamemode === "survival") {
            launchHostileProjectile(e, "fireball");
            e.shootCooldown = 2.8 + Math.random() * 1.4;
          }
        }

        if (e.type === "dragon") {
          e.timer += dt * 0.7;
          const hasCrystal = entities.some(x => x.type === "crystal");
          if (hasCrystal && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + dt * 2.5);
          document.getElementById("boss-bar-fill").style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;

          const tx = Math.cos(e.timer) * 18;
          const tz = Math.sin(e.timer) * 18;
          const ty = 40 + Math.sin(e.timer * 2.2) * 5;
          e.mesh.position.lerp(new THREE.Vector3(tx, ty, tz), dt * 2);
          e.mesh.rotation.y = -e.timer;
          if (e.parts.wings.length === 2) {
            const flap = Math.sin(e.timer * 8) * 0.45;
            e.parts.wings[0].rotation.z = flap;
            e.parts.wings[1].rotation.z = -flap;
          }
          e.breathCooldown = (e.breathCooldown || 3) - dt;
          if (e.breathCooldown <= 0 && e.mesh.position.distanceTo(PLAYER.pos) < 30 && GAME.gamemode === "survival") {
            launchHostileProjectile(e, "dragon_breath");
            e.breathCooldown = 4.5;
          }
          if (e.mesh.position.distanceTo(PLAYER.pos) < 4.5 && Math.random() < dt * 1.5) {
            damagePlayer(4, "Убит Драконом Края");
          }
          continue;
        }

        if (e.cfg.hostile && GAME.difficulty === "peaceful") {
          scene.remove(e.mesh);
          entities.splice(i, 1);
          continue;
        }

        const toPlayer = PLAYER.pos.clone().sub(e.mesh.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        let moving = false;

        if (e.cfg.hostile && dist < 18 && GAME.gamemode !== "creative" && GAME.gamemode !== "spectator") {
          toPlayer.normalize();
          e.mesh.position.x += toPlayer.x * 2.4 * dt;
          e.mesh.position.z += toPlayer.z * 2.4 * dt;
          e.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
          moving = true;
          if (dist < 1.45 && Math.random() < dt * 1.4) {
            const mult = GAME.difficulty === "hard" ? 1.5 : GAME.difficulty === "easy" ? 0.6 : 1;
            damagePlayer(Math.ceil(e.cfg.dmg * mult), `Убит мобом: ${e.cfg.name}`);
          }
        } else {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.timer = 2 + Math.random() * 3;
            e.wandAng = Math.random() * Math.PI * 2;
          }
          const vx = Math.cos(e.wandAng || 0) * (e.cfg.passiveVillager ? 0.5 : 0.9);
          const vz = Math.sin(e.wandAng || 0) * (e.cfg.passiveVillager ? 0.5 : 0.9);
          e.mesh.position.x += vx * dt;
          e.mesh.position.z += vz * dt;
          e.mesh.rotation.y = Math.atan2(vx, vz);
          moving = true;
        }

        if (moving && e.parts.legs.length >= 2) {
          e.walkPhase += dt * 7;
          const s = Math.sin(e.walkPhase) * 0.55;
          e.parts.legs[0].rotation.x = s;
          e.parts.legs[1].rotation.x = -s;
          if (e.parts.legs[2]) e.parts.legs[2].rotation.x = -s;
          if (e.parts.legs[3]) e.parts.legs[3].rotation.x = s;
        }

        if (GAME.world.dimension === "overworld") {
          const surfY = GAME.world.getSurfaceHeight(e.mesh.position.x, e.mesh.position.z);
          if (surfY > 0) e.mesh.position.y = surfY + 1;
        }
      }
    }

    // =========================================================================
    // 10. INVENTORY, OFF-HAND ('F'), CREATIVE CATALOG, CRAFTING & VILLAGER TRADE
    // =========================================================================
    function getItemInfo(id) {
      if (typeof id === "number") return { name: BLOCK_PROPS[id]?.name || "Блок", icon: ATLAS.icons[id], stack: 64 };
      return { name: ITEMS[id]?.name || id, icon: ATLAS.icons[id], stack: ITEMS[id]?.stack || 64 };
    }

    function giveItem(id, count = 1) {
      const info = getItemInfo(id);
      for (let i = 0; i < 36; i++) {
        const s = PLAYER.inv[i];
        if (s && s.id === id && s.count < info.stack) {
          const add = Math.min(count, info.stack - s.count);
          s.count += add;
          count -= add;
          if (count <= 0) { updateHotbarUI(); return true; }
        }
      }
      for (let i = 0; i < 36; i++) {
        if (!PLAYER.inv[i]) {
          const add = Math.min(count, info.stack);
          PLAYER.inv[i] = { id, count: add };
          count -= add;
          if (count <= 0) { updateHotbarUI(); return true; }
        }
      }
      updateHotbarUI();
      return count === 0;
    }

    function consumeHeld(amount = 1) {
      if (GAME.gamemode === "creative") return;
      const s = PLAYER.inv[PLAYER.hotbarIdx];
      if (!s) return;
      s.count -= amount;
      if (s.count <= 0) PLAYER.inv[PLAYER.hotbarIdx] = null;
      updateHotbarUI();
    }

    function swapOffhandItem() {
      const tmp = PLAYER.inv[PLAYER.hotbarIdx];
      PLAYER.inv[PLAYER.hotbarIdx] = PLAYER.offhand;
      PLAYER.offhand = tmp;
      GAME.equipAnim = 1.0;
      SFX.click();
      updateHotbarUI();
      if (GAME.state === "gui") refreshGuiGrids();
    }

    function renderSlot(slotEl, stack) {
      slotEl.innerHTML = "";
      if (!stack) return;
      const info = getItemInfo(stack.id);
      slotEl.title = `${info.name} (${stack.count})`;
      if (info.icon) {
        const img = document.createElement("img");
        img.src = info.icon;
        img.style.width = "28px";
        img.style.height = "28px";
        slotEl.appendChild(img);
      }
      if (stack.count > 1) {
        const cnt = document.createElement("span");
        cnt.className = "slot-count";
        cnt.textContent = stack.count;
        slotEl.appendChild(cnt);
      }
    }

    function updateHotbarUI() {
      const hb = document.getElementById("hotbar");
      hb.innerHTML = "";
      for (let i = 0; i < 9; i++) {
        const sl = document.createElement("div");
        sl.className = "inv-slot" + (i === PLAYER.hotbarIdx ? " active" : "");
        renderSlot(sl, PLAYER.inv[i]);
        hb.appendChild(sl);
      }
      renderSlot(document.getElementById("offhand-hud-slot"), PLAYER.offhand);

      const held = PLAYER.inv[PLAYER.hotbarIdx];
      document.getElementById("held-item-label").textContent = held ? getItemInfo(held.id).name : "";
    }

    // Creative Catalog
    let creativeCategory = "all";
    function buildCreativeCatalogList() {
      const allEntries = [];
      for (const [idStr, props] of Object.entries(BLOCK_PROPS)) {
        const id = Number(idStr);
        if ([B.AIR, B.NETHER_PORTAL, B.END_PORTAL, B.WHEAT_1, B.BED_FOOT, B.BED_HEAD].includes(id)) continue;
        allEntries.push({ id, name: props.name, cat: "blocks" });
      }
      for (const [id, info] of Object.entries(ITEMS)) {
        allEntries.push({ id, name: info.name, cat: info.cat || "misc" });
      }
      return allEntries;
    }

    function renderCreativeCatalog() {
      const grid = document.getElementById("creative-catalog-grid");
      const query = document.getElementById("creative-search").value.trim().toLowerCase();
      grid.innerHTML = "";
      const list = buildCreativeCatalogList().filter(item => {
        if (creativeCategory !== "all" && item.cat !== creativeCategory) return false;
        if (query && !item.name.toLowerCase().includes(query) && !String(item.id).toLowerCase().includes(query)) return false;
        return true;
      });
      for (const item of list) {
        const sl = document.createElement("div");
        sl.className = "inv-slot";
        const stackAmt = getItemInfo(item.id).stack;
        renderSlot(sl, { id: item.id, count: 1 });
        sl.title = `${item.name} (Клик: взять x${stackAmt})`;
        sl.onclick = e => {
          giveItem(item.id, e.shiftKey ? stackAmt : 1);
          SFX.click();
          refreshGuiGrids();
        };
        grid.appendChild(sl);
      }
    }

    let currentGuiType = null;
    let activeChestKey = null;

    function openGUI(type, contextKey = null) {
      currentGuiType = type;
      activeChestKey = contextKey;
      GAME.state = "gui";
      miningState.active = false;
      PLAYER.blockingShield = false;
      PLAYER.isPullingBow = false;
      document.exitPointerLock?.();
      document.getElementById("gui-screen").classList.remove("hidden");

      const creativePanel = document.getElementById("creative-panel");
      const survivalRow = document.getElementById("survival-gui-row");

      if (type === "inventory" && GAME.gamemode === "creative") {
        document.getElementById("gui-title").textContent = "Творческий режим — Все блоки и предметы";
        creativePanel.classList.remove("hidden");
        survivalRow.classList.add("hidden");
        renderCreativeCatalog();
        refreshGuiGrids();
        return;
      }

      creativePanel.classList.add("hidden");
      survivalRow.classList.remove("hidden");

      const titles = {
        inventory: "Инвентарь и Крафт",
        crafting: "Верстак (3x3)",
        furnace: "Печь",
        chest: "Сундук",
        trade: VILLAGER_PROFESSIONS[contextKey]?.title || "Торговля с жителем"
      };
      document.getElementById("gui-title").textContent = titles[type] || "Инвентарь";

      const mainArea = document.getElementById("gui-main-area");
      mainArea.innerHTML = "";
      const recipePanel = document.getElementById("gui-recipe-panel");

      if (type === "inventory" || type === "crafting") {
        recipePanel.classList.remove("hidden");
        const rGrid = document.getElementById("recipe-book-grid");
        rGrid.innerHTML = "";
        for (const rec of RECIPES) {
          const btn = document.createElement("div");
          btn.className = "inv-slot";
          renderSlot(btn, rec.out);
          const reqNames = Object.entries(rec.req).map(([k, v]) => `${getItemInfo(isNaN(k) ? k : Number(k)).name} x${v}`).join(", ");
          btn.title = `${getItemInfo(rec.out.id).name} x${rec.out.count}\nНужно: ${reqNames}`;
          btn.onclick = () => {
            const counts = {};
            PLAYER.inv.forEach(s => { if (s) counts[s.id] = (counts[s.id] || 0) + s.count; });
            for (const [reqId, reqCnt] of Object.entries(rec.req)) {
              if ((counts[reqId] || 0) < reqCnt) {
                SFX.hurt();
                showBanner(`Не хватает: ${reqNames}`);
                return;
              }
            }
            for (const [reqId, reqCnt] of Object.entries(rec.req)) {
              let left = reqCnt;
              for (let i = 0; i < 36 && left > 0; i++) {
                const s = PLAYER.inv[i];
                if (s && String(s.id) === String(reqId)) {
                  const take = Math.min(left, s.count);
                  s.count -= take;
                  left -= take;
                  if (s.count <= 0) PLAYER.inv[i] = null;
                }
              }
            }
            giveItem(rec.out.id, rec.out.count);
            SFX.click();
            refreshGuiGrids();
          };
          rGrid.appendChild(btn);
        }
      } else {
        recipePanel.classList.add("hidden");
      }

      if (type === "trade" && VILLAGER_PROFESSIONS[contextKey]) {
        const prof = VILLAGER_PROFESSIONS[contextKey];
        const tList = document.createElement("div");
        tList.className = "trade-list";
        for (const tr of prof.trades) {
          const row = document.createElement("div");
          row.className = "trade-row";
          const giveInfo = getItemInfo(tr.give.id);
          const getInfo = getItemInfo(tr.get.id);

          const left = document.createElement("div");
          left.style.display = "flex";
          left.style.alignItems = "center";
          left.style.gap = "8px";
          left.innerHTML = `<img src="${giveInfo.icon}" style="width:24px;height:24px;"> <span>${giveInfo.name} x${tr.give.count}</span> <b>→</b> <img src="${getInfo.icon}" style="width:24px;height:24px;"> <span>${getInfo.name} x${tr.get.count}</span>`;

          const btn = document.createElement("button");
          btn.className = "mc-btn";
          btn.style.padding = "2px 10px";
          btn.style.fontSize = "18px";
          btn.textContent = "Обменять";
          btn.onclick = () => {
            let have = 0;
            PLAYER.inv.forEach(s => { if (s && s.id === tr.give.id) have += s.count; });
            if (have < tr.give.count) {
              SFX.hurt();
              showBanner(`Нужно: ${giveInfo.name} x${tr.give.count}`);
              return;
            }
            let leftToTake = tr.give.count;
            for (let i = 0; i < 36 && leftToTake > 0; i++) {
              const s = PLAYER.inv[i];
              if (s && s.id === tr.give.id) {
                const take = Math.min(leftToTake, s.count);
                s.count -= take;
                leftToTake -= take;
                if (s.count <= 0) PLAYER.inv[i] = null;
              }
            }
            giveItem(tr.get.id, tr.get.count);
            PLAYER.xp += 10;
            updateXP();
            SFX.pickup();
            refreshGuiGrids();
          };
          row.append(left, btn);
          tList.appendChild(row);
        }
        mainArea.appendChild(tList);
      } else if (type === "furnace") {
        const box = document.createElement("div");
        box.style.display = "flex";
        box.style.flexDirection = "column";
        box.style.gap = "6px";
        box.innerHTML = `<div style="font-size:18px;">Переплавка руд, песка и булыжника при наличии угля или досок:</div>`;
        const smeltBtn = document.createElement("button");
        smeltBtn.className = "mc-btn";
        smeltBtn.textContent = "Переплавить 1 предмет из инвентаря";
        smeltBtn.onclick = () => {
          const fuelIdx = PLAYER.inv.findIndex(s => s && (s.id === "coal" || s.id === B.OAK_PLANKS || s.id === B.OAK_LOG));
          const oreIdx = PLAYER.inv.findIndex(s => s && SMELT_MAP[s.id] !== undefined);
          if (fuelIdx === -1 || oreIdx === -1) {
            showBanner("Нужно сырьё (руда/булыжник/песок) и топливо (уголь/доски)!");
            return;
          }
          const outId = SMELT_MAP[PLAYER.inv[oreIdx].id];
          PLAYER.inv[oreIdx].count--;
          if (PLAYER.inv[oreIdx].count <= 0) PLAYER.inv[oreIdx] = null;
          PLAYER.inv[fuelIdx].count--;
          if (PLAYER.inv[fuelIdx].count <= 0) PLAYER.inv[fuelIdx] = null;
          giveItem(outId, 1);
          PLAYER.xp += 8;
          updateXP();
          SFX.pickup();
          refreshGuiGrids();
        };
        box.appendChild(smeltBtn);
        mainArea.appendChild(box);
      } else if (type === "chest" && contextKey) {
        if (!GAME.world.chests.has(contextKey)) GAME.world.chests.set(contextKey, new Array(27).fill(null));
        const chestArr = GAME.world.chests.get(contextKey);
        const grid = document.createElement("div");
        grid.className = "gui-grid-9";
        for (let i = 0; i < 27; i++) {
          const sl = document.createElement("div");
          sl.className = "inv-slot";
          renderSlot(sl, chestArr[i]);
          bindInventoryCursor(sl, () => chestArr[i], value => { chestArr[i] = value; });
          grid.appendChild(sl);
        }
        mainArea.appendChild(grid);
      }

      refreshGuiGrids();
    }

    let carriedStack = null, rightDragActive = false, rightDragVisited = new Set();
    function renderCarriedStack() {
      const el=document.getElementById("inventory-cursor-stack"); if(!el)return;
      el.innerHTML="";
      if(!carriedStack||GAME.state!=="gui"){el.style.display="none";return;}
      const info=getItemInfo(carriedStack.id);
      if(info.icon){const img=document.createElement("img");img.src=info.icon;el.appendChild(img);}
      if(carriedStack.count>1){const n=document.createElement("span");n.className="slot-count";n.textContent=carriedStack.count;el.appendChild(n);}
      el.style.display="flex";
    }
    window.addEventListener("mousemove",e=>{const el=document.getElementById("inventory-cursor-stack");if(el&&carriedStack&&GAME.state==="gui"){el.style.left=e.clientX+"px";el.style.top=e.clientY+"px";}});
    function refreshAfterInventoryClick(){if(currentGuiType==="chest"&&activeChestKey)openGUI("chest",activeChestKey);else refreshGuiGrids();updateHotbarUI();renderCarriedStack();}
    function applyInventorySlotClick(readStack,writeStack,button=0){
      const target=readStack();
      if(button===2){
        if(!carriedStack){if(!target)return;const take=Math.ceil(target.count/2);carriedStack={id:target.id,count:take};target.count-=take;writeStack(target.count>0?target:null);}
        else if(!target){writeStack({id:carriedStack.id,count:1});carriedStack.count--;if(carriedStack.count<=0)carriedStack=null;}
        else if(String(target.id)===String(carriedStack.id)&&target.count<getItemInfo(target.id).stack){target.count++;carriedStack.count--;if(carriedStack.count<=0)carriedStack=null;writeStack(target);}else return;
      }else{
        if(!carriedStack){if(!target)return;carriedStack={id:target.id,count:target.count};writeStack(null);}
        else if(!target){writeStack(carriedStack);carriedStack=null;}
        else if(String(target.id)===String(carriedStack.id)){const cap=getItemInfo(target.id).stack||64;const moved=Math.min(carriedStack.count,Math.max(0,cap-target.count));if(!moved)return;target.count+=moved;carriedStack.count-=moved;writeStack(target);if(carriedStack.count<=0)carriedStack=null;}
        else{writeStack(carriedStack);carriedStack={id:target.id,count:target.count};}
      }
      SFX.click();refreshAfterInventoryClick();
    }
    function bindInventoryCursor(el,readStack,writeStack){
      el.draggable=false;
      const placeOne=()=>{if(!carriedStack)return;const target=readStack();if(!target)writeStack({id:carriedStack.id,count:1});else if(String(target.id)===String(carriedStack.id)&&target.count<getItemInfo(target.id).stack){target.count++;writeStack(target);}else return;carriedStack.count--;if(carriedStack.count<=0)carriedStack=null;refreshAfterInventoryClick();};
      el.addEventListener("mousedown",e=>{
        if(e.button!==0&&e.button!==2)return;
        e.preventDefault();e.stopPropagation();
        if(e.button===0&&e.detail>=2&&carriedStack){
          const wanted=carriedStack.id,cap=getItemInfo(wanted).stack||64;
          let space=Math.max(0,cap-carriedStack.count);
          for(let i=0;i<PLAYER.inv.length&&space>0;i++){
            const stack=PLAYER.inv[i];
            if(!stack||String(stack.id)!==String(wanted))continue;
            const moved=Math.min(space,stack.count);stack.count-=moved;space-=moved;carriedStack.count+=moved;
            if(stack.count<=0)PLAYER.inv[i]=null;
          }
          if(currentGuiType==="chest"&&activeChestKey){
            const chest=GAME.world.chests.get(activeChestKey);
            if(chest)for(let i=0;i<chest.length&&space>0;i++){
              const stack=chest[i];if(!stack||String(stack.id)!==String(wanted))continue;
              const moved=Math.min(space,stack.count);stack.count-=moved;space-=moved;carriedStack.count+=moved;
              if(stack.count<=0)chest[i]=null;
            }
          }
          SFX.click();refreshAfterInventoryClick();return;
        }
        if(e.button===2&&carriedStack){rightDragActive=true;rightDragVisited=new Set([el]);placeOne();}
        else{rightDragActive=false;applyInventorySlotClick(readStack,writeStack,e.button);}
      });
      el.addEventListener("mouseenter",e=>{if(rightDragActive&&(e.buttons&2)&&!rightDragVisited.has(el)){rightDragVisited.add(el);placeOne();}});
      el.addEventListener("contextmenu",e=>e.preventDefault());
;
    }
    window.addEventListener("mouseup",e=>{if(e.button===2){rightDragActive=false;rightDragVisited.clear();}});

    function bindArmorCursor(el, key) {
      el.addEventListener("mousedown", e => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault(); e.stopPropagation();
        const current = PLAYER.armor[key];
        const canEquip = item => !!ITEMS[item?.id] && ITEMS[item.id].equip === key;
        if (!carriedStack) {
          if (!current) return;
          carriedStack = current; PLAYER.armor[key] = null;
        } else if (!current) {
          if (!canEquip(carriedStack)) return;
          PLAYER.armor[key] = carriedStack; carriedStack = null;
        } else if (canEquip(carriedStack)) {
          PLAYER.armor[key] = carriedStack; carriedStack = current;
        } else return;
        refreshGuiGrids(); renderCarriedStack(); updateHUD();
      });
      el.addEventListener("contextmenu", e => e.preventDefault());
    }

    function refreshGuiGrids() {
      const bp = document.getElementById("gui-backpack");
      const hb = document.getElementById("gui-hotbar");
      const oldOffSlot = document.getElementById("gui-offhand-slot");
      const offSlot = oldOffSlot.cloneNode(false);
      oldOffSlot.replaceWith(offSlot);
      bp.innerHTML = "";
      hb.innerHTML = "";
      renderSlot(offSlot, PLAYER.offhand);
      bindInventoryCursor(offSlot, () => PLAYER.offhand, value => { PLAYER.offhand = value; });
      for (const key of ["head", "chest", "legs", "feet"]) {
        const oldSlot = document.getElementById("armor-" + key + "-slot");
        const slot = oldSlot.cloneNode(false);
        oldSlot.replaceWith(slot);
        renderSlot(slot, PLAYER.armor[key]);
        bindArmorCursor(slot, key);
      }

      const makeInvSlot = (idx) => {
        const sl = document.createElement("div");
        sl.className = "inv-slot";
        renderSlot(sl, PLAYER.inv[idx]);
        bindInventoryCursor(sl, () => PLAYER.inv[idx], value => { PLAYER.inv[idx] = value; });
        return sl;
      };

      for (let i = 9; i < 36; i++) bp.appendChild(makeInvSlot(i));
      for (let i = 0; i < 9; i++) hb.appendChild(makeInvSlot(i));
    }

    function closeGUI() {
      if (carriedStack) {
        let left = carriedStack.count;
        const cap = getItemInfo(carriedStack.id).stack || 64;
        for (let i = 0; i < 36 && left > 0; i++) {
          const s = PLAYER.inv[i];
          if (s && String(s.id) === String(carriedStack.id) && s.count < cap) {
            const moved = Math.min(left, cap - s.count); s.count += moved; left -= moved;
          }
        }
        for (let i = 0; i < 36 && left > 0; i++) if (!PLAYER.inv[i]) {
          const moved = Math.min(left, cap); PLAYER.inv[i] = { id: carriedStack.id, count: moved }; left -= moved;
        }
        if (left > 0) { carriedStack.count = left; showBanner("Освободи место в инвентаре, чтобы убрать предмет с курсора!"); return; }
        carriedStack = null; updateHotbarUI();
      }
      document.getElementById("gui-screen").classList.add("hidden");
      GAME.state = "playing";
      renderCarriedStack();
      requestLock();
    }

    // =========================================================================
    // 11. RAYCASTING, MINING, PLACING, BEDS, PORTALS & VILLAGER INTERACTION
    // =========================================================================
    let targetBlock = null;
    const miningState = { active: false, x: 0, y: 0, z: 0, progress: 0 };

    function getEyePos() {
      return new THREE.Vector3(PLAYER.pos.x, PLAYER.pos.y + (PLAYER.sneaking ? 1.32 : 1.62), PLAYER.pos.z);
    }

    function getLookDir() {
      const euler = new THREE.Euler(PLAYER.pitch, PLAYER.yaw, 0, "YXZ");
      return new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
    }

    function findEntityUnderCrosshair(maxRange = 4.5) {
      const origin = getEyePos();
      const dir = getLookDir();
      for (const e of entities) {
        if (e.type === "drop" || e.type === "arrow" || e.type === "thrown_eye") continue;
        const center = e.mesh.position.clone().add(new THREE.Vector3(0, e.cfg.h * 0.5, 0));
        const toEnt = center.sub(origin);
        const proj = toEnt.dot(dir);
        if (proj > 0 && proj < maxRange) {
          const perp = toEnt.clone().addScaledVector(dir, -proj).length();
          if (perp < Math.max(e.cfg.w, e.cfg.h * 0.65)) return e;
        }
      }
      return null;
    }

    function updateRaycast() {
      const origin = getEyePos();
      const dir = getLookDir();
      const maxDist = GAME.gamemode === "creative" ? 6.0 : 4.8;
      let prevX = Math.floor(origin.x), prevY = Math.floor(origin.y), prevZ = Math.floor(origin.z);

      targetBlock = null;
      for (let t = 0; t <= maxDist; t += 0.05) {
        const p = origin.clone().addScaledVector(dir, t);
        const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
        const id = GAME.world.getBlock(bx, by, bz);
        if (id !== B.AIR && id !== B.WATER && id !== B.LAVA) {
          targetBlock = { x: bx, y: by, z: bz, id, px: prevX, py: prevY, pz: prevZ };
          highlightBox.position.set(bx + 0.5, by + 0.5, bz + 0.5);
          highlightBox.visible = true;
          return;
        }
        prevX = bx; prevY = by; prevZ = bz;
      }
      highlightBox.visible = false;
    }

    function performLeftClickAction() {
      GAME.swingTimer = 0.24;
      const hitEnt = findEntityUnderCrosshair(4.5);
      if (hitEnt) {
        const held = PLAYER.inv[PLAYER.hotbarIdx];
        let dmg = (held && ITEMS[held.id]?.damage) ? ITEMS[held.id].damage : 2;
        if (PLAYER.effects.strength > 0) dmg += 4;
        damageEntity(hitEnt, dmg);
      }
    }

    function tickMining(dt) {
      if (!miningState.active || !targetBlock || GAME.state !== "playing") {
        miningState.progress = 0;
        updateCrackStage(0);
        return;
      }
      if (GAME.gamemode === "adventure" || GAME.gamemode === "spectator") return;

      const b = targetBlock;
      if (miningState.x !== b.x || miningState.y !== b.y || miningState.z !== b.z) {
        miningState.x = b.x; miningState.y = b.y; miningState.z = b.z;
        miningState.progress = 0;
      }

      const props = BLOCK_PROPS[b.id];
      if (!props || props.hardness < 0) return;

      if (GAME.gamemode === "creative") {
        spawnParticles(b.x + 0.5, b.y + 0.5, b.z + 0.5, b.id, 8);
        GAME.world.setBlock(b.x, b.y, b.z, B.AIR, true);
        SFX.breakBlock(props.mat);
        miningState.progress = 0;
        return;
      }

      const held = PLAYER.inv[PLAYER.hotbarIdx];
      const toolInfo = held ? ITEMS[held.id] : null;
      let speedMult = 1.0;
      if (props.tool && toolInfo?.tool === props.tool) speedMult = toolInfo.speed;
      else if (props.mat === "wood" && toolInfo?.tool === "axe") speedMult = toolInfo.speed;

      const breakTime = Math.max(0.08, (props.hardness * 1.35) / speedMult);
      miningState.progress += dt / breakTime;
      GAME.swingTimer = 0.2;
      crackMesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      updateCrackStage(Math.min(10, Math.floor(miningState.progress * 10)));

      if (miningState.progress >= 1.0) {
        SFX.breakBlock(props.mat);
        spawnParticles(b.x + 0.5, b.y + 0.5, b.z + 0.5, b.id, 8);
        GAME.world.setBlock(b.x, b.y, b.z, B.AIR, true);
        miningState.progress = 0;
        updateCrackStage(0);

        const canHarvest = !props.minTier || (toolInfo?.tool === props.tool && toolInfo.tier >= props.minTier);
        if (canHarvest && props.drop) {
          if (props.drop === "apple_chance") {
            if (Math.random() < 0.22) spawnDrop(b.x + 0.5, b.y + 0.5, b.z + 0.5, "apple", 1);
          } else {
            spawnDrop(b.x + 0.5, b.y + 0.5, b.z + 0.5, props.drop, 1);
          }
        }
      }
    }

    function triggerExplosion(cx, cy, cz, radius = 4, reason = "Взорвался") {
      SFX.explode();
      spawnParticles(cx, cy + 1, cz, 0xd96826, 28);
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dz = -radius; dz <= radius; dz++) {
            if (dx * dx + dy * dy + dz * dz <= radius * radius) {
              const id = GAME.world.getBlock(cx + dx, cy + dy, cz + dz);
              if (id !== B.AIR && id !== B.BEDROCK) {
                GAME.world.setBlock(cx + dx, cy + dy, cz + dz, B.AIR, true);
              }
            }
          }
        }
      }
      const dist = PLAYER.pos.distanceTo(new THREE.Vector3(cx, cy, cz));
      if (dist < radius + 3) {
        damagePlayer(Math.max(4, Math.round((radius + 3 - dist) * 4)), reason, true);
      }
    }

    function useBedAt(bx, by, bz) {
      if (GAME.world.dimension !== "overworld") {
        triggerExplosion(bx, by, bz, 5, "Убит [Преднамеренным игровым дизайном]");
        return;
      }
      PLAYER.spawnPos = { dim: "overworld", x: bx + 0.5, y: by + 1.05, z: bz + 0.5 };
      showBanner("Точка возрождения установлена!");
      addChatLine("Точка возрождения установлена.", "#c8c4a0");

      const isNight = GAME.timeOfDay >= 12000 && GAME.timeOfDay <= 23500;
      if (isNight) {
        const fade = document.getElementById("sleep-fade");
        fade.style.opacity = "0.95";
        setTimeout(() => {
          GAME.timeOfDay = 500;
          GAME.dayCount++;
          GAME.weather = "clear";
          PLAYER.health = Math.min(20, PLAYER.health + 4);
          updateEnvironment(0);
          updateHUD();
          fade.style.opacity = "0";
          showBanner("Доброе утро! Наступил новый день.");
        }, 650);
      }
    }

    function tryIgniteNetherPortal(x, y, z) {
      for (const axis of ["x", "z"]) {
        let minY = y;
        while (minY > 1 && GAME.world.getBlock(x, minY - 1, z) === B.AIR) minY--;
        if (GAME.world.getBlock(x, minY - 1, z) === B.OBSIDIAN && GAME.world.getBlock(x, minY + 3, z) === B.OBSIDIAN) {
          for (let dy = 0; dy < 3; dy++) {
            GAME.world.setBlock(x, minY + dy, z, B.NETHER_PORTAL, true);
            if (axis === "x" && GAME.world.getBlock(x + 1, minY + dy, z) === B.AIR) GAME.world.setBlock(x + 1, minY + dy, z, B.NETHER_PORTAL, true);
            if (axis === "z" && GAME.world.getBlock(x, minY + dy, z + 1) === B.AIR) GAME.world.setBlock(x, minY + dy, z + 1, B.NETHER_PORTAL, true);
          }
          SFX.levelUp();
          showBanner("Портал в Нижний мир активирован!");
          return true;
        }
      }
      return false;
    }

    function performRightClickDown() {
      const held = PLAYER.inv[PLAYER.hotbarIdx];
      const off = PLAYER.offhand;

      // 1. Villager Trading on Right-Click
      const hitEnt = findEntityUnderCrosshair(4.2);
      if (hitEnt && hitEnt.cfg.passiveVillager) {
        openGUI("trade", hitEnt.cfg.passiveVillager);
        return;
      }

      // Right-click equips armor directly from the selected hotbar slot.
      if (held && ITEMS[held.id]?.equip) {
        const slot = ITEMS[held.id].equip;
        const previous = PLAYER.armor[slot];
        PLAYER.armor[slot] = { id: held.id, count: 1 };
        if (previous && !giveItem(previous.id, 1)) spawnDrop(PLAYER.pos.x, PLAYER.pos.y + 1, PLAYER.pos.z, previous.id, 1);
        if (GAME.gamemode !== "creative") consumeHeld(1);
        updateHUD(); SFX.click();
        return;
      }

      // Main-hand actions take priority over off-hand shield blocking.
      if (held?.id === "ender_pearl") {
        launchEnderPearl();
        return;
      }

      // 3. Bow Drawing
      if (held?.id === "bow") {
        const hasArrows = GAME.gamemode === "creative" || PLAYER.inv.some(s => s && s.id === "arrow") || off?.id === "arrow";
        if (!hasArrows) {
          showBanner("Нет стрел для лука!");
          return;
        }
        PLAYER.isPullingBow = true;
        PLAYER.bowPullTime = 0;
        return;
      }

      // 4. Eating Food
      if (held && ITEMS[held.id]?.food && (PLAYER.hunger < 20 || held.id === "golden_apple")) {
        PLAYER.hunger = Math.min(20, PLAYER.hunger + ITEMS[held.id].food);
        if (held.id === "golden_apple") PLAYER.health = Math.min(20, PLAYER.health + 8);
        consumeHeld(1);
        SFX.pickup();
        updateHUD();
        return;
      }

      // 5. Launch Flying Eye of Ender (unless aiming at an empty End Portal Frame)
      if (held && held.id === "ender_eye" && (!targetBlock || targetBlock.id !== B.END_PORTAL_FRAME)) {
        launchEyeOfEnder();
        return;
      }

      // Shield blocking is only the fallback when the main hand has no usable item.
      if ((!held || held.id === "shield") && (held?.id === "shield" || off?.id === "shield") && (!targetBlock || !BLOCK_PROPS[targetBlock.id]?.interactive)) {
        PLAYER.blockingShield = true;
        return;
      }

      if (!targetBlock) return;
      const b = targetBlock;
      const props = BLOCK_PROPS[b.id];

      // 6. Interactive Blocks (Crafting, Furnace, Chest, Bed)
      if (props?.interactive === "bed") {
        useBedAt(b.x, b.y, b.z);
        return;
      }
      if (props?.interactive && !PLAYER.sneaking) {
        openGUI(props.interactive, `${GAME.world.dimension}:${b.x},${b.y},${b.z}`);
        return;
      }

      // 7. Insert Eye of Ender into End Portal Frame & Check Ring Activation!
      if (b.id === B.END_PORTAL_FRAME && held?.id === "ender_eye") {
        GAME.world.setBlock(b.x, b.y, b.z, B.END_PORTAL_FRAME_EYE, true);
        consumeHeld(1);
        SFX.pickup();
        GAME.world.checkAndActivateEndPortalAround(b.x, b.y, b.z);
        return;
      }

      if (!held) return;

      // 8. Place 2-Block Bed
      if (held.id === "bed") {
        const dir = getLookDir();
        const hx = Math.abs(dir.x) > Math.abs(dir.z) ? Math.sign(dir.x) : 0;
        const hz = Math.abs(dir.z) >= Math.abs(dir.x) ? Math.sign(dir.z) : 0;
        if (GAME.world.getBlock(b.px + hx, b.py, b.pz + hz) === B.AIR) {
          GAME.world.setBlock(b.px, b.py, b.pz, B.BED_FOOT, true);
          GAME.world.setBlock(b.px + hx, b.py, b.pz + hz, B.BED_HEAD, true);
          SFX.placeBlock();
          GAME.swingTimer = 0.2;
          consumeHeld(1);
        }
        return;
      }

      if (ITEMS[held.id]?.tool === "hoe" && (b.id === B.GRASS || b.id === B.DIRT)) {
        GAME.world.setBlock(b.x, b.y, b.z, B.FARMLAND, true);
        SFX.placeBlock();
        return;
      }

      if (held.id === "flint_and_steel") {
        tryIgniteNetherPortal(b.px, b.py, b.pz);
        return;
      }

      if (held.id === "bucket_water") {
        GAME.world.setBlock(b.px, b.py, b.pz, B.WATER, true);
        SFX.placeBlock();
        return;
      }

      if (held.id === "bucket_lava") {
        GAME.world.setBlock(b.px, b.py, b.pz, B.LAVA, true);
        SFX.placeBlock();
        return;
      }

      if (typeof held.id === "number" && GAME.gamemode !== "adventure" && GAME.gamemode !== "spectator") {
        const px = b.px, py = b.py, pz = b.pz;
        const pMinX = PLAYER.pos.x - 0.28, pMaxX = PLAYER.pos.x + 0.28;
        const pMinY = PLAYER.pos.y, pMaxY = PLAYER.pos.y + 1.78;
        const pMinZ = PLAYER.pos.z - 0.28, pMaxZ = PLAYER.pos.z + 0.28;
        const overlapsPlayer = (px + 1 > pMinX && px < pMaxX) && (py + 1 > pMinY && py < pMaxY) && (pz + 1 > pMinZ && pz < pMaxZ);
        if (overlapsPlayer && BLOCK_PROPS[held.id]?.solid) return;

        GAME.world.setBlock(px, py, pz, held.id, true);
        SFX.placeBlock();
        GAME.swingTimer = 0.2;
        consumeHeld(1);

        if (held.id === B.END_PORTAL_FRAME_EYE) {
          GAME.world.checkAndActivateEndPortalAround(px, py, pz);
        }
      }
    }

    function performRightClickUp() {
      PLAYER.blockingShield = false;
      if (PLAYER.isPullingBow) {
        const charge = Math.min(1.0, PLAYER.bowPullTime / 0.85);
        PLAYER.isPullingBow = false;
        PLAYER.bowPullTime = 0;
        if (charge > 0.15) {
          if (GAME.gamemode !== "creative") {
            const arrIdx = PLAYER.inv.findIndex(s => s && s.id === "arrow");
            if (arrIdx !== -1) {
              PLAYER.inv[arrIdx].count--;
              if (PLAYER.inv[arrIdx].count <= 0) PLAYER.inv[arrIdx] = null;
            } else if (PLAYER.offhand?.id === "arrow") {
              PLAYER.offhand.count--;
              if (PLAYER.offhand.count <= 0) PLAYER.offhand = null;
            }
            updateHotbarUI();
          }
          shootArrow(charge);
        }
      }
    }

    // =========================================================================
    // 12. PLAYER PHYSICS, ANTI-STUCK COLLISIONS & DIMENSION SWITCHING
    // =========================================================================
    const keys = {};
    let lastWPress = 0, lastSpacePress = 0, doubleWSprint = false;

    function collidesAt(pos) {
      if (GAME.gamemode === "spectator") return false;
      const hw = 0.28, h = PLAYER.sneaking ? 1.48 : 1.78;
      const minX = Math.floor(pos.x - hw), maxX = Math.floor(pos.x + hw);
      const minY = Math.floor(pos.y + 0.02), maxY = Math.floor(pos.y + h);
      const minZ = Math.floor(pos.z - hw), maxZ = Math.floor(pos.z + hw);
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          for (let z = minZ; z <= maxZ; z++) {
            if (BLOCK_PROPS[GAME.world.getBlock(x, y, z)]?.solid) return true;
          }
        }
      }
      return false;
    }

    function resolveStuckInBlocks() {
      if (!GAME.world || GAME.gamemode === "spectator") return;
      if (!collidesAt(PLAYER.pos)) return;
      for (let step = 0.1; step <= 3.0; step += 0.1) {
        const up = PLAYER.pos.clone();
        up.y += step;
        if (!collidesAt(up)) {
          PLAYER.pos.y = up.y;
          PLAYER.vel.y = Math.max(0, PLAYER.vel.y);
          return;
        }
      }
    }

    function damagePlayer(amount, reason = "Получен урон", bypassShield = false) {
      if (GAME.gamemode === "creative" || GAME.gamemode === "spectator") return;
      if (PLAYER.invulnTimer > 0) return;

      if (PLAYER.blockingShield && !bypassShield) {
        PLAYER.invulnTimer = 0.45;
        SFX.shieldBlock();
        showBanner("Удар заблокирован щитом!");
        return;
      }

      const armorValue = Object.values(PLAYER.armor || {}).reduce((sum, stack) => sum + (stack ? (ITEMS[stack.id]?.armor || 0) : 0), 0);
      const toughness = Object.values(PLAYER.armor || {}).reduce((sum, stack) => sum + (stack ? (ITEMS[stack.id]?.toughness || 0) : 0), 0);
      amount *= 1 - Math.min(0.8, armorValue * 0.04 + Math.min(0.12, toughness * 0.015));
      PLAYER.invulnTimer = 0.55;
      PLAYER.health = Math.max(0, PLAYER.health - amount);
      SFX.hurt();
      updateHUD();

      if (PLAYER.health <= 0) {
        GAME.state = "dead";
        PLAYER.blockingShield = false;
        PLAYER.isPullingBow = false;
        document.exitPointerLock?.();
        document.getElementById("death-reason").textContent = reason;
        if (!GAME.keepInventory) {
          for (let i = 0; i < 36; i++) {
            if (PLAYER.inv[i]) {
              spawnDrop(PLAYER.pos.x, PLAYER.pos.y + 0.5, PLAYER.pos.z, PLAYER.inv[i].id, PLAYER.inv[i].count);
              PLAYER.inv[i] = null;
            }
          }
          if (PLAYER.offhand) {
            spawnDrop(PLAYER.pos.x, PLAYER.pos.y + 0.5, PLAYER.pos.z, PLAYER.offhand.id, PLAYER.offhand.count);
            PLAYER.offhand = null;
          }          for (const key of ["head", "chest", "legs", "feet"]) {
            const armorStack = PLAYER.armor[key];
            if (armorStack) {
              spawnDrop(PLAYER.pos.x, PLAYER.pos.y + 0.5, PLAYER.pos.z, armorStack.id, armorStack.count);
              PLAYER.armor[key] = null;
            }
          }
          PLAYER.xp = 0;
          PLAYER.level = 0;
          updateHotbarUI();
          document.getElementById("death-keep-status").textContent = "KeepInventory ВЫКЛ: предметы выпали на месте смерти.";
        } else {
          document.getElementById("death-keep-status").textContent = "KeepInventory ВКЛ: инвентарь и опыт сохранены!";
        }
        document.getElementById("death-screen").classList.remove("hidden");
      }
    }

    function switchDimension(newDim) {
      clearAllEntities();
      GAME.world.clearAllMeshes();
      GAME.world.dimension = newDim;

      if (newDim === "nether") {
        // Safe arrival point; build the fortress roughly 200 blocks away.
        PLAYER.pos.set(0.5, 23, 0.5);
        const fortressX = 200, fortressZ = 0;
        for (let dx = -4; dx <= 4; dx++) {
          for (let dz = -4; dz <= 24; dz++) {
            GAME.world.setBlockRaw(fortressX + dx, 21, fortressZ + dz, B.NETHER_BRICKS);
            for (let dy = 1; dy <= 6; dy++) GAME.world.setBlockRaw(fortressX + dx, 21 + dy, fortressZ + dz, B.AIR);
            if (Math.abs(dx) === 4) GAME.world.setBlockRaw(fortressX + dx, 22, fortressZ + dz, B.NETHER_BRICKS);
          }
        }
        spawnMob("blaze", fortressX + 2, 22, fortressZ + 7);
        spawnMob("blaze", fortressX - 2, 22, fortressZ + 12);
        spawnMob("blaze", fortressX, 22, fortressZ + 18);
        spawnMob("wither_skeleton", fortressX - 2, 22, fortressZ + 8);
        spawnMob("wither_skeleton", fortressX + 2, 22, fortressZ + 14);
        showBanner("Нижний мир! Крепость находится примерно в 200 блоках от портала.");
      } else if (newDim === "end") {
        PLAYER.pos.set(0.5, 34, 14.5);
        for (const [px, pz] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
          for (let y = 30; y <= 40; y++) GAME.world.setBlockRaw(px, y, pz, B.OBSIDIAN);
          spawnMob("crystal", px + 0.5, 41, pz + 0.5);
        }
        spawnMob("dragon", 0, 42, 0);
        showBanner("КРАЙ! Уничтожьте Кристаллы Края на башнях и победите Дракона!");
      } else {
        PLAYER.pos.set(PLAYER.spawnPos.x, PLAYER.spawnPos.y, PLAYER.spawnPos.z);
        showBanner("Верхний мир");
      }
      PLAYER.vel.set(0, 0, 0);
      updateChunksAroundPlayer(true);
      resolveStuckInBlocks();
      updateHUD();
    }

    function tickPlayerPhysics(dt) {
      if (!GAME.world || GAME.state !== "playing") return;
      if (PLAYER.invulnTimer > 0) PLAYER.invulnTimer -= dt;
      if (PLAYER.isPullingBow) PLAYER.bowPullTime += dt;

      resolveStuckInBlocks();

      for (const k of Object.keys(PLAYER.effects)) {
        if (PLAYER.effects[k] > 0) PLAYER.effects[k] = Math.max(0, PLAYER.effects[k] - dt);
      }

      const feetBlock = GAME.world.getBlock(PLAYER.pos.x, PLAYER.pos.y + 0.1, PLAYER.pos.z);
      const headBlock = GAME.world.getBlock(PLAYER.pos.x, PLAYER.pos.y + 1.5, PLAYER.pos.z);
      PLAYER.inWater = feetBlock === B.WATER || headBlock === B.WATER;
      PLAYER.inLava = feetBlock === B.LAVA || headBlock === B.LAVA;

      if (feetBlock === B.NETHER_PORTAL) {
        GAME.portalTimer += dt;
        if (GAME.portalTimer >= 1.5) {
          GAME.portalTimer = 0;
          switchDimension(GAME.world.dimension === "nether" ? "overworld" : "nether");
          return;
        }
      } else if (feetBlock === B.END_PORTAL) {
        GAME.portalTimer = 0;
        switchDimension("end");
        return;
      } else {
        GAME.portalTimer = 0;
      }

      if (headBlock === B.WATER && GAME.gamemode === "survival") {
        PLAYER.air = Math.max(0, PLAYER.air - dt * 30);
        if (PLAYER.air <= 0 && Math.random() < dt * 1.2) damagePlayer(2, "Утонул", true);
      } else {
        PLAYER.air = Math.min(300, PLAYER.air + dt * 90);
      }

      if (PLAYER.inLava) PLAYER.fireTicks = 5;
      if (PLAYER.inWater) PLAYER.fireTicks = 0;
      if (PLAYER.fireTicks > 0) {
        PLAYER.fireTicks -= dt;
        document.getElementById("fire-overlay").classList.remove("hidden");
        if (Math.random() < dt * 1.1) damagePlayer(1, "Сгорел в огне", true);
      } else {
        document.getElementById("fire-overlay").classList.add("hidden");
      }

      if (GAME.difficulty === "peaceful" && PLAYER.health < 20 && Math.random() < dt * 2) {
        PLAYER.health = Math.min(20, PLAYER.health + 1);
      }

      // Survival hunger and natural regeneration.
      if (GAME.gamemode === "survival" && GAME.difficulty !== "peaceful") {
        const moving = keys["KeyW"] || keys["KeyA"] || keys["KeyS"] || keys["KeyD"];
        PLAYER.hungerTick += dt * (PLAYER.sprinting && moving ? 1.8 : moving ? 0.65 : 0.12);
        if (PLAYER.hungerTick >= 18) {
          PLAYER.hungerTick = 0;
          PLAYER.hunger = Math.max(0, PLAYER.hunger - 1);
          updateHUD();
        }
        if (PLAYER.hunger >= 18 && PLAYER.health < PLAYER.maxHealth) {
          PLAYER.regenTick += dt;
          if (PLAYER.regenTick >= 4) {
            PLAYER.regenTick = 0;
            PLAYER.health = Math.min(PLAYER.maxHealth, PLAYER.health + 1);
            updateHUD();
          }
        } else if (PLAYER.hunger > 0) {
          PLAYER.regenTick = 0;
        }
        if (PLAYER.hunger <= 0) {
          PLAYER.regenTick += dt;
          if (PLAYER.regenTick >= 4) {
            PLAYER.regenTick = 0;
            if (PLAYER.health > 1) damagePlayer(1, "Истощение", true);
          }
        }
      }

      let forward = 0, strafe = 0;
      if (keys["KeyW"]) forward += 1;
      if (keys["KeyS"]) forward -= 1;
      if (keys["KeyA"]) strafe -= 1;
      if (keys["KeyD"]) strafe += 1;

      if (forward <= 0) doubleWSprint = false;
      PLAYER.sneaking = !!(keys["KeyC"] || keys["AltLeft"] || keys["AltRight"]);
      PLAYER.sprinting = !!((keys["ShiftLeft"] || keys["ShiftRight"] || doubleWSprint) && forward > 0 && !PLAYER.sneaking && !PLAYER.blockingShield && !PLAYER.isPullingBow);

      let moveSpeed = (PLAYER.sneaking || PLAYER.blockingShield || PLAYER.isPullingBow) ? 2.1 : PLAYER.sprinting ? 6.4 : 4.4;
      if (PLAYER.flying) moveSpeed *= 1.8;
      if (PLAYER.effects.speed > 0) moveSpeed *= 1.45;

      const sin = Math.sin(PLAYER.yaw);
      const cos = Math.cos(PLAYER.yaw);
      const wishX = (-sin * forward + cos * strafe);
      const wishZ = (-cos * forward - sin * strafe);
      const len = Math.hypot(wishX, wishZ);
      const nx = len > 0 ? wishX / len : 0;
      const nz = len > 0 ? wishZ / len : 0;

      PLAYER.vel.x = nx * moveSpeed;
      PLAYER.vel.z = nz * moveSpeed;

      if (PLAYER.flying || GAME.gamemode === "spectator") {
        PLAYER.vel.y = 0;
        if (keys["Space"]) PLAYER.vel.y = 7.5;
        if (PLAYER.sneaking) PLAYER.vel.y = -7.5;
      } else if (PLAYER.inWater) {
        PLAYER.vel.y = Math.max(-3.0, PLAYER.vel.y - 8 * dt);
        if (keys["Space"]) PLAYER.vel.y = 4.2;
      } else {
        const gliding = PLAYER.armor.chest?.id === "elytra" && !PLAYER.onGround && PLAYER.pos.y > 4 && keys["Space"];
        PLAYER.vel.y -= (gliding ? 4.2 : 26) * dt;
        if (gliding) {
          const forward = new THREE.Vector3(-Math.sin(PLAYER.yaw), 0, -Math.cos(PLAYER.yaw));
          PLAYER.vel.x += forward.x * 5.5 * dt;
          PLAYER.vel.z += forward.z * 5.5 * dt;
          PLAYER.vel.y = Math.max(PLAYER.vel.y, -3.2);
        }
        if (keys["Space"] && PLAYER.onGround) {
          PLAYER.vel.y = PLAYER.effects.jump > 0 ? 11.5 : 8.4;
          PLAYER.onGround = false;
          const under = GAME.world.getBlock(PLAYER.pos.x, PLAYER.pos.y - 0.2, PLAYER.pos.z);
          if (under === B.FARMLAND) {
            GAME.world.setBlock(PLAYER.pos.x, PLAYER.pos.y - 0.2, PLAYER.pos.z, B.DIRT, true);
            SFX.breakBlock("grass");
          }
        }
      }

      const nextX = PLAYER.pos.clone();
      nextX.x += PLAYER.vel.x * dt;
      if (!collidesAt(nextX)) {
        if (!(PLAYER.sneaking && PLAYER.onGround && !PLAYER.flying && !collidesAt(nextX.clone().add(new THREE.Vector3(0, -0.6, 0))))) {
          PLAYER.pos.x = nextX.x;
        }
      }

      const nextZ = PLAYER.pos.clone();
      nextZ.z += PLAYER.vel.z * dt;
      if (!collidesAt(nextZ)) {
        if (!(PLAYER.sneaking && PLAYER.onGround && !PLAYER.flying && !collidesAt(nextZ.clone().add(new THREE.Vector3(0, -0.6, 0))))) {
          PLAYER.pos.z = nextZ.z;
        }
      }

      const prevY = PLAYER.pos.y;
      PLAYER.pos.y += PLAYER.vel.y * dt;
      if (collidesAt(PLAYER.pos)) {
        PLAYER.pos.y = prevY;
        if (PLAYER.vel.y < 0) {
          if (!PLAYER.onGround && PLAYER.fallStartY !== null && !PLAYER.inWater && !PLAYER.flying) {
            const fallDist = PLAYER.fallStartY - PLAYER.pos.y;
            if (fallDist > 3.5) damagePlayer(Math.floor(fallDist - 3), "Разбился насмерть", true);
          }
          PLAYER.onGround = true;
          PLAYER.fallStartY = null;
        }
        PLAYER.vel.y = 0;
      } else {
        if (PLAYER.onGround && PLAYER.vel.y < 0) PLAYER.fallStartY = PLAYER.pos.y;
        PLAYER.onGround = false;
      }

      if (PLAYER.pos.y < -15) damagePlayer(20, "Выпал из мира", true);

      const horiz = Math.hypot(PLAYER.vel.x, PLAYER.vel.z);
      if (horiz > 0.2 && PLAYER.onGround) {
        PLAYER.bobTimer += dt * (PLAYER.sprinting ? 13 : 9);
        PLAYER.stepDist += horiz * dt;
        if (PLAYER.stepDist >= 2.3) {
          PLAYER.stepDist = 0;
          const bUnder = GAME.world.getBlock(PLAYER.pos.x, PLAYER.pos.y - 0.2, PLAYER.pos.z);
          SFX.step(BLOCK_PROPS[bUnder]?.mat || "grass");
        }
      }
    }

    // =========================================================================
    // 13. ENVIRONMENT, CAMERA, BOW/SHIELD/TOOL VIEWMODEL ANIMATIONS
    // =========================================================================
    function updateEnvironment(dt) {
      if (GAME.doDaylightCycle && GAME.state === "playing") {
        GAME.timeOfDay = (GAME.timeOfDay + dt * 20) % 24000;
        if (GAME.timeOfDay < dt * 20) GAME.dayCount++;
      }

      cloudGroup.children.forEach(c => {
        c.position.x += dt * 0.8;
        if (c.position.x > 120) c.position.x = -120;
      });

      if (GAME.weather === "rain" && GAME.world?.dimension === "overworld") {
        rainDrops.forEach((drop, idx) => {
          drop.visible = true;
          drop.position.y -= dt * 22;
          if (drop.position.y < PLAYER.pos.y - 4 || drop.position.distanceTo(PLAYER.pos) > 22) {
            drop.position.set(
              PLAYER.pos.x + ((idx * 17) % 26) - 13,
              PLAYER.pos.y + 10 + (idx % 8),
              PLAYER.pos.z + ((idx * 23) % 26) - 13
            );
          }
        });
      } else {
        rainDrops.forEach(d => { d.visible = false; });
      }

      const dim = GAME.world?.dimension || "overworld";
      if (dim === "nether") {
        scene.background.setHex(0x361010);
        scene.fog.color.setHex(0x361010);
        ambientLight.intensity = 0.72;
        sunLight.intensity = 0.35;
        sunMesh.visible = false;
        moonMesh.visible = false;
        return;
      }
      if (dim === "end") {
        scene.background.setHex(0x0c0914);
        scene.fog.color.setHex(0x0c0914);
        ambientLight.intensity = 0.65;
        sunLight.intensity = 0.4;
        sunMesh.visible = false;
        moonMesh.visible = false;
        return;
      }

      const angle = (GAME.timeOfDay / 24000) * Math.PI * 2;
      const sunY = Math.sin(angle);
      const sunX = Math.cos(angle);
      const dayFactor = Math.max(0, Math.min(1, (sunY + 0.25) / 0.65));

      const skyCol = new THREE.Color(0x0e1429).lerp(
        new THREE.Color(GAME.weather === "rain" ? 0x566275 : 0x88aae0),
        dayFactor
      );
      if (Math.abs(sunY) < 0.22 && dayFactor > 0.05) {
        skyCol.lerp(new THREE.Color(0xc97b49), 0.4);
      }

      const headBlock = GAME.world?.getBlock(PLAYER.pos.x, PLAYER.pos.y + 1.5, PLAYER.pos.z);
      if (headBlock === B.WATER) {
        scene.fog.color.setHex(0x234c9e);
        scene.fog.near = 2;
        scene.fog.far = 18;
      } else {
        scene.background.copy(skyCol);
        scene.fog.color.copy(skyCol);
        scene.fog.near = 26;
        scene.fog.far = GAME.renderDist * 16 + 10;
      }

      ambientLight.intensity = 0.3 + dayFactor * 0.42;
      sunLight.intensity = 0.16 + dayFactor * 0.72;
      sunLight.position.set(PLAYER.pos.x + sunX * 50, PLAYER.pos.y + Math.abs(sunY) * 60 + 20, PLAYER.pos.z + 25);
      sunLight.target.position.copy(PLAYER.pos);

      sunMesh.visible = true;
      moonMesh.visible = true;
      sunMesh.position.set(PLAYER.pos.x + sunX * 90, PLAYER.pos.y + sunY * 90, PLAYER.pos.z - 20);
      sunMesh.lookAt(PLAYER.pos);
      moonMesh.position.set(PLAYER.pos.x - sunX * 90, PLAYER.pos.y - sunY * 90, PLAYER.pos.z - 20);
      moonMesh.lookAt(PLAYER.pos);
    }

    function updateCameraAndViewmodel(dt) {
      camera.rotation.order = "YXZ";
      camera.rotation.z = 0;

      if (GAME.state === "menu") {
        const t = performance.now() * 0.00016;
        camera.position.set(Math.cos(t) * 28, 42, Math.sin(t) * 28);
        camera.lookAt(0, 29, 0);
        camera.rotation.z = 0;
        fpGroup.visible = false;
        return;
      }

      // Dynamic FOV: Sprint widens FOV, Bow pull zooms FOV in!
      const bowCharge = PLAYER.isPullingBow ? Math.min(1.0, PLAYER.bowPullTime / 0.85) : 0;
      const targetFov = PLAYER.isPullingBow ? (GAME.fov - bowCharge * 14) : (PLAYER.sprinting ? GAME.fov + 9 : GAME.fov);
      camera.fov += (targetFov - camera.fov) * dt * 12;
      camera.updateProjectionMatrix();

      const eye = getEyePos();
      const bobY = Math.sin(PLAYER.bobTimer) * 0.04;
      const bobX = Math.cos(PLAYER.bobTimer * 0.5) * 0.025;
      const isMoving = Math.hypot(PLAYER.vel.x, PLAYER.vel.z) > 0.2;
      const isSwinging = miningState.active || GAME.swingTimer > 0;

      if (PLAYER.rig) {
        PLAYER.rig.root.position.copy(PLAYER.pos);
        PLAYER.rig.root.rotation.y = PLAYER.yaw + Math.PI;
        animateHumanoidRig(PLAYER.rig, dt, {
          moving: isMoving,
          sprinting: PLAYER.sprinting,
          sneaking: PLAYER.sneaking,
          swinging: isSwinging,
          blocking: PLAYER.blockingShield,
          aimingBow: PLAYER.isPullingBow,
          hasOffShield: PLAYER.offhand?.id === "shield",
          pitch: PLAYER.pitch
        });
      }

      if (GAME.cameraMode === 0) {
        if (PLAYER.rig) PLAYER.rig.root.visible = false;
        fpGroup.visible = true;
        camera.position.set(eye.x, eye.y + bobY, eye.z);
        camera.rotation.order = "YXZ";
        camera.rotation.y = PLAYER.yaw;
        camera.rotation.x = PLAYER.pitch;
        camera.rotation.z = 0;

        if (GAME.swingTimer > 0) GAME.swingTimer = Math.max(0, GAME.swingTimer - dt);
        if (GAME.equipAnim > 0) GAME.equipAnim = Math.max(0, GAME.equipAnim - dt * 4.5);
        const equipDrop = GAME.equipAnim * 0.25;

        const swingCycle = miningState.active
          ? Math.abs(Math.sin(performance.now() * 0.018))
          : (GAME.swingTimer > 0 ? Math.sin((0.24 - GAME.swingTimer) * 26) : 0);

        // Main Hand (Right)
        const held = PLAYER.inv[PLAYER.hotbarIdx];
        fpArm.visible = false;
        fpBlock.visible = false;
        fpItemSprite.visible = false;
        fpMainShield.visible = false;

        if (held?.id === "shield") {
          fpMainShield.visible = true;
          if (PLAYER.blockingShield) {
            fpMainShield.position.set(0.18, -0.18, -0.52);
            fpMainShield.rotation.set(0.05, -0.25, 0.05);
          } else {
            fpMainShield.position.set(0.45 + bobX, -0.38 + bobY - equipDrop, -0.68);
            fpMainShield.rotation.set(0.1, -0.45, 0.1);
          }
        } else if (held && typeof held.id === "number" && ATLAS.materials[held.id]) {
          fpBlock.visible = true;
          fpBlock.material = ATLAS.materials[held.id];
          fpBlock.position.set(0.46 + bobX - swingCycle * 0.25, -0.38 + bobY - swingCycle * 0.14 - equipDrop, -0.78 - swingCycle * 0.12);
          fpBlock.rotation.set(0.2 + swingCycle * 0.85, 0.6, -swingCycle * 0.45);
        } else if (held && ATLAS.itemTextures[held.id]) {
          fpItemSprite.visible = true;
          fpItemSprite.material.map = ATLAS.itemTextures[held.id];
          fpItemSprite.material.needsUpdate = true;

          if (held.id === "bow" && PLAYER.isPullingBow) {
            const shake = bowCharge > 0.9 ? Math.sin(performance.now() * 0.08) * 0.006 : 0;
            fpItemSprite.position.set(0.28 + shake, -0.22 + shake, -0.58 + bowCharge * 0.12);
            fpItemSprite.rotation.set(0.05, -0.15, 0.05 + bowCharge * 0.15);
            fpItemSprite.scale.set(1 + bowCharge * 0.15, 1 + bowCharge * 0.15, 1);
          } else {
            fpItemSprite.scale.set(1, 1, 1);
            fpItemSprite.position.set(0.45 + bobX - swingCycle * 0.28, -0.32 + bobY - swingCycle * 0.18 - equipDrop, -0.72 - swingCycle * 0.12);
            fpItemSprite.rotation.set(0.1 + swingCycle * 0.95, -0.4, 0.15 - swingCycle * 0.5);
          }
        } else {
          fpArm.visible = true;
          fpArm.position.set(0.46 + bobX - swingCycle * 0.28, -0.44 + bobY - swingCycle * 0.18 - equipDrop, -0.75 - swingCycle * 0.14);
          fpArm.rotation.set(0.45 + swingCycle * 1.15, -0.25, -0.15 - swingCycle * 0.55);
        }

        // Off-Hand (Left)
        const off = PLAYER.offhand;
        fpOffBlock.visible = false;
        fpOffSprite.visible = false;
        fpOffShield.visible = false;

        if (off?.id === "shield") {
          fpOffShield.visible = true;
          if (PLAYER.blockingShield) {
            fpOffShield.position.set(-0.18, -0.18, -0.52);
            fpOffShield.rotation.set(0.05, 0.25, -0.05);
          } else {
            fpOffShield.position.set(-0.46 - bobX, -0.4 + bobY, -0.68);
            fpOffShield.rotation.set(0.1, 0.45, -0.1);
          }
        } else if (off && typeof off.id === "number" && ATLAS.materials[off.id]) {
          fpOffBlock.visible = true;
          fpOffBlock.material = ATLAS.materials[off.id];
          fpOffBlock.position.set(-0.48 - bobX, -0.4 + bobY, -0.76);
          fpOffBlock.rotation.set(0.2, -0.6, 0);
        } else if (off && ATLAS.itemTextures[off.id]) {
          fpOffSprite.visible = true;
          fpOffSprite.material.map = ATLAS.itemTextures[off.id];
          fpOffSprite.material.needsUpdate = true;
          fpOffSprite.position.set(-0.46 - bobX, -0.36 + bobY, -0.72);
          fpOffSprite.rotation.set(0.1, 0.4, -0.15);
        }
      } else {
        if (PLAYER.rig) PLAYER.rig.root.visible = true;
        fpGroup.visible = false;
        const dir = getLookDir();
        const mult = GAME.cameraMode === 1 ? -3.6 : 3.6;
        camera.position.copy(eye.clone().addScaledVector(dir, mult)).add(new THREE.Vector3(0, 0.35, 0));
        camera.lookAt(eye);
        camera.rotation.z = 0;
      }
    }

    // =========================================================================
    // 14. FIREBASE MULTIPLAYER SYNC, COMMAND LOGS & TAB PLAYER LIST
    // =========================================================================
    async function refreshRoomList() {
      const box = document.getElementById("mp-room-list");
      if (!fbDb) {
        box.innerHTML = `<div style="color:#b88080;">База Firebase недоступна.</div>`;
        return;
      }
      box.innerHTML = `<div style="color:#9a9a9a;">Обновление списка комнат...</div>`;
      try {
        const snap = await get(ref(fbDb, "minecraft_game/rooms"));
        const val = snap.val();
        box.innerHTML = "";
        if (!val) {
          box.innerHTML = `<div style="color:#9a9a9a;">Пока нет активных комнат. Создайте свою!</div>`;
          return;
        }
        let count = 0;
        for (const [rId, room] of Object.entries(val)) {
          const playersCount = room.players ? Object.keys(room.players).length : 0;
          if (playersCount === 0) continue;
          count++;
          const row = document.createElement("div");
          row.className = "room-item";
          row.innerHTML = `<span>Комната: <b>${rId}</b> • Игроков: ${playersCount}</span>`;
          const btn = document.createElement("button");
          btn.className = "mc-btn";
          btn.style.padding = "2px 10px";
          btn.style.fontSize = "18px";
          btn.textContent = "Присоединиться";
          btn.onclick = () => joinMultiplayerRoom(rId);
          row.appendChild(btn);
          box.appendChild(row);
        }
        if (count === 0) box.innerHTML = `<div style="color:#9a9a9a;">Пока нет активных комнат. Создайте свою!</div>`;
      } catch (e) {
        box.innerHTML = `<div style="color:#b88080;">Ошибка загрузки: ${e.message}</div>`;
      }
    }

    function leaveMultiplayerRoom() {
      MP.unsubs.forEach(u => { try { u(); } catch (_) {} });
      MP.unsubs = [];
      if (MP.sweepTimer) { clearInterval(MP.sweepTimer); MP.sweepTimer = null; }
      if (MP.pingTimer) { clearInterval(MP.pingTimer); MP.pingTimer = null; }
      for (const rp of MP.remotePlayers.values()) scene.remove(rp.rig.root);
      MP.remotePlayers.clear();
      if (MP.active && fbDb && MP.roomId) {
        remove(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players/${MP.playerId}`));
      }
      MP.active = false;
      MP.roomId = null;
      document.getElementById("hud-mp-status").classList.add("hidden");
      document.getElementById("btn-copy-room").classList.add("hidden");
      document.getElementById("tab-player-list").classList.add("hidden");
    }

    function applyPlayersSnapshot(allRaw) {
      const all = allRaw || {};
      const now = Date.now();
      const activeIds = [];

      for (const [id, pData] of Object.entries(all)) {
        if (!pData) continue;
        if (id !== MP.playerId && pData.lastSeen && now - pData.lastSeen > 12000) {
          remove(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players/${id}`)).catch(() => {});
          continue;
        }
        activeIds.push(id);
        if (id === MP.playerId) continue;

        if (!MP.remotePlayers.has(id)) {
          const rig = createHumanoidRig(pData.skin || "steve", pData.name || "Друг");
          rig.root.position.set(pData.x || 8, pData.y || 32, pData.z || 8);
          MP.remotePlayers.set(id, {
            rig,
            data: pData,
            targetPos: new THREE.Vector3(pData.x || 8, pData.y || 32, pData.z || 8),
            targetYaw: pData.yaw || 0,
            targetPitch: pData.pitch || 0
          });
          addChatLine(`[Сервер] Игрок ${pData.name || "Друг"} присоединился!`, "#b8c9a3");
        } else {
          const rp = MP.remotePlayers.get(id);
          rp.data = pData;
          rp.targetPos.set(pData.x, pData.y, pData.z);
          rp.targetYaw = pData.yaw || 0;
          rp.targetPitch = pData.pitch || 0;
        }
      }

      for (const [id, rp] of MP.remotePlayers.entries()) {
        if (!activeIds.includes(id)) {
          scene.remove(rp.rig.root);
          MP.remotePlayers.delete(id);
          addChatLine(`[Сервер] Игрок ${rp.data.name || id} вышел из игры`, "#b4b4b4");
        }
      }

      document.getElementById("hud-mp-status").textContent = `Комната: ${MP.roomId} • Игроков: ${Math.max(1, activeIds.length)}`;
      if (!document.getElementById("tab-player-list").classList.contains("hidden")) {
        renderTabPlayerList();
      }
    }

    function renderPingBarsHtml(ping) {
      const bars = ping < 65 ? 5 : ping < 120 ? 4 : ping < 200 ? 3 : ping < 320 ? 2 : 1;
      const cls = bars >= 4 ? "on-good" : bars >= 2 ? "on-mid" : "on-bad";
      let html = `<span class="ping-bars">`;
      for (let b = 1; b <= 5; b++) {
        const h = 3 + b * 2;
        html += `<span class="ping-bar ${b <= bars ? cls : ""}" style="height:${h}px;"></span>`;
      }
      html += `</span>`;
      return html;
    }

    function renderTabPlayerList() {
      const header = document.getElementById("tab-list-header");
      const rowsBox = document.getElementById("tab-list-rows");
      const dimLabels = { overworld: "Верхний мир", nether: "Ад", end: "Край" };

      const list = [{
        name: `${MP.nickname} (Вы)`,
        skin: GAME.skin,
        dim: GAME.world?.dimension || "overworld",
        ping: MP.active ? MP.pingMs : 1
      }];

      if (MP.active) {
        for (const rp of MP.remotePlayers.values()) {
          list.push({
            name: rp.data.name || "Друг",
            skin: rp.data.skin || "steve",
            dim: rp.data.dim || "overworld",
            ping: typeof rp.data.ping === "number" ? rp.data.ping : 45
          });
        }
      }

      header.textContent = MP.active
        ? `Комната ${MP.roomId} • Игроков онлайн: ${list.length}`
        : `Одиночный мир • Игроков: 1`;

      rowsBox.innerHTML = "";
      for (const p of list) {
        const skinCfg = SKIN_PRESETS[p.skin] || SKIN_PRESETS.steve;
        const hexCol = "#" + skinCfg.skin.toString(16).padStart(6, "0");
        const row = document.createElement("div");
        row.className = "tab-row";
        row.innerHTML = `
          <div class="tab-player-left">
            <span class="tab-head-icon" style="background:${hexCol};"></span>
            <span>${p.name}</span>
            <span class="tab-dim-badge">${dimLabels[p.dim] || p.dim}</span>
          </div>
          <div class="tab-ping-wrap">
            <span>${p.ping} мс</span>
            ${renderPingBarsHtml(p.ping)}
          </div>
        `;
        rowsBox.appendChild(row);
      }
    }

    async function measureFirebasePing() {
      if (!MP.active || !fbDb || !MP.roomId) return;
      const t0 = performance.now();
      try {
        await update(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players/${MP.playerId}`), {
          lastSeen: Date.now()
        });
        MP.pingMs = Math.max(8, Math.round(performance.now() - t0));
      } catch (_) {}
    }

    async function joinMultiplayerRoom(roomId, isCreator = false) {
      if (!fbDb) { showBanner("Firebase не подключен!"); return; }
      leaveMultiplayerRoom();
      MP.nickname = document.getElementById("mp-nickname").value.trim() || "Steve";
      MP.roomId = roomId.toUpperCase();
      MP.active = true;

      const roomRef = ref(fbDb, `minecraft_game/rooms/${MP.roomId}`);
      let seedToUse = 77742;
      if (isCreator) {
        await set(roomRef, { seed: seedToUse, createdAt: Date.now() });
      } else {
        const snap = await get(roomRef);
        if (snap.exists() && snap.val().seed) seedToUse = snap.val().seed;
        else await set(roomRef, { seed: seedToUse, createdAt: Date.now() });
      }

      startNewWorld({
        name: `Сервер ${MP.roomId}`,
        seedInput: String(seedToUse),
        gamemode: "survival",
        difficulty: "normal",
        bonusChest: isCreator,
        keepInventory: false,
        allowCheats: true,
        doDaylightCycle: true
      });

      document.getElementById("hud-mp-status").classList.remove("hidden");
      document.getElementById("btn-copy-room").classList.remove("hidden");

      const myRef = ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players/${MP.playerId}`);
      onDisconnect(myRef).remove();

      await set(myRef, {
        name: MP.nickname,
        skin: GAME.skin,
        dim: GAME.world.dimension,
        x: Number(PLAYER.pos.x.toFixed(2)),
        y: Number(PLAYER.pos.y.toFixed(2)),
        z: Number(PLAYER.pos.z.toFixed(2)),
        yaw: 0,
        pitch: 0,
        moving: false,
        sprinting: false,
        sneaking: false,
        swinging: false,
        blocking: false,
        aimingBow: false,
        hasOffShield: false,
        ping: MP.pingMs,
        lastSeen: Date.now()
      });

      const unsubPlayers = onValue(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players`), snap => {
        applyPlayersSnapshot(snap.val());
      });
      MP.unsubs.push(unsubPlayers);

      MP.sweepTimer = setInterval(async () => {
        if (!MP.active || !fbDb || !MP.roomId) return;
        try {
          const snap = await get(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players`));
          applyPlayersSnapshot(snap.val());
        } catch (_) {}
      }, 1500);

      measureFirebasePing();
      MP.pingTimer = setInterval(measureFirebasePing, 2000);

      const unsubBlocks = onChildAdded(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/blocks`), snap => {
        const b = snap.val();
        if (!b || b.by === MP.playerId) return;
        if (GAME.world && b.dim === GAME.world.dimension) {
          GAME.world.setBlock(b.x, b.y, b.z, b.id, false);
        }
      });
      MP.unsubs.push(unsubBlocks);

      const unsubChat = onChildAdded(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/chat`), snap => {
        const msg = snap.val();
        if (!msg || msg.by === MP.playerId) return;
        if (msg.isCmdLog) {
          addChatLine(`[${msg.name}: ${msg.text}]`, "#a4a4a4", true);
        } else {
          addChatLine(`<${msg.name}> ${msg.text}`, "#dcdcdc");
        }
      });
      MP.unsubs.push(unsubChat);

      addChatLine(`[Мультиплеер] Код комнаты: ${MP.roomId}. Удерживайте TAB для списка игроков и пинга.`, "#d6cf82");
    }

    function tickMultiplayer(dt) {
      if (!MP.active || !fbDb || !MP.roomId) return;

      for (const rp of MP.remotePlayers.values()) {
        rp.rig.root.visible = (rp.data.dim || "overworld") === GAME.world.dimension;
        rp.rig.root.position.lerp(rp.targetPos, Math.min(1, dt * 14));
        rp.rig.root.rotation.y = rp.targetYaw + Math.PI;
        animateHumanoidRig(rp.rig, dt, {
          moving: !!rp.data.moving,
          sprinting: !!rp.data.sprinting,
          sneaking: !!rp.data.sneaking,
          swinging: !!rp.data.swinging,
          blocking: !!rp.data.blocking,
          aimingBow: !!rp.data.aimingBow,
          hasOffShield: !!rp.data.hasOffShield,
          pitch: rp.targetPitch
        });
      }

      MP.syncAccum += dt;
      if (MP.syncAccum >= 0.06) {
        MP.syncAccum = 0;
        const held = PLAYER.inv[PLAYER.hotbarIdx];
        set(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/players/${MP.playerId}`), {
          name: MP.nickname,
          skin: GAME.skin,
          dim: GAME.world.dimension,
          x: Number(PLAYER.pos.x.toFixed(2)),
          y: Number(PLAYER.pos.y.toFixed(2)),
          z: Number(PLAYER.pos.z.toFixed(2)),
          yaw: Number(PLAYER.yaw.toFixed(3)),
          pitch: Number(PLAYER.pitch.toFixed(3)),
          moving: Math.hypot(PLAYER.vel.x, PLAYER.vel.z) > 0.2,
          sprinting: PLAYER.sprinting,
          sneaking: PLAYER.sneaking,
          swinging: miningState.active || GAME.swingTimer > 0,
          blocking: PLAYER.blockingShield,
          aimingBow: PLAYER.isPullingBow,
          hasOffShield: PLAYER.offhand?.id === "shield",
          held: held ? held.id : null,
          ping: MP.pingMs,
          lastSeen: Date.now()
        });
      }
    }

    // =========================================================================
    // 15. COMMAND CONSOLE + BROADCAST LOGS TO ALL PLAYERS IN CHAT
    // =========================================================================
    const ALL_COMMANDS = [
      "/help",
      "/gamerule keepInventory true",
      "/gamerule keepInventory false",
      "/gamerule doDaylightCycle true",
      "/gamerule doDaylightCycle false",
      "/time set day",
      "/time set night",
      "/time set noon",
      "/time set midnight",
      "/gamemode survival",
      "/gamemode creative",
      "/gamemode adventure",
      "/gamemode spectator",
      "/difficulty peaceful",
      "/difficulty easy",
      "/difficulty normal",
      "/difficulty hard",
      "/give diamond_sword 1",
      "/give diamond_pickaxe 1",
      "/give ender_eye 12",
      "/give bow 1",
      "/give arrow 64",
      "/give shield 1",
      "/give bed 1",
      "/give emerald 32",
      "/give obsidian 16",
      "/give flint_and_steel 1",
      "/tp spawn",
      "/tp ~ ~ ~",
      "/teleport 100 70 100",
      "/spawnpoint",
      "/setworldspawn",
      "/summon zombie",
      "/summon cow",
      "/heal",
      "/feed",
      "/clear",
      "/kill",
      "/effect speed",
      "/effect jump",
      "/effect strength",
      "/effect clear",
      "/locate village",
      "/locate pyramid",
      "/locate stronghold",
      "/seed",
      "/weather clear",
      "/weather rain"
    ];

    function addChatLine(text, color = "#dcdcdc", isCmdLog = false) {
      const box = document.getElementById("chat-messages");
      const line = document.createElement("div");
      line.className = "chat-line" + (isCmdLog ? " chat-cmd-log" : "");
      line.style.color = color;
      line.textContent = text;
      box.appendChild(line);
      while (box.children.length > 14) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    }

    function logAndBroadcastCommand(actionSummary) {
      addChatLine(`[${MP.nickname}: ${actionSummary}]`, "#a4a4a4", true);
      if (MP.active && fbDb && MP.roomId) {
        push(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/chat`), {
          by: MP.playerId,
          name: MP.nickname,
          text: actionSummary,
          isCmdLog: true
        });
      }
    }

    function executeCommand(raw) {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (!trimmed.startsWith("/")) {
        addChatLine(`<${MP.nickname}> ${trimmed}`);
        if (MP.active && fbDb && MP.roomId) {
          push(ref(fbDb, `minecraft_game/rooms/${MP.roomId}/chat`), {
            by: MP.playerId, name: MP.nickname, text: trimmed
          });
        }
        return;
      }
      if (!GAME.allowCheats && trimmed !== "/help" && trimmed !== "/seed") {
        addChatLine("[Ошибка] Читы отключены в настройках этого мира!", "#c98b8b");
        return;
      }

      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const a1 = (parts[1] || "").toLowerCase();
      const a2 = (parts[2] || "").toLowerCase();
      const a3 = (parts[3] || "").toLowerCase();

      switch (cmd) {
        case "help":
          addChatLine("=== Доступные команды ===", "#d6cf82");
          addChatLine("/gamerule keepInventory <true|false> • /gamerule doDaylightCycle <true|false>");
          addChatLine("/time set <day|night|noon|midnight|число> • /weather <clear|rain>");
          addChatLine("/gamemode <survival|creative|adventure|spectator|0|1|2|3>");
          addChatLine("/difficulty <peaceful|easy|normal|hard|0|1|2|3>");
          addChatLine("/give <предмет> [кол-во] • /tp <x> <y> <z> | spawn • /spawnpoint");
          addChatLine("/heal • /feed • /clear • /kill • /effect <speed|jump|strength|clear>");
          addChatLine("/locate <village|pyramid|stronghold> • /seed");
          break;

        case "gamerule":
          if (a1 === "keepinventory") {
            GAME.keepInventory = (a2 === "true" || a2 === "1" || a2 === "вкл");
            updateHUD();
            logAndBroadcastCommand(`Игровое правило keepInventory изменено на ${GAME.keepInventory}`);
          } else if (a1 === "dodaylightcycle") {
            GAME.doDaylightCycle = (a2 === "true" || a2 === "1" || a2 === "вкл");
            logAndBroadcastCommand(`Игровое правило doDaylightCycle изменено на ${GAME.doDaylightCycle}`);
          } else {
            addChatLine("Использование: /gamerule <keepInventory|doDaylightCycle> <true|false>", "#c98b8b");
          }
          break;

        case "time":
          if (a1 === "set") {
            const presets = { day: 1000, noon: 6000, night: 13500, midnight: 18000 };
            if (presets[a2] !== undefined) GAME.timeOfDay = presets[a2];
            else if (!isNaN(Number(a2))) GAME.timeOfDay = Math.max(0, Number(a2)) % 24000;
            else { addChatLine("Укажите day, night, noon, midnight или число", "#c98b8b"); break; }
            updateEnvironment(0);
            logAndBroadcastCommand(`Время установлено на ${Math.round(GAME.timeOfDay)}`);
          }
          break;

        case "gamemode": {
          const map = { "0": "survival", survival: "survival", "1": "creative", creative: "creative", "2": "adventure", adventure: "adventure", "3": "spectator", spectator: "spectator" };
          const mode = map[a1];
          if (!mode) { addChatLine("Режимы: survival (0), creative (1), adventure (2), spectator (3)", "#c98b8b"); break; }
          GAME.gamemode = mode;
          PLAYER.flying = (mode === "creative" || mode === "spectator");
          updateHUD();
          logAndBroadcastCommand(`Собственный игровой режим изменён на ${mode}`);
          break;
        }

        case "difficulty": {
          const map = { "0": "peaceful", peaceful: "peaceful", "1": "easy", easy: "easy", "2": "normal", normal: "normal", "3": "hard", hard: "hard" };
          const diff = map[a1];
          if (!diff) { addChatLine("Сложность: peaceful (0), easy (1), normal (2), hard (3)", "#c98b8b"); break; }
          GAME.difficulty = diff;
          updateHUD();
          logAndBroadcastCommand(`Сложность игры изменена на ${diff}`);
          break;
        }

        case "give": {
          if (!a1) { addChatLine("Использование: /give <item_id> [количество]", "#c98b8b"); break; }
          const count = Math.max(1, Math.min(64, Number(a2) || 1));
          let itemId = null;
          if (ITEMS[a1]) itemId = a1;
          else if (B[a1.toUpperCase()] !== undefined) itemId = B[a1.toUpperCase()];
          else if (!isNaN(Number(a1)) && BLOCK_PROPS[Number(a1)]) itemId = Number(a1);
          if (!itemId) { addChatLine(`Неизвестный предмет: ${a1}`, "#c98b8b"); break; }
          giveItem(itemId, count);
          logAndBroadcastCommand(`Выдано ${getItemInfo(itemId).name} x${count}`);
          break;
        }

        case "tp":
        case "teleport": {
          if (a1 === "spawn") PLAYER.pos.set(PLAYER.spawnPos.x, PLAYER.spawnPos.y, PLAYER.spawnPos.z);
          else {
            const base = [PLAYER.pos.x, PLAYER.pos.y, PLAYER.pos.z];
            const coords = [a1, a2, a3].map((v, i) => v.startsWith("~") ? base[i] + (v.length > 1 ? (Number(v.slice(1)) || 0) : 0) : Number(v));
            if (coords.some(v => !Number.isFinite(v))) { addChatLine("Использование: /tp <x> <y> <z>, /tp ~ ~ ~ или /tp spawn", "#c98b8b"); break; }
            PLAYER.pos.set(coords[0], coords[1], coords[2]);
          }
          PLAYER.vel.set(0, 0, 0);
          updateChunksAroundPlayer(true);
          resolveStuckInBlocks();
          logAndBroadcastCommand(`Телепортация в ${Math.floor(PLAYER.pos.x)}, ${Math.floor(PLAYER.pos.y)}, ${Math.floor(PLAYER.pos.z)}`);
          break;
        }

        case "spawnpoint":
          PLAYER.spawnPos = { dim: GAME.world.dimension, x: PLAYER.pos.x, y: PLAYER.pos.y, z: PLAYER.pos.z };
          logAndBroadcastCommand(`Точка возрождения установлена в ${Math.round(PLAYER.pos.x)}, ${Math.round(PLAYER.pos.y)}, ${Math.round(PLAYER.pos.z)}`);
          break;

        case "setworldspawn":
          PLAYER.spawnPos = { dim: "overworld", x: PLAYER.pos.x, y: PLAYER.pos.y, z: PLAYER.pos.z };
          logAndBroadcastCommand("Мировая точка появления установлена");
          break;

        case "summon": {
          const allowed = ["zombie", "skeleton", "creeper", "enderman", "cow", "pig", "sheep", "chicken", "villager_fletcher", "blaze"];
          const type = a1 || "pig";
          if (!allowed.includes(type)) { addChatLine(`Неизвестный тип существа: ${type}`, "#c98b8b"); break; }
          const dir = getLookDir();
          const x = PLAYER.pos.x + dir.x * 3, z = PLAYER.pos.z + dir.z * 3;
          const y = GAME.world.dimension === "overworld" ? Math.max(1, GAME.world.getSurfaceHeight(x, z) + 1) : PLAYER.pos.y;
          spawnMob(type, x, y, z);
          logAndBroadcastCommand(`Создано существо: ${type}`);
          break;
        }

        case "heal":
          PLAYER.health = 20;
          PLAYER.fireTicks = 0;
          updateHUD();
          logAndBroadcastCommand(`Здоровье восстановлено`);
          break;

        case "feed":
          PLAYER.hunger = 20;
          updateHUD();
          logAndBroadcastCommand(`Сытость восстановлена`);
          break;

        case "clear":
          PLAYER.inv.fill(null);
          PLAYER.offhand = null;
          updateHotbarUI();
          logAndBroadcastCommand(`Инвентарь очищен`);
          break;

        case "kill":
          logAndBroadcastCommand(`Использована команда /kill`);
          damagePlayer(999, "Убит командой /kill", true);
          break;

        case "effect":
          if (a1 === "clear") {
            PLAYER.effects = { speed: 0, jump: 0, strength: 0, night_vision: 0 };
            logAndBroadcastCommand(`Сняты все эффекты`);
          } else if (PLAYER.effects[a1] !== undefined) {
            PLAYER.effects[a1] = 60;
            logAndBroadcastCommand(`Наложен эффект ${a1} на 60 сек.`);
          } else {
            addChatLine("Эффекты: speed, jump, strength, clear", "#c98b8b");
          }
          break;

        case "locate":
          if (a1 === "village") {
            const v = GAME.world.structures.villages[0] || { x: 38, y: 28, z: 32 };
            logAndBroadcastCommand(`Найдена деревня: X=${v.x}, Y=${v.y}, Z=${v.z}`);
          } else if (a1 === "pyramid") {
            const p = GAME.world.structures.pyramids[0] || { x: -58, y: 28, z: 64 };
            logAndBroadcastCommand(`Найдена пирамида: X=${p.x}, Y=${p.y}, Z=${p.z}`);
          } else if (a1 === "stronghold") {
            const s = GAME.world.structures.stronghold;
            logAndBroadcastCommand(`Найдена подземная крепость (Портал в Край): X=${s.x}, Y=${s.y}, Z=${s.z}`);
          } else {
            addChatLine("Использование: /locate <village|pyramid|stronghold>", "#c98b8b");
          }
          break;

        case "seed":
          addChatLine(`Сид мира: ${GAME.world.seed}`, "#a8c993");
          break;

        case "weather":
          if (a1 === "clear" || a1 === "rain") {
            GAME.weather = a1;
            logAndBroadcastCommand(`Погода изменена на ${a1}`);
          } else {
            addChatLine("Использование: /weather <clear|rain>", "#c98b8b");
          }
          break;

        default:
          logAndBroadcastCommand(`Выполнена команда: ${trimmed}`);
      }
    }

    function updateCommandSuggestions() {
      const input = document.getElementById("chat-input");
      const box = document.getElementById("chat-suggestions");
      const val = input.value.trim().toLowerCase();
      if (!val.startsWith("/")) { box.classList.add("hidden"); return; }
      const matches = ALL_COMMANDS.filter(c => c.toLowerCase().startsWith(val)).slice(0, 6);
      if (matches.length === 0) { box.classList.add("hidden"); return; }
      box.innerHTML = "";
      box.classList.remove("hidden");
      for (const m of matches) {
        const chip = document.createElement("span");
        chip.className = "cmd-chip";
        chip.textContent = m;
        chip.onclick = () => { input.value = m; input.focus(); updateCommandSuggestions(); };
        box.appendChild(chip);
      }
    }

    function openChat(prefill = "") {
      const row = document.getElementById("chat-input-row");
      const input = document.getElementById("chat-input");
      row.classList.remove("hidden");
      input.value = prefill;
      document.exitPointerLock?.();
      setTimeout(() => input.focus(), 10);
      updateCommandSuggestions();
    }

    function closeChat() {
      document.getElementById("chat-input-row").classList.add("hidden");
      document.getElementById("chat-suggestions").classList.add("hidden");
      document.getElementById("chat-input").blur();
      if (GAME.state === "playing") requestLock();
    }

    // =========================================================================
    // 16. HUD UPDATES & TIME-BUDGETED CHUNK MESH QUEUE (ANTI-LAG)
    // =========================================================================
    let bannerTimer = null;
    function showBanner(text) {
      const b = document.getElementById("action-banner");
      b.textContent = text;
      b.style.opacity = "1";
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { b.style.opacity = "0"; }, 3600);
    }

    function updateXP() {
      while (PLAYER.xp >= 100) {
        PLAYER.xp -= 100;
        PLAYER.level++;
        SFX.levelUp();
      }
      document.getElementById("xp-fill").style.width = `${PLAYER.xp}%`;
      document.getElementById("xp-level").textContent = PLAYER.level > 0 ? PLAYER.level : "";
    }

    function updateHUD() {
      if (!GAME.world) return;
      const dimNames = { overworld: "Верхний мир", nether: "Нижний мир (Ад)", end: "Край (Энд)" };
      const modeNames = { survival: "Выживание", creative: "Творческий", adventure: "Приключение", spectator: "Наблюдатель" };
      document.getElementById("hud-dim").textContent = `Измерение: ${dimNames[GAME.world.dimension]}`;
      document.getElementById("hud-biome").textContent = `Биом: ${GAME.world.getBiome(PLAYER.pos.x, PLAYER.pos.z)} • День ${GAME.dayCount}`;
      document.getElementById("hud-coords").textContent = `XYZ: ${Math.floor(PLAYER.pos.x)} / ${Math.floor(PLAYER.pos.y)} / ${Math.floor(PLAYER.pos.z)}`;
      document.getElementById("hud-rules").textContent = `KeepInv: ${GAME.keepInventory ? "ВКЛ" : "ВЫКЛ"} • Режим: ${modeNames[GAME.gamemode]} • Сложность: ${GAME.difficulty}`;

      const hBox = document.getElementById("health-icons");
      hBox.innerHTML = "";
      if (GAME.gamemode === "survival" || GAME.gamemode === "adventure") {
        const hearts = Math.ceil(PLAYER.health / 2);
        for (let i = 0; i < 10; i++) {
          const s = document.createElement("span");
          s.textContent = "❤";
          s.style.color = i < hearts ? "#b83535" : "#3a3a3a";
          hBox.appendChild(s);
        }
      }

      const armorBox = document.getElementById("armor-icons");
      if (armorBox) {
        armorBox.innerHTML = "";
        for (const key of ["head", "chest", "legs", "feet"]) {
          const slot = document.createElement("span");
          const stack = PLAYER.armor?.[key];
          slot.textContent = stack ? "▣" : "□";
          slot.title = stack ? (ITEMS[stack.id]?.name || stack.id) : "Пустой слот брони";
          slot.style.cssText = "display:inline-flex;width:17px;height:17px;align-items:center;justify-content:center;border:1px solid #aaa;background:#333;color:" + (stack ? "#e7e7e7" : "#777");
          armorBox.appendChild(slot);
        }
      }

      const fBox = document.getElementById("hunger-icons");
      fBox.innerHTML = "";
      if (GAME.gamemode === "survival" || GAME.gamemode === "adventure") {
        const legs = Math.ceil(PLAYER.hunger / 2);
        for (let i = 0; i < 10; i++) {
          const s = document.createElement("span");
          s.textContent = "🍗";
          s.style.opacity = i < legs ? "0.9" : "0.25";
          fBox.appendChild(s);
        }
      }

      const aBox = document.getElementById("air-icons");
      aBox.innerHTML = "";
      if (PLAYER.air < 300) {
        const bubs = Math.ceil(PLAYER.air / 30);
        for (let i = 0; i < bubs; i++) {
          const s = document.createElement("span");
          s.textContent = "🫧";
          aBox.appendChild(s);
        }
      }
    }

    function updateChunksAroundPlayer(immediate = false) {
      if (!GAME.world) return;
      GAME.world.ensureStructuresInRegion(PLAYER.pos.x, PLAYER.pos.z);

      const pcx = Math.floor(PLAYER.pos.x / CHUNK_SIZE);
      const pcz = Math.floor(PLAYER.pos.z / CHUNK_SIZE);
      const r = GAME.renderDist;
      const needed = new Set();
      const toBuild = [];

      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const cx = pcx + dx, cz = pcz + dz;
          const key = GAME.world.chunkKey(cx, cz);
          needed.add(key);
          if (!GAME.world.meshes.has(key)) {
            toBuild.push({ cx, cz, dist: dx * dx + dz * dz });
          }
        }
      }

      toBuild.sort((a, b) => a.dist - b.dist);
      for (const item of toBuild) {
        if (immediate && item.dist <= 4) {
          GAME.world.rebuildChunkMesh(item.cx, item.cz);
        } else {
          GAME.world.enqueueChunkRebuild(item.cx, item.cz, item.dist <= 2);
        }
      }

      for (const [key, grp] of GAME.world.meshes.entries()) {
        if (!needed.has(key)) {
          scene.remove(grp);
          grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
          GAME.world.meshes.delete(key);
        }
      }
    }

    function processChunkMeshQueue(maxPerFrame = 2) {
      if (!GAME.world || GAME.world.meshQueue.length === 0) return;
      let built = 0;
      while (built < maxPerFrame && GAME.world.meshQueue.length > 0) {
        const item = GAME.world.meshQueue.shift();
        GAME.world.meshQueueSet.delete(item.key);
        if (!GAME.world.meshes.has(item.key)) {
          GAME.world.rebuildChunkMesh(item.cx, item.cz);
          built++;
        }
      }
    }

    // =========================================================================
    // 17. WORLD START & MENU BINDINGS
    // =========================================================================
    function parseSeed(str) {
      if (!str || !str.trim()) return Math.floor(Math.random() * 899999 + 100000);
      if (!isNaN(Number(str))) return Math.abs(Math.floor(Number(str)));
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    }

    function findSafeSurfaceY(x, z) {
      const ix = Math.floor(x), iz = Math.floor(z);
      for (let y = WORLD_HEIGHT - 2; y >= 1; y--) {
        if (BLOCK_PROPS[GAME.world.getBlock(ix, y, iz)]?.solid) return y + 1.05;
      }
      return GAME.world.getSurfaceHeight(ix, iz) + 1.5;
    }

    function startNewWorld(cfg) {
      clearAllEntities();
      if (GAME.world) GAME.world.clearAllMeshes();
      if (PLAYER.rig) scene.remove(PLAYER.rig.root);
      PLAYER.rig = createHumanoidRig(GAME.skin);

      const numericSeed = parseSeed(cfg.seedInput);
      GAME.gamemode = cfg.gamemode;
      GAME.difficulty = cfg.difficulty;
      GAME.keepInventory = cfg.keepInventory;
      GAME.allowCheats = cfg.allowCheats;
      GAME.doDaylightCycle = cfg.doDaylightCycle;
      GAME.weather = "clear";
      GAME.timeOfDay = 1800;
      GAME.dayCount = 1;

      GAME.world = new VoxelWorld(numericSeed);
      GAME.world.getChunk(0, 0);
      GAME.world.buildStructures();

      const sy = findSafeSurfaceY(8, 8);
      PLAYER.pos.set(8.5, sy, 8.5);
      PLAYER.spawnPos = { dim: "overworld", x: 8.5, y: sy, z: 8.5 };
      PLAYER.vel.set(0, 0, 0);
      PLAYER.yaw = 0;
      PLAYER.pitch = 0;
      PLAYER.health = 20;
      PLAYER.hunger = 20;
      PLAYER.air = 300;
      PLAYER.fireTicks = 0;
      PLAYER.blockingShield = false;
      PLAYER.isPullingBow = false;
      PLAYER.flying = (cfg.gamemode === "creative" || cfg.gamemode === "spectator");
      PLAYER.inv.fill(null);
      PLAYER.offhand = null;

      if (cfg.bonusChest) GAME.world.spawnBonusChestNear(8.5, 8.5);

      if (cfg.gamemode === "creative") {
        giveItem("diamond_sword", 1);
        giveItem("bow", 1);
        giveItem("arrow", 64);
        giveItem("ender_eye", 16);
        giveItem(B.END_PORTAL_FRAME, 16);
        giveItem(B.OBSIDIAN, 64);
        giveItem("flint_and_steel", 1);
        giveItem("bed", 1);
        giveItem(B.GRASS, 64);
        PLAYER.offhand = { id: "shield", count: 1 };
      } else {
        // A fresh survival world starts with an empty inventory.
      }

      // Villagers spawn alongside villages in distant generated regions.

      spawnMob("cow", 14, sy, 12);
      spawnMob("pig", 4, sy, 15);
      spawnMob("sheep", 11, sy, 17);
      spawnMob("chicken", 6, sy, 11);

      updateChunksAroundPlayer(true);
      resolveStuckInBlocks();
      updateHotbarUI();
      updateHUD();

      document.querySelectorAll(".screen-overlay").forEach(el => el.classList.add("hidden"));
      document.getElementById("hud").classList.remove("hidden");
      document.getElementById("chat-messages").innerHTML = "";
      addChatLine(`[Мир "${cfg.name}"] Сид: ${numericSeed}. Исследуй мир, чтобы найти деревни, пирамиды и порталы.`, "#d6cf82");

      GAME.state = "playing";
      requestLock();
      showBanner("Клик по экрану — захват мыши • F — предмет во вторую руку • E — инвентарь/креатив");
    }

    function requestLock() {
      canvas.requestPointerLock?.();
    }

    // Menu Bindings
    document.getElementById("btn-open-create").onclick = () => {
      SFX.click();
      document.getElementById("main-menu").classList.add("hidden");
      document.getElementById("create-world-screen").classList.remove("hidden");
    };
    document.getElementById("btn-create-cancel").onclick = () => {
      SFX.click();
      document.getElementById("create-world-screen").classList.add("hidden");
      document.getElementById("main-menu").classList.remove("hidden");
    };

    document.getElementById("btn-open-multiplayer").onclick = () => {
      SFX.click();
      document.getElementById("main-menu").classList.add("hidden");
      document.getElementById("multiplayer-screen").classList.remove("hidden");
      refreshRoomList();
    };
    document.getElementById("btn-mp-back").onclick = () => {
      SFX.click();
      document.getElementById("multiplayer-screen").classList.add("hidden");
      document.getElementById("main-menu").classList.remove("hidden");
    };
    document.getElementById("btn-mp-refresh").onclick = () => { SFX.click(); refreshRoomList(); };
    document.getElementById("btn-mp-create-room").onclick = () => {
      SFX.click();
      const code = Math.random().toString(36).substring(2, 7).toUpperCase();
      joinMultiplayerRoom(code, true);
    };
    document.getElementById("btn-mp-join-room").onclick = () => {
      SFX.click();
      const code = document.getElementById("mp-room-code").value.trim().toUpperCase();
      if (!code) { showBanner("Введите код комнаты!"); return; }
      joinMultiplayerRoom(code, false);
    };
    document.getElementById("btn-copy-room").onclick = () => {
      SFX.click();
      if (!MP.roomId) return;
      const tmp = document.createElement("input");
      tmp.value = MP.roomId;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand("copy");
      document.body.removeChild(tmp);
      showBanner(`Код комнаты ${MP.roomId} скопирован!`);
    };

    document.getElementById("btn-open-skin").onclick = () => {
      SFX.click();
      document.getElementById("main-menu").classList.add("hidden");
      document.getElementById("skin-screen").classList.remove("hidden");
    };
    document.getElementById("btn-skin-back").onclick = () => {
      SFX.click();
      document.getElementById("skin-screen").classList.add("hidden");
      document.getElementById("main-menu").classList.remove("hidden");
    };
    document.querySelectorAll(".skin-preset").forEach(btn => {
      btn.onclick = () => {
        SFX.click();
        GAME.skin = btn.dataset.skin;
        document.getElementById("skin-current-label").textContent = `Текущий скин: ${SKIN_PRESETS[GAME.skin].name}`;
      };
    });

    const modesOrder = ["survival", "creative", "adventure", "spectator"];
    const modeLabels = { survival: "Выживание", creative: "Творческий", adventure: "Приключение", spectator: "Наблюдатель" };
    document.getElementById("btn-cfg-gamemode").onclick = (e) => {
      SFX.click();
      const next = modesOrder[(modesOrder.indexOf(WORLD_CONFIG.gamemode) + 1) % modesOrder.length];
      WORLD_CONFIG.gamemode = next;
      e.target.textContent = `Режим: ${modeLabels[next]}`;
    };

    const diffOrder = ["peaceful", "easy", "normal", "hard"];
    const diffLabels = { peaceful: "Мирная", easy: "Легкая", normal: "Нормальная", hard: "Сложная" };
    document.getElementById("btn-cfg-difficulty").onclick = (e) => {
      SFX.click();
      const next = diffOrder[(diffOrder.indexOf(WORLD_CONFIG.difficulty) + 1) % diffOrder.length];
      WORLD_CONFIG.difficulty = next;
      e.target.textContent = `Сложность: ${diffLabels[next]}`;
    };

    document.getElementById("btn-cfg-bonus-chest").onclick = (e) => {
      SFX.click();
      WORLD_CONFIG.bonusChest = !WORLD_CONFIG.bonusChest;
      e.target.textContent = `Бонусный сундук: ${WORLD_CONFIG.bonusChest ? "ВКЛ" : "ВЫКЛ"}`;
    };
    document.getElementById("btn-cfg-keep-inv").onclick = (e) => {
      SFX.click();
      WORLD_CONFIG.keepInventory = !WORLD_CONFIG.keepInventory;
      e.target.textContent = `Сохранять инвентарь: ${WORLD_CONFIG.keepInventory ? "ВКЛ" : "ВЫКЛ"}`;
    };
    document.getElementById("btn-cfg-cheats").onclick = (e) => {
      SFX.click();
      WORLD_CONFIG.allowCheats = !WORLD_CONFIG.allowCheats;
      e.target.textContent = `Читы и команды: ${WORLD_CONFIG.allowCheats ? "ВКЛ" : "ВЫКЛ"}`;
    };
    document.getElementById("btn-cfg-daycycle").onclick = (e) => {
      SFX.click();
      WORLD_CONFIG.doDaylightCycle = !WORLD_CONFIG.doDaylightCycle;
      e.target.textContent = `Смена дня/ночи: ${WORLD_CONFIG.doDaylightCycle ? "ВКЛ" : "ВЫКЛ"}`;
    };

    document.getElementById("btn-create-launch").onclick = () => {
      SFX.click();
      leaveMultiplayerRoom();
      WORLD_CONFIG.name = document.getElementById("cfg-world-name").value.trim() || "Новый мир";
      WORLD_CONFIG.seedInput = document.getElementById("cfg-seed").value;
      startNewWorld(WORLD_CONFIG);
    };

    // Creative Tabs & Search
    document.querySelectorAll(".cr-tab").forEach(btn => {
      btn.onclick = () => {
        SFX.click();
        document.querySelectorAll(".cr-tab").forEach(b => b.classList.remove("active-tab"));
        btn.classList.add("active-tab");
        creativeCategory = btn.dataset.cat;
        renderCreativeCatalog();
      };
    });
    document.getElementById("creative-search").addEventListener("input", renderCreativeCatalog);
    document.getElementById("btn-creative-clear").onclick = () => {
      SFX.click();
      PLAYER.inv.fill(null);
      PLAYER.offhand = null;
      updateHotbarUI();
      refreshGuiGrids();
    };

    // Settings
    document.getElementById("btn-open-settings").onclick = () => {
      SFX.click();
      document.getElementById("main-menu").classList.add("hidden");
      document.getElementById("settings-screen").classList.remove("hidden");
    };
    document.getElementById("btn-pause-settings").onclick = () => {
      SFX.click();
      document.getElementById("pause-menu").classList.add("hidden");
      document.getElementById("settings-screen").classList.remove("hidden");
    };
    document.getElementById("btn-settings-back").onclick = () => {
      SFX.click();
      document.getElementById("settings-screen").classList.add("hidden");
      if (GAME.world && GAME.state === "paused") document.getElementById("pause-menu").classList.remove("hidden");
      else document.getElementById("main-menu").classList.remove("hidden");
    };
    document.getElementById("btn-set-render").onclick = (e) => {
      SFX.click();
      GAME.renderDist = GAME.renderDist >= 6 ? 3 : GAME.renderDist + 1;
      e.target.textContent = `Дальность прорисовки: ${GAME.renderDist} чанка`;
      updateChunksAroundPlayer();
    };
    document.getElementById("btn-set-fov").onclick = (e) => {
      SFX.click();
      GAME.fov = GAME.fov >= 100 ? 65 : GAME.fov + 10;
      e.target.textContent = `Поле зрения (FOV): ${GAME.fov}`;
    };
    document.getElementById("btn-set-sens").onclick = (e) => {
      SFX.click();
      GAME.mouseSens = GAME.mouseSens >= 1.6 ? 0.6 : Number((GAME.mouseSens + 0.2).toFixed(1));
      e.target.textContent = `Чувствительность мыши: ${Math.round(GAME.mouseSens * 100)}%`;
    };
    document.getElementById("btn-set-vol").onclick = (e) => {
      SFX.click();
      SFX.volume = SFX.volume <= 0 ? 1.0 : Number((SFX.volume - 0.2).toFixed(1));
      e.target.textContent = `Громкость звуков: ${Math.round(SFX.volume * 100)}%`;
    };

    // Pause, Death, GUI & End Poem Buttons
    document.getElementById("btn-resume").onclick = () => {
      SFX.click();
      document.getElementById("pause-menu").classList.add("hidden");
      GAME.state = "playing";
      requestLock();
    };
    document.getElementById("btn-open-commands-help").onclick = () => {
      SFX.click();
      document.getElementById("pause-menu").classList.add("hidden");
      GAME.state = "playing";
      executeCommand("/help");
      openChat("/");
    };
    document.getElementById("btn-quit-menu").onclick = () => {
      SFX.click();
      leaveMultiplayerRoom();
      GAME.state = "menu";
      document.getElementById("hud").classList.add("hidden");
      document.getElementById("pause-menu").classList.add("hidden");
      document.getElementById("main-menu").classList.remove("hidden");
    };
    document.getElementById("btn-respawn").onclick = () => {
      SFX.click();
      document.getElementById("death-screen").classList.add("hidden");
      if (GAME.world.dimension !== PLAYER.spawnPos.dim) switchDimension(PLAYER.spawnPos.dim);
      PLAYER.pos.set(PLAYER.spawnPos.x, PLAYER.spawnPos.y, PLAYER.spawnPos.z);
      PLAYER.vel.set(0, 0, 0);
      PLAYER.health = 20;
      PLAYER.hunger = 20;
      PLAYER.fireTicks = 0;
      GAME.state = "playing";
      updateChunksAroundPlayer(true);
      resolveStuckInBlocks();
      updateHUD();
      requestLock();
    };
    document.getElementById("btn-death-menu").onclick = () => {
      SFX.click();
      leaveMultiplayerRoom();
      document.getElementById("death-screen").classList.add("hidden");
      document.getElementById("hud").classList.add("hidden");
      GAME.state = "menu";
      document.getElementById("main-menu").classList.remove("hidden");
    };
    document.getElementById("btn-gui-close").onclick = () => { SFX.click(); closeGUI(); };
    document.getElementById("btn-poem-close").onclick = () => {
      SFX.click();
      document.getElementById("end-poem-screen").classList.add("hidden");
      GAME.state = "playing";
      requestLock();
    };

    // Chat Input Events
    const chatInputEl = document.getElementById("chat-input");
    chatInputEl.addEventListener("input", updateCommandSuggestions);
    chatInputEl.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        executeCommand(chatInputEl.value);
        closeChat();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeChat();
      } else if (e.key === "Tab") {
        e.preventDefault();
        const firstChip = document.querySelector("#chat-suggestions .cmd-chip");
        if (firstChip) {
          chatInputEl.value = firstChip.textContent;
          updateCommandSuggestions();
        }
      }
    });
    document.getElementById("btn-chat-send").onclick = () => {
      executeCommand(chatInputEl.value);
      closeChat();
    };

    // Keyboard & Mouse Controls
    let qDropHeld = false, qDropCooldown = 0;
    function dropHeldItem(amount = 1) {
      const held = PLAYER.inv[PLAYER.hotbarIdx];
      if (!held) return;
      const dir = getLookDir();
      const count = Math.min(amount, held.count);
      spawnDrop(PLAYER.pos.x + dir.x * 1.2, PLAYER.pos.y + 1.2, PLAYER.pos.z + dir.z * 1.2, held.id, count);
      consumeHeld(count);
    }
    window.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && ["KeyS", "KeyD", "KeyP", "KeyR", "KeyF", "KeyG", "KeyU", "KeyH", "KeyJ"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === "Tab") {
        e.preventDefault();
        if (GAME.state === "playing" && document.activeElement !== chatInputEl) {
          const tabEl = document.getElementById("tab-player-list");
          if (tabEl.classList.contains("hidden")) {
            renderTabPlayerList();
            tabEl.classList.remove("hidden");
          }
        }
        return;
      }

      if (document.activeElement === chatInputEl || document.activeElement === document.getElementById("creative-search")) return;

      if (e.code === "KeyW" && !keys["KeyW"]) {
        const now = performance.now();
        if (now - lastWPress < 280) doubleWSprint = true;
        lastWPress = now;
      }
      if (e.code === "Space" && !keys["Space"] && (GAME.gamemode === "creative" || GAME.gamemode === "spectator")) {
        const now = performance.now();
        if (now - lastSpacePress < 280) {
          PLAYER.flying = !PLAYER.flying;
          showBanner(PLAYER.flying ? "Режим полёта: ВКЛ" : "Режим полёта: ВЫКЛ");
        }
        lastSpacePress = now;
      }

      keys[e.code] = true;

      if (e.code === "KeyF" && !e.ctrlKey && (GAME.state === "playing" || GAME.state === "gui")) {
        swapOffhandItem();
      } else if (e.code === "KeyE") {
        if (GAME.state === "playing") openGUI("inventory");
        else if (GAME.state === "gui") closeGUI();
      } else if (e.code === "Escape") {
        document.getElementById("tab-player-list").classList.add("hidden");
        if (GAME.state === "gui") closeGUI();
        else if (GAME.state === "playing") {
          GAME.state = "paused";
          document.exitPointerLock?.();
          document.getElementById("pause-menu").classList.remove("hidden");
        }
      } else if (e.code === "Slash" && GAME.state === "playing") {
        e.preventDefault();
        openChat("/");
      } else if (e.code === "KeyT" && GAME.state === "playing") {
        e.preventDefault();
        openChat("");
      } else if (e.code === "F3") {
        e.preventDefault();
        document.getElementById("f3-overlay").classList.toggle("hidden");
      } else if (e.code === "F5") {
        e.preventDefault();
        GAME.cameraMode = (GAME.cameraMode + 1) % 3;
      } else if (e.code === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.().catch(() => {});
      } else if (e.code === "KeyQ" && GAME.state === "playing") {
        dropHeldItem(1);
        qDropHeld = true; qDropCooldown = 0;
      } else if (e.code.startsWith("Digit")) {
        const n = Number(e.code.replace("Digit", ""));
        if (n >= 1 && n <= 9) {
          PLAYER.hotbarIdx = n - 1;
          GAME.equipAnim = 1.0;
          updateHotbarUI();
        }
      }
    });

    window.addEventListener("keyup", e => {
      keys[e.code] = false;
      if (e.code === "KeyQ") qDropHeld = false;
      if (e.code === "Tab") {
        document.getElementById("tab-player-list").classList.add("hidden");
      }
    });

    window.addEventListener("wheel", e => {
      if (GAME.state !== "playing") return;
      PLAYER.hotbarIdx = (PLAYER.hotbarIdx + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      GAME.equipAnim = 1.0;
      updateHotbarUI();
    });

    canvas.addEventListener("mousedown", e => {
      if (GAME.state !== "playing") return;
      if (!document.getElementById("chat-input-row").classList.contains("hidden")) return;
      if (document.pointerLockElement !== canvas) {
        requestLock();
        return;
      }
      if (e.button === 0) {
        miningState.active = true;
        performLeftClickAction();
      } else if (e.button === 2) {
        performRightClickDown();
      }
    });

    window.addEventListener("mouseup", e => {
      if (e.button === 0) miningState.active = false;
      if (e.button === 2) performRightClickUp();
    });

    window.addEventListener("contextmenu", e => e.preventDefault());

    window.addEventListener("mousemove", e => {
      if (GAME.state === "playing" && document.pointerLockElement === canvas) {
        PLAYER.yaw -= e.movementX * 0.0022 * GAME.mouseSens;
        PLAYER.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, PLAYER.pitch - e.movementY * 0.0022 * GAME.mouseSens));
        camera.rotation.order = "YXZ";
        camera.rotation.z = 0;
      }
    });

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // =========================================================================
    // 18. INITIALIZATION & MAIN LOOP
    // =========================================================================
    initTextures();

    GAME.world = new VoxelWorld(12345);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) GAME.world.rebuildChunkMesh(dx, dz);
    }

    let lastTime = performance.now();
    let chunkTimer = 0, hudTimer = 0, spawnTimer = 0, fpsFrames = 0, fpsTimer = 0;

    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      fpsFrames++;
      fpsTimer += dt;
      if (fpsTimer >= 0.5) {
        document.getElementById("f3-fps").textContent = `FPS: ${Math.round(fpsFrames / fpsTimer)}`;
        document.getElementById("f3-seed").textContent = `Seed: ${GAME.world?.seed || 0}`;
        document.getElementById("f3-chunks").textContent = `Chunks: ${GAME.world?.meshes.size || 0} (Q: ${GAME.world?.meshQueue.length || 0})`;
        document.getElementById("f3-mobs").textContent = `Entities: ${entities.length}`;
        if (GAME.world?.structures.stronghold) {
          const sh = GAME.world.structures.stronghold;
          document.getElementById("f3-stronghold").textContent = `Stronghold: X=${sh.x}, Z=${sh.z}`;
        }
        fpsFrames = 0;
        fpsTimer = 0;
      }

      // Smooth time-budgeted chunk building (eliminates micro-stutters)
      processChunkMeshQueue(2);

      // Update break particles
      for (let i = breakParticles.length - 1; i >= 0; i--) {
        const p = breakParticles[i];
        p.life -= dt;
        p.vel.y -= 12 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.life <= 0) {
          scene.remove(p.mesh);
          breakParticles.splice(i, 1);
        }
      }

      if (GAME.state === "playing") {
        if (qDropHeld) {
          qDropCooldown += dt;
          if (qDropCooldown >= 0.18) { qDropCooldown = 0; dropHeldItem(1); }
        }
        tickPlayerPhysics(dt);
        updateRaycast();
        tickMining(dt);
        tickEntities(dt);
        tickMultiplayer(dt);

        chunkTimer += dt;
        if (chunkTimer >= 0.45) {
          chunkTimer = 0;
          updateChunksAroundPlayer(false);
        }

        hudTimer += dt;
        if (hudTimer >= 0.25) {
          hudTimer = 0;
          updateHUD();
        }

        spawnTimer += dt;
        if (spawnTimer >= 6.0 && entities.length < 16) {
          spawnTimer = 0;
          const ang = Math.random() * Math.PI * 2;
          const sx = PLAYER.pos.x + Math.cos(ang) * 14;
          const sz = PLAYER.pos.z + Math.sin(ang) * 14;

          if (GAME.world.dimension === "overworld") {
            const isNight = GAME.timeOfDay > 12500 && GAME.timeOfDay < 23000;
            const sy = GAME.world.getSurfaceHeight(sx, sz);
            if (sy >= 27) {
              if (isNight && GAME.difficulty !== "peaceful") {
                const hostiles = ["zombie", "skeleton", "creeper", "enderman"];
                spawnMob(hostiles[Math.floor(Math.random() * hostiles.length)], sx, sy + 1, sz);
              } else {
                const passives = ["cow", "pig", "sheep", "chicken"];
                spawnMob(passives[Math.floor(Math.random() * passives.length)], sx, sy + 1, sz);
              }
            }
          } else if (GAME.world.dimension === "nether" && GAME.difficulty !== "peaceful") {
            const netherMobs = ["blaze", "wither_skeleton"];
            spawnMob(netherMobs[Math.floor(Math.random() * netherMobs.length)], sx, 22, sz);
          }
        }
      }

      updateEnvironment(dt);
      updateCameraAndViewmodel(dt);
      renderer.render(scene, camera);
    }

    window.onload = () => requestAnimationFrame(animate);
