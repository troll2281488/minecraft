// Cinematic title panorama: a softly orbiting camera over a continuous voxel-world landscape.
// This is a menu-only scene; it never allocates or mutates gameplay chunks.
const canvas = document.getElementById('title-world-bg');
if (canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let width = 0, height = 0, time = 0, last = 0;
  const trees = Array.from({ length: 25 }, (_, i) => ({
    x: ((i * 173) % 1900) - 950,
    depth: 0.22 + ((i * 37) % 70) / 100,
    size: 0.65 + ((i * 19) % 70) / 100,
    pine: i % 3 !== 0,
  }));
  const clouds = Array.from({ length: 7 }, (_, i) => ({
    x: (i * 257) % 1500, y: 0.12 + (i % 3) * 0.085, scale: 0.65 + (i % 4) * 0.16,
  }));
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth; height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function path(points, fill) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  function hill(y, amp, phase, color) {
    ctx.beginPath(); ctx.moveTo(0, height);
    for (let x = 0; x <= width + 8; x += 8) {
      const nx = x / width;
      const yy = y + Math.sin(nx * 7.2 + phase) * amp + Math.sin(nx * 15 + phase * 1.7) * amp * .23;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(width, height); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function tree(x, ground, scale, pine, far) {
    const s = scale * (0.55 + far * .6);
    ctx.save(); ctx.translate(x, ground); ctx.scale(s, s);
    ctx.fillStyle = '#503b2b'; ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(-5,-72); ctx.lineTo(5,-72); ctx.lineTo(9,0); ctx.fill();
    ctx.fillStyle = '#73513a'; ctx.fillRect(-3,-68,3,55);
    if (pine) {
      for (let i=0;i<4;i++) {
        const y=-130+i*24, half=39-i*5;
        path([[-half,y+35],[0,y-25],[half,y+35]], ['#244d32','#2d6239','#347344','#3d8047'][i]);
        ctx.fillStyle='rgba(145,185,103,.12)'; ctx.fillRect(-half*.5,y+7,half*.5,3);
      }
    } else {
      const blobs=[[-23,-92,31], [12,-104,35],[-5,-132,32],[30,-80,26],[-34,-72,25]];
      for (let i=0;i<blobs.length;i++) {
        const [bx,by,r]=blobs[i];
        ctx.beginPath();ctx.arc(bx,by,r,0,Math.PI*2);ctx.fillStyle=['#28603a','#347947','#3d8748','#2e6d3e','#43864b'][i];ctx.fill();
      }
      ctx.fillStyle='rgba(180,205,116,.15)';ctx.beginPath();ctx.arc(-10,-130,14,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function draw(now) {
    requestAnimationFrame(draw);
    if (canvas.style.display === 'none') return;
    const dt = last ? Math.min(.05,(now-last)/1000) : 0; last=now; time += dt;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.max(1,Math.floor(canvas.clientWidth*d)) || canvas.height !== Math.max(1,Math.floor(canvas.clientHeight*d))) resize();
    const w=width,h=height, orbit=Math.sin(time*.075), drift=time*8;
    const sky=ctx.createLinearGradient(0,0,0,h);
    sky.addColorStop(0,'#579bd0'); sky.addColorStop(.48,'#a9d5df'); sky.addColorStop(1,'#e6d8ad');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const sunX=w*(.76+orbit*.035),sunY=h*.19;
    const glow=ctx.createRadialGradient(sunX,sunY,4,sunX,sunY,Math.max(w,h)*.34);
    glow.addColorStop(0,'rgba(255,238,177,.38)');glow.addColorStop(1,'rgba(255,238,177,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#fff0bc';ctx.beginPath();ctx.arc(sunX,sunY,Math.max(17,h*.027),0,Math.PI*2);ctx.fill();
    for(const c of clouds){
      const x=((c.x-drift*.22)%(w+240)+w+240)%(w+240)-120;
      const y=c.y*h;
      ctx.save();ctx.translate(x,y);ctx.scale(c.scale, c.scale*.58);
      ctx.fillStyle='rgba(246,249,238,.46)';
      for(const p of [[0,0,31],[27,-8,26],[53,0,34],[79,4,24]]){ctx.beginPath();ctx.arc(p[0],p[1],p[2],0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
    hill(h*.49,h*.055,1.2,'#789d8b');
    hill(h*.55,h*.07,3.4,'#527b69');
    // Distant ridgelines and a forest valley give the camera a real landscape horizon.
    hill(h*.62,h*.055,5.1,'#385e4b');
    const lakeY=h*.72;
    ctx.beginPath();ctx.moveTo(w*.31,lakeY);ctx.bezierCurveTo(w*.42,h*.65,w*.65,h*.68,w*.82,h*.76);ctx.lineTo(w*.95,h*.88);ctx.lineTo(w*.2,h*.86);ctx.closePath();
    const water=ctx.createLinearGradient(0,lakeY,0,h*.9);water.addColorStop(0,'#639c9b');water.addColorStop(1,'#315e5c');ctx.fillStyle=water;ctx.fill();
    for(let i=0;i<18;i++){const yy=lakeY+12+i*5;const xx=w*(.39+((i*17)%40)/100);ctx.strokeStyle='rgba(218,231,190,'+(0.16-i*.006)+')';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx+w*(.04+(i%4)*.018),yy+Math.sin(time+i)*1.5);ctx.stroke();}
    // Camera orbit shifts the foreground independently from the distant hills.
    const sorted=trees.slice().sort((a,b)=>a.depth-b.depth);
    for(const tr of sorted){
      const x=((tr.x + orbit*150*tr.depth - drift*(.03+tr.depth*.08))%(w+260)+w+260)%(w+260)-130;
      const ground=h*(.69+tr.depth*.23)+Math.sin((x/w)*5+time*.05)*h*.018;
      tree(x,ground,tr.size*(.72+tr.depth*.55),tr.pine,tr.depth);
    }
    // Foreground rolling meadow: continuous surfaces, grass tufts, stones and flowers.
    ctx.beginPath();ctx.moveTo(0,h*.79);
    for(let x=0;x<=w+4;x+=4){const y=h*(.82+Math.sin(x/w*5+orbit*.4)*.035+Math.sin(x/w*11+1)*.012);ctx.lineTo(x,y);}
    ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();
    const meadow=ctx.createLinearGradient(0,h*.78,0,h);meadow.addColorStop(0,'#63934b');meadow.addColorStop(.35,'#47753b');meadow.addColorStop(1,'#263f2d');ctx.fillStyle=meadow;ctx.fill();
    for(let i=0;i<150;i++){
      const x=((i*83+drift*1.5)%(w+20))-10;
      const y=h*(.84+((i*29)%15)/100);
      const len=3+(i%5)*1.5;
      ctx.strokeStyle=i%3?'rgba(172,197,103,.55)':'rgba(218,203,125,.72)';
      ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2+(i%5),y-len);ctx.stroke();
      if(i%13===0){ctx.fillStyle='#e8d58a';ctx.beginPath();ctx.arc(x,y-len,2.2,0,Math.PI*2);ctx.fill();}
    }
    for(let i=0;i<12;i++){
      const x=((i*137+orbit*45)%(w+40))-20,y=h*(.88+((i*11)%8)/100),r=3+(i%4)*2;
      ctx.fillStyle='#716e62';ctx.beginPath();ctx.ellipse(x,y,r*1.5,r*.7,-.2,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(210,208,174,.3)';ctx.beginPath();ctx.ellipse(x-r*.3,y-r*.2,r*.6,r*.22,-.2,0,Math.PI*2);ctx.fill();
    }
    // Soft vignette and subtle film grain-like scanlines.
    const vignette=ctx.createRadialGradient(w*.53,h*.48,Math.min(w,h)*.22,w*.5,h*.5,Math.max(w,h)*.72);
    vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(8,17,13,.38)');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  }
  resize();window.addEventListener('resize',resize,{passive:true});requestAnimationFrame(draw);
}
