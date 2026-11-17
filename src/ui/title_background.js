const canvas=document.getElementById('title-world-bg');
if(canvas){
 const ctx=canvas.getContext('2d');let w=0,h=0,t=0;
 const cells=[];
 for(let z=-8;z<=8;z++)for(let x=-8;x<=8;x++)cells.push({x,z,y:Math.max(0,Math.round(1.3+1.5*Math.sin(x*.48)*Math.cos(z*.37)+.8*Math.sin((x+z)*.31)))});
 const trees=[[-5,-3],[-2,4],[4,-5],[6,2],[1,6],[-7,3]];
 function resize(){const d=Math.min(devicePixelRatio||1,2);w=canvas.clientWidth;h=canvas.clientHeight;canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);}
 function p(x,y,z,a,cy,s){const X=x*Math.cos(a)-z*Math.sin(a),Z=x*Math.sin(a)+z*Math.cos(a),d=Z+24,f=s*19;return{x:w/2+X*f/d,y:h*.58+(cy-y)*f/d,d};}
 function poly(v,c){ctx.beginPath();v.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();ctx.fillStyle=c;ctx.fill();ctx.strokeStyle='rgba(20,35,20,.2)';ctx.stroke();}
 function draw(){
  t+=1/60;const d=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(canvas.clientWidth*d)||canvas.height!==Math.round(canvas.clientHeight*d))resize();
  const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#65b5ec');sky.addColorStop(.65,'#c0e7f3');sky.addColorStop(1,'#d5e7c2');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#fff0a0';ctx.fillRect(w*.78,h*.13,52,52);
  for(let i=0;i<9;i++){const x=((i*137-t*8)%(w+180))-90,y=h*.43+(i%3)*13;ctx.fillStyle=['#7fae83','#6f9e75','#8db78a'][i%3];ctx.fillRect(x,y,170,h-y);}
  const a=t*.12,s=Math.min(w,h)/24,cy=8.5+Math.sin(t*.22)*.25,items=[];
  for(const {x,z,y} of cells){
   const A=p(x,y,z,a,cy,s),B=p(x+1,y,z,a,cy,s),C=p(x+1,y,z+1,a,cy,s),D=p(x,y,z+1,a,cy,s);
   const F=p(x+1,y-1,z,a,cy,s),G=p(x+1,y-1,z+1,a,cy,s),Q=p(x,y-1,z+1,a,cy,s);
   items.push({d:(A.d+B.d+C.d+D.d)/4,fn:()=>{poly([A,B,C,D],'#68a94b');poly([D,C,G,Q],'#795536');poly([B,C,G,F],'#5e442d');}});
  }
  for(const [x,z] of trees){const y=cells.find(v=>v.x===x&&v.z===z)?.y||2,P=p(x+.5,y,z+.5,a,cy,s),T=p(x+.5,y+3,z+.5,a,cy,s),r=Math.max(5,s*25/P.d);items.push({d:P.d,fn:()=>{ctx.fillStyle='#76502f';ctx.fillRect(P.x-r*.18,P.y,r*.36,T.y-P.y);ctx.fillStyle='#286b35';ctx.fillRect(T.x-r,T.y-r*.6,r*2,r*1.2);ctx.fillStyle='#388747';ctx.fillRect(T.x-r*.7,T.y-r*1.35,r*1.4,r*.85);}});}
  items.sort((u,v)=>v.d-u.d).forEach(v=>v.fn());requestAnimationFrame(draw);
 }
 resize();addEventListener('resize',resize,{passive:true});requestAnimationFrame(draw);
}