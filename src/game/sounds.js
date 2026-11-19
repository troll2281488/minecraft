/**
 * Small procedural sound bank. Audio is created only after the first player
 * gesture, so browsers never block game startup because of autoplay policy.
 */
export class GameSounds {
  constructor() { this.context = null; this.lastStep = 0; }
  _ctx() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return null;
    if (!this.context) this.context = new Audio();
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    return this.context;
  }
  play(kind, material = 'stone') {
    const c = this._ctx();
    if (!c) return;
    const now = c.currentTime;
    const gain = c.createGain();
    gain.connect(c.destination);
    const presets = {
      break: { f: material === 'wood' ? 150 : material === 'grass' ? 260 : 190, d: .13, type: 'square' },
      place: { f: material === 'wood' ? 210 : 320, d: .075, type: 'triangle' },
      hit: { f: 105, d: .09, type: 'sawtooth' },
      hurt: { f: 78, d: .16, type: 'triangle' },
      pickup: { f: 620, d: .12, type: 'sine' },
      step: { f: material === 'wood' ? 105 : material === 'grass' ? 145 : 120, d: .045, type: 'triangle' },
      equip: { f: 440, d: .10, type: 'sine' },
      cast: { f: 520, d: .12, type: 'triangle' },
      reel: { f: 360, d: .10, type: 'triangle' },
      bite: { f: 880, d: .08, type: 'sine' },
      catch: { f: 740, d: .16, type: 'sine' },
    };
    const p = presets[kind] || presets.hit;
    const osc = c.createOscillator();
    osc.type = p.type;
    osc.frequency.setValueAtTime(p.f, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, p.f * .55), now + p.d);
    gain.gain.setValueAtTime(kind === 'step' ? .035 : .075, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + p.d);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + p.d + .01);
  }
  step(material) {
    const now = globalThis.performance?.now?.() ?? 0;
    if (now - this.lastStep < 260) return;
    this.lastStep = now;
    this.play('step', material);
  }
}
