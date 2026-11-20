'use strict';
const $=id=>document.getElementById(id), c=$('lcd'), g=c.getContext('2d');
const labels=['MASTER','DRUM','BASS','KEYS','PAD','LEAD','PERC','FX','AUX'];
const cycles=[0,16,12,15,16,7,11,13,9]; // Demo pattern lengths in sixteenth-note steps.
const colors=['#e8d2ff','#ff8858','#c994ff','#87baff','#9de8a9','#ffcd76','#f49bbb','#90e1db','#b3b7ff'];
const parts=[['A',12],['B',12],['C',16],['D',12],['E',12]], total=64;
const patches=[[],['ACOUSTIC','808 BOOM','909 CLUB'],['SUB','FM BASS','PLUCK'],['TINE','ORGAN','PIANO'],['AIR','CLOUD','WARM'],['SOFT LEAD','SYNC','SAW'],['TOMS','SHAKER','CLAPS'],['SWEEP','NOISE','RING'],['INIT','BELLS','PLUCK']];
const master=[112,0,0,0], masterNames=['Темп','DJ-фильтр','Sidechain / Pump','Sync Delay / Echo'];
const mix=labels.map(()=>[80,0,0,0]), mixNames=['Громкость','Панорама L / R','Фильтр LPF / HPF','Reverb'];
const masterInk=['#ffcf78','#8dd9ff','#ffa2bf','#9ce9a5'];
const masterShort=['BPM','DJ FILTER','PUMP','ECHO'];
const knobView=labels.map(()=>0), touched=labels.map(()=>false);
const mixShort=['LEVEL','PAN','FILTER','REVERB'];
let songFocus=false, partPick=0;
const TRACK_Y=30, ROW_H=18, SONG_Y=199, SONG_H=17;
const locks=labels.map(()=>new Map());
let recording=-1,recHold=null,recHeld=false,clear=null;
const muted=labels.map(()=>false), patch=labels.map(()=>0), toggled=new Set();
let track=0,mode='song',zoom=false,position=0,transport='stop',last=performance.now(), hold=null, held=false;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
function text(s,x,y,col='#e7edf7',font=9){g.fillStyle=col;g.font=`600 ${font}px monospace`;g.textBaseline='middle';g.fillText(s,x,y);}
function rect(x,y,w,h,col){g.fillStyle=col;g.fillRect(x,y,w,h);}
function section(){let at=0;for(let i=0;i<parts.length;i++){const [name,n]=parts[i];if(position<at+n)return {i,name,n,at};at+=n;}return {i:0,name:'A',n:8,at:0};}
function events(t,i){return ((i*(t+3)+t*11)%17)<(t===1?10:4);}
function bipolar(v,left,right){return v===0?'0':(v<0?left:right)+' '+Math.abs(v)+'%';}
function value(i){const v=(track===0?master:mix[track])[i];return track===0?(i===0?v+' BPM':i===1?bipolar(v,'LPF','HPF'):v+'%'):(i===1?bipolar(v,'L','R'):i===2?bipolar(v,'LPF','HPF'):v+'%');}
function lockCount(t){return [...locks[t].values()].reduce((n,v)=>n+Object.keys(v).length,0);}
function turnKnob(i,sign){
 knobView[track]=i;touched[track]=true;
 const row=track===0?master:mix[track], tempo=track===0&&i===0, bipolarKnob=i===1||(track!==0&&i===2);
 row[i]=clamp(row[i]+sign*(tempo?1:5),tempo?30:bipolarKnob?-100:0,tempo?300:100);
 if(recording===track){const step=Math.floor(position*16), point=locks[track].get(step)||{};point[i]=row[i];locks[track].set(step,point);}
 sync();
}
// Draw step automation as it was recorded; a flat line means no changes.
function drawLocks(t,x,y,w,s){
 const selected=!songFocus&&track===t, k=knobView[t];
 const start=zoom?s.at:0,end=zoom?s.at+s.n:total;
 const norm=(i,v)=>{const lo=t===0&&i===0?30:i===1||(t>0&&i===2)?-100:0,hi=t===0&&i===0?300:100;return (v-lo)/(hi-lo);};
 const state=new Map(), points=[];
 for(const [step,p] of [...locks[t]].sort((a,b)=>a[0]-b[0])){
   if(selected){if(Object.hasOwn(p,k))points.push([step/16,norm(k,p[k])]);}
   else {for(const [i,v] of Object.entries(p))state.set(Number(i),norm(Number(i),v));if(state.size)points.push([step/16,[...state.values()].reduce((a,b)=>a+b,0)/state.size]);}
 }
 if(!points.length)return;
 const color=selected?masterInk[k]:'#9299a8',py=v=>y+13-Math.round(v*10),pos=bar=>x+Math.min(w-1,Math.floor((bar-start)*w/(end-start)));
 let previous=null,from=x;
 for(const [bar,v] of points){
   if(bar<start){previous=v;continue;}if(bar>=end)break;
   const to=pos(bar),b=py(v);
   if(previous!==null){const a=py(previous);if(to>from)rect(from,a,to-from,1,color);rect(to,Math.min(a,b),1,Math.abs(a-b)+1,color);}
   rect(to,b,Math.min(2,x+w-to),2,color);previous=v;from=to;
 }
 if(previous!==null)rect(from,py(previous),x+w-from,1,color);
}
function replacePart(dir){const opts='ABCDE';parts[partPick][0]=opts[(opts.indexOf(parts[partPick][0])+dir+5)%5];sync();}
function render(){
 rect(0,0,240,240,'#080c14');const s=section();
 rect(5,5,17,14,'#ff9b53');text(String(track+1),10,12,'#201123',10);text(transport==='play'?'▶':transport==='pause'?'Ⅱ':'■',27,12,'#bcb1ff',12);text(master[0]+' BPM',43,12);text(`PART ${s.name} · BAR ${Math.floor(position)+1}/${total}`,101,12,'#d6c6ff');rect(0,23,240,1,'#34415b');
 if(mode==='presets'){
  text('PRESETS / '+labels[track],7,35,'#bcb1ff',11);text('ENGINE',7,54,'#889ab1');text('PATCH',92,54,'#889ab1');rect(82,49,1,163,'#314261');
  labels.slice(1).forEach((l,i)=>text(l,7,68+i*17,track===i+1?'#ebdfff':'#8092aa'));
  patches[track].forEach((p,i)=>{if(i===patch[track])rect(88,60+i*21,146,19,'#503f78');text(p,93,69+i*21);});text('PRESETS: ВЫБОР',7,228,'#9bb0cd');return;
 }
 if(mode==='seq'){
  text('SEQ / '+labels[track],7,37,'#bcb1ff',11);text('16 STEP · DEMO',7,58,'#a7b6ce');
  for(let i=0;i<16;i++){const x=10+(i%4)*56,y=76+Math.floor(i/4)*33,has=events(track,i)!==toggled.has(track+':'+i);rect(x,y,51,28,has?colors[track]:'#233249');text(String(i+1),x+7,y+14,has?'#13101b':'#b7c4d9');}text('НАЖМИ НА ШАГ',7,226,'#9bb0cd');return;
 }
 const x=53,w=181;
 text('SONG',5,SONG_Y+8,songFocus?'#ffcf78':'#9bb0cd');let at=0;
 parts.forEach(([name,n],i)=>{const a=x+Math.floor(at*w/total), b=x+Math.floor((at+n)*w/total);rect(a,SONG_Y,b-a-1,SONG_H,songFocus&&i===partPick?'#ffcf78':i===s.i?'#a895eb':'#40355d');if(b-a>10)text(name,a+3,SONG_Y+8,(songFocus&&i===partPick)||i===s.i?'#120e22':'#eadfff',8);at+=n;});
 if(zoom)rect(x+Math.floor(position*w/total),SONG_Y-1,1,SONG_H+2,'#fff');
 labels.forEach((l,t)=>{const y=TRACK_Y+t*ROW_H,on=!songFocus&&track===t, color=muted[t]?'#68717d':colors[t];rect(3,y,234,16,on?'#343251':'#151e2d');if(on)rect(3,y,2,16,color);text(`${t+1} ${l}`,7,y+8,color,8);
  if(t===0){drawLocks(t,x,y,w,s);return;}
  if(zoom){
    const len=cycles[t],phase=Math.floor(position*16)%len;
    for(let i=0;i<len;i++){
     const xx=x+Math.floor(i*w/len);rect(xx,y+2,1,12,'#273246');
     if(i<16&&events(t,i)!==toggled.has(t+':'+i)){const ny=t===1?y+3:y+3+(i*(t+2))%9;rect(xx+2,ny,t===1?2:4,t===1?10:2,color);}
    }
    if(transport!=='stop')rect(x+Math.floor(phase*w/len),y+1,1,13,muted[t]?'#747d8c':'#f2f5ff');
  }
  else {let st=0;for(let i=0;i<parts.length;i++){const n=parts[i][1],a=x+Math.floor(st*w/total),b=x+Math.floor((st+n)*w/total);if(events(t,i)||t===1)rect(a,y+3,b-a-1,10,color);st+=n;}}
 });
 const px=x+Math.min(w-1,Math.floor((zoom?(position-s.at)/s.n:position/total)*w));labels.slice(1).forEach((_,i)=>drawLocks(i+1,x,TRACK_Y+(i+1)*ROW_H,w,s));
 rect(px,TRACK_Y-2,1,zoom?ROW_H+2:labels.length*ROW_H+2,'#f2f5ff');if(!zoom)rect(px,SONG_Y-1,1,SONG_H+2,'#f2f5ff');
 if(songFocus)text(`${partPick+1}/${parts.length} · ${parts[partPick][0]} · PRESETS: REPLACE`,6,226,'#ffcf78',8);
 else if(track===0||touched[track]||recording===track){const k=knobView[track];text(`${recording===track?'● REC · ':''}K${k+1} ${(track===0?masterShort:mixShort)[k]} · ${value(k)}`,6,226,masterInk[k],8);}
 else text(`${labels[track]} · ${patches[track][patch[track]]} · ${muted[track]?'MUTED':'SEQ / PRESETS'}`,6,226,'#d6c6ff',8);
}
function sync(){
 $('overview').hidden=$('detail').hidden=mode!=='song';$('back').hidden=mode==='song'&&!songFocus; $('back').textContent=songFocus?'↑ К дорожке 9':'← Песня';$('select-label').textContent=songFocus?'SELECT · ← / → по частям песни':'SELECT · дорожка';$('preset-label').textContent=songFocus?'PRESETS · заменить часть':track===0?'PRESETS · масштаб (− песня / + фрагмент)':'PRESETS · звуки';
 $('overview').setAttribute('aria-pressed',String(!zoom));$('detail').setAttribute('aria-pressed',String(zoom));
 $('play').textContent=transport==='play'?'Ⅱ PAUSE':transport==='pause'?'▶ RESUME':'▶ PLAY';$('seq').disabled=songFocus||track===0;$('mute').disabled=songFocus||track===0;$('mute').setAttribute('aria-pressed',String(muted[track]));
 $('rec').setAttribute('aria-pressed',String(recording===track));$('rec').disabled=Boolean(clear)||songFocus;$('rec').textContent=recording===track?'● REC ON':'● REC';
 $('knobs').replaceChildren();(songFocus?[]:track===0?masterNames:mixNames).forEach((n,i)=>{const d=document.createElement('div');d.className='row';const label=document.createElement('label');label.textContent=`K${i+1} · ${n}`;label.style.color=masterInk[i];label.style.fontWeight=i===knobView[track]?'700':'';const val=document.createElement('span');val.textContent=value(i);d.append(label,val);[-1,1].forEach(sign=>{const b=document.createElement('button');b.textContent=sign<0?'−':'+';b.setAttribute('aria-label',n+(sign<0?' уменьшить':' увеличить'));b.onclick=()=>turnKnob(i,sign);d.append(b);});$('knobs').append(d);});
 render();
}
function act(k,n){
 if(k==='select'&&mode==='song'){
   const slot=clamp((songFocus?labels.length+partPick:track)+n,0,labels.length+parts.length-1);
   songFocus=slot>=labels.length;
   if(songFocus){track=labels.length-1;partPick=slot-labels.length;}else track=slot;
 }else if(songFocus)return replacePart(n);
 else if(k==='select'){track=clamp(track+n,0,8);if(track===0)mode='song';}
 else if(track>0){if(mode==='presets')patch[track]=clamp(patch[track]+n,0,patches[track].length-1);else mode='presets';}
 else if(n){zoom=n>0;$('status').textContent=zoom?'MASTER · Масштаб: текущий фрагмент':'MASTER · Масштаб: вся песня';}
 sync();
}
for(const b of document.querySelectorAll('[data-do]'))b.onclick=()=>{const [k,n]=b.dataset.do.split(',');act(k,Number(n));};
$('back').onclick=()=>{mode='song';songFocus=false;sync();};$('seq').onclick=()=>{if(track){mode='seq';sync();}};$('mute').onclick=()=>{if(track){muted[track]=!muted[track];sync();}};
$('overview').onclick=()=>{zoom=false;sync();};$('detail').onclick=()=>{zoom=true;sync();};
function shortPlay(){last=performance.now();transport=transport==='play'?'pause':'play';sync();}
function stop(){transport='stop';position=0;sync();}
const play=$('play');play.onpointerdown=e=>{if(e.button!==0||hold!==null)return;play.setPointerCapture(e.pointerId);held=false;hold=setTimeout(()=>{held=true;stop();},2000);};
function release(){clearTimeout(hold);hold=null;}play.onpointerup=()=>{if(hold===null)return;release();if(!held)shortPlay();};play.onpointercancel=release;play.onlostpointercapture=release;play.onclick=e=>{if(e.detail===0)shortPlay();};
function recTap(){if(clear)return;recording=recording===track?-1:track;$('status').textContent=recording===track?`REC · ${labels[track]}: изменения K1–K4 записываются в текущий шаг.`:`REC выключен · ${labels[track]}: ${lockCount(track)} lock(s).`;sync();}
function finishClear(apply){if(!clear)return;const {target,timer}=clear;clearInterval(timer);clear=null;$('clear-locks').hidden=true;if(apply){locks[target].clear();if(recording===target)recording=-1;}$('status').textContent=apply?`Locks очищены: ${labels[target]}. Остальные дорожки не изменились.`:'Очистка отменена.';sync();}
function beginClear(target){if(clear)return;const until=performance.now()+3000;clear={target,timer:null};$('clear-locks').hidden=false;const update=()=>{const n=Math.ceil((until-performance.now())/1000);if(n<=0)return finishClear(true);$('clear-message').textContent=`Очистить все parameter locks дорожки ${target+1} ${labels[target]}? Автоочистка через ${n} с.`;};clear.timer=setInterval(update,100);update();sync();$('cancel-clear').focus();}
$('cancel-clear').onclick=()=>finishClear(false);
const rec=$('rec');rec.onpointerdown=e=>{if(e.button!==0||recHold!==null||clear)return;rec.setPointerCapture(e.pointerId);recHeld=false;const target=track;recHold=setTimeout(()=>{recHeld=true;beginClear(target);},2000);};
function recRelease(){clearTimeout(recHold);recHold=null;}rec.onpointerup=()=>{if(recHold===null)return;recRelease();if(!recHeld)recTap();};rec.onpointercancel=recRelease;rec.onlostpointercapture=recRelease;rec.onclick=e=>{if(e.detail===0)recTap();};
c.onclick=e=>{const r=c.getBoundingClientRect(),x=(e.clientX-r.left)*240/r.width,y=(e.clientY-r.top)*240/r.height;
 if(mode==='song'&&y>=SONG_Y&&y<SONG_Y+SONG_H){if(!songFocus)partPick=section().i;songFocus=true;track=labels.length-1;let at=0;for(let i=0;i<parts.length;i++){at+=parts[i][1];if(x>=53&&(x-53)*total/181<at){partPick=i;break;}}sync();}
 else if(mode==='song'&&y>=TRACK_Y&&y<TRACK_Y+labels.length*ROW_H){songFocus=false;track=Math.floor((y-TRACK_Y)/ROW_H);sync();}
 else if(mode==='presets'&&x>=88&&y>=60&&y<123){patch[track]=Math.floor((y-60)/21);sync();}
 else if(mode==='seq'&&x>=10&&x<234&&y>=76&&y<208){const i=Math.floor((y-76)/33)*4+Math.floor((x-10)/56),k=track+':'+i;if(toggled.has(k))toggled.delete(k);else toggled.add(k);render();}
};
function tick(now){const dt=Math.min(100,now-last);last=now;if(transport==='play'){position=(position+dt*master[0]/240000)%total;render();}requestAnimationFrame(tick);}sync();requestAnimationFrame(tick);
