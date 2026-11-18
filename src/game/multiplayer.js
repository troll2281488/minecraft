/**
 * Firebase Realtime Database multiplayer for the custom WebGL game.
 * Data is namespaced under minecraft_game/ to remain compatible with the
 * uploaded reference game. No Three.js objects or globals are used here.
 */
let initializeApp, getApps, getDatabase, ref, set, get, update, push, remove;
let onValue, onChildAdded, onChildChanged, onDisconnect;
import { BLOCKS, parseStateString } from '../world/block.js';
import * as storage from '../save/storage.js';
import { GENERATOR_VERSION } from '../world/gen/terrain.js';
import { DATA_VERSION } from '../save/migrate.js';

const CONFIG = {
  apiKey: 'AIzaSyCf1UO6hrlXR2GYcgGZUfsbit4Zav1m4E',
  authDomain: 'trolldonor.firebaseapp.com',
  databaseURL: 'https://trolldonor-default-rtdb.firebaseio.com',
  projectId: 'trolldonor',
  storageBucket: 'trolldonor.firebasestorage.app',
  messagingSenderId: '761197257675',
  appId: '1:761197257675:web:53dc596cf349d0cd474c4e',
};

const safeName = (value) => String(value || 'Игрок').replace(/[.#$]/g, '').replaceAll('[', '').replaceAll(']', '').replaceAll('/', '').slice(0, 20) || 'Игрок';
const roomCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();

/** Keep the current host while present; otherwise elect the lowest remaining UID. */
export function electRoomHost(room, players) {
  const current = room?.hostUid;
  if (current && players?.[current]) return current;
  return Object.keys(players || {}).sort()[0] || null;
}

export class Multiplayer {
  constructor(game) {
    this.game = game;
    this.app = null;
    this.db = null;
    const savedUid = localStorage.getItem('mc_uid');
    // The supplied Firebase rules allow user IDs up to 32 characters.
    this.uid = savedUid && savedUid.length <= 32
      ? savedUid
      : `u_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
    this.nickname = safeName(localStorage.getItem('mc_nick') || `Игрок_${Math.floor(100 + Math.random() * 900)}`);
    this.roomId = null;
    this.remotePlayers = new Map();
    this.pendingBlocks = new Map();
    this.unsubscribers = [];
    this.syncElapsed = 0;
    this.presenceElapsed = 0;
    this.worldSyncElapsed = 0;
    this.hudElapsed = 0;
    this.isHost = false;
    this.applyingRemoteBlock = false;
    this.connected = false;
    this.firebaseConnected = false;
    this.firebaseError = '';
  }

  async init() {
    try {
      if (!initializeApp) {
        const appSdk = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const dbSdk = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        ({ initializeApp, getApps } = appSdk);
        ({ getDatabase, ref, set, get, update, push, remove, onValue, onChildAdded, onChildChanged, onDisconnect } = dbSdk);
      }
      this.app = getApps().find((app) => app.name === 'minecraft-web') ||
        initializeApp(CONFIG, 'minecraft-web');
      this.db = getDatabase(this.app);
      this.connected = true;
      this.connectionUnsubscribe?.();
      this.connectionUnsubscribe = onValue(ref(this.db, '.info/connected'), (snap) => {
        this.firebaseConnected = snap.val() === true;
        if (this.firebaseConnected) this.firebaseError = '';
        this._updateRoomHud();
      }, (error) => {
        this.firebaseError = error?.message || 'Firebase connection listener failed';
        console.error('[multiplayer] connection listener failed:', error);
        this._updateRoomHud();
      });
      localStorage.setItem('mc_uid', this.uid);
      await set(ref(this.db, `minecraft_game/users/${this.uid}`), {
        name: this.nickname, online: true, room: '', ts: Date.now(),
      });
      onDisconnect(ref(this.db, `minecraft_game/users/${this.uid}`))
        .update({ online: false, room: '', ts: Date.now() }).catch(() => {});
      onDisconnect(ref(this.db, `minecraft_game/players/${this.uid}`))
        .update({ online: false, room: '' }).catch(() => {});
      return true;
    } catch (error) {
      this.connected = false;
      this.db = null;
      console.error('[multiplayer] Firebase initialization failed:', error);
      this.game.ui.toast(`Firebase недоступен: ${error.message}`, { error: true, duration: 9000 });
      return false;
    }
  }

  async setNickname(value) {
    this.nickname = safeName(value);
    localStorage.setItem('mc_nick', this.nickname);
    if (this.db) {
      await update(ref(this.db, `minecraft_game/users/${this.uid}`), { name: this.nickname });
      if (this.roomId) {
        await update(ref(this.db, `minecraft_game/rooms/${this.roomId}/players/${this.uid}`), { name: this.nickname });
      }
    }
    return this.nickname;
  }

  async showLobby() {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    const ok = this.connected && this.db ? true : await this.init();
    const rooms = document.getElementById('mp-rooms-list');
    const people = document.getElementById('mp-players-list');
    if (!ok) {
      rooms.textContent = 'Не удалось подключиться к Firebase. Проверьте интернет и правила Realtime Database.';
      people.textContent = '';
      return;
    }
    this._listen(onValue, ref(this.db, 'minecraft_game/rooms'), (snap) => {
      rooms.replaceChildren();
      const entries = Object.entries(snap.val() || {});
      if (!entries.length) {
        rooms.textContent = 'Активных комнат пока нет — создайте первую.';
        return;
      }
      for (const [code, room] of entries) {
        const row = document.createElement('div');
        row.className = 'mp-row';
        const label = document.createElement('span');
        label.textContent = `Комната ${code} · ${room.hostName || 'Сервер'} · ${Object.keys(room.players || {}).length} игроков`;
        const join = document.createElement('button');
        join.textContent = 'Войти';
        join.onclick = () => this.joinRoom(code);
        row.append(label, join);
        rooms.append(row);
      }
    });
    this._listen(onValue, ref(this.db, 'minecraft_game/users'), (snap) => {
      people.replaceChildren();
      for (const [uid, p] of Object.entries(snap.val() || {})) {
        if (!p.online) continue;
        const row = document.createElement('div');
        row.className = 'mp-row';
        const label = document.createElement('span');
        label.textContent = `● ${p.name || 'Игрок'}${uid === this.uid ? ' (вы)' : ''}`;
        row.append(label);
        if (p.room && uid !== this.uid) {
          const join = document.createElement('button');
          join.textContent = `К другу · ${p.room}`;
          join.onclick = () => this.joinRoom(p.room);
          row.append(join);
        }
        people.append(row);
      }
    });
  }

  _listen(subscribe, target, callback) {
    this.unsubscribers.push(subscribe(target, callback, (error) => {
      this.firebaseError = error?.message || 'Firebase permission/network error';
      console.error('[multiplayer] listener failed:', error);
      this.game.ui.toast(`Ошибка мультиплеера: ${this.firebaseError}`, { error: true, duration: 9000 });
      this._updateRoomHud();
    }));
  }

  async createRoom() {
    if (!this.db && !(await this.init())) return;
    const code = roomCode();
    const seed = String(Math.floor(Math.random() * 2147483647));
    await set(ref(this.db, `minecraft_game/rooms/${code}`), {
      seed, hostName: this.nickname, hostUid: this.uid, worldTime: 0, createdAt: Date.now(), players: {},
    });
    await this.joinRoom(code, seed);
  }

  async joinRoom(rawCode) {
    if (!this.db && !(await this.init())) return;
    const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) {
      this.game.ui.toast('Введи код комнаты', { error: true });
      return;
    }
    const roomRef = ref(this.db, `minecraft_game/rooms/${code}`);
    let snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      this.game.ui.toast('Комната не найдена. Проверь код или попроси друга создать комнату заново.', { error: true });
      return;
    }
    const room = snapshot.val() || {};
    const seed = String(room.seed ?? 424242);
    const sharedTime = Number.isFinite(room.worldTime) ? room.worldTime : 0;

    await this.leaveRoom(false);
    this.roomId = code;
    this.isHost = room.hostUid === this.uid;
    const worldId = `online-${code}-${this.uid}`;
    const savedPlayer = await storage.getPlayer(worldId, 'local');
    const meta = await storage.putWorld({
      id: worldId, name: `Online · ${code}`, seed,
      generatorVersion: GENERATOR_VERSION, time: sharedTime, createdWith: DATA_VERSION,
    });
    await this.game._enterWorld(meta, savedPlayer);

    // New clients must not all appear at the exact same coordinates. That made
    // remote avatars overlap the local camera and look like they were missing.
    if (!savedPlayer) {
      let hash = 2166136261;
      for (const char of this.uid) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      const angle = (hash % 8) * (Math.PI / 4);
      const radius = 2.5 + ((hash >>> 3) % 3);
      const base = this.game.player;
      const desiredX = Math.floor(base.x + Math.cos(angle) * radius);
      const desiredZ = Math.floor(base.z + Math.sin(angle) * radius);
      const offsetSpawn = this.game.world.findSpawn(desiredX, desiredZ, 7);
      if (offsetSpawn) base.teleport(offsetSpawn.x, offsetSpawn.y, offsetSpawn.z);
    }

    const playerRef = ref(this.db, `minecraft_game/rooms/${code}/players/${this.uid}`);
    await set(playerRef, this._playerPayload());
    onDisconnect(playerRef).remove().catch(() => {});
    await update(ref(this.db, `minecraft_game/players/${this.uid}`), { room: code, name: this.nickname });
    await update(ref(this.db, `minecraft_game/users/${this.uid}`), { room: code, name: this.nickname, online: true, ts: Date.now() });

    this._listen(onValue, ref(this.db, `minecraft_game/rooms/${code}/worldTime`), (snap) => {
      const time = snap.val();
      if (Number.isFinite(time) && this.game.world && !this.isHost) this.game.world.time = time;
    });
    let knownPlayers = null;
    this._listen(onValue, ref(this.db, `minecraft_game/rooms/${code}/players`), (snap) => {
      const players = snap.val() || {};
      const currentIds = new Set(Object.keys(players));
      const firstSnapshot = knownPlayers === null;
      if (knownPlayers) {
        for (const [uid, joined] of Object.entries(players)) {
          if (uid !== this.uid && !knownPlayers.has(uid)) {
            const name = safeName(joined.name);
            this.addChat(`§ ${name} зашёл в комнату`);
            this.game.ui.toast(`${name} зашёл в игру`, { duration: 3500 });
          }
        }
      }
      if (firstSnapshot) {
        for (const [uid, joined] of Object.entries(players)) {
          if (uid !== this.uid) this.addChat(`В комнате уже есть игрок: ${safeName(joined.name)}`);
        }
      }
      knownPlayers = currentIds;
      // If the room creator leaves, elect the first remaining UID deterministically.
      const hostUid = electRoomHost(room, players);
      if (hostUid) {
        this.isHost = hostUid === this.uid;
        if (room.hostUid !== hostUid) update(ref(this.db, `minecraft_game/rooms/${code}`), { hostUid })
          .catch((error) => console.warn('[multiplayer] host election:', error));
      }
      for (const uid of this.remotePlayers.keys()) if (!players[uid]) this.remotePlayers.delete(uid);
      for (const [uid, p] of Object.entries(players)) {
        if (uid === this.uid || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        const current = this.remotePlayers.get(uid) || { id: uid, name: safeName(p.name), x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, targetX: p.x, targetY: p.y, targetZ: p.z, targetYaw: p.yaw || 0 };
        current.name = safeName(p.name);
        current.health = Number.isFinite(p.health) ? p.health : 20;
        current.food = Number.isFinite(p.food) ? p.food : 20;
        current.inWater = !!p.inWater;
        current.airborne = p.onGround === false;
        current.targetX = p.x; current.targetY = p.y; current.targetZ = p.z; current.targetYaw = p.yaw || 0;
        this.remotePlayers.set(uid, current);
      }
      this._updateRoomHud();
    });
    const applyBlockSnapshot = (snap) => {
      const block = snap.val();
      if (!block || !Number.isInteger(block.x) || !Number.isInteger(block.y) || !Number.isInteger(block.z)) return;
      this.pendingBlocks.set(`${block.x},${block.y},${block.z}`, block);
      this._applyPendingBlocks();
    };
    this._listen(onChildAdded, ref(this.db, `minecraft_game/rooms/${code}/blocks`), applyBlockSnapshot);
    this._listen(onChildChanged, ref(this.db, `minecraft_game/rooms/${code}/blocks`), applyBlockSnapshot);
    this._listen(onChildAdded, ref(this.db, `minecraft_game/rooms/${code}/chat`), (snap) => {
      const msg = snap.val();
      if (msg?.text) this.addChat(`<${safeName(msg.sender)}> ${String(msg.text).slice(0, 240)}`);
    });
    document.getElementById('hud-room').textContent = `Комната: ${code}`;
    document.getElementById('hud-room').classList.remove('hidden');
    document.getElementById('mp-screen').classList.add('hidden');
    this.game.ui.toast(`Подключено к комнате ${code}`);
  }

  _updateRoomHud() {
    const hud = document.getElementById('hud-room');
    if (!hud || !this.roomId) return;
    const local = this.game.player;
    const players = [
      `${this.nickname} ${Math.ceil(local?.health ?? 20)}♥ ${Math.ceil(local?.vitals?.food ?? 20)}🍗`,
      ...[...this.remotePlayers.values()].map((p) => `${p.name} ${Math.ceil(p.health ?? 20)}♥ ${Math.ceil(p.food ?? 20)}🍗`),
    ];
    const connection = this.firebaseError ? ' · ошибка соединения' : this.firebaseConnected ? ' · онлайн' : ' · подключение…';
    hud.textContent = `Комната ${this.roomId} · ${players.length} игроков${this.isHost ? ' · хост' : ''}${connection} | ${players.join(' · ')}`;
  }

  _applyPendingBlocks() {
    if (!this.game.world || !this.pendingBlocks.size) return;
    this.applyingRemoteBlock = true;
    try {
      for (const [key, block] of this.pendingBlocks) {
        let state;
        try {
          const parsed = parseStateString(block.state || block.id);
          const definition = BLOCKS.get(parsed.blockId);
          if (!definition) { this.pendingBlocks.delete(key); continue; }
          state = definition.defaultState;
          for (const [name, value] of Object.entries(parsed.values)) {
            const property = definition.properties[name];
            if (!property) continue;
            const typed = property.parse(value);
            if (typed !== undefined) state = state.with(name, typed);
          }
        } catch { this.pendingBlocks.delete(key); continue; }
        if (this.game.world.setBlock(block.x, block.y, block.z, state, { relight: false })) this.pendingBlocks.delete(key);
      }
    } finally { this.applyingRemoteBlock = false; }
  }

  _playerPayload() {
    const p = this.game.player;
    return {
      name: this.nickname,
      x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)), z: Number(p.z.toFixed(2)),
      yaw: Number(p.yaw.toFixed(2)), pitch: Number(p.pitch.toFixed(2)),
      gamemode: p.gamemode,
      health: p.health,
      food: p.vitals?.food ?? 20,
      inWater: !!p.inWater,
      onGround: !!p.onGround,
      ts: Date.now(),
    };
  }

  tick(dt) {
    this._applyPendingBlocks();
    for (const p of this.remotePlayers.values()) {
      const alpha = Math.min(1, dt * 12);
      const moving = Math.hypot(p.targetX - p.x, p.targetZ - p.z) > 0.002;
      if (moving) p.walkPhase = (p.walkPhase || 0) + dt * 11;
      else if (p.inWater) p.walkPhase = (p.walkPhase || 0) + dt * 2.4;
      p.x += (p.targetX - p.x) * alpha;
      p.y += (p.targetY - p.y) * alpha;
      p.z += (p.targetZ - p.z) * alpha;
      const yawDelta = Math.atan2(Math.sin(p.targetYaw - p.yaw), Math.cos(p.targetYaw - p.yaw));
      p.yaw += yawDelta * alpha;
    }
    if (!this.db || !this.roomId || !this.game.running || this.game.paused || !this.game.player) return;
    this.syncElapsed += dt;
    this.presenceElapsed += dt;
    this.worldSyncElapsed += dt;
    this.hudElapsed += dt;
    if (this.hudElapsed >= 1) {
      this.hudElapsed = 0;
      this._updateRoomHud();
    }
    if (this.syncElapsed >= 0.12) {
      this.syncElapsed = 0;
      update(ref(this.db, `minecraft_game/rooms/${this.roomId}/players/${this.uid}`), this._playerPayload())
        .catch((error) => console.warn('[multiplayer] player sync:', error));
    }
    if (this.worldSyncElapsed >= 2) {
      this.worldSyncElapsed = 0;
      if (this.isHost && this.game.world) {
        update(ref(this.db, `minecraft_game/rooms/${this.roomId}`), { worldTime: this.game.world.time })
          .catch((error) => console.warn('[multiplayer] world clock sync:', error));
      }
    }
    if (this.presenceElapsed >= 5) {
      this.presenceElapsed = 0;
      update(ref(this.db, `minecraft_game/users/${this.uid}`), { online: true, room: this.roomId, name: this.nickname, ts: Date.now() })
        .catch((error) => console.warn('[multiplayer] presence sync:', error));
    }
  }

  pushBlockChange(x, y, z, state) {
    if (!this.db || !this.roomId || this.applyingRemoteBlock) return;
    const stateString = state?.toString?.();
    if (!stateString) return;
    set(ref(this.db, `minecraft_game/rooms/${this.roomId}/blocks/overworld_${x}_${y}_${z}`), {
      x, y, z, state: stateString, ts: Date.now(),
    }).catch((error) => this.game.ui.toast(`Не удалось синхронизировать блок: ${error.message}`, { error: true }));
  }

  sendChat(text) {
    const value = String(text || '').trim().slice(0, 240);
    if (!value) return;
    if (!this.db || !this.roomId) {
      this.addChat(`<${this.nickname}> ${value}`);
      return;
    }
    push(ref(this.db, `minecraft_game/rooms/${this.roomId}/chat`), {
      sender: this.nickname, text: value, timestamp: Date.now(),
    }).catch((error) => this.game.ui.toast(`Чат недоступен: ${error.message}`, { error: true }));
  }

  addChat(text) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    const line = document.createElement('div');
    line.textContent = text;
    box.append(line);
    while (box.children.length > 8) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }

  async leaveRoom(markOffline = false) {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    if (this.db && this.roomId) {
      await remove(ref(this.db, `minecraft_game/rooms/${this.roomId}/players/${this.uid}`)).catch(() => {});
      await update(ref(this.db, `minecraft_game/players/${this.uid}`), { room: '' }).catch(() => {});
      await update(ref(this.db, `minecraft_game/users/${this.uid}`), { room: '', online: true, ts: Date.now() }).catch(() => {});
    }
    this.roomId = null;
    this.isHost = false;
    this.remotePlayers.clear();
    this.pendingBlocks.clear();
    document.getElementById('hud-room')?.classList.add('hidden');
    if (markOffline && this.db) {
      await update(ref(this.db, `minecraft_game/players/${this.uid}`), { online: false, room: '' }).catch(() => {});
    }
  }
}
