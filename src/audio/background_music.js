/**
 * Local background music playlist. Audio files are supplied by the player and
 * kept in IndexedDB; no copyrighted game soundtrack is bundled with the app.
 */
const DB='donorcraft-resource-packs', STORE='archives', KEY='background-music';
function openDB(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(new Error('IndexedDB недоступен'));return;}const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Не удалось открыть хранилище музыки'));});}
async function saveTracks(files){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(files.map(file=>({name:file.name,type:file.type,blob:file})),KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function readTracks(){const db=await openDB();try{return await new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}finally{db.close();}}
async function deleteTracks(){const db=await openDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
export class BackgroundMusic{
 constructor(){this.audio=typeof Audio!=='undefined'?new Audio():null;this.audio?.setAttribute('preload','metadata');if(this.audio){this.audio.loop=false;this.audio.volume=.22;this.audio.addEventListener('ended',()=>this._next());}this.tracks=[];this.urls=[];this.index=-1;this.active=false;this.loading=null;this.retryHandler=()=>this._tryPlay();}
 async restore(){if(this.tracks.length)return this.tracks.length;if(this.loading)return this.loading;this.loading=(async()=>{const saved=await readTracks();this._setTracks(saved);return this.tracks.length;})();try{return await this.loading;}finally{this.loading=null;}}
 _setTracks(items){for(const url of this.urls)URL.revokeObjectURL(url);this.urls=[];this.tracks=(items||[]).filter(x=>x?.blob instanceof Blob);this.urls=this.tracks.map(x=>URL.createObjectURL(x.blob));if(this.index>=this.tracks.length)this.index=-1;}
 async importFiles(fileList){const files=[...fileList].filter(f=>/\.(ogg|mp3|wav|m4a|aac|flac)$/i.test(f.name));if(!files.length)throw new Error('Не найдены аудиофайлы OGG, MP3, WAV, M4A, AAC или FLAC');const previous=await readTracks();const merged=[...previous,...files.map(blob=>({name:blob.name,type:blob.type,blob}))];await saveTracks(merged);this._setTracks(merged);if(this.active)this._playIndex(0);return{count:files.length,total:this.tracks.length};}
 async start(){if(!this.audio)return false;this.active=true;await this.restore();if(!this.tracks.length)return false;document.removeEventListener('pointerdown',this.retryHandler);document.removeEventListener('keydown',this.retryHandler);document.addEventListener('pointerdown',this.retryHandler,{once:true});document.addEventListener('keydown',this.retryHandler,{once:true});if(this.index<0)this.index=Math.floor(Math.random()*this.tracks.length);return this._tryPlay();}
 _tryPlay(){if(!this.active||!this.audio||!this.tracks.length)return false;if(this.index<0)this.index=0;this.audio.src=this.urls[this.index];this.audio.play().then(()=>{document.removeEventListener('pointerdown',this.retryHandler);document.removeEventListener('keydown',this.retryHandler);}).catch(()=>{});return true;}
 _playIndex(index){if(!this.tracks.length)return;this.index=(index+this.tracks.length)%this.tracks.length;this._tryPlay();}
 _next(){if(this.active&&this.tracks.length)this._playIndex((this.index+1)%this.tracks.length);}
 stop(){this.active=false;this.audio?.pause();document.removeEventListener('pointerdown',this.retryHandler);document.removeEventListener('keydown',this.retryHandler);}
 setVolume(value){if(this.audio)this.audio.volume=Math.max(0,Math.min(1,Number(value)||0));}
 async clear(){this.stop();await deleteTracks();this._setTracks([]);this.index=-1;}
 get count(){return this.tracks.length;}
 get currentName(){return this.tracks[this.index]?.name||'';}
}