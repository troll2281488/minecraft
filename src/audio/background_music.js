/**
 * Built-in calm soundtrack plus optional player playlist.
 * Tracks are intentionally sparse: a short delay after entering a world,
 * then a quiet interval between complete tracks.
 */
const DB='donorcraft-resource-packs', STORE='archives', KEY='background-music';
const MUSIC_ROOT = new URL('../../assets/audio/music/', import.meta.url);
const FIRST_TRACK_MIN=20_000, FIRST_TRACK_MAX=45_000;
const TRACK_GAP_MIN=120_000, TRACK_GAP_MAX=240_000;
const randomBetween=(min,max)=>Math.floor(min+Math.random()*(max-min+1));

function openDB(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(new Error('IndexedDB недоступен'));return;}const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Не удалось открыть хранилище музыки'));});}
async function saveTracks(files){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(files.map(file=>({name:file.name,type:file.type,blob:file})),KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function readTracks(){const db=await openDB();try{return await new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}finally{db.close();}}
async function deleteTracks(){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function readBuiltinTracks(){
 try{
  const response=await fetch(new URL('manifest.json',MUSIC_ROOT));
  if(!response.ok)throw new Error('Встроенный музыкальный список недоступен');
  const manifest=await response.json();
  return (manifest.tracks||[]).filter(track=>track?.file).map(track=>({
   name:track.name||track.file,
   src:new URL(track.file,MUSIC_ROOT).href,
   builtin:true,
  }));
 }catch(error){console.warn('[music] Не удалось загрузить встроенный плейлист:',error);return [];}
}

export class BackgroundMusic{
 constructor(){
  this.audio=typeof Audio!=='undefined'?new Audio():null;
  this.audio?.setAttribute('preload','metadata');
  if(this.audio){this.audio.loop=false;this.audio.volume=.22;this.audio.addEventListener('ended',()=>this._queueNext());}
  this.tracks=[];this.urls=[];this.builtinTracks=[];this.index=-1;this.active=false;this.loading=null;
  this.timer=null;this.playbackDue=false;
  this.retryHandler=()=>{if(this.active&&this.playbackDue)this._tryPlay();};
 }
 async restore(){
  if(this.tracks.length)return this.tracks.length;
  if(this.loading)return this.loading;
  this.loading=(async()=>{
   const [saved,builtin]=await Promise.all([readTracks(),readBuiltinTracks()]);
   this.builtinTracks=builtin;
   this._setTracks([...saved,...builtin]);
   return this.tracks.length;
  })();
  try{return await this.loading;}finally{this.loading=null;}
 }
 _setTracks(items){
  for(const url of this.urls)if(url.startsWith('blob:'))URL.revokeObjectURL(url);
  this.urls=[];
  this.tracks=(items||[]).filter(x=>x?.blob instanceof Blob||typeof x?.src==='string');
  this.urls=this.tracks.map(x=>x.blob instanceof Blob?URL.createObjectURL(x.blob):x.src);
  if(this.index>=this.tracks.length)this.index=-1;
 }
 async importFiles(fileList){
  const files=[...fileList].filter(f=>/\.(ogg|mp3|wav|m4a|aac|flac)$/i.test(f.name));
  if(!files.length)throw new Error('Не найдены аудиофайлы OGG, MP3, WAV, M4A, AAC или FLAC');
  const previous=await readTracks();
  const merged=[...previous,...files.map(blob=>({name:blob.name,type:blob.type,blob}))];
  await saveTracks(merged);
  this._setTracks([...merged,...this.builtinTracks]);
  if(this.active)this._schedule(randomBetween(FIRST_TRACK_MIN,FIRST_TRACK_MAX),true);
  return{count:files.length,total:this.tracks.length};
 }
 async start(){
  if(!this.audio)return false;
  this.active=true;await this.restore();
  if(!this.tracks.length)return false;
  if(this.index<0)this.index=Math.floor(Math.random()*this.tracks.length);
  if(!this.timer&&!this.playbackDue)this._schedule(randomBetween(FIRST_TRACK_MIN,FIRST_TRACK_MAX),true);
  return true;
 }
 _schedule(delay,chooseTrack=false){
  clearTimeout(this.timer);this.timer=null;this.playbackDue=false;
  this.audio?.pause();
  if(!this.active||!this.tracks.length)return;
  if(chooseTrack&&this.tracks.length>1){
   let next=this.index;
   while(next===this.index)next=Math.floor(Math.random()*this.tracks.length);
   this.index=next;
  }
  this.timer=setTimeout(()=>{this.timer=null;this.playbackDue=true;this._tryPlay();},delay);
 }
 _tryPlay(){
  if(!this.active||!this.playbackDue||!this.audio||!this.tracks.length)return false;
  if(this.index<0)this.index=0;
  this.audio.src=this.urls[this.index];
  this.audio.play().then(()=>{
   this.playbackDue=false;
   document.removeEventListener('pointerdown',this.retryHandler);
   document.removeEventListener('keydown',this.retryHandler);
  }).catch(()=>{
   document.addEventListener('pointerdown',this.retryHandler,{once:true});
   document.addEventListener('keydown',this.retryHandler,{once:true});
  });
  return true;
 }
 _queueNext(){if(this.active&&this.tracks.length)this._schedule(randomBetween(TRACK_GAP_MIN,TRACK_GAP_MAX),true);}
 _playIndex(index){if(!this.tracks.length)return;this.index=(index+this.tracks.length)%this.tracks.length;this._schedule(0,false);}
 stop(){
  this.active=false;this.playbackDue=false;clearTimeout(this.timer);this.timer=null;
  this.audio?.pause();
  document.removeEventListener('pointerdown',this.retryHandler);
  document.removeEventListener('keydown',this.retryHandler);
 }
 setVolume(value){if(this.audio)this.audio.volume=Math.max(0,Math.min(1,Number(value)||0));}
 async clear(){this.stop();await deleteTracks();this._setTracks(this.builtinTracks);this.index=-1;}
 get count(){return this.tracks.length;}
 get currentName(){return this.tracks[this.index]?.name||'';}
}
