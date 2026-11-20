'use strict';
const $=id=>document.getElementById(id), canvas=$('lcd'), ctx=canvas.getContext('2d');
const KEY='fm1-home-layout-v1', kinds={text:'Надпись',tracks:'Треки',detail:'Активный трек',rect:'Прямоугольник',square:'Квадрат',circle:'Круг',steps:'16 шагов'};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const names=['DRUM','BASS','FM6','KEYS','PAD','LEAD','PERC','VOCAL'];
const shape=t=>['rect','square','circle','steps'].includes(t);
const uid=()=> 'EL-'+Array.from(crypto.getRandomValues(new Uint8Array(5)),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
const block=(type,x,y,w,h,text='')=>({id:uid(),type,x,y,w,h,text,note:'',font:12,fg:'#edf4ff',bg:shape(type)?(type==='circle'?'#f05260':type==='steps'?'#42ba79':'#387ddc'):'#19283b'});
const initial=()=>({format:'fm1-home',version:1,count:6,actions:{select:'track',knob:'volume'},blocks:[block('text',6,6,228,24,'HOME  /  120 BPM'),block('tracks',6,36,228,159),block('detail',6,201,228,33)].map((b,i)=>({...b,id:['HOME-TITLE','HOME-TRACKS','HOME-ACTIVE'][i]}))});
function normalize(o){
  if(o?.format!=='fm1-home'||o.version!==1||!Array.isArray(o.blocks)||o.blocks.length>30)throw Error('Нужен JSON макета FM‑1 версии 1.');
  const num=(x,d,a,b)=>clamp(Number.isFinite(x)?Math.round(x):d,a,b), color=(x,d)=>typeof x==='string'&&/^#[\da-f]{6}$/i.test(x)?x:d;
  const ids=new Set();
  return {...initial(),count:o.count===8?8:6,actions:{select:['none','track'].includes(o.actions?.select)?o.actions.select:'track',knob:['none','track','volume'].includes(o.actions?.knob)?o.actions.knob:'volume'},blocks:o.blocks.map(b=>{
    if(!b||!Object.hasOwn(kinds,b.type))throw Error('Неизвестный тип блока.');
    let w=num(b.w,100,16,240),h=num(b.h,30,14,240);
    if(['circle','square'].includes(b.type))w=h=Math.min(w,h);
    let id=typeof b.id==='string'&&/^(EL-[A-F0-9]{10}|HOME-(TITLE|TRACKS|ACTIVE))$/.test(b.id)&&!ids.has(b.id)?b.id:uid();
    ids.add(id);
    return {...block(b.type,num(b.x,0,0,240-w),num(b.y,0,0,240-h),w,h,String(b.text??'').slice(0,80)),id,note:typeof b.note==='string'?b.note.slice(0,400):'',font:num(b.font,12,8,28),fg:color(b.fg,'#edf4ff'),bg:color(b.bg,'#19283b')};
  })};
}
let doc=initial(), selected=0, editing=true, active=0, volumes=names.map((_,i)=>76-i*5), drag=null, drawing=false;
try{const raw=localStorage.getItem(KEY);if(raw){const old=JSON.parse(raw);doc=normalize(old);if(old.blocks.some(b=>!b.id))store();}}catch{}
function store(){try{localStorage.setItem(KEY,JSON.stringify(doc));}catch{}}
function say(s){$('status').textContent=s;}
function draw(g,outline){
  g.fillStyle='#080e18';g.fillRect(0,0,240,240);
  doc.blocks.forEach(b=>{
    const {x,y,w,h,font,fg,bg}=b;g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle=bg;if(b.type==='circle'){g.beginPath();g.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);g.fill();}else if(b.type==='steps'){
      const side=Math.max(1,Math.min(h,Math.floor(w/16)-1));
      for(let i=0;i<16;i++){const a=x+Math.floor((i+.5)*w/16-side/2);g.fillRect(a,y+Math.floor((h-side)/2),side,side);}
    }else g.fillRect(x,y,w,h);
    g.font=`600 ${font}px monospace`;g.textBaseline='middle';g.fillStyle=fg;
    if(b.type==='text'){g.fillText(b.text,x+5,y+h/2,Math.max(1,w-10));}
    if(b.type==='detail'){g.fillText(`T${active+1} ${names[active]}  VOL ${volumes[active]}`,x+5,y+h/2,Math.max(1,w-10));}
    if(b.type==='tracks'){
      for(let i=0;i<doc.count;i++){
        const y1=y+Math.floor(i*h/doc.count),rh=y+Math.floor((i+1)*h/doc.count)-y1;
        g.fillStyle=i===active?'#9ddaff':i%2?'#00000026':bg;g.fillRect(x,y1,w,rh-1);
        g.fillStyle=i===active?'#081525':fg;g.font=`600 ${Math.min(font,Math.max(6,rh-4))}px monospace`;
        g.fillText(`${i+1} ${names[i]}`,x+5,y1+rh/2,Math.max(1,w-35));g.textAlign='right';g.fillText(volumes[i],x+w-5,y1+rh/2,24);g.textAlign='left';
      }
    }
    g.restore();
  });
  const b=doc.blocks[selected];if(outline&&b){g.strokeStyle='#ffb75d';g.lineWidth=1;g.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);g.fillStyle='#ffb75d';g.fillRect(b.x+b.w-7,b.y+b.h-7,7,7);}
}
const paint=()=>draw(ctx,editing);
function fields(){
  const root=$('fields'), b=doc.blocks[selected];root.replaceChildren();$('remove').disabled=!b;$('properties').disabled=!b;$('element-id').textContent=b?.id||'—';
  if(!b)return;
  for(const [k,title,type] of [['x','X','number'],['y','Y','number'],['w','Ширина','number'],['h','Высота','number'],['font','Шрифт, px','number'],['fg','Текст','color'],['bg','Фон','color'],['text','Подпись','text'],['note','Назначение / комментарий','text']]){
    if(k==='text'&&b.type!=='text')continue;if(shape(b.type)&&['font','fg'].includes(k))continue;
    const l=document.createElement('label'),inpt=document.createElement('input');l.textContent=title;inpt.type=type;inpt.value=b[k];inpt.dataset.key=k;
    if(k==='text'||k==='note')inpt.maxLength=k==='note'?400:80;
    inpt.addEventListener('input',()=>{if(type==='number')return;b[k]=inpt.value;paint();store();});
    inpt.addEventListener('change',()=>{if(type!=='number')return;const range={x:[0,240-b.w],y:[0,240-b.h],w:[16,240-b.x],h:[14,240-b.y],font:[8,28]};if(inpt.value!==''&&Number.isFinite(inpt.valueAsNumber))b[k]=clamp(Math.round(inpt.valueAsNumber),...range[k]);if(['circle','square'].includes(b.type)&&['w','h'].includes(k))b.w=b.h=clamp(b[k],16,Math.min(240-b.x,240-b.y));inpt.value=b[k];for(const el of root.querySelectorAll('input[type=number]'))el.value=b[el.dataset.key];paint();store();});l.append(inpt);root.append(l);
  }
}
function refresh(){
  $('layers').replaceChildren(...doc.blocks.map((b,i)=>{const el=document.createElement('button');el.type='button';el.textContent=`${i+1}. ${kinds[b.type]}`;el.setAttribute('aria-pressed',String(i===selected));el.onclick=()=>{selected=i;refresh();};return el;}));
  $('count').value=doc.count;$('selectAction').value=doc.actions.select;$('knobAction').value=doc.actions.knob;
  $('edit').setAttribute('aria-pressed',String(editing));$('test').setAttribute('aria-pressed',String(!editing));
  $('inspector').hidden=!editing;$('controls').hidden=editing;$('tip').textContent=editing?'Перетащи блок или потяни за его нижний правый угол.':'Проверь переходы и громкость виртуальными SELECT и KNOB 1. Можно также нажать на строку трека.';
  fields();paint();
}
function coords(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*240/r.width,(e.clientY-r.top)*240/r.height];}
function hit(x,y){for(let i=doc.blocks.length-1;i>=0;i--){const b=doc.blocks[i];if(x>=b.x&&x<b.x+b.w&&y>=b.y&&y<b.y+b.h)return i;}return -1;}
canvas.addEventListener('pointerdown',e=>{
  if(drag||e.button!==0)return;
  const [x,y]=coords(e);
  if(editing&&drawing){
    const type=$('type').value;if(!shape(type)||doc.blocks.length>=30)return;
    const b=block(type,clamp(Math.round(x),0,224),clamp(Math.round(y),0,224),16,16);
    doc.blocks.push(b);selected=doc.blocks.length-1;drag={id:e.pointerId,x,y,b,create:true};drawing=false;$('draw').setAttribute('aria-pressed','false');canvas.style.cursor='';canvas.setPointerCapture(e.pointerId);refresh();return;
  }
  const i=hit(x,y);if(i<0)return;
  const b=doc.blocks[i];if(!editing){if(b.type==='tracks'){active=clamp(Math.floor((y-b.y)*doc.count/b.h),0,doc.count-1);paint();}return;}
  selected=i;drag={id:e.pointerId,x,y,b,base:{...b},size:x>b.x+b.w-10&&y>b.y+b.h-10};canvas.setPointerCapture(e.pointerId);refresh();
});
canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;const [x,y]=coords(e),{b,base,size}=drag,dx=Math.round(x-drag.x),dy=Math.round(y-drag.y);
  if(drag.create){
    b.x=clamp(Math.round(Math.min(x,drag.x)),0,224);b.y=clamp(Math.round(Math.min(y,drag.y)),0,224);
    b.w=clamp(Math.abs(dx),16,240-b.x);b.h=clamp(Math.abs(dy),16,240-b.y);
    if(['circle','square'].includes(b.type))b.w=b.h=Math.min(b.w,b.h);
  }else if(size){b.w=clamp(base.w+dx,16,240-b.x);b.h=clamp(base.h+dy,14,240-b.y);if(['circle','square'].includes(b.type))b.w=b.h=clamp(base.w+(Math.abs(dx)>Math.abs(dy)?dx:dy),16,Math.min(240-b.x,240-b.y));}else{b.x=clamp(base.x+dx,0,240-b.w);b.y=clamp(base.y+dy,0,240-b.h);}
  for(const el of $('fields').querySelectorAll('input[type=number]'))el.value=b[el.dataset.key];paint();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(drag?.id===e.pointerId){drag=null;store();}});
$('edit').onclick=()=>{editing=true;refresh();};$('test').onclick=()=>{editing=false;drawing=false;$('draw').setAttribute('aria-pressed','false');canvas.style.cursor='';refresh();};
$('copy-id').onclick=async()=>{const id=doc.blocks[selected]?.id;if(!id)return;try{await navigator.clipboard.writeText(id);say('Скопирован код '+id);}catch{say('Код элемента: '+id);}};
$('draw').onclick=()=>{if(!shape($('type').value))$('type').value='rect';if(doc.blocks.length>=30)return say('В макете не больше 30 блоков.');drawing=!drawing;$('draw').setAttribute('aria-pressed',String(drawing));canvas.style.cursor=drawing?'crosshair':'';say(drawing?'Проведи пальцем или мышью по экрану, чтобы нарисовать фигуру.':'Рисование выключено.');};
$('type').onchange=()=>{if(drawing&&!shape($('type').value))$('draw').click();};
$('add').onclick=()=>{if(doc.blocks.length>=30)return say('В макете не больше 30 блоков.');doc.blocks.push(block($('type').value,20,70,['circle','square'].includes($('type').value)?45:195,45,'НОВЫЙ БЛОК'));selected=doc.blocks.length-1;refresh();store();};
$('remove').onclick=()=>{if(!doc.blocks[selected])return;doc.blocks.splice(selected,1);selected=Math.min(selected,doc.blocks.length-1);refresh();store();};
$('count').onchange=()=>{doc.count=Number($('count').value);active=Math.min(active,doc.count-1);paint();store();};
for(const [id,k] of [['selectAction','select'],['knobAction','knob']])$(id).onchange=()=>{doc.actions[k]=$(id).value;store();};
for(const b of document.querySelectorAll('[data-step]'))b.onclick=()=>{const [k,n]=b.dataset.step.split(','),a=doc.actions[k];if(a==='track')active=clamp(active+Number(n),0,doc.count-1);if(a==='volume')volumes[active]=clamp(volumes[active]+Number(n),0,100);paint();};
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
$('save').onclick=()=>download(new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}),'FM1-HOME.json');
$('png').onclick=()=>{const c=document.createElement('canvas');c.width=c.height=240;draw(c.getContext('2d'),false);c.toBlob(b=>{if(b)download(b,'FM1-HOME.png');});};
$('open').onclick=()=>$('file').click();$('file').onchange=async()=>{const f=$('file').files[0];$('file').value='';if(!f)return;try{if(f.size>100000)throw Error('Файл слишком большой.');doc=normalize(JSON.parse(await f.text()));selected=0;active=0;store();refresh();say('Макет открыт.');}catch(e){say('Не удалось открыть: '+e.message);}};
$('reset').onclick=()=>{if(!confirm('Вернуть исходный макет HOME?'))return;doc=initial();selected=0;active=0;volumes=names.map((_,i)=>76-i*5);store();refresh();say('Исходный макет восстановлен.');};
refresh();
