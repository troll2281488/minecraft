import { BedrockSoundPack } from '../audio/bedrock_sound_pack.js';
/**
 * Original procedural sound events. AudioContext is created lazily after a user
 * gesture; these synthesized cues are not recordings from Minecraft.
 */
export const SOUND_EVENTS = Object.freeze({
  'block.break':'break','block.place':'place','block.hit':'hit','block.step':'step',
  'block.door.open':'doorOpen','block.door.close':'doorClose',
  'block.chest.open':'chestOpen','block.chest.close':'chestClose',
  'block.furnace.start':'furnace','block.note':'note',
  'entity.player.hurt':'hurt','entity.player.levelup':'levelup',
  'entity.item.pickup':'pickup','entity.item.drop':'drop','entity.experience_orb.pickup':'xp',
  'entity.arrow.shoot':'shoot','entity.arrow.hit':'arrowHit',
  'entity.generic.explode':'explode','entity.mob.ambient':'ambient',
  'entity.mob.hurt':'mobHurt','entity.mob.death':'mobDeath',
  'entity.villager.trade':'trade','item.equip':'equip','item.cast':'cast',
  'item.reel':'reel','item.fishing.bite':'bite','item.fishing.catch':'catch',
  'item.eat':'eat','item.goat_horn':'goatHorn',
  'weather.rain':'rain','weather.thunder':'thunder',
  'fluid.water':'water','fluid.lava':'lava','ui.click':'click','ui.toast':'toast',
});
export const SOUND_PRESETS = Object.freeze({
  break:{f:190,d:.13,type:'square',volume:.075}, place:{f:320,d:.075,type:'triangle',volume:.07},
  hit:{f:105,d:.09,type:'sawtooth',volume:.075}, hurt:{f:78,d:.16,type:'triangle',volume:.085},
  pickup:{f:620,d:.12,type:'sine',volume:.065}, xp:{f:940,d:.10,type:'sine',volume:.045}, drop:{f:250,d:.08,type:'triangle',volume:.06},
  step:{f:120,d:.045,type:'triangle',volume:.035}, equip:{f:440,d:.10,type:'sine',volume:.06},
  cast:{f:520,d:.12,type:'triangle',volume:.065}, reel:{f:360,d:.10,type:'triangle',volume:.06},
  eat:{f:540,d:.08,type:'triangle',volume:.045}, goatHorn:{f:185,d:.72,type:'sawtooth',volume:.075},
  bite:{f:880,d:.08,type:'sine',volume:.07}, catch:{f:740,d:.16,type:'sine',volume:.07},
  doorOpen:{f:165,d:.22,type:'square',volume:.055}, doorClose:{f:125,d:.19,type:'square',volume:.055},
  chestOpen:{f:235,d:.16,type:'triangle',volume:.055}, chestClose:{f:175,d:.14,type:'triangle',volume:.055},
  furnace:{f:95,d:.28,type:'sawtooth',volume:.035}, note:{f:660,d:.24,type:'sine',volume:.065},
  levelup:{f:880,d:.34,type:'sine',volume:.075}, shoot:{f:420,d:.075,type:'sawtooth',volume:.055},
  arrowHit:{f:145,d:.065,type:'triangle',volume:.06}, explode:{f:52,d:.42,type:'sawtooth',volume:.12},
  ambient:{f:185,d:.32,type:'sine',volume:.025}, mobHurt:{f:115,d:.19,type:'triangle',volume:.065},
  mobDeath:{f:82,d:.28,type:'sawtooth',volume:.07}, trade:{f:590,d:.11,type:'sine',volume:.06},
  rain:{f:310,d:.09,type:'triangle',volume:.018}, thunder:{f:48,d:.65,type:'sawtooth',volume:.09},
  water:{f:230,d:.18,type:'sine',volume:.025}, lava:{f:72,d:.24,type:'sawtooth',volume:.03},
  click:{f:520,d:.035,type:'square',volume:.035}, toast:{f:720,d:.10,type:'sine',volume:.045},
});
const MATERIAL_PITCH = Object.freeze({wood:.78,grass:1.28,stone:1,sand:.92,metal:1.55,glass:1.8});

export function noteBlockFrequency(note) {
  const pitch = Math.max(0, Math.min(24, Math.floor(Number(note) || 0)));
  return 440 * Math.pow(2, (pitch - 12) / 12);
}
export class GameSounds {
  constructor(){this.context=null;this.lastStep=0;this.enabled=true;this.masterVolume=1;this.bedrockPack=null;}
  async importBedrockPack(file){
    const context=this._ctx();
    if(!context)throw new Error('Web Audio недоступен в этом браузере');
    const pack=new BedrockSoundPack(context);
    const result=await pack.import(file);
    this.bedrockPack=pack;
    return result;
  }
  clearBedrockPack(){this.bedrockPack=null;}
  _ctx(){
    if(!this.enabled)return null;
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)return null;
    if(!this.context)this.context=new Audio();
    if(this.context.state==='suspended')this.context.resume().catch(()=>{});
    return this.context;
  }
  setEnabled(enabled){this.enabled=!!enabled;}
  setVolume(volume){this.masterVolume=Math.max(0,Math.min(1,Number(volume)||0));}
  playEvent(eventId,material='stone'){
    if(this.enabled&&this.bedrockPack?.play(eventId,this.masterVolume))return true;
    const kind=SOUND_EVENTS[eventId];
    if(!kind)return false;
    this.play(kind,material);
    return true;
  }
  play(kind,material='stone'){
    const c=this._ctx();if(!c)return;
    const p=SOUND_PRESETS[kind]||SOUND_PRESETS.hit;
    const now=c.currentTime,gain=c.createGain();
    gain.gain.setValueAtTime(p.volume*this.masterVolume,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+p.d);gain.connect(c.destination);
    const osc=c.createOscillator(),frequency=p.f*(MATERIAL_PITCH[material]||1);
    osc.type=p.type;osc.frequency.setValueAtTime(frequency,now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*.55),now+p.d);
    osc.connect(gain);osc.start(now);osc.stop(now+p.d+.015);
  }
  playNote(note, material = 'wood'){
    const c=this._ctx();if(!c)return false;
    const now=c.currentTime,gain=c.createGain(),osc=c.createOscillator();
    const instrument=material==='metal'?'square':material==='stone'||material==='sand'?'triangle':'sine';
    const frequency=noteBlockFrequency(note);
    gain.gain.setValueAtTime(.085*this.masterVolume,now);
    gain.gain.exponentialRampToValueAtTime(.001,now+.32);gain.connect(c.destination);
    osc.type=instrument;osc.frequency.setValueAtTime(frequency,now);
    osc.connect(gain);osc.start(now);osc.stop(now+.34);
    return true;
  }
  step(material){
    const now=globalThis.performance?.now?.()??0;
    if(now-this.lastStep<260)return;
    this.lastStep=now;this.play('step',material);
  }
}
