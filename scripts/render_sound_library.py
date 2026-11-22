#!/usr/bin/env python3
"""Generate Donorcraft's original procedural WAV sound library (stdlib only).
The files are synthesized by this project; they are not Minecraft recordings.
"""
import math, os, random, struct, wave, zipfile

RATE = 22050
OUT = os.path.join('assets', 'sound_library')
random.seed(1)

class Buf:
    def __init__(self, dur):
        self.n=int(RATE*dur)+1
        self.s=[0.0]*self.n
    def tone(self,f0,f1,dur,gain,wave='triangle',when=0.0):
        start=int(when*RATE); n=int(dur*RATE); phase=0.0
        for i in range(n):
            k=start+i
            if k>=self.n: break
            t=i/max(1,n); f=f0*(f1/f0)**t; phase+=f/RATE; p=phase%1.0
            v=math.sin(2*math.pi*p) if wave=='sine' else 4*abs(p-.5)-1
            attack=min(1.0,i/(.012*RATE+1)); env=attack*(.0008)**t
            self.s[k]+=v*gain*env
    def noise(self,dur,gain,cutoff=2000.0,when=0.0):
        start=int(when*RATE); n=int(dur*RATE)
        a=1-math.exp(-2*math.pi*cutoff/RATE); y=0.0
        for i in range(n):
            k=start+i
            if k>=self.n: break
            y+=a*(random.uniform(-1,1)-y)
            self.s[k]+=y*3.0*gain*(.0008)**(i/max(1,n))
    def save(self,path):
        peak=max(1e-9,max(abs(x) for x in self.s)); scale=.8/peak
        with wave.open(path,'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes(b''.join(struct.pack('<h',int(max(-1,min(1,x*scale))*32767)) for x in self.s))

def recipe(name):
    def new(d): return Buf(d)
    if name=='block_break_stone': b=new(.16); b.noise(.06,.5,2800); b.tone(420,336,.12,.10)
    elif name=='block_break_wood': b=new(.16); b.noise(.06,.5,1500); b.tone(300,240,.12,.10)
    elif name=='block_break_grass': b=new(.18); b.noise(.08,.5,900); b.tone(220,180,.12,.08)
    elif name=='block_break_sand': b=new(.2); b.noise(.12,.4,3600)
    elif name=='block_place': b=new(.12); b.noise(.05,.35,2200)
    elif name=='step_stone': b=new(.1); b.noise(.07,.18,1700); b.tone(252,210,.06,.05,'sine')
    elif name=='step_wood': b=new(.1); b.noise(.07,.18,900); b.tone(180,150,.06,.05,'sine')
    elif name=='step_grass': b=new(.1); b.noise(.07,.18,600); b.tone(132,110,.06,.05,'sine')
    elif name=='step_sand': b=new(.1); b.noise(.09,.14,2400)
    elif name=='block_hit': b=new(.1); b.noise(.05,.2,2000); b.tone(294,252,.07,.14,'sine')
    elif name=='player_hurt': b=new(.25); b.tone(520,430,.16,.16); b.tone(260,220,.18,.08,'sine')
    elif name=='mob_hurt': b=new(.2); b.tone(330,270,.12,.14)
    elif name=='mob_death': b=new(.35); b.tone(392,262,.30,.14)
    elif name=='item_pickup': b=new(.25); b.tone(740,1180,.09,.16,'sine'); b.tone(1180,1480,.09,.14,'sine',.07)
    elif name=='xp_orb': b=new(.15); b.tone(940,1040,.1,.10,'sine')
    elif name=='item_drop': b=new(.12); b.noise(.06,.2,2000); b.tone(250,200,.08,.08)
    elif name=='level_up':
        b=new(.9)
        for i,f in enumerate([660,830,990,1320]): b.tone(f,f,.2,.14,'sine',i*.08)
    elif name=='equip': b=new(.15); b.noise(.12,.14,2500)
    elif name=='eat': b=new(.3); b.noise(.06,.14,1200); b.noise(.06,.12,1200,.1); b.tone(300,260,.08,.05,'sine')
    elif name=='bow_shoot': b=new(.2); b.noise(.12,.14,900); b.tone(330,520,.12,.07)
    elif name=='arrow_hit': b=new(.12); b.noise(.06,.2,1800); b.tone(300,220,.06,.08)
    elif name=='explosion': b=new(.8); b.noise(.6,.4,500); b.tone(90,45,.5,.25,'sine')
    elif name=='thunder': b=new(2.0); b.noise(1.6,.3,300); b.tone(60,40,1.2,.12,'sine')
    elif name=='water_splash': b=new(.3); b.noise(.22,.15,1400)
    elif name=='door_open': b=new(.25); b.noise(.06,.25,1000); b.tone(200,170,.12,.10)
    elif name=='chest_open': b=new(.25); b.noise(.06,.25,1000); b.tone(200,170,.12,.10)
    elif name=='fishing_cast': b=new(.3); b.noise(.22,.12,700); b.tone(520,330,.22,.08,'sine')
    elif name=='fishing_bite': b=new(.15); b.tone(880,988,.08,.14,'sine')
    elif name=='fishing_catch': b=new(.25); b.tone(740,1480,.16,.14,'sine')
    elif name=='villager_trade': b=new(.3); b.tone(590,590,.11,.14,'sine'); b.tone(880,880,.12,.12,'sine',.08)
    elif name=='ui_click': b=new(.06); b.tone(1200,900,.03,.06,'sine')
    elif name=='ui_toast': b=new(.2); b.tone(720,720,.1,.10,'sine')
    elif name=='note_block': b=new(.7); b.tone(660,660,.6,.16,'sine')
    elif name=='cow_ambient': b=new(.5); b.tone(190,230,.3,.10,'sine'); b.tone(230,200,.25,.07,'sine',.25)
    elif name=='pig_ambient': b=new(.35); b.tone(320,300,.12,.10); b.tone(300,280,.12,.09,'triangle',.14)
    elif name=='sheep_ambient': b=new(.4); b.tone(520,560,.14,.09,'sine'); b.tone(560,500,.14,.07,'sine',.18)
    elif name=='chicken_ambient':
        b=new(.3)
        for i in range(3): b.tone(820,960,.05,.08,'sine',i*.07)
    elif name=='horse_ambient': b=new(.5); b.tone(340,380,.3,.08); b.tone(380,330,.2,.06,'triangle',.3)
    elif name=='rabbit_ambient':
        b=new(.25)
        for i in range(2): b.tone(640,720,.05,.07,'sine',i*.09)
    elif name=='villager_ambient': b=new(.4); b.tone(380,420,.15,.09,'triangle'); b.tone(420,380,.15,.08,'triangle',.18)
    elif name=='cat_ambient': b=new(.4); b.tone(700,900,.15,.08,'sine'); b.tone(900,760,.18,.07,'sine',.2)
    elif name=='bee_ambient': b=new(.6); b.noise(.6,.10,2500)
    elif name=='zombie_ambient': b=new(.5); b.tone(170,150,.3,.09,'triangle'); b.noise(.3,.05,500)
    elif name=='skeleton_ambient': b=new(.35); b.noise(.15,.12,3000); b.tone(300,260,.12,.07,'sine')
    elif name=='creeper_fuse': b=new(1.0); b.tone(260,300,.9,.07,'sine')
    elif name=='spider_ambient': b=new(.3); b.tone(240,200,.12,.07,'triangle'); b.noise(.1,.08,2800,.1)
    elif name=='wolf_ambient': b=new(.5); b.tone(420,480,.25,.08,'sine'); b.tone(480,420,.2,.06,'sine',.27)
    elif name=='ender_pearl_throw': b=new(.3); b.tone(400,800,.2,.08,'sine'); b.noise(.15,.08,1200)
    elif name=='portal_ambient': b=new(1.2); b.noise(1.0,.06,900); b.tone(120,150,1.0,.05,'sine')
    else: return None
    return b

NAMES = [
 'block_break_stone','block_break_wood','block_break_grass','block_break_sand','block_place',
 'step_stone','step_wood','step_grass','step_sand','block_hit',
 'player_hurt','mob_hurt','mob_death','item_pickup','xp_orb','item_drop','level_up','equip','eat',
 'bow_shoot','arrow_hit','explosion','thunder','water_splash','door_open','chest_open',
 'fishing_cast','fishing_bite','fishing_catch','villager_trade','ui_click','ui_toast','note_block',
 'cow_ambient','pig_ambient','sheep_ambient','chicken_ambient','horse_ambient','rabbit_ambient',
 'villager_ambient','cat_ambient','bee_ambient','zombie_ambient','skeleton_ambient','creeper_fuse',
 'spider_ambient','wolf_ambient','ender_pearl_throw','portal_ambient',
]
def main():
    os.makedirs(OUT,exist_ok=True); written=[]
    for name in NAMES:
        audio=recipe(name)
        if audio is None: continue
        path=os.path.join(OUT,name+'.wav'); audio.save(path); written.append(path)
    with zipfile.ZipFile(os.path.join('assets','sound_library.zip'),'w',zipfile.ZIP_DEFLATED) as archive:
        for path in written: archive.write(path,os.path.basename(path))
        archive.writestr('README.txt','Original synthesized project audio, not Minecraft recordings.\\n')
    print(f'Generated {len(written)} WAV sound effects.')
if __name__=='__main__': main()
