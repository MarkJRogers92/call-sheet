// Call Sheet vertical slice: one arcade battle screen + the post-game pack.
(function(){
'use strict';
const {data:D,resolver:R,roster:Ro,battle:B,packs:P,evolution:EV,world:W,signatures:SG,classes:CL}=window.CallSheet;
const O=window.CallSheet.onboarding;
const FX=window.SliceFX,S=FX.sfx,PT=FX.particles,{card,esc,paintPortrait}=window.SliceCards;
const $=s=>document.querySelector(s);
const STORE='callsheet.slice.v1';

// ================================================================ persistence (per-viewer, optional)
// Dynasty mode: when Dynasty Lab opens the battle (an iframe on the same origin), the host supplies the real teams,
// the program's playbook and settings, records the result into the season, and stores the playbook in the save.
const challengeFrame=window.frameElement?.dataset?.driveChallenges==='true';
let campaignSave=null,activeChallenge=null;
const HOST=(()=>{try{return !challengeFrame&&window.parent!==window&&(window.frameElement?.dataset?.classicDrive?window.parent.__callSheetClassic:window.parent.__callSheetDynasty)||null}catch(e){return null}})();
const DYN=HOST?HOST.launch():null;
function loadSave(){
  if(DYN)return{team:null,world:null,playbook:DYN.playbook?JSON.parse(JSON.stringify(DYN.playbook)):P.newPlaybook(),settings:DYN.settings||null,activeBattle:DYN.activeBattle||null,combos:[...(DYN.combos||[])],games:DYN.games||0,seenHelp:!!DYN.seenHelp};
  try{const t=localStorage.getItem(STORE);if(t)return JSON.parse(t)}catch(e){}return null;
}
function writeSave(){
  if(campaignSave||DYN?.classicDrive)return;
  if(b&&!b._closed)save.activeBattle={seed:b.seed,battle:B.save(b)};
  if(DYN){HOST.save({activeBattle:save.activeBattle||null,playbook:save.playbook,combos:save.combos,settings:save.settings,games:save.games,seenHelp:!!save.seenHelp});return}
  try{localStorage.setItem(STORE,JSON.stringify(save))}catch(e){}
}
let save=loadSave()||{team:null,playbook:P.newPlaybook(),settings:{mode:'key',control:'offense',fast:false,sound:true},combos:[],games:0};
P.updateStarterBook(save.playbook);
save.settings??={mode:'key',control:'offense',fast:false,sound:true};save.combos??=[];
save.settings.headset=B.headsetSettings(save.settings.headset);
// Saves from before the league existed get one.
if(save.team&&!save.world)save.world=W.newWorld(save.team,`w${Date.now()%1e6}`);
if(save.world&&!save.world.rival){save.world.rival=save.world.order[0];save.world.trophy={holder:save.world.rival,history:[]}}
// Signature cards are generated per player, so they're re-registered on load.
// Saves from before rosters persisted get class years now.
if(save.world&&!save.world.userLineup){save.world.userLineup=W.freshLineup(save.team);save.world.userRecord={w:0,l:0};save.world.history=[];for(const [id,p] of Object.entries(save.world.programs))p.lineup??=W.freshLineup(id)}
if(save.world){
  Ro.refreshUniforms(save.world.userLineup,save.playbook);
  for(const p of Object.values(save.world.programs))Ro.refreshUniforms(p.lineup,p.playbook);
  for(const spot of save.world.offseason?.spots||[])for(const p of spot.prospects||[])if(!window.DynastyJerseys.legal(p.pos,p.number))p.number=window.DynastyJerseys.first(p.pos,p.id);
}
function registerSignatures(){SG.registerAll(save.playbook);for(const r of save.playbook.ringOfHonor||[])SG.register(r);if(save.world)for(const p of Object.values(save.world.programs))SG.registerAll(p.playbook)}
registerSignatures();
// Your collection's print finishes (foil, gold) show on your cards wherever they appear.
window.SliceCards.finishOf=id=>save.playbook?.finishes?.[id]||null;

// ================================================================ state
let b=null,req=null,seen=0,busy=false,err='',sel={play:null,tac:[]},readMode=save.settings.readMode==='primary'?'primary':'auto',fullSheet=save.settings.sheetView!=='quick';
const userSide=()=>b.user;
const teamOf=s=>b.teams[s];
const oppId=()=>W.opponentOf(save.world);
const specOf=id=>W.SPECS[id];

// ================================================================ field
const YD=10,MIDY=266;
const X=abs=>(10+abs)*YD;
const absOf=(field,poss)=>poss==='home'?field:100-field;
const svg=$('#field'),NS='http://www.w3.org/2000/svg';
const mk=(tag,attrs={},parent)=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(parent)parent.appendChild(e);return e};
let layer={},pos={};
function drawField(){
  svg.innerHTML='';
  const defs=mk('defs',{},svg);
  const g=mk('linearGradient',{id:'turf',x1:0,y1:0,x2:0,y2:1},defs);mk('stop',{offset:0,'stop-color':'#276348'},g);mk('stop',{offset:1,'stop-color':'#154939'},g);
  {const f=mk('filter',{id:'plglow',x:'-60%',y:'-60%',width:'220%',height:'220%'},defs);mk('feGaussianBlur',{stdDeviation:2.6},f)}
  mk('rect',{x:0,y:0,width:1200,height:533,fill:'url(#turf)',rx:6},svg);
  for(let i=0;i<10;i++)mk('rect',{x:100+i*100,y:0,width:50,height:533,fill:'rgba(255,255,255,.035)'},svg);
  const hc=teamOf('home').colors[0],ac=teamOf('away').colors[0];
  mk('rect',{x:0,y:0,width:100,height:533,fill:hc,opacity:.85},svg);mk('rect',{x:1100,y:0,width:100,height:533,fill:ac,opacity:.85},svg);
  for(const [x,t,rot] of [[50,teamOf('home').short,-90],[1150,teamOf('away').short,90]]){const tx=mk('text',{x,y:MIDY,'text-anchor':'middle','dominant-baseline':'middle',transform:`rotate(${rot} ${x} ${MIDY})`,fill:'rgba(255,255,255,.85)','font-family':'Barlow Condensed,Impact,sans-serif','font-weight':800,'font-size':64,'letter-spacing':12},svg);tx.textContent=t}
  for(let y=0;y<=100;y+=5){const x=X(y);mk('line',{x1:x,y1:0,x2:x,y2:533,stroke:'rgba(255,255,255,'+(y%10?'.35':'.7')+')','stroke-width':y%50?2:3},svg)}
  for(let y=1;y<100;y++){const x=X(y);for(const yy of [8,206,320,519])mk('line',{x1:x,y1:yy,x2:x,y2:yy+8,stroke:'rgba(255,255,255,.5)','stroke-width':1.5},svg)}
  const paint=mk('g',{'aria-hidden':'true',fill:'#e2e7d5'},svg);
  mk('rect',{x:2,y:2,width:1196,height:529,rx:4,fill:'none',stroke:'#d8dfcd','stroke-width':4},paint);
  for(let yard=10;yard<100;yard+=10){
    const x=X(yard),number=Math.min(yard,100-yard),towardGoal=yard<50?-1:1;
    for(const y of [80,453]){
      const label=mk('text',{x,y,'text-anchor':'middle','dominant-baseline':'central',transform:y<MIDY?`rotate(180 ${x} ${y})`:'','font-family':'Barlow Condensed,Impact,sans-serif','font-weight':800,'font-size':34},paint);
      label.textContent=number;
      if(yard!==50){
        const base=x+towardGoal*23;
        mk('path',{d:`M ${base} ${y-4} v 8 l ${towardGoal*7} -4 Z`},paint);
      }
    }
  }
  for(const x of [X(0),X(100)])for(const y of [3,523])mk('rect',{x:x-3,y,width:6,height:7,rx:1,fill:'#f6974a'},paint);
  layer.zone=mk('rect',{x:0,y:0,width:0,height:533,fill:'rgba(63,193,255,.08)'},svg);
  layer.los=mk('line',{x1:0,y1:0,x2:0,y2:533,stroke:'#3fc1ff','stroke-width':4,opacity:.9},svg);
  layer.fd=mk('line',{x1:0,y1:0,x2:0,y2:533,stroke:'#ffe066','stroke-width':5,opacity:.95,filter:''},svg);
  layer.players=mk('g',{},svg);
  layer.shadow=mk('ellipse',{cx:0,cy:0,rx:7,ry:4,fill:'rgba(0,0,0,.45)'},svg);
  layer.ball=mk('ellipse',{cx:0,cy:0,rx:8,ry:5,fill:'#8a4b1c',stroke:'#fff','stroke-width':1.5},svg);
  pos={};layer.dots={};
}
function frameSelectedPlay(spot){
  const height=$('#fieldWrap').clientHeight;
  if(!height)return;
  // Crop the sidelines around the two widest receivers and preserve the yard scale.
  const top=40,frameHeight=453;
  const width=Math.min(1200,Math.max(525,Math.round(frameHeight*svg.clientWidth/height)));
  const center=X(absOf(spot.field,spot.possession))+(spot.possession==='home'?90:-90);
  const left=Math.max(0,Math.min(1200-width,center-width/2));
  svg.setAttribute('viewBox',`${left} ${top} ${width} ${frameHeight}`);
}
if(window.ResizeObserver)new ResizeObserver(()=>{
  if(!$('#fieldLocator').hidden&&req?.kind==='snap')frameSelectedPlay(req.situation);
}).observe($('#fieldWrap'));
const OFF_SPOTS={LT:[-1,194],LG:[-1,230],C:[-1,266],RG:[-1,302],RT:[-1,338],TE:[-1.3,376],X:[-1,70],Z:[-1,462],SLOT:[-2,412],QB:[-5,266],RB:[-7.5,266]};
const DEF_SPOTS={RUSH:[1.3,176],NT:[1.3,246],DT3:[1.3,290],SET:[1.3,358],WILL:[5,212],MIKE:[5,268],BOXS:[6,352],NICKEL:[5.5,412],BCB:[7,70],FCB:[7,462],FS:[13,266]};
function formation(st,e=null){
  if(!st||!st.possession||st.field==null)return null;
  const off=st.possession,def=off==='home'?'away':'home',dir=off==='home'?1:-1,los=X(absOf(st.field,off)),out={};
  const line=e?B.snapLineup(b,e,'off'):teamOf(off).lineup.off;
  for(const [role,spot] of Object.entries(OFF_SPOTS)){
    let [dx,y]=spot;
    if(role==='SLOT'&&line.SLOT?.pos==='TE')[dx,y]=[-1.4,152];
    if(role==='SLOT'&&['RB','FB','HB'].includes(line.SLOT?.pos))[dx,y]=[-5.5,214];
    if(role==='TE'&&line.TE?.pos==='WR')[dx,y]=[-2,120];
    out[`o:${role}`]={x:los+dx*YD*dir,y,side:off,role,lineup:'off'};
  }
  for(const[r,[dx,y]]of Object.entries(DEF_SPOTS))out[`d:${r}`]={x:los+dx*YD*dir,y,side:def,role:r,lineup:'def'};
  return{los,dir,dots:out,off,def};
}
// ---------------------------------------------------------------- player cards on the field
// Every player on the field is a small card: team color, real face, jersey number. Hover (or tap) for the player's
// grades and this game's line. Cards light up: green where you hold the edge in the coming duels, red where you
// don't, gold when a player wins his duel, and a big pop for the player who made the play.
const CW=26,CH=34,faceCache=new Map();
function faceURL(p,colors){
  const key=`${p.id}|${colors?.[0]}`;if(faceCache.has(key))return faceCache.get(key);
  let url='';try{const cv=document.createElement('canvas');cv.width=cv.height=48;if(paintPortrait(cv,p,colors,48))url=cv.toDataURL()}catch(e){}
  faceCache.set(key,url);return url;
}
function signatureIds(){
  const ids=new Set();for(const pb of [save.playbook,DYN?.oppPlaybook])for(const s of pb?.signatures||[])ids.add(String(s.playerId));
  return ids;
}
function ensureDots(f,e){
  const sigs=signatureIds();
  for(const[k,d]of Object.entries(f.dots)){
    let el=layer.dots[k];
    if(!el){
      el=mk('g',{class:'pl',role:'button',tabindex:k==='o:QB'?'0':'-1'},layer.players);el.dataset.key=k;
      const c=mk('g',{class:'pc'},el);
      mk('rect',{class:'glow',x:-CW/2-2,y:-CH/2-2,width:CW+4,height:CH+4,rx:5,filter:'url(#plglow)'},c);
      mk('rect',{class:'cbody',x:-CW/2,y:-CH/2,width:CW,height:CH,rx:3,'stroke-width':1.5},c);
      mk('image',{class:'pface',x:-CW/2+1.5,y:-CH/2+1.5,width:CW-3,height:CH-12,preserveAspectRatio:'xMidYMin slice'},c);
      mk('rect',{class:'nband',x:-CW/2,y:CH/2-11,width:CW,height:11,rx:2},c);
      mk('text',{class:'num',x:0,y:CH/2-5.2,'text-anchor':'middle','dominant-baseline':'central'},c);
      el.addEventListener('pointerenter',ev=>showTip(el,ev));el.addEventListener('pointermove',ev=>moveTip(ev));
      el.addEventListener('pointerleave',hideTip);el.addEventListener('pointerdown',ev=>{if(ev.pointerType!=='mouse'){ev.stopPropagation();tipFor===el?hideTip():showTip(el,ev)}});
      const showFocused=()=>{const rect=el.getBoundingClientRect();showTip(el,{clientX:rect.right,clientY:rect.top+rect.height/2})};
      el.addEventListener('focus',showFocused);el.addEventListener('blur',hideTip);
      el.addEventListener('keydown',ev=>{
        if(ev.key==='Escape'){hideTip();return}
        if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();showFocused();return}
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
        ev.preventDefault();const all=Object.values(layer.dots),step=['ArrowLeft','ArrowUp'].includes(ev.key)?-1:1;
        const next=all[(all.indexOf(el)+step+all.length)%all.length];el.setAttribute('tabindex','-1');next.setAttribute('tabindex','0');next.focus();
      });
      layer.dots[k]=el;
    }
    const team=teamOf(d.side),p=(e?B.snapLineup(b,e,d.lineup):team.lineup[d.lineup])[d.role],c=el.firstChild;
    el.dataset.side=d.side;el.dataset.lineup=d.lineup;el.dataset.role=d.role;el.dataset.pid=p?p.id:'';
    c.querySelector('.cbody').setAttribute('fill',team.colors[0]);c.querySelector('.nband').setAttribute('fill',team.colors[0]);
    c.querySelector('.cbody').setAttribute('stroke',team.colors[1]||'#fff');
    const face=c.querySelector('.pface'),url=p?faceURL(p,team.colors):'';
    if(face.getAttribute('href')!==url){if(url)face.setAttribute('href',url);else face.removeAttribute('href')}
    c.querySelector('.num').textContent=p?p.number:'';
    el.classList.toggle('hot',!!(p&&b.fire[p.id]));el.classList.toggle('sig',!!(p&&sigs.has(String(p.id))));
    el.classList.toggle('opp',d.side!==b.user);
    el.setAttribute('aria-label',p?`${p.name}, #${p.number} ${p.role}`:d.role);
  }
}
// Matchup glow for the coming snap. duels come from the read (preview), margin > 0 favors the offense.
let glowNotes={};
function clearGlow(){$('#fieldLocator').hidden=true;svg.setAttribute('viewBox','0 0 1200 533');layer.route?.remove();layer.route=null;glowNotes={};for(const el of Object.values(layer.dots||{}))el.classList.remove('edge','risk','threat','won','dim')}
function fieldGlow(duels,userOff){
  clearGlow();if(!duels||fogSpread())return;
  for(const d of duels){
    const adv=userOff?d.margin:-d.margin;if(Math.abs(adv)<1)continue;
    const mine=(userOff?d.offRoles:d.defRoles).map(r=>(userOff?'o:':'d:')+r),theirs=(userOff?d.defRoles:d.offRoles).map(r=>(userOff?'d:':'o:')+r);
    for(const k of mine){layer.dots[k]?.classList.add(adv>0?'edge':'risk');(glowNotes[k]??=[]).push(`${d.label}: ${D.chip(Math.max(-3,Math.min(3,adv)))}`)}
    if(adv<0)for(const k of theirs){layer.dots[k]?.classList.add('threat');(glowNotes[k]??=[]).push(`${d.label}: a threat to you`)}
  }
}
// After the play: duel winners flash gold, the playmaker pops.
function celebrateCards(e){
  clearGlow();const lit=[];
  for(let i=0;i<(e.duelResults||[]).length;i++){
    const d=e.duels[i],won=e.duelResults[i].won;
    for(const r of won?d.offRoles:d.defRoles){const k=(won?'o:':'d:')+r;if(layer.dots[k])lit.push(k)}
    if(i===0&&!won)break;
  }
  const P=e.participants||{},big=Math.abs(e.yards||0)>=15||e.turnover||e.kind==='sack';
  const star=e.turnover==='interception'&&P.defender?`d:${P.defender}`:e.kind==='sack'&&P.sacker?`d:${P.sacker}`:P.carrier&&(e.kind==='run'||e.kind==='scramble')?`o:${P.carrier}`:P.target&&e.completed?`o:${P.target}`:null;
  for(const k of new Set(lit)){const el=layer.dots[k];el.classList.add('won');layer.players.appendChild(el);
    FX.anim(el.firstChild,[{transform:'scale(1)'},{transform:'scale(1.35)'},{transform:'scale(1.1)'}],{duration:320,easing:'cubic-bezier(.2,1.6,.4,1)'})}
  if(star&&layer.dots[star]&&big){
    const el=layer.dots[star];el.classList.add('won');layer.players.appendChild(el);
    FX.anim(el.firstChild,[{transform:'scale(1)'},{transform:'scale(2.1)'},{transform:'scale(1.3)'}],{duration:520,easing:'cubic-bezier(.2,1.6,.4,1)'});
    const r=el.getBoundingClientRect();PT.burst(r.left+r.width/2,r.top+r.height/2,{n:28,speed:7,colors:['#fff','#ffe066','#ffb03c']});
  }
  setTimeout(()=>{for(const el of Object.values(layer.dots))el.classList.remove('won')},1700);
}
// Hover card: who he is, his grades, this game.
let tipFor=null;
const CLASS_YR=['','FR','SO','JR','SR'];
function gameLine(st){
  if(!st)return'No stats yet';
  const out=[];
  if(st.passAtt)out.push(`${st.comp}/${st.passAtt} · ${st.passYds} yds${st.passTD?` · ${st.passTD} TD`:''}${st.ints?` · ${st.ints} INT`:''}`);
  if(st.rushAtt)out.push(`${st.rushAtt} car · ${st.rushYds} yds${st.rushTD?` · ${st.rushTD} TD`:''}`);
  if(st.rec||st.targets)out.push(`${st.rec} rec · ${st.recYds} yds${st.recTD?` · ${st.recTD} TD`:''}`);
  const dfn=[st.tackles&&`${st.tackles} tkl`,st.sacks&&`${st.sacks} sack${st.sacks>1?'s':''}`,st.intDef&&`${st.intDef} INT`].filter(Boolean);
  if(dfn.length)out.push(dfn.join(' · '));
  return out.join('<br>')||'No stats yet';
}
function equippedSignatureHTML(side,role,id){
  if(side!==b.user)return '';
  const spec=save.playbook?.signatures?.find(s=>String(s.playerId)===String(id)&&s.role===role),d=spec&&P.cardDef(spec.id);
  return d?.matchupText?`<div class="tt-notes">When you play <b>${esc(d.name)}</b>: ${esc(d.matchupText)}</div>`:'';
}
function showTip(el,ev){
  const team=teamOf(el.dataset.side),p=b.personnel?.[el.dataset.pid]||team.lineup[el.dataset.lineup]?.[el.dataset.role];if(!p)return;
  tipFor=el;let tip=$('#ptip');
  if(!tip){tip=document.createElement('div');tip.id='ptip';tip.setAttribute('role','tooltip');document.body.appendChild(tip)}
  const strong=new Set(D.STYLE_TRAITS[p.archetype]||[]);
  const traits=D.TRAITS.map(t=>[t,p.traits?.[t]??50]).sort((a,c)=>(strong.has(c[0])-strong.has(a[0]))||c[1]-a[1]);
  const opp=el.dataset.side!==b.user,fog=opp?fogSpread():0;
  const g=v=>{if(!fog)return String(v);const lo=v-(v%(fog*5+1));return`${lo}–${lo+fog*5}`};
  const notes=glowNotes[el.dataset.key]||[];
  tip.className=`${el.classList.contains('sig')?'sig':''} ${opp?'opp':''}`;
  tip.style.setProperty('--tc',team.colors[0]);
  tip.innerHTML=`<div class="tt-head"><canvas width="56" height="56"></canvas><div><b>${esc(p.name)}</b><span>#${esc(p.number)} · ${esc(p.pos||p.role)} · ${esc(CLASS_YR[p.year]||'')}</span><span>${esc(team.short)} ${esc(p.role)} · ${esc(p.archetype||'')}${p.ovr?` · <b>${g(p.ovr)}</b> OVR`:''}</span></div></div>
    <div class="tt-traits">${traits.map(([t,v])=>`<div class="${strong.has(t)?'key':''}"><span>${t==='iq'?'IQ':esc(t)}</span><i style="--v:${Math.max(0,Math.min(100,fog?v-(v%(fog*5+1)):v))}%"></i><b>${g(v)}</b></div>`).join('')}</div>
    ${(p.cond||[]).length?`<div class="tt-cond">${p.cond.map(c=>`<span class="${c.v>0?'up':'down'}">${c.v>0?'+1':'−1'} ${esc(fog?c.src.replace(/ \(health \d+\)/,''):c.src)}<small>${c.when==='late'?'4th quarter':c.when==='money'?'3rd & 4th down':'every snap'}</small></span>`).join('')}</div>`:''}
    ${D.SIGNATURES[p.archetype]?`<div class="tt-notes">${esc(D.SIGNATURES[p.archetype].text)}</div>`:''}
    ${equippedSignatureHTML(el.dataset.side,el.dataset.role,p.id)}
    ${notes.length?`<div class="tt-notes">${notes.map(n=>`<div>${esc(n)}</div>`).join('')}</div>`:''}
    ${b.fire[p.id]?'<div class="tt-fire">ON FIRE</div>':''}${el.classList.contains('sig')?'<div class="tt-sig">SIGNATURE CARD</div>':''}
    <div class="tt-line"><span>This game</span>${gameLine(b.players?.[p.id])}</div>${fog?`<div class="tt-fog">Film confidence ${DYN.scouting.confidence}%: grades are ranges</div>`:''}`;
  paintPortrait(tip.querySelector('canvas'),p,team.colors,56);
  tip.classList.add('on');moveTip(ev);
}
function moveTip(ev){
  const tip=$('#ptip');if(!tip||!tipFor)return;
  const w=tip.offsetWidth,h=tip.offsetHeight,x=ev.clientX+16+w>innerWidth?ev.clientX-16-w:ev.clientX+16,y=Math.min(innerHeight-h-8,Math.max(8,ev.clientY-h/2));
  tip.style.left=`${Math.max(8,x)}px`;tip.style.top=`${y}px`;
}
function hideTip(){tipFor=null;$('#ptip')?.classList.remove('on')}
document.addEventListener('click',switchSameLook);
document.addEventListener('pointerdown',e=>{if(tipFor&&!e.target.closest?.('.pl'))hideTip()});
function placeDot(k,x,y){const el=layer.dots[k];if(el)el.setAttribute('transform',`translate(${x.toFixed(1)},${y.toFixed(1)})`);pos[k]={x,y}}
function placeBall(x,y,h=0){layer.ball.setAttribute('cx',x);layer.ball.setAttribute('cy',y-h);layer.ball.setAttribute('rx',8*(1+h/120));layer.ball.setAttribute('ry',5*(1+h/120));layer.shadow.setAttribute('cx',x);layer.shadow.setAttribute('cy',y+6)}
function setMarkers(st,instant){
  if(!st||st.field==null||!st.possession){layer.los.setAttribute('opacity',0);layer.fd.setAttribute('opacity',0);return}
  const off=st.possession,los=X(absOf(st.field,off)),fdAbs=Math.min(100,Math.max(0,absOf(Math.min(100,st.field+st.distance),off))),fd=X(fdAbs);
  layer.los.setAttribute('opacity',.9);layer.fd.setAttribute('opacity',st.field+st.distance>=100?0:.95);
  const set=(el,x)=>{el.setAttribute('x1',x);el.setAttribute('x2',x)};
  set(layer.los,los);set(layer.fd,fd);
  layer.zone.setAttribute('x',Math.min(los,fd));layer.zone.setAttribute('width',Math.abs(fd-los));
}
async function setFormation(st,ms=380,e=null){
  const f=formation(st,e);if(!f){layer.players.style.opacity=0;layer.ball.style.opacity=0;layer.shadow.style.opacity=0;return}
  layer.players.style.opacity=1;layer.ball.style.opacity=1;layer.shadow.style.opacity=1;
  ensureDots(f,e);setMarkers(st);
  const from={};for(const k of Object.keys(f.dots))from[k]=pos[k]||{x:f.dots[k].x,y:f.dots[k].y+(k[0]==='o'?40:-40)};
  await FX.tween(ms,t=>{for(const[k,d]of Object.entries(f.dots))placeDot(k,from[k].x+(d.x-from[k].x)*t,from[k].y+(d.y-from[k].y)*t);placeBall(f.los-1.2*YD*f.dir,MIDY)},FX.ease.out);
}
// Run the play: everyone moves, the key actor carries the result.
async function animatePlay(e){
  const f=formation(e.sit,e);if(!f)return;
  const dir=f.dir,los=f.los,P0={};for(const k of Object.keys(f.dots))P0[k]={...(pos[k]||f.dots[k])};
  const yards=e.yards||0,endX=Math.max(5,Math.min(1195,los+yards*YD*dir)),part=e.participants||{},pass=D.PLAYS[e.play]?.pass;
  const carrier=part.carrier?`o:${part.carrier}`:null,target=part.target?`o:${part.target}`:null,qb='o:QB';
  const endY=MIDY+(Math.random()-.5)*160;
  const T={};
  for(const[k,d]of Object.entries(f.dots)){
    const p=P0[k];let tx=p.x,ty=p.y;
    if(k.startsWith('o:')){
      if(['LT','LG','C','RG','RT'].includes(d.role))tx=p.x+YD*1.2*dir;
      else if(['X','Z','SLOT','TE'].includes(d.role))tx=p.x+YD*(pass?11:4)*dir;
      if(d.role==='QB'&&pass)tx=p.x-YD*3*dir;
    }else{tx=p.x+(endX-p.x)*.45;ty=p.y+(endY-p.y)*.35}
    T[k]={x:tx,y:ty};
  }
  const sackerKey=part.sacker?`d:${part.sacker}`:null,defKey=part.defender?`d:${part.defender}`:null;
  if(e.kind==='sack'){T[qb]={x:endX,y:MIDY};if(sackerKey)T[sackerKey]={x:endX+8*dir,y:MIDY-10}}
  else if(carrier&&(e.kind==='run'||e.kind==='scramble')){T[carrier]={x:endX,y:endY};if(defKey)T[defKey]={x:endX+10*dir,y:endY+8}}
  else if(target){T[target]={x:endX,y:endY};if(defKey)T[defKey]={x:endX+(e.completed?14:4)*dir,y:endY+12}}
  S.whistle();
  await FX.tween(1050,t=>{
    for(const k of Object.keys(f.dots)){const a=P0[k],z=T[k];placeDot(k,a.x+(z.x-a.x)*t,a.y+(z.y-a.y)*t)}
    const qbp=pos[qb];
    if(pass&&e.kind!=='sack'&&target&&e.kind!=='scramble'){
      if(t<.4)placeBall(qbp.x,qbp.y);
      else{const u=(t-.4)/.6,tp=pos[target],tx=tp.x,ty=tp.y,bx=qbp.x+(tx-qbp.x)*u,by=qbp.y+(ty-qbp.y)*u;placeBall(bx,by,Math.sin(Math.PI*u)*70)}
    }else{const c=carrier?pos[carrier]:qbp;if(c)placeBall(c.x,c.y)}
  },FX.ease.inOut);
  if(e.turnover==='interception'&&defKey&&pos[defKey])placeBall(pos[defKey].x,pos[defKey].y);
  if(e.kind==='inc'&&target){const tp=pos[target];await FX.tween(260,t=>placeBall(tp.x+t*20*dir,tp.y+t*14,(1-t)*10))}
}

// ================================================================ broadcast bug and side panel
function clock(st){const q=b.game.status==='final'?'FINAL':st.period>4?'OT':`Q${st.period}`;if(st.period>4||b.game.status==='final')return q;return`${q} ${Math.floor(st.clock/60)}:${String(st.clock%60).padStart(2,'0')}`}
function renderBug(st=sitNow(),score=b.game.score){
  const options=!busy&&b&&B.sidelineOptions(b);
  const sideline=$('#sidelineBtn');
  sideline.hidden=!options||(!options.offense&&!options.late&&!options.canCoachDrive&&!b.log.some(e=>e.type==='snap'&&e.offSide===b.game.possession&&e.sit));
  if(options)sideline.textContent=options.coachDrive?'Coaching this drive':options.late?`Clock · ${options.timeouts} TO`:options.keep?'Sideline · 1 held':'Sideline';
  const dd=st.possession&&st.down?`${['','1ST','2ND','3RD','4TH'][st.down]} & ${st.field+st.distance>=100?'GOAL':st.distance} · ${st.field>50?'OPP '+(100-st.field):st.field===50?'50':'OWN '+st.field}`:'';
  const tm=s=>`<div class="tm ${s}" style="background:${teamOf(s).colors[0]}"><span class="poss ${st.possession===s?'on':''}"></span><div><div class="ab">${esc(teamOf(s).short)}</div>${s===b.user?'<div class="you">YOU</div>':''}</div><div class="sc">${score[s]}</div></div>`;
  $('#bug').innerHTML=`<div class="bug">${tm('home')}<div class="mid"><div class="clk">${b.weather&&b.weather!=='clear'?`<span title="${WX[b.weather].label}">${WX[b.weather].icon}</span> `:''}${clock(st)}</div><div class="dd">${dd}</div></div>${tm('away')}</div>`;
}
const sitNow=()=>({down:b.game.down,distance:b.game.distance,field:b.game.fieldPosition,period:b.game.period,clock:b.game.clock,possession:b.game.possession});
function hotHTML(){
  const hot=[];for(const s of ['home','away'])for(const lu of ['off','def'])for(const p of Object.values(teamOf(s).lineup[lu]))if(b.fire[p.id])hot.push({p,s});
  if(!hot.length)return'';
  return`<div class="box"><h3>On fire</h3>${hot.length?hot.map(({p,s})=>`<div class="hot"><span class="flame"></span>${esc(p.name)} <span class="mini">${esc(teamOf(s).short)} ${p.role}</span></div>`).join(''):'<div class="mini">Win every duel for three straight snaps to catch fire: +0.5 until you lose one.</div>'}</div>`;
}
const COMBOS=[...(D.COMBOS||[]).map(c=>({id:c.id,name:c.name,how:c.how,reward:c.reward})),{id:'chain_gang',name:'Chain Gang',how:'Three first downs in one drive',reward:'+1 Command next series'}];
function comboHTML(){if(!save.combos.length)return'';return`<div class="box"><h3>Combo book</h3>${COMBOS.map(c=>{const f=save.combos.includes(c.id);return`<div class="combo ${f?'found':''}"><b>${f?esc(c.name):'? ? ?'}</b><br>${f?esc(c.how)+' · '+esc(c.reward):'Undiscovered'}</div>`}).join('')}</div>`}
const fmtEdge=n=>`${n>0?'+':''}${Number(n.toFixed(1))}`;
function readHTML(){
  if(!req||req.kind!=='snap'){clearGlow();return''}
  if(!sel.play){clearGlow();return`<div class="box"><h3>The read</h3><div class="mini">Pick a play card. Drag it onto the field, or tap it and hit SNAP.</div></div>`}
  const tactics=sel.tac.map(i=>req.options.tactics.find(t=>t.slot===i)?.id).filter(Boolean);
  const pv=B.preview(b,req.side,snapChoice(tactics));if(!pv)return'';
  // Precise forecasts and matchup colors also reveal the hidden grades. Keep the read honest under fog.
  if(fogSpread()){
    clearGlow();
    const duels=req.role==='off'?pv.snap.duels:pv.vs.slice().sort((a,c)=>c.weight-a.weight)[0]?.snap.duels||[];
    const side=b.user==='home'?'away':'home';
    return`<div class="box"><h3>The read</h3><div class="mini">Film confidence ${esc(DYN.scouting.confidence)}% (from your coordinators and head coach). Exact forecasts are unavailable.</div>
      ${duels.map(d=>`<div class="drow"><span class="k">${d.key}</span><span class="n"><b>${esc(d.label)}</b><br>${esc(d.offNames.join(' & '))} vs ${esc(d.defNames.join(' & '))}<br>Opponent grade ${esc(fogGrade(req.role==='off'?d.defGrade:d.offGrade,(req.role==='off'?d.defNames:d.offNames)[0],side).text)}</span><span class="chip fogchip">?</span></div>`).join('')}</div>`;
  }
  if(req.role==='off'){
    fieldGlow(pv.snap.duels,true);
    // Each duel as the same stacked sum the replay shows, projected from the visible look (fogged reads return above).
    return`<div class="box"><h3>The read</h3><div class="mini">Projection from the visible look; hidden adjustments can change it.</div><div class="exp">${pv.ev.yards.toFixed(1)}<small>yds estimated</small></div>
      <div class="kpis"><span>1ST DOWN <b>${Math.round(pv.ev.first*100)}%</b></span><span>TURNOVER <b>${(pv.ev.turnover*100).toFixed(0)}%</b></span></div>
      ${pv.snap.duels.map(d=>`<div class="drow"><span class="k">${d.key}</span><span class="n"><b>${esc(d.label)}</b><br>${esc(d.offNames.join(' & '))} <span class="muted">vs</span> ${esc(d.defNames.join(' & '))}</span><span class="chip ${d.chip}">${d.chip}</span></div><div class="read-sum">${duelSumHTML(d,{offSide:req.side,defSide:req.side==='home'?'away':'home'},true)}</div>`).join('')}</div>`;
  }
  const rows=pv.vs.sort((a,c)=>c.weight-a.weight);fieldGlow(rows[0]?.snap.duels,false);
  const avg=rows.reduce((s,v)=>s+v.weight*v.ev.yards,0);
  return`<div class="box"><h3>The read</h3><div class="exp">${avg.toFixed(1)}<small>yds allowed</small></div>
    ${rows.map(v=>`<div class="drow"><span class="k">${Math.round(v.weight*100)}</span><span class="n"><b>If ${esc(v.family)}</b><br>${v.snap.duels.map(d=>`${d.key} <span class="chip ${D.chip(Math.max(-3,Math.min(3,-d.margin)))}" style="font-size:10px;padding:1px 5px">${D.chip(Math.max(-3,Math.min(3,-d.margin)))}</span>`).join(' ')}</span><span class="cond">${v.ev.yards.toFixed(1)}</span></div>`).join('')}</div>`;
}
function snapChoice(tactics){
  return {play:sel.play,tactics,read:readMode,...(req.role==='def'&&sel.edgeAssignment?{edgeAssignment:sel.edgeAssignment}:{}),...(sel.target?{target:sel.target}:{}),...(sel.bracketRole&&tactics.includes('bracket')?{bracketRole:sel.bracketRole}:{})};
}
function selectedTactics(){return sel.tac.map(slot=>req.options.tactics.find(t=>t.slot===slot)?.id).filter(Boolean)}
function choosePlay(id){
  const play=id?req.options.plays.find(p=>p.id===id):null;
  if(id&&(!play||play.blocked||play.cost>req.options.command)){
    err=play?.blocked||(!play?'That play is no longer in hand.':`${play.card.name} needs ${play.cost} Command. You have ${req.options.command}.`);
    S.error();return false;
  }
  if(sel.play!==id)delete sel.target;
  sel.play=id;err='';retainCallTactics(play);
  if(sel.bracketRole&&!selectedTactics().includes('bracket'))delete sel.bracketRole;
  return true;
}
function sameLookHTML(){
  const pair=B.sameLookPair(b,req,sel.play);
  if(!pair)return '';
  const m=pair.mate;
  const action=!m?'':m.reason?`<small>${esc(m.name)} · ${esc(m.reason)}</small>`:
    `<button type="button" class="auto" data-same-look="${esc(m.id)}">Switch to ${esc(m.name)} · ${m.cost} CMD</button>`;
  const diagrams=m?`<details><summary>Compare diagrams</summary><div class="pair-diagrams">${(pair.diagrams||['inside_zone','pa_boot']).map(id=>
    `<figure>${window.SliceCards.diagram(id,'off')}<figcaption>${esc(D.PLAYS[id].name)}</figcaption></figure>`).join('')}</div></details>`:'';
  const hold=pair.hold?`<button type="button" class="auto" data-hold-look="${esc(pair.hold.grouping)}">Stay in ${esc(pair.hold.name)}</button><small>Personnel stays there until you set it back to Auto.</small>`:'';
  return `<section class="same-look"><b>${esc(pair.title)}</b><p>${esc(pair.read)}</p>${pair.setup?`<small>${esc(pair.setup)}</small>`:''}${hold}${diagrams}${action}</section>`;
}
// Hold the look: switch to the personnel where the corner has seen the quick out, keeping the selected call.
function holdLook(e){
  const el=e.target.closest?.('[data-hold-look]');
  if(!el||busy||req?.kind!=='snap')return;
  const pair=B.sameLookPair(b,req,sel.play);if(!pair?.hold||pair.hold.grouping!==el.dataset.holdLook)return;
  const keep=sel.play;
  try{req=B.setGrouping(b,req.side,pair.hold.grouping)||b.pending}catch(err2){err=err2.message;renderHand();return}
  const still=req.options.plays.find(p=>p.id===keep&&!p.blocked);
  err='';
  if(still)retainCallTactics(still);else sel={play:null,tac:[]};
  writeSave();setFormation(sitNow(),0);refresh();$('#snapBtn')?.focus({preventScroll:true});
}
document.addEventListener('click',holdLook);
function retainCallTactics(play){
  let remaining=req.options.command-(play?.cost||0);
  const removed=[];
  sel.tac=sel.tac.filter(slot=>{
    const t=req.options.tactics.find(t=>t.slot===slot);
    if(!t)return false;
    if(t.cost>remaining||tacticBlock(t,play)){removed.push(t.card.name);return false}
    remaining-=t.cost;return true;
  });
  if(removed.length)err='Removed from this call: '+removed.join(', ')+'.';
}
function switchSameLook(e){
  const el=e.target.closest?.('[data-same-look]');
  if(!el||busy||req?.kind!=='snap')return;
  const mate=B.sameLookPair(b,req,sel.play)?.mate;
  if(!mate||mate.reason||mate.id!==el.dataset.sameLook)return;
  choosePlay(mate.id);
  S.tick(6);refresh();
  document.querySelector('[data-same-look]')?.focus({preventScroll:true});
}
function matchupHTML(){
  clearGlow();
  const card=req.role==='off'?D.PLAYS[sel.play]:D.CALLS[sel.play];
  if(!card||card.quickKick||card.id==='spike')return '';
  const tactics=selectedTactics(),choice=snapChoice(tactics),pv=B.preview(b,req.side,choice);
  const likely=pv?.vs?.slice().sort((a,c)=>c.weight-a.weight)[0],snap=pv?.snap||likely?.snap;
  if(!snap?.duels?.length)return '';
  const off=req.role==='off',fog=fogSpread(),gate=snap.duels[0];
  const d=!fog&&gate.p<.5?gate:snap.duels.find(d=>d.key==='K')||gate;
  const pct=duel=>Math.round(100*(off?duel.p:1-duel.p));
  const label={G:'Gate',K:'Key',F:'Finish'}[d.key];
  fieldGlow(snap.duels,off);
  const roles=new Set([...d.offRoles.map(role=>'o:'+role),...d.defRoles.map(role=>'d:'+role)]);
  for(const [key,el] of Object.entries(layer.dots||{}))el.classList.toggle('dim',!roles.has(key));
  const path=off&&window.SliceCards.routeFor(card);
  if(path){
    const f=formation(req.situation);
    if(f){
      // The chalk face faces up; the field faces the opponent's end zone.
      let across=6,offset=-34;
      if(sel.target&&sel.target!==card.target){
        const from=f.dots['o:'+card.target],to=f.dots['o:'+sel.target];
        if(from&&to){across=(from.y-MIDY)*(to.y-MIDY)<0?-6:6;offset=to.y-(from.y+34)*across/6}
      }
      const styles={fill:'none','stroke-width':.8};
      layer.route=mk('g',{},svg);
      for(const part of window.SliceCards.pairRoutes(card)||[{d:path,receiver:true}]){
        // Retarget the passing route while the mesh and rollout stay over the backfield.
        const scale=part.receiver?across:6,shift=part.receiver?offset:-34;
        mk('path',{...styles,d:part.d,stroke:part.mesh?'#efe6d2':'#ffe066','stroke-dasharray':part.mesh?'1 1':'2 1',
          transform:`matrix(0 ${scale} ${-7*f.dir} 0 ${f.los+238*f.dir} ${shift})`},layer.route);
      }
      svg.insertBefore(layer.route,layer.players);
    }
  }
  const spot=req.situation;
  frameSelectedPlay(spot);
  const locator=$('#fieldLocator');locator.hidden=false;
  locator.querySelector('b').style.left=absOf(spot.field,spot.possession)+'%';
  locator.querySelector('i').style.left=absOf(Math.min(100,spot.field+spot.distance),spot.possession)+'%';
  let detail=fog?'Opponent grades uncertain':pct(d)+'% estimated duel win';
  if(!fog&&tactics.length){
    const plain=B.preview(b,req.side,{...choice,tactics:[],bracketRole:undefined});
    const before=(plain?.snap||plain?.vs?.find(v=>v.family===likely?.family)?.snap)?.duels.find(row=>row.key===d.key);
    if(before){const diff=pct(d)-pct(before);detail+=' · '+(diff>0?'+':'')+diff+' pts from selected tactics'}
  }
  return `<div class="quick-matchup"><b>${esc(label)} · ${esc(d.label)}${likely?' vs '+esc(likely.family):''}</b><span>${esc(d.offNames.join(' & '))} vs ${esc(d.defNames.join(' & '))}</span><small>${esc(detail)}</small></div>${sameLookHTML()}`;
}
function assignmentHTML(){
  const off=req.role==='off',line=teamOf(off?req.side:(req.side==='home'?'away':'home')).lineup.off;
  const options=off?(sel.play&&R.targetOptions?.(D.PLAYS[sel.play],line)):selectedTactics().includes('bracket')&&(B.bracketOptions||R.bracketOptions)?.(line);
  let edge='';
  if(!off&&sel.play){
    const def=teamOf(req.side).lineup.def,end=esc(def.SET?.name||'End'),will=esc(def.WILL?.name||'Linebacker');
    edge=`<label class="assignment">Against Read Option <select data-assignment="edgeAssignment"><option value="">Coordinator decides</option><option value="crash" ${sel.edgeAssignment==='crash'?'selected':''}>Crash on RB · ${end} takes RB, ${will} takes QB</option><option value="contain" ${sel.edgeAssignment==='contain'?'selected':''}>Contain QB · ${end} takes QB, ${will} takes RB</option></select></label>`;
  }
  if(!options||options.length<2)return edge;
  const key=off?'target':'bracketRole',fallback=off?D.PLAYS[sel.play].target:'';
  return `${edge}<label class="assignment">${off?'Primary target':'Bracket assignment'} <select data-assignment="${key}">${off?'':`<option value="">${req.options.bracketPlan?'Prepared · '+esc(req.options.bracketPlan.name):'Best receiver'}</option>`}${options.map(o=>`<option value="${esc(o.role)}" ${(sel[key]||fallback)===o.role?'selected':''}>${esc(o.name)} · ${esc(o.role)}${o.defRole?' vs '+esc(o.defRole):''}</option>`).join('')}</select></label>`;
}
function bindAssignment(root){
  for(const el of root.querySelectorAll('[data-assignment]'))el.onchange=()=>{
    sel[el.dataset.assignment]=el.value;
    const play=req.options.plays.find(p=>p.id===sel.play);
    const removed=req.options.tactics.filter(t=>sel.tac.includes(t.slot)&&tacticBlock(t,play));
    sel.tac=sel.tac.filter(slot=>!removed.some(t=>t.slot===slot));
    err=removed.length?'Removed incompatible tactics: '+removed.map(t=>t.card.name).join(', '):'';
    refresh();root.querySelector(`[data-assignment="${el.dataset.assignment}"]`)?.focus({preventScroll:true});
  };
}
function tacticNoteHTML(quick=false){
  if(!sel.play||req?.kind!=='snap')return '';
  const note=B.tacticRead(req,sel.play,teamOf(req.side).lineup[req.role],sel.tac,sel.target,b,!!fogSpread(),readMode);
  if(!note)return '<p class="call-tactic-note">Hold Command for the next call.</p>';
  const hand=req.options.tactics,slot=note.selected?sel.tac[0]:hand.find(t=>t.id===note.id)?.slot;
  const rest=sel.tac.slice(1).map(i=>hand.find(t=>t.slot===i)?.card.name).filter(Boolean);
  const action=quick&&slot!=null?`<button class="tbtn" type="button" data-tactic-slot="${slot}" ${hand.find(t=>t.slot===slot)?.card.info?'':'aria-pressed="'+note.selected+'"'}>${note.selected?'Remove':hand.find(t=>t.slot===slot)?.card.info?'Play now':'Add tactic'} · ${esc(note.name)} · ${note.cost} CMD</button>`:'';
  return `<div class="call-tactic-note">${action||`<b>${note.selected?'Selected':'Pair with'}: ${esc(note.name)} · ${note.cost} CMD</b>`} <span>${esc(note.reason)}${rest.length?' Also selected: '+rest.map(esc).join(', ')+'.':''}</span></div>`;
}
function coachingHTML(){
  const cues=B.coachingRead(req,sel.play);
  return cues.length?`<div class="box" id="coachingRead"><h3>Coach's read</h3>${cues.map(c=>`<p class="mini">${esc(c)}</p>`).join('')}${tacticNoteHTML()}</div>`:'';
}
function backfieldHTML(){
  if(req?.kind!=='snap'||req.role!=='off')return'';
  const team=teamOf(req.side);if(!(team.backfield?.length>1))return'';
  const p=team.lineup.off.RB,mode=b.backfieldMode?.[req.side]||'auto';
  return`<div class="box"><h3><label for="backfield">Backfield package</label></h3><select id="backfield" class="tbtn" style="width:100%">${Object.entries(B.BACKFIELD_MODES).map(([id,name])=>`<option value="${id}" ${id===mode?'selected':''}>${esc(name)}</option>`).join('')}</select><div class="mini" style="margin-top:6px"><b>${esc(p.name)}</b> · ${esc(p.archetype)}<br>${mode==='auto'?'Backup takes every fourth offensive snap.':mode==='starter'?'Keep the depth-chart starter on the field.':mode==='power'?'Best power and technique, adjusted for conditions.':'Best technique, IQ and versatility, adjusted for conditions.'}</div></div>`;
}
// Personnel grouping for this series: heavy (12, 21) helps the run and costs a receiver; 10 spreads them out.
function personnelHTML(){
  if(req?.kind!=='snap'||req.role!=='off'||!B.GROUPINGS)return'';
  const mode=b.grouping?.[req.side]||'auto',now=B.groupingFor(b,req.side);
  const packages=B.groupingOptions?.(b,req.side);
  if(packages)return `<div class="box"><h3><label for="personnel">Personnel</label></h3><select id="personnel" class="tbtn">${packages.map(p=>`<option value="${esc(p.id)}" ${p.id===mode?'selected':''} ${p.available===false?'disabled':''}>${esc(p.name)}${p.available===false?' · unavailable':''}</option>`).join('')}</select><p class="mini">${esc(packages.find(p=>p.id===mode)?.detail||'')}</p></div>`;
  return`<div class="box"><h3><label for="personnel">Personnel</label></h3><select id="personnel" class="tbtn" style="width:100%">${Object.entries(B.GROUPINGS).map(([id,name])=>`<option value="${id}" ${id===mode?'selected':''}>${esc(name)}${id==='auto'?` (now ${now})`:''}</option>`).join('')}</select><div class="mini">12/21: run +½ unless they load the box, receivers −½. 10: receivers +½ against one deep safety, run −½.</div></div>`;
}
function recentSnapsHTML(offSide){
  const snaps=b.log.filter(e=>e.type==='snap'&&e.offSide===offSide&&e.sit).slice(-5).reverse();
  if(!snaps.length)return '';
  const rows=snaps.map(e=>{
    const {down,distance,field,period,clock:seconds}=e.sit;
    const downLabel=['','1st','2nd','3rd','4th'][down]||'';
    const time=period>4?'OT':`Q${period} ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    const play=D.PLAYS[e.play]?.name||e.play,call=D.CALLS[e.call]?.name||e.call;
    const yards=Number(e.yards)||0,gain=`${yards>0?'+':''}${yards} yd`;
    let outcome=gain;
    if(e.penalty)outcome=e.penalty.label;
    else if(e.turnover)outcome=e.turnover==='interception'?'Intercepted':'Fumble lost';
    else if(e.kind==='punt')outcome='Quick kick';
    else if(e.kind==='inc')outcome='Incomplete';
    else if(e.kind==='sack')outcome='Sack · '+gain;
    if(!e.penalty&&!e.turnover){
      if(e.score?.[offSide]-e.sit.score?.[offSide]>=6)outcome+=' · TD';
      else if(e.score?.[e.defSide]-e.sit.score?.[e.defSide]===2)outcome+=' · Safety';
      else if(e.kind!=='punt'&&down===4&&yards<distance)outcome+=' · Downs';
    }
    return `<li><small>${esc(time)} · ${esc(downLabel)} &amp; ${field+distance>=100?'goal':esc(distance)}</small><strong>${esc(play)} · ${esc(outcome)}</strong>${call?`<span>vs ${esc(call)}</span>`:''}</li>`;
  });
  return `<details class="recent-snaps"><summary>Recent snaps · ${esc(teamOf(offSide).short)} offense</summary><ol aria-label="Most recent first">${rows.join('')}</ol></details>`;
}
function lastSnapHTML(){
  const e=b.lastResult,note=B.explainSnap(e);if(!note)return'';
  const outcome=e.penalty?e.penalty.label:e.turnover?e.turnover:e.kind==='inc'?'Incomplete':`${e.yards>0?'+':''}${e.yards} yards`;
  return`<div class="box" id="lastSnap"><h3>Last snap · ${esc(teamOf(e.offSide).short)} offense</h3><div class="mini">${esc(D.PLAYS[e.play]?.name||'')} · ${esc(outcome)}</div><p class="mini">${esc(note.summary)}</p><details><summary>Full breakdown</summary><div class="mini muted">${esc(note.detail)}</div></details></div>`;
}
// A setup is evidence only when its modifier affected a duel that was actually played.
function setupReceipt(e){
  if(!e||e.penalty||e.category==='kick'||!e.duelResults?.length)return '';
  for(let i=0;i<(e.duelResults[0].won?e.duelResults.length:1);i++){
    const d=e.duels?.[i],m=d?.mods?.find(m=>m.src==='Punish the lean'||m.src==='Sitting on it'||m.src==='Blitz-happy defense'||m.src?.startsWith('COMBO: '));
    if(!m)continue;
    const setup=m.src==='Punish the lean'?`Counter against defenders playing ${e.lean==='run'?'the run':e.lean==='quick'?'short passes':'deep passes'}`:m.src==='Sitting on it'?`Defense read the ${e.lean}`:m.src==='Blitz-happy defense'?'Repeated pressure helped the screen':m.src.slice(7);
    const us=(d.offNames||[]).join(' & '),them=(d.defNames||[]).join(' & ');
    return `${setup}: ${us||'Offense'} vs ${them||'defense'} · offense ${e.duelResults[i].won?'won':'lost'} the ${String(d.label||'matchup').toLowerCase()}.`;
  }
  return '';
}
function matchupStoryHTML(e){
  const note=B.matchupStory(e);if(!note)return'';
  return`<strong>${esc(note.summary)}</strong><span>${esc(setupReceipt(e)||(fogSpread()?'The duel is the result, not a guarantee of the whole play. Their grades are ranges at your film confidence.':note.detail))}</span>${note.defense?`<small>${esc(note.defense)}</small>`:''}`;
}
function showMatchupStory(e){
  let panel=$('#matchupStory');if(!panel){panel=document.createElement('div');panel.id='matchupStory';panel.setAttribute('role','status');$('#stage').appendChild(panel)}
  panel.innerHTML=matchupStoryHTML(e);panel.hidden=!panel.innerHTML;
  const note=B.matchupStory(e);if(!note)return;
  for(const role of note.winnerRoles||[]){const dot=layer.dots[(note.offWon?'o:':'d:')+role];if(dot){dot.classList.add('won');layer.players.appendChild(dot)}}
}
function guidedDriveHTML(){
  if(!b?.guidedDrive?.active)return'';
  return`<section class="box" id="guidedDrive"><h3>Your opening drive</h3><p class="mini">You call every offensive snap on this drive. Your normal pace returns afterward.</p><details><summary>Why might this play fit?</summary><p class="mini">${esc(O.hint(req,sel.play))}</p></details><button class="tbtn" id="finishGuide">Finish guided drive</button></section>`;
}
function bindGuide(root){
  const finish=root.querySelector('#finishGuide');if(!finish)return;
  finish.onclick=()=>{if(busy)return;O.skip(b);save.settings.guidedDriveDone=true;save.settings.guidedDrivePending=false;writeSave();refresh();$('#sheetToggle').focus()};
}
function adaptationHTML(){
  const clue=B.adaptationRead(b,req);if(!clue)return'';
  return`<section class="box" id="opponentAdjustment"><h3>Opponent adjustment</h3><p class="mini">${esc(clue.summary)}</p><details><summary>Your possible answer</summary><p class="mini">${esc(clue.detail)}${clue.counterPlay?` Try ${esc(D.PLAYS[clue.counterPlay]?.name||clue.counterPlay)} from your hand.`:''}</p></details></section>`;
}
// The one snap that decided it, with the duel that won it. The same text is recorded on the dynasty's game
// archive, so This Week's Last Final card shows the identical line.
function deciderHTML(){
  let t='';try{t=B.decidingMoments(b)[0]||''}catch(e){}
  return t?`<section class="box" id="decidingSnap" style="text-align:left"><h3>Deciding snap</h3><p>${esc(t)}</p></section>`:'';
}
// After a loss, one evidence-backed swap the coach can stage in the deck editor. Nothing changes until Save.
function lossSwapFor(note){
  const opp=b.user==='home'?'away':'home',lost=b.game?.score&&b.game.score[b.user]<b.game.score[opp];
  return lost&&note?P.lossSwap(save.playbook,note):null;
}
function takeawayHTML(){
  const note=B.postgameTakeaway(b);if(!note)return'';
  const swap=lossSwapFor(note);
  return`<section class="box" id="filmTakeaway" style="text-align:left"><h3>One takeaway</h3><p>${esc(note.summary)}</p><p class="mini">${esc(note.evidence)}</p><details><summary>Optional adjustment</summary><p class="mini">${esc(note.recommendation)}</p>${swap?`<button class="tbtn" data-film-swap>Stage swap: −1 ${esc(swap.removeName)}, +1 ${esc(swap.addName)}</button> `:''}<button class="tbtn" data-film-deck>Review your deck</button><p class="mini">Nothing changes unless you choose and save an adjustment.</p></details></section>`;
}
function renderSide(){
  if(req?.kind==='snap'&&!fullSheet){$('#side').replaceChildren();return}
  const pb=save.playbook;
  const ur=DYN?DYN.record:(save.world?.userRecord||pb.record),opponent=teamOf(b.user==='away'?'home':'away');
  const goal=activeChallenge?`<section class="box"><h3>${esc(activeChallenge.name)}</h3><p class="challenge-objective">${esc(activeChallenge.objective)}</p></section>`:'';
  const gameContext=activeChallenge?'':`<h3>${DYN?esc(DYN.label):`Season ${save.world.season}`}</h3><div class="statline">${DYN?.classicDrive?'RECORDED FINAL · '+esc(DYN.finalScore):`RECORD <b>${ur.w}-${ur.l}</b>`}${DYN?'':` · WEEK <b>${save.world.week%save.world.order.length+1}</b> of ${save.world.order.length}`}</div>`;
  $('#side').innerHTML=goal+guidedDriveHTML()+adaptationHTML()+backfieldHTML()+personnelHTML()+coachingHTML()+readHTML()+lastSnapHTML()+hotHTML()+comboHTML()+`<div class="box">${gameContext}
   <div class="mini">vs ${esc(opponent.name)} · ${esc(opponent.coach.name)}</div>
   <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="tbtn" id="bHelp">How to play</button><button class="tbtn" id="bFast">${save.settings.fast?'Speed: fast':'Speed: normal'}</button><button class="tbtn" id="bSound">${save.settings.sound?'Sound: on':'Sound: off'}</button><button class="tbtn" id="bReplay">Replays: ${save.settings.replays==='all'?'all':'key moments'}</button><button class="tbtn" id="bRead" title="Auto: if the first read is covered, the QB checks down to the back or tight end. Primary only: no checkdowns (long 3rd downs).">Checkdowns: ${readMode==='primary'?'off':'auto'}</button>${activeChallenge?'':`<button class="tbtn" id="bSim">${DYN?.classicDrive?'Sim this drive':'Sim to end'}</button>`}</div></div>`;
  bindGuide($('#side'));
  if(req?.kind==='snap'&&sel.play){
    const featured=matchupHTML();if(featured)$('#coachingRead')?.insertAdjacentHTML('afterbegin',featured);
  }
  const personnel=$('#personnel');if(personnel)personnel.onchange=()=>{if(busy)return;try{req=B.setGrouping(b,req.side,personnel.value)||b.pending;sel={play:null,tac:[]};writeSave();setFormation(sitNow(),0);refresh();$('#personnel')?.focus({preventScroll:true})}catch(e){err=e.message;renderHand()}};
  const backfield=$('#backfield');if(backfield)backfield.onchange=()=>{
    if(busy)return;
    try{req=B.setBackfield(b,req.side,backfield.value);writeSave();sel={play:null,tac:[]};err='';hideTip();const f=formation(sitNow());if(f)ensureDots(f);refresh()}catch(e){err=e.message;renderHand()}
  };
  $('#bHelp').onclick=()=>howToPlay();
  $('#bFast').onclick=()=>{save.settings.fast=!save.settings.fast;FX.speed=save.settings.fast?.45:1;writeSave();renderSide()};
  $('#bSound').onclick=()=>{save.settings.sound=!save.settings.sound;S.on=save.settings.sound;writeSave();renderSide()};
  $('#bReplay').onclick=()=>{save.settings.replays=save.settings.replays==='all'?'moments':'all';writeSave();renderSide()};
  $('#bRead').onclick=()=>{readMode=readMode==='primary'?'auto':'primary';save.settings.readMode=readMode;writeSave();refresh()};
  const sim=$('#bSim');if(sim)sim.onclick=()=>{if(busy)return;if(b.guidedDrive?.active){O.skip(b);save.settings.guidedDriveDone=true;save.settings.guidedDrivePending=false}b.mode='sim';b.pending=null;FX.skipping=true;go(null)};
}

// ================================================================ the Look
function leanMeterText(req){
  const m=req.leanMeter;if(!m?.count)return '';
  const family={run:'runs',quick:'quick passes',deep:'deep passes'}[m.family]||m.family;
  const next={run:'run',quick:'quick pass',deep:'deep pass'}[m.family]||m.family;
  if(!req.look?.lean?.confirmed||!Number.isFinite(m.threshold))return `Your tendency: ${family} · ${m.count}`;
  const left=m.threshold-m.count;
  return left>0?`Your tendency: ${family} · ${m.count}/${m.threshold}. ${left} more ${left===1?next+' draws':family+' draw'} a defensive adjustment.`:'';
}
let lastLook={};
function renderLook(){
  const el=$('#look');if(!req||req.kind!=='snap'){el.innerHTML='';return}
  const tags=[];
  if(req.role==='off'){
    const o=req.options,opener=D.PLAYS[o.openingScript];if(opener?.name&&Object.hasOwn(D.PLAYS,o.openingScript))tags.push(['script',`Opening script: ${opener.name}`,true]);
    if(o.openingScriptMiss)tags.push(['script','Normal draw · '+o.openingScriptMiss,true]);
    const l=req.look,shell=v=>v===0?'NO SAFETY':v===1?'ONE-HIGH':'TWO-HIGH';
    tags.push(['box',`BOX: ${l.box.value}`,l.box.confirmed]);tags.push(['shell',`SHELL: ${shell(l.shell.value)}`,l.shell.confirmed]);
    tags.push(['pressure',`PRESSURE: ${l.pressure.value?'SHOWN':'NONE SHOWN'}`,l.pressure.confirmed]);
    if(l.coverage.confirmed)tags.push(['coverage',`COVERAGE: ${l.coverage.value}`,true]);
    if(l.lean.value&&l.lean.confirmed)tags.push(['lean',B.leanRead(l.lean.value),true,'lean']);
    if(l.heat)tags.push(['heat','🔥 BLITZ-HAPPY',true,'lean']);
    if(req.leanMeter){const text=leanMeterText(req);if(text)tags.push(['meter',text,true,'lean'])}
  }else{
    const t=req.offTendency,f=req.offLook.family;
    tags.push(['family',`PLAY: ${f.confirmed?f.value:'?'}`,f.confirmed]);
    tags.push(['tend',`TENDENCY · RUN ${t.run} · QUICK ${t.quick} · DEEP ${t.deep}`,true]);
    if(req.lean)tags.push(['lean',B.leanRead(req.lean,false),true,'lean']);
  }
  el.innerHTML=tags.map(([k,txt,c,extra])=>`<span class="tag ${extra||(c?'conf':'unc')} ${c&&lastLook[k]===false?'flip':''}">${esc(txt)} ${c?'✓':'?'}</span>`).join('');
  lastLook=Object.fromEntries(tags.map(([k,,c])=>[k,c]));
}

// ================================================================ hand
function selCost(){const o=req.options,p=o.plays.find(x=>x.id===sel.play);return(p?p.cost:0)+sel.tac.reduce((s,i)=>s+(o.tactics.find(t=>t.slot===i)?.cost||0),0)}
function tacticBlock(t,play){
  const lineup=teamOf(req.side).lineup[req.role];
  return R.signatureBlocked(t.card,lineup)||(req.role==='off'&&!t.card.info&&play?R.tacticBlocked(t.card,R.targetedPlay?.(play.card,sel.target,lineup)||play.card,lineup):null);
}
function blockedSelection(play){
  return req.options.tactics.find(t=>sel.tac.includes(t.slot)&&tacticBlock(t,play));
}
// Once staff snaps have run since the coach's last call, the ticker no longer shows it: pin one line on the board.
function pinnedCallHTML(){
  const c=B.lastUserCall(b);if(!c||c.since<1)return'';
  return`<p class="pinned-call" id="pinnedCall"><span>Your last call${c.since?` · ${c.since} snap${c.since===1?'':'s'} ago`:''}</span> <b>${esc(c.name)} · ${esc(c.result)}</b>${c.summary?` <em class="${c.won?'won':'lost'}">${esc(c.summary)}</em>`:''}</p>${c.defense?`<details class="pinned-call"><summary>Defensive call</summary>${esc(c.defense)}</details>`:''}`;
}
function twoDownButton(){
  const on=!!b.snap?.twoDown;
  return `<button type="button" class="tbtn" data-two-down title="Plan to go for it on fourth-and-short. Staff will favor a manageable next down." aria-pressed="${on}">Two-down territory · ${on?'On':'Off'}</button>`;
}
function bindTwoDown(h){
  const button=h.querySelector('[data-two-down]');if(!button)return;
  button.onclick=()=>{
    if(busy)return;
    req=B.submit(b,{type:'two_down',active:!b.snap.twoDown});
    writeSave();refresh();h.querySelector('[data-two-down]')?.focus({preventScroll:true});
  };
}
function quickSheetHTML(view){
  const opt=req.options,selected=opt.plays.find(p=>p.id===sel.play),cost=selCost();
  const cards=view.choices.map(c=>{
    const p=opt.plays.find(p=>p.id===c.id);
    const m=c.matchup?`<span class="quick-choice-matchup">Projected ${esc(c.matchup.label)}: ${esc(c.matchup.offense)} vs ${esc(c.matchup.defense)} <i class="chip ${c.matchup.chip==='?'?'fogchip':esc(c.matchup.chip)}" title="${c.matchup.chip==='?'?'Opponent grade uncertain':'Projected matchup from the shown look'}">${esc(c.matchup.chip)}</i></span>`:'';
    return `<button type="button" class="quick-choice" data-quick-call="${esc(c.id)}" aria-pressed="${c.id===sel.play}"><span><b>${esc(c.label)}</b><small>${p.cost} CMD</small></span>${m}<span class="trade">${esc(c.detail)}</span></button>`;
  }).join('');
  const opener=opt.plays.find(p=>p.id===opt.openingScript);
  return `<div class="quick-board">
    <div class="quick-heading"><span class="eyebrow">${b.guidedDrive?.active?'Guided drive · ':''}${req.role==='off'?'Offense':'Defense'} · ${opt.command} command left</span>${opener?`<small>Scripted: ${esc(opener.card.name)}</small>`:''}</div>
    ${req.role==='off'&&req.situation?.down===3&&req.situation.period<=4?twoDownButton():''}
    ${b.challenge?`<p class="challenge-objective">${esc(activeChallenge.name)} · ${esc(activeChallenge.objective)}</p>`:''}
    ${pinnedCallHTML()}<p id="quickClue">${esc(view.clue)}</p>${req.leanMeter?`<small>${esc(leanMeterText(req))}</small>`:''}
    <section class="quick-choices" aria-label="Contrasting calls">${cards||'<p>No available quick call. Open the full sheet or delegate this snap.</p>'}</section>
    ${assignmentHTML()}${matchupHTML()}${tacticNoteHTML(true)}
    <div class="quick-actions"><button type="button" class="snap" id="snapBtn" ${!selected||selected.blocked||blockedSelection(selected)||cost>opt.command?'disabled':''}>${selected?`Snap: ${esc(selected.card.name)} · ${cost}`:'Select a call'}</button><button type="button" class="auto" id="autoBtn">Let staff call it</button></div>
    ${guidedDriveHTML()}${err?`<div role="status" class="quick-error">${esc(err)}</div>`:''}</div>`;
}
function renderQuickHand(h){
  h.innerHTML=quickSheetHTML(B.snapDecisions(b,req,{...sel,read:readMode},DYN?.scouting?.confidence));
  {const story=$('#matchupStory');if(story&&h.querySelector('#pinnedCall'))story.hidden=true} // one place for the coach's last call
  for(const el of h.querySelectorAll('[data-quick-call]'))el.onclick=()=>{
    if(busy)return;const id=el.dataset.quickCall,wasFocused=document.activeElement===el;
    S.init();choosePlay(id);S.tick(6);renderQuickHand(h);
    if(wasFocused)[...h.querySelectorAll('[data-quick-call]')].find(c=>c.dataset.quickCall===id)?.focus({preventScroll:true});
  };
  bindAssignment(h);bindGuide(h);bindTwoDown(h);
  const pair=h.querySelector('[data-tactic-slot]');if(pair)pair.onclick=()=>{const t=req.options.tactics.find(t=>t.slot===Number(pair.dataset.tacticSlot));if(t)tacticClick(t,tacticBlock(t,req.options.plays.find(p=>p.id===sel.play)))};
  $('#snapBtn').onclick=snap;
  $('#autoBtn').onclick=()=>{if(!busy){S.whoosh();go({type:'auto'})}};
  h.classList.remove('away');
}
function renderHand(){
  const h=$('#hand'),live=req?.kind==='snap';
  $('#root').classList.toggle('quick-snap',live&&!fullSheet);
  $('#root').classList.toggle('full-snap',live&&fullSheet);
  h.inert=!live;$('#battleSettings').hidden=!live;
  const toggle=$('#sheetToggle');toggle.hidden=!live;toggle.textContent=fullSheet?'Quick calls':'Full call sheet';toggle.setAttribute('aria-expanded',String(live&&fullSheet));
  if(!live){h.classList.add('away');return}
  if(!fullSheet){renderQuickHand(h);return}
  const o=req.options,role=req.role,lean=role==='off'&&req.look.lean.confirmed?req.look.lean.value:null;
  const play=o.plays.find(p=>p.id===sel.play);
  const previousScroll=h.querySelector('.sheet-cards')?.scrollTop||0;
  h.innerHTML='';
  const fanP=document.createElement('div');fanP.className='fan';fanP.style.position='relative';fanP.innerHTML='<span class="fanlab">CALL SHEET</span>';
  o.plays.forEach((p,i)=>{
    const c=p.card,notch=lean&&(c.punishes===lean||(c.id==='vertical_shot'&&lean==='quick'));
    const el=card(p.id,{cost:p.cost,base:p.base,blocked:!!p.blocked,selected:sel.play===p.id,why:p.blocked,notch,mastery:req.side===b.user?EV.progress(save.playbook,p.id):null});
    const n=o.plays.length,mid=(n-1)/2;el.style.setProperty('--rot',`${(i-mid)*4}deg`);el.style.setProperty('--arc',`${Math.abs(i-mid)**2*3}px`);el.style.zIndex=i;
    {// Defense never sees their committed play: the marker asks "would this call complete a combo if they run or pass?"
    const cb=role==='off'?B.comboFor(b,c):(B.comboFor(b,D.PLAYS.inside_zone,c)||B.comboFor(b,D.PLAYS.quick_slant,c));if(cb&&cb.side===(role==='off'?'off':'def')){el.insertAdjacentHTML('beforeend',`<span class="setup-ready">SET UP · ${cb.duel==='G'?'GATE':cb.duel==='F'?'FINISH':'KEY'} +1</span>`);el.title=`${cb.name} is ready${cb.id==='wall_up'?' if they run':''}`}}
    wirePlayCard(el,p);fanP.appendChild(el);
  });
  const cmd=document.createElement('div');cmd.className='cmd';
  const cost=selCost(),total=Math.max(D.RULES.seriesCommand,o.command);
  let coins='';for(let i=0;i<total;i++){const gone=i>=o.command,spend=!gone&&i>=o.command-cost;coins+=`<span class="coin ${gone?'gone':''} ${spend?'spend':''}"></span>`}
  const over=cost>o.command,why=play&&(play.blocked||blockedSelection(play));
  cmd.innerHTML=`${sel.play?`<strong class="call-receipt">${esc(play.card.name)}${sel.tac.length?' + '+sel.tac.map(slot=>esc(o.tactics.find(t=>t.slot===slot)?.card.name)).join(', '):''}</strong>`:''}${assignmentHTML()}${role==='off'&&req.situation?.down===3&&req.situation.period<=4?twoDownButton():''}<div class="coins" aria-label="${o.command} Command left">${coins}</div><div class="cmdl">${o.command} COMMAND · THIS SERIES</div>
    <button class="snap" id="snapBtn" ${!sel.play||over||why?'disabled':''}>SNAP IT${sel.play?` · ${cost}`:''}</button><button class="auto" id="autoBtn">Coordinator, call it</button>`;
  const fanT=document.createElement('div');fanT.className='fan';fanT.style.position='relative';fanT.innerHTML='<span class="fanlab">TACTICS</span>';
  o.tactics.forEach((t,i)=>{
    const why=tacticBlock(t,play),selected=sel.tac.includes(t.slot);
    const el=card(t.id,{cost:t.cost,selected,blocked:!!why&&!selected,why:selected&&why?'Remove: '+why:why});
    if(!t.card.info)el.setAttribute('aria-pressed',String(selected));
    const n=o.tactics.length,mid=(n-1)/2;el.style.setProperty('--rot',`${(i-mid)*5}deg`);el.style.setProperty('--arc',`${Math.abs(i-mid)**2*3}px`);
    el.dataset.tacticSlot=t.slot;el.onclick=()=>tacticClick(t,why);fanT.appendChild(el);
  });
  if(!o.tactics.length)fanT.insertAdjacentHTML('beforeend','<div class="mini" style="padding:40px 10px">Hand empty this series</div>');
  const cards=document.createElement('div');cards.className='sheet-cards';
  cards.style.setProperty('--plays',Math.max(1,o.plays.length)+'fr');
  cards.style.setProperty('--tactics',Math.max(1,o.tactics.length)+'fr');
  cards.append(fanP,fanT);h.append(cards,cmd);cards.scrollTop=previousScroll;
  bindAssignment(h);bindTwoDown(h);
  if(err)cmd.insertAdjacentHTML('afterbegin',`<span class="sheet-error" role="status">${esc(err)}</span>`);
  $('#snapBtn').onclick=()=>snap();
  $('#autoBtn').onclick=()=>{S.whoosh();go({type:'auto'})};
  h.classList.remove('away');
}
function tacticClick(t,why){
  if(busy)return;S.init();
  const hadFocus=document.activeElement?.dataset.tacticSlot===String(t.slot);
  const restore=()=>{if(hadFocus)($('#hand [data-tactic-slot="'+t.slot+'"]')||$('#hand [aria-pressed="true"]')||$('#autoBtn'))?.focus({preventScroll:true})};
  if(t.card.info){
    if(t.cost>req.options.command){err='Not enough Command.';S.error();renderHand();restore();return}
    const originalSnap=b.snap;
    // The engine spends the first copy, even when the coach taps a later duplicate.
    const spentSlot=req.options.tactics.find(card=>card.id===t.id).slot;
    try{req=B.submit(b,{type:'info',tactic:t.id})}
    catch(e){err=e.message;S.error();renderHand();restore();return}
    writeSave();S.chime();
    if(req?.kind!=='snap'||b.snap!==originalSnap){go(undefined);return}
    sel.tac=sel.tac.map(slot=>slot>spentSlot?slot-1:slot);
    const play=req.options.plays.find(p=>p.id===sel.play);
    err='';retainCallTactics(play);
    if(!selectedTactics().includes('bracket'))delete sel.bracketRole;
    if(play&&play.cost>req.options.command)err=`Choose a cheaper play. ${play.card.name} needs ${play.cost} Command and you have ${req.options.command}.`;
    FX.shake($('#look'),.4);refresh();
    if(hadFocus)($('#snapBtn:not(:disabled)')||$('#autoBtn'))?.focus({preventScroll:true});
    return;
  }
  const i=sel.tac.indexOf(t.slot);
  if(i<0&&why){err=why;S.error();renderHand();restore();return}
  if(i>=0)sel.tac.splice(i,1);
  else{
    // A replacement copy takes the place of the selected copy in the budget.
    const otherCopy=req.options.tactics.find(card=>card.id===t.id&&sel.tac.includes(card.slot));
    const total=selCost()-(otherCopy?.cost||0)+t.cost;
    if(total>req.options.command){
      err=`Adding ${t.card.name} would cost ${total} Command for the call. You have ${req.options.command}.`;
      S.error();renderHand();restore();return;
    }
    if(otherCopy)sel.tac=sel.tac.filter(slot=>slot!==otherCopy.slot);
    sel.tac.push(t.slot);
  }
  err='';S.tick(sel.tac.length*3);refresh();restore();
}
function wirePlayCard(el,p){
  let start=null,ghost=null;
  el.addEventListener('pointerdown',e=>{if(busy||p.blocked)return;start={x:e.clientX,y:e.clientY};el.setPointerCapture(e.pointerId)});
  el.addEventListener('pointermove',e=>{
    if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
    if(!ghost&&Math.hypot(dx,dy)>10){ghost=el.cloneNode(true);ghost.style.cssText=`position:fixed;left:0;top:0;z-index:40;pointer-events:none;--rot:0deg;--arc:0px;--lift:0px;width:${el.offsetWidth}px;height:${el.offsetHeight}px`;document.body.appendChild(ghost);el.style.opacity=.3;$('#drop').classList.add('on');S.whoosh()}
    if(ghost){ghost.style.transform=`translate(${e.clientX-el.offsetWidth/2}px,${e.clientY-el.offsetHeight/2}px) rotate(${dx/30}deg) scale(1.08)`;$('#drop').classList.toggle('hover',overStage(e))}
  });
  el.addEventListener('pointerup',e=>{
    const wasDrag=!!ghost;if(ghost){ghost.remove();ghost=null;el.style.opacity='';$('#drop').classList.remove('on','hover')}
    if(!start)return;start=null;
    if(wasDrag){if(overStage(e)){if(choosePlay(p.id))snap();else refresh()}return}
    S.init();choosePlay(sel.play===p.id?null:p.id);S.tick(6);refresh();
  });
  el.addEventListener('click',e=>{if(e.detail!==0||busy||p.blocked)return;choosePlay(p.id);refresh();[...$('#hand').querySelectorAll('.card')].find(c=>c.dataset.id===p.id)?.focus({preventScroll:true})});
  el.addEventListener('pointercancel',()=>{if(ghost){ghost.remove();ghost=null;el.style.opacity='';$('#drop').classList.remove('on','hover')}start=null});
}
function overStage(e){const r=$('#stage').getBoundingClientRect();return e.clientX>r.left&&e.clientX<r.right&&e.clientY>r.top&&e.clientY<r.bottom-40}
function snap(){
  if(busy||!sel.play)return;
  const tactics=sel.tac.map(i=>req.options.tactics.find(t=>t.slot===i).id);
  const blocked=blockedSelection(req.options.plays.find(p=>p.id===sel.play));
  if(blocked){err='Remove '+blocked.card.name+' in the full sheet or choose a compatible play.';S.error();renderHand();return}
  if(selCost()>req.options.command){err='Not enough Command.';S.error();renderHand();return}
  S.init();go({type:'call',...snapChoice(tactics)});
}
function refresh(){renderLook();renderHand();renderSide()}
$('#sheetToggle').onclick=()=>{if(busy||req?.kind!=='snap')return;fullSheet=!fullSheet;save.settings.sheetView=fullSheet?'full':'quick';writeSave();refresh()};

function headsetInputs(){
  return B.HEADSET_RULES.map(({id,label})=>`<label><input type="checkbox" data-headset="${id}" ${save.settings.headset[id]?'checked':''}> ${esc(label)}</label>`).join('');
}
function updateHeadset(input){
  save.settings.headset[input.dataset.headset]=input.checked;
  if(b)b.headset=B.headsetSettings(save.settings.headset);
  writeSave();
}
const preferences=$('#battlePreferences');
$('#battleSettings').onclick=()=>{
  if(busy)return;
  preferences.querySelector('#motionMode').value=save.settings.motion||'system';
  preferences.querySelector('#replayMode').value=save.settings.replays==='all'?'all':'moments';
  preferences.querySelector('#fastMode').checked=!!save.settings.fast;
  preferences.querySelector('#soundMode').checked=save.settings.sound!==false;
  preferences.querySelector('#readPolicy').value=readMode;
  $('#headsetControls').innerHTML=headsetInputs();
  preferences.showModal();
};
preferences.onchange=e=>{
  if(e.target.matches('[data-headset]')){updateHeadset(e.target);return}
  const settings=save.settings;
  settings.motion=$('#motionMode').value;FX.setMotion(settings.motion);
  settings.replays=$('#replayMode').value;settings.fast=$('#fastMode').checked;FX.speed=settings.fast?.45:1;
  settings.sound=$('#soundMode').checked;S.on=settings.sound;
  settings.readMode=readMode=$('#readPolicy').value;writeSave();refresh();
};
$('#settingsHelp').onclick=()=>{preferences.close();howToPlay()};
preferences.addEventListener('close',()=>{if(!$('#modal').classList.contains('on'))$('#battleSettings').focus({preventScroll:true})});

// The same overlay hosts several game screens. Inert the field only while that overlay is showing.
const modal=$('#modal');let modalInvoker=null,modalOpen=false;
new MutationObserver(()=>{
  const open=modal.classList.contains('on');
  if(open&&!modalOpen){modalInvoker=document.activeElement;$('#root').inert=true}
  if(open){
    const heading=modal.querySelector('.big, h1, h2, h3');
    modal.setAttribute('aria-label',heading?.textContent.trim()||'Game decision');
    if(!modal.contains(document.activeElement))modal.focus({preventScroll:true});
  }else if(modalOpen){
    $('#root').inert=false;
    if(modalInvoker?.isConnected&&modalInvoker!==document.body)modalInvoker.focus({preventScroll:true});
    if(document.activeElement===document.body&&!busy&&!$('#sheetToggle').hidden)$('#sheetToggle').focus({preventScroll:true});
  }
  modalOpen=open;
}).observe(modal,{attributes:true,attributeFilter:['class'],childList:true});
modal.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){
    const back=modal.querySelector('#gotIt,#back,#toTitle,#challengeBack,#challengeMenu');
    if(back&&!(back.id==='gotIt'&&modal.querySelector('#guideStart'))){ev.preventDefault();back.click()}
    return;
  }
  if(ev.key!=='Tab')return;
  const controls=[...modal.querySelectorAll('button:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!controls.length){ev.preventDefault();return}
  if(ev.shiftKey&&(document.activeElement===controls[0]||document.activeElement===modal)){ev.preventDefault();controls.at(-1).focus()}
  else if(!ev.shiftKey&&document.activeElement===controls.at(-1)){ev.preventDefault();controls[0].focus()}
});

// ================================================================ flow
async function go(action){
  if(busy&&action!==null)return;busy=true;$('#sheetToggle').hidden=true;$('#hand').classList.add('away');$('#hand').inert=true;err='';
  try{req=action===undefined||action===null?B.advance(b):B.submit(b,action)}
  catch(e){err=e.message;busy=false;S.error();refresh();return}
  clearGlow();const story=$('#matchupStory');if(story)story.hidden=true;
  sel={play:null,tac:[]};writeSave();
  await present();
  busy=false;FX.skipping=false;$('#skip').classList.remove('on');
  decide();
}
function guidedDriveDone(){
  const m=$('#modal');m.innerHTML=`<div class="mwrap"><p class="big gold">DRIVE COMPLETE</p><p class="statline">You have called a full offensive drive. Keep every snap, or let the staff handle routine downs.</p><button class="btn go" id="guideKey">KEY MOMENTS</button><button class="btn" id="guideSnap">EVERY SNAP</button></div>`;m.classList.add('on');
  for(const [id,mode] of [['guideKey','key'],['guideSnap','snap']])$('#'+id).onclick=()=>{b.mode=mode;save.settings.mode=mode;writeSave();m.classList.remove('on');decide()};
}
function decide(){
  if(b.challenge){const result=B.challengeResult(b);if(result){challengeFinish(result);return}}
  if(O.update(b)){save.settings.guidedDriveDone=true;save.settings.guidedDrivePending=false;writeSave();if(req){guidedDriveDone();return}}
  if(!req){
    if(DYN?.classicDrive){
      const m=$('#modal'),score=b.game.score;
      m.innerHTML=`<div class="mwrap"><p class="big gold">DRIVE COMPLETE</p><p class="statline">Your replay · ${esc(b.teams.away.name)} ${score.away} · ${esc(b.teams.home.name)} ${score.home}</p><p>Recorded final · ${esc(DYN.finalScore)}</p><button class="btn go" id="classicAgain">Play it again</button><button class="btn" id="back">Back to Game Center</button></div>`;
      m.classList.add('on');$('#classicAgain').onclick=dynastyStart;$('#back').onclick=()=>HOST.close();return;
    }
    finalScreen();return;
  }
  if(req.kind==='mesh'){meshDialog();return}
  if(req.kind==='halftime'){halftimeDialog();return}
  if(req.kind==='fourth'){fourthModal();return}
  if(req.kind==='plan'){go({type:'plan',calls:[]});return}
  renderBug();setFormation(sitNow());refresh();
}

// ================================================================ presentation
async function present(){
  const entries=b.log.slice(seen);seen=b.log.length;
  if(entries.length>1||entries.some(e=>e.userCalled))$('#skip').classList.add('on');
  for(const e of entries){
    if(e.type==='halftime'){ticker('HALFTIME · tendencies cool off, decks reshuffle');await callout('HALFTIME','cool small',900);continue}
    if(e.type==='kick'){await quickKick(e);continue}
    if(e.type==='rest'||e.type==='penalty'){ticker(e.text);continue}
    if(e.type!=='snap')continue;
    if(!FX.instant&&e.userCalled&&e.duelResults&&(save.settings.replays==='all'||e.sit.down>=3||e.sit.field>=80||e.turnover||e.yards>=20||scored(e)))await cinematic(e);else await quick(e);
  }
  renderBug();
}
function ticker(text){const t=$('#ticker');const d=document.createElement('div');d.className='tick';d.textContent=text;t.prepend(d);while(t.children.length>3)t.lastChild.remove();FX.anim(d,[{opacity:0,transform:'translateY(-10px)'},{opacity:1,transform:'none'}],250);$('#sr').textContent=text}
const userOff=e=>e.offSide===b.user;
function scored(e){return e.score&&e.sit&&(e.score[e.offSide]-(b._lastScore?.[e.offSide]??0))>=6}
async function quick(e){
  renderBug(e.sit,b._lastScore||e.score);
  await setFormation(e.sit,FX.skipping?0:200,e);
  ticker(`${teamOf(e.offSide).short} · ${e.text}`);
  if(!e.penalty){await animatePlayFast(e);if(e.userCalled)showMatchupStory(e)}
  const td=e.score&&e.score[e.offSide]-(b._lastScore?b._lastScore[e.offSide]:0)>=6;
  b._lastScore={...e.score};renderBug(e.after,e.score);
  const good=userOff(e);
  if(td){await callout('TOUCHDOWN',good?'':'bad',1100,teamOf(e.offSide).short);if(good){PT.confetti(90);S.fanfare()}else S.groan()}
  else if(e.turnover){await callout(e.turnover==='interception'?'PICKED OFF':'FUMBLE',good?'bad':'',900);good?S.groan():S.crowd(1,.3)}
  else if(e.userCalled&&e.after?.down===1&&e.after.possession===e.offSide){await callout('FIRST DOWN','small',500,`${e.yards} yards`)}
  else if(e.kind==='sack'&&!good&&b.control!=='offense'){await callout('SACK','',700)}
  for(const ev of e.events||[])if(ev.side===b.user)await eventCallout(ev);
  await FX.wait(120);
}
async function animatePlayFast(e){
  const sp=FX.speed;FX.speed=sp*.45;await animatePlay(e);FX.speed=sp;
}
async function quickKick(e){
  if(e.sit)await setFormation(e.sit,FX.skipping?0:150);
  ticker(e.text);
  b._lastScore={...e.score};if(e.after)renderBug(e.after,e.score);
  if(e.kick==='field_goal'&&e.made){const good=e.side===b.user;await callout('FIELD GOAL',good?'small':'bad small',800);if(good)S.crowd(1,.3)}
  await FX.wait(200);
}
function initials(n){return n.split(' ').map(x=>x[0]).join('')}
// Scouting fog (Dynasty Lab film confidence): below 82, opponent grades show as a range that always contains the
// true grade; below 64 the range is wider. Your own players are always exact. The duel math never changes.
function fogSpread(){return B.filmFog(DYN?.scouting?.confidence).spread}
function isOpponentSide(side){return!!DYN&&side!==b.user}
function fogRange(grade,pid,side){
  const sp=isOpponentSide(side)?fogSpread():0;if(!sp)return null;
  let h=0;for(const ch of String(pid))h=(h*31+ch.charCodeAt(0))>>>0;const lo=Math.floor(grade)-(h%(sp+1));return{lo,hi:lo+sp+1};
}
// The duel as an addition problem: ability + each helping modifier = total, one column per side, totals face off.
// The fog key matches fighterHTML (the player's name), so a range here equals the range on the fighter card.
function duelSumHTML(d,e,uo){
  const sum=B.duelSum(d);if(!sum)return'';
  const n=v=>Number(v.toFixed(2)).toString();
  const col=(c,cls,names,pid,side)=>{
    const fog=fogRange(c.grade,pid,side),plus=c.adds.reduce((t,a)=>t+a.v,0);
    const ability=fog?`${fog.lo}–${fog.hi}`:n(c.grade),total=fog?`${n(fog.lo+plus)}–${n(fog.hi+plus)}`:n(c.total);
    return`<div class="dcol ${cls}"><div class="dwho">${esc(names.filter(Boolean).join(' & '))}</div>
      <div class="add" title="Relevant traits scaled to a matchup grade; card modifiers are added separately."><b>${ability}</b><span>Ability</span></div>
      ${c.adds.map(a=>`<div class="add"><b>+ ${n(a.v)}</b><span>${esc(fog?a.src.replace(/ \(health \d+\)/g,''):a.src)}</span></div>`).join('')}
      <div class="dtotal"><b>${total}</b><span>Total</span></div></div>`;
  };
  const fogged=!!fogSpread(),mine=uo?sum.edge:-sum.edge,chance=Math.round((uo?d.p:1-d.p)*100);
  const verdict=fogged?'Their ability is a range at your film confidence, so the edge is uncertain.':`${n(sum.off.total)} vs ${n(sum.def.total)} · your edge ${mine>0?'+':''}${n(mine)} · ${chance}% to win this duel${Math.abs(d.raw)>=3?' (at the limit)':''}`;
  return`<div class="dsum">${col(sum.off,'o',d.offNames||[],d.offNames?.[0]||'',e.offSide)}<div class="dvs">VS</div>${col(sum.def,'d',d.defNames||[],d.defNames?.[0]||'',e.defSide)}</div><div class="dverdict">${esc(verdict)}</div>`;
}
function fogGrade(grade,pid,side){
  const sp=isOpponentSide(side)?fogSpread():0;if(!sp)return{text:String(Number(grade.toFixed(2))),fog:false};
  let h=0;for(const ch of String(pid))h=(h*31+ch.charCodeAt(0))>>>0;const lo=Math.floor(grade)-(h%(sp+1));
  return{text:`${lo}–${lo+sp+1}`,fog:true};
}
function fighterHTML(cls,names,roles,lineup,grade,color,side){
  grade=fogGrade(grade,names[0],side).text;
  grade=typeof grade==='number'?Number(grade.toFixed(1)):grade;
  const p=lineup[roles[0]];const hot=p&&b.fire[p.id];
  return`<div class="fighter ${cls} ${hot?'burn':''}" style="--${cls==='o'?'oc':'dc'}:${color}"><canvas class="face" data-pid="${esc(p?p.id:'')}" data-side="${cls}" width="64" height="64" aria-label="${esc(names[0]||'')}"></canvas><div><div class="nm">${esc(names.join(' & '))}</div><div class="ar">${esc(p?p.archetype:'')}${hot?' · 🔥 ON FIRE':''}</div></div><div class="gr">${grade}</div></div>`;
}
async function cinematic(e){
  renderBug(e.sit,b._lastScore||e.score);
  await setFormation(e.sit,FX.skipping?0:250,e);
  const uo=userOff(e),stage=$('#stage'),clash=$('#clash');
  const offT=teamOf(e.offSide),defT=teamOf(e.defSide),offLine=B.snapLineup(b,e,'off'),defLine=B.snapLineup(b,e,'def');
  // Phase 1: three duel clashes.
  if(e.penalty){await callout('FLAG!','bad small',1000,e.penalty.label);b._lastScore={...e.score};return}
  clash.classList.add('on');
  for(let i=0;i<3;i++){
    const d=e.duels[i],won=e.duelResults[i].won,userWon=uo?won:!won;
    const slot=d.key==='G'?'GATE':d.key==='K'?'KEY':'FINISH';
    clash.innerHTML=`<div class="cl"><div class="lab">${slot}${d.label.toUpperCase()===slot?'':' · '+esc(d.label)}</div>
      ${fighterHTML('o',d.offNames,d.offRoles,offLine,d.offGrade,offT.colors[0],e.offSide)}<div class="vs">VS</div>
      ${fighterHTML('d',d.defNames,d.defRoles,defLine,d.defGrade,defT.colors[0],e.defSide)}
      <div class="clashmath">${duelSumHTML(d,e,uo)}</div>
      <div class="stamp ${userWon?'w':'l'}">${userWon?'WIN':'LOSE'}</div></div>`;
    for(const cv of clash.querySelectorAll('canvas.face')){const lu=cv.dataset.side==='o'?offLine:defLine,pl=Object.values(lu).find(x=>x.id===cv.dataset.pid);if(pl)paintPortrait(cv,pl,(cv.dataset.side==='o'?offT:defT).colors,64)}
    const fo=clash.querySelector('.fighter.o'),fd=clash.querySelector('.fighter.d'),vs=clash.querySelector('.vs');
    S.whoosh();
    await Promise.all([FX.anim(fo,[{transform:'translateX(-80vw)'},{transform:'translateX(10px)'},{transform:'none'}],{duration:340,easing:'ease-in'}),FX.anim(fd,[{transform:'translateX(80vw)'},{transform:'translateX(-10px)'},{transform:'none'}],{duration:340,easing:'ease-in'})]);
    S.clash();FX.shake(stage,.9);FX.anim($('#flash'),[{opacity:.55},{opacity:0}],180);
    const r=stage.getBoundingClientRect();PT.burst(r.left+r.width/2,r.top+r.height*.42,{n:36,speed:9,colors:['#fff','#ffe066','#ff9a3c']});
    FX.anim(vs,[{transform:'translateX(-50%) scale(2)',opacity:0},{transform:'translateX(-50%) scale(1)',opacity:1}],200);
    for(const [j,m] of [...clash.querySelectorAll('.dsum .add')].entries()){await FX.wait(110);S.tick(j*2+4);FX.anim(m,[{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:200,easing:'cubic-bezier(.2,1.6,.4,1)'})}
    for(const t of clash.querySelectorAll('.dsum .dtotal'))FX.anim(t,[{opacity:0,transform:'scale(1.6)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.3,1.5,.5,1)'});await FX.wait(200);
    await FX.wait(260);
    const st=clash.querySelector('.stamp');
    if(userWon){S.tone(660,.12,'square',.12);S.tone(990,.18,'square',.1,1,.08)}else S.tone(150,.25,'sawtooth',.14,.6);
    await FX.anim(st,[{opacity:0,transform:'translateX(-50%) rotate(-8deg) scale(3)'},{opacity:1,transform:'translateX(-50%) rotate(-8deg) scale(1)'}],{duration:220,easing:'cubic-bezier(.3,1.5,.5,1)'});
    FX.shake(stage,userWon?.5:.7);
    await FX.wait(420);
    if(i===0&&!won)break; // a lost Gate decides the play
  }
  clash.classList.remove('on');clash.innerHTML='';
  // Phase 2: the play runs.
  hideTip();clearGlow();
  await animatePlay(e);
  celebrateCards(e);
  showMatchupStory(e);
  // Phase 3: count the yards, then the callout.
  const before=b._lastScore||e.score,td=e.score[e.offSide]-before[e.offSide]>=6;
  b._lastScore={...e.score};
  if(e.kind!=='inc'&&!e.turnover){
    const y=$('#yards'),target=e.yards;y.style.color=((target>0)===uo)?'#ffe066':'#ff8a7a';
    FX.anim(y,[{opacity:0,transform:'scale(.4)'},{opacity:1,transform:'scale(1)'}],{duration:180,easing:'cubic-bezier(.2,1.6,.4,1)'});
    let last=0;await FX.tween(Math.min(900,240+Math.abs(target)*28),t=>{const v=Math.round(target*t);if(v!==last){last=v;S.tick(Math.abs(v))}y.textContent=`${v>0?'+':''}${v}`},FX.ease.out);
    FX.shake(stage,Math.min(1.6,.4+Math.abs(target)/25));
    await FX.wait(350);FX.anim(y,[{opacity:1},{opacity:0,transform:'translateY(-40px)'}],300);
  }
  renderBug(e.after,e.score);
  const goodFor=offGood=>offGood===uo;
  const firstDown=e.after.possession===e.offSide&&e.after.down===1&&!td&&!e.turnover;
  if(td){await bigMoment('TOUCHDOWN!',goodFor(true),offT.short)}
  else if(e.turnover==='interception')await callout('PICKED OFF!',goodFor(false)?'':'bad',1200,e.text.split(':')[1]?.split('.')[0]);
  else if(e.turnover==='fumble')await callout('FUMBLE!',goodFor(false)?'':'bad',1200);
  else if(e.kind==='sack')await callout('SACK!',goodFor(false)?'':'bad',1100,`${e.yards} yards`);
  else if(e.kind==='inc')await callout('INCOMPLETE',goodFor(false)?'small':'cool small',800);
  else if(e.after.possession!==e.offSide)await callout('STOPPED!',goodFor(false)?'':'bad',1100,'turnover on downs');
  else if(e.yards>=20)await callout('BIG PLAY!',goodFor(true)?'':'bad',1200,`+${e.yards} yards${firstDown?' · first down':''}`);
  else if(firstDown)await callout('FIRST DOWN!',goodFor(true)?'':'bad',1000);
  else if(e.yards<=0)await callout('STUFFED!',goodFor(false)?'':'bad small',800);
  if(goodFor(true)&&(td||e.yards>=20||firstDown))S.crowd(td?2:1.2,td?.55:.35);
  if(e.reset)await callout('DEFENSE BACKS OFF','hotc small',1000,{run:'They stop committing to the run',quick:'They stop sitting on short passes',pressure:'They back off the repeated pressure'}[e.reset]);
  for(const ev of e.events||[])await eventCallout(ev);
  ticker(e.text);
}
async function eventCallout(ev){
  const mine=ev.side===b.user;
  if(ev.type==='combo'){
    if(mine&&!save.combos.includes(ev.id)){save.combos.push(ev.id);writeSave()}
    if(mine){S.chime();PT.burst(innerWidth/2,innerHeight*.45,{n:60,colors:['#ffe066','#fff']})}
    await callout(mine?'COMBO!':'THEIR COMBO',mine?'':'bad',1300,`${ev.name} · ${ev.reward}`);
  }else if(ev.type==='fire'){
    if(mine){S.fire();PT.embers(innerWidth/2,innerHeight*.55)}
    await callout('ON FIRE!',mine?'hotc':'bad',1300,`${ev.name} (${ev.role})`);
  }else if(ev.type==='cooled'){
    await callout('COOLED OFF',mine?'cool small':'small',900,ev.name);
  }
}
async function callout(text,cls='',ms=1000,sub=''){
  const c=$('#callout');c.innerHTML=`<div class="co ${cls}">${esc(text)}${sub?`<span class="sub">${esc(sub)}</span>`:''}</div>`;
  const el=c.firstChild;
  await FX.anim(el,[{opacity:0,transform:'skewX(-8deg) scale(2.6) rotate(-4deg)'},{opacity:1,transform:'skewX(-8deg) scale(.94)'},{opacity:1,transform:'skewX(-8deg) scale(1)'}],{duration:260,easing:'cubic-bezier(.2,1.4,.4,1)'});
  if(!cls.includes('small')&&!cls.includes('cool'))FX.shake($('#stage'),.8);
  await FX.wait(ms);
  await FX.anim(el,[{opacity:1},{opacity:0,transform:'skewX(-8deg) translateY(-30px) scale(1.1)'}],220);
  c.innerHTML='';
}
async function bigMoment(text,good,sub){
  const rays=$('#rays');
  if(good){rays.classList.add('on');S.fanfare();PT.confetti(180);FX.anim($('#flash'),[{opacity:.8},{opacity:0}],400)}else S.groan();
  FX.shake($('#stage'),2);
  await callout(text,good?'':'bad',1600,sub);
  rays.classList.remove('on');
}

// ================================================================ fourth down
function coachingDialog(title,body){
  const dialog=document.createElement('dialog');
  dialog.className='coaching-dialog';dialog.setAttribute('aria-labelledby','coachingTitle');
  dialog.innerHTML=`<h2 id="coachingTitle">${esc(title)}</h2>${body}`;
  document.body.appendChild(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
  return dialog;
}
function meshDialog(){
  renderBug();
  const r=req,dialog=coachingDialog('Read the end',`<p>${esc(r.cue)}</p>
    <p class="statline">Watch the unblocked end. ${esc(r.linebacker)} has the other lane.</p>
    <button type="button" class="btn" data-mesh="give">Give inside · ${esc(r.back)}</button>
    <button type="button" class="btn" data-mesh="keep">Keep outside · ${esc(r.qb)}</button>
    <button type="button" class="btn" data-mesh="auto">Let the QB read it</button>`);
  const finish=choice=>{dialog.close();go(choice==='auto'?{type:'auto'}:{type:'mesh',choice})};
  for(const button of dialog.querySelectorAll('[data-mesh]'))button.onclick=()=>finish(button.dataset.mesh);
  dialog.oncancel=e=>{e.preventDefault();finish('auto')};
}
function halftimeDialog(){
  renderBug();setFormation(sitNow());refresh();
  const r=req,preferred=D.TACTICS[r.suggestion];
  const evidence=[r.lostProtection?`${r.lostProtection} lost protection Gate${r.lostProtection===1?'':'s'} on offense`:'',
    r.allowedPasses?`${r.allowedPasses} completion${r.allowedPasses===1?'':'s'} of 10+ yards allowed${r.threat?.name?`, ${r.threat.count} to ${r.threat.name}`:''}`:''].filter(Boolean).join(' · ');
  const dialog=coachingDialog('Halftime adjustment',`
    ${evidence?`<p class="statline">${esc(evidence)}</p>`:''}
    <p>Make one adjustment. Feature a personnel package on offense or script an equipped tactic for its unit’s first second-half hand. The tactic replaces one normal draw.</p>
    ${preferred?`<p>Staff suggestion · <b>${esc(preferred.name)}</b>${r.suggestion==='bracket'&&r.bracketTarget?.name?` on ${esc(r.bracketTarget.name)} · Extra help against this receiver leaves others more space.`:` · ${esc(preferred.text)}`}</p>`:''}
    <label>Second-half adjustment <select id="halfTactic"><option value="">Keep the game plan</option>${(r.packages||[]).map(o=>`<option value="package:${esc(o.id)}">${esc(o.name)} personnel</option>`).join('')}${r.options.map(({id,role})=>`<option value="${esc(id)}">${esc(D.TACTICS[id].name)} · ${role==='off'?'offense':'defense'}</option>`).join('')}</select></label><p id="halfDetail" aria-live="polite"></p>
    <button type="button" class="btn go" id="halfContinue">Start the second half</button>`);
  const select=dialog.querySelector('select');
  select.onchange=()=>{
    const id=select.value,group=r.packages?.find(p=>'package:'+p.id===id);
    dialog.querySelector('#halfDetail').textContent=id==='bracket'&&r.bracketTarget?`Prepare a bracket on ${r.bracketTarget.name} when he is on the field. You can change the assignment before the snap.`:group?.detail||D.TACTICS[id]?.text||'';
  };
  const finish=id=>{dialog.close();go({type:'halftime',adjustment:id||null})};
  dialog.querySelector('#halfContinue').onclick=()=>finish(dialog.querySelector('select').value);
  dialog.oncancel=e=>{e.preventDefault();finish(null)};
}
$('#sidelineBtn').onclick=()=>{
  if(busy)return;
  const o=B.sidelineOptions(b);if(!o)return;
  const threat=B.revealedThreat(b,b.game.possession);
  const editable=o.offense||o.late||o.canCoachDrive;
  const dialog=coachingDialog(editable?'Sideline instructions':'Sideline film',`
    ${o.canCoachDrive?`<label class="timeout-choice"><input type="checkbox" id="coachDrive" ${o.coachDrive?'checked':''}> Call every snap this drive</label><p>Key Moments resumes when this possession ends.</p>`:''}
    ${recentSnapsHTML(b.game.possession)}
    ${o.tactics.length?`<label>Keep on a first down <select id="keepTactic"><option value="">Draw a fresh hand</option>${o.tactics.map(id=>`<option value="${esc(id)}" ${id===o.keep?'selected':''}>${esc(D.TACTICS[id].name)}</option>`).join('')}</select></label>
       <p>If this tactic is still in hand when you earn a first down, keep one copy and draw one fewer. A change of possession clears the choice.</p>`:''}
    ${o.retained?`<p>You carried ${esc(D.TACTICS[o.retained]?.name||o.retained)} into this series.</p>`:''}
    ${o.late&&o.offense?`<label>Two-minute tempo <select id="clockIntent">${[['normal','Normal snap timing'],['preserve','Hurry to the line · up to 13 seconds'],['drain','Use the play clock · up to 10 extra seconds']].map(([id,label])=>`<option value="${id}" ${id===o.intent?'selected':''}>${label}</option>`).join('')}</select></label><p>Applies to running-clock snaps for the rest of this half. Stoppages and opponent timeouts still apply.</p>`:''}
    ${o.late?`<label class="timeout-choice"><input type="checkbox" id="clockTimeout" ${o.timeoutNext?'checked':''} ${o.timeouts?'':'disabled'}> Call timeout after this snap if the clock would run · ${o.timeouts} left</label>`:''}
    ${o.offense&&o.featurable?.length?(o.featured?`<p>Featured this half · <b>${esc(o.featured.name||'your player')}</b> · ${o.featured.left} touch${o.featured.left===1?'':'es'} left with the feature active.</p>`
      :`<label>Feature a player this half <select id="featurePlayer"><option value="">No featured player</option>${o.featurable.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.role)}</option>`).join('')}</select></label>
       <p>Calls designed for him give his duels +1 until he records two carries or catches. The defense spots his productive touches sooner.</p>`):''}
    ${threat?`<p>Recent film · ${esc(b.personnel[threat.playerId]?.name||'The same player')} gained ${threat.yards} yards on ${threat.count} productive ${esc(D.PLAYS[threat.play].name)} call${threat.count===1?'':'s'}.</p>`:''}
    <div>${editable?'<button type="button" class="btn go" id="sidelineApply">Apply</button> ':''}<button type="button" class="btn" id="sidelineCancel">${editable?'Cancel':'Close'}</button></div>`);
  dialog.querySelector('#sidelineCancel').onclick=()=>dialog.close();
  if(!editable)return;
  dialog.querySelector('#sidelineApply').onclick=()=>{
    B.setSideline(b,{coachDrive:dialog.querySelector('#coachDrive')?.checked,keep:dialog.querySelector('#keepTactic')?.value||null,
      intent:dialog.querySelector('#clockIntent')?.value||o.intent,timeoutNext:!!dialog.querySelector('#clockTimeout')?.checked,
      feature:dialog.querySelector('#featurePlayer')?.value||null});
    writeSave();dialog.close();renderBug();
  };
};
function fourthModal(){
  renderBug();setFormation(sitNow());refresh();$('#hand').classList.add('away');$('#hand').inert=true;
  const r=req,m=$('#modal');
  const lab={go:'GO FOR IT',punt:'PUNT',field_goal:`FIELD GOAL · ${Math.round(r.fgChance*100)}%${r.kicker?.adjust?` (${r.kicker.name?esc(r.kicker.name)+' ':''}${r.kicker.adjust>0?'+':''}${Math.round(r.kicker.adjust*100)}%)`:''}`};
  const last=B.lastCallRecap(b),nth=['','1st','2nd','3rd','4th'][last?.down]||'Last';
  // Keep the coach's own call in view: this modal opens right after it and would otherwise cover the matchup story.
  const story=$('#matchupStory');if(story&&last)story.hidden=true; // the recap now carries it; avoid a ghost behind the scrim
  const recap=last?`<p class="fourth-last" id="lastCall"><span class="eyebrow">Your ${nth}-down call</span><b>${esc(last.name)} · ${esc(last.result)}</b>${last.summary?`<span class="${last.offWon?'won':'lost'}">${esc(last.summary)}</span>`:''}</p>${last.defense?`<details><summary>Defensive call</summary>${esc(last.defense)}</details>`:''}`:'';
  m.innerHTML=`<div class="mwrap"><p class="big gold">4TH DOWN</p>${recap}<p class="statline">${r.twoDown?'Two-down territory · ':''}${r.situation.distance} to go · staff says <b>${esc(lab[r.recommended]||r.recommended)}</b></p>
    <div>${r.options.map(o=>`<button class="btn ${o===r.recommended?'go':''}" data-o="${o}">${esc(lab[o])}</button>`).join('')}</div></div>`;
  m.classList.add('on');
  m.querySelectorAll('[data-o]').forEach(el=>el.onclick=()=>{m.classList.remove('on');S.whoosh();go({choice:el.dataset.o})});
}

// ================================================================ final + pack
function drawGamePack(won){
  const opp=b.user==='home'?'away':'home';
  return P.openPack(save.playbook,{won,rivalry:b.rivalry,stage:DYN?.stage||null,favor:won?DYN?.packFavor:null,favorWhy:DYN?.packFavorWhy,seed:DYN?`${DYN.seed}:${save.games}`:`${save.team}:${save.games}`,oppTendency:b.tend[opp],worldTaken:DYN?HOST.rewardContext().worldTaken:W.takenLegendaries(save.world,save.playbook,'user')});
}
function attachTryouts(pack){
  const ids=new Set(pack.cards.flatMap(c=>[c.id,c.exchange].filter(Boolean).map(id=>P.awardedId(save.playbook,id))));
  return {...pack,tryouts:Object.fromEntries([...ids].map(id=>[id,B.tryRewardCard({battle:b},id)]))};
}
function freezeReward(won){
  const opponent=teamOf(b.user==='home'?'away':'home');
  return attachTryouts(P.freezeGamePack(save.playbook,drawGamePack(won),{key:DYN.seed,year:DYN.season,source:`${DYN.stage?DYN.label:'Week '+DYN.week} vs ${opponent.name}`}));
}
function breakoutSpec(){
  return SG.breakoutCard(b,b.user,b._breakout,{season:DYN?DYN.season:save.world.season,colors:teamOf(b.user).colors});
}
// Close the battle and bank the offer in the SAME host save. No currency, automatic pick or week gate.
function bankAndReturn(){
  if(!DYN||!b._recorded||b._packPicked||b._closed||!b._gamePack)return;
  const pb=save.playbook,pack=b._gamePack,locker=pb.gamePacks??=[];
  if(!locker.some(p=>p.key===pack.key))locker.push(pack.tryouts?pack:attachTryouts(pack));
  if(b._breakout&&!b._breakoutResolved){
    const spec=breakoutSpec();
    if(SG.add(pb,spec).full){
      (pb.reserveSignatures??=[]).push(spec);SG.register(spec);pb.lastSignatureGame=pb.gamesPlayed;
      (pb.history??=[]).push({id:spec.id,kind:'signature',side:spec.side});
    }
    b._breakoutResolved=true;
  }
  b._closed=true;save.activeBattle=null;writeSave();
  HOST.close(pack.title+' saved. Open it from Collection whenever you like.');
}
function bankButton(){
  return DYN?`<button class="btn" id="bankPack">SAVE PACK FOR LATER &amp; RETURN</button>${b._breakout&&!b._breakoutResolved?`<p class="mini">${esc(b._breakout.p.name)}’s breakout signature will be kept too. No active signature is replaced.</p>`:''}`:'';
}
function bindBank(){const button=$('#bankPack');if(button)button.onclick=bankAndReturn}

// Put one earned card to work without sending the coach through the deck builder.
const gameMilestones=()=>[...(b._programMilestones||[]),...(b._achievements||[])];
function milestoneOption(){
  if(b._installedMilestone)return null;
  const pb=save.playbook;
  for(const a of gameMilestones()){
    const d=P.cardDef(a.reward);if(!d)continue;
    const deck=pb[d.side],pile=D.TACTICS[d.id]?'tactics':'wrinkles';
    const index=pb.reserve?.[d.side]?.[pile]?.indexOf(d.id)??-1;
    if(index>=0&&!deck.base.includes(d.id)&&!deck[pile].includes(d.id)&&deck[pile].length<pb.capacity[pile])return{a,d,pile,index};
  }
  return null;
}
function milestoneHTML(){
  const awards=gameMilestones();if(!awards.length)return '';
  const picked=P.cardDef(b._installedMilestone),option=milestoneOption();
  const featured=option?.a||awards.find(a=>a.reward===picked?.id)||awards[0];
  const d=P.cardDef(featured.reward);if(!d)return '';
  const others=awards.filter(a=>a!==featured);
  return `<section class="box" id="milestoneReward" style="text-align:left"><h3>${esc(featured.name)} · ${esc(d.name)}</h3><p class="mini">${esc(featured.how)}. ${esc(d.text||'')}</p>
    ${option?`<button type="button" class="tbtn" id="equipMilestone">Add ${esc(d.name)} to next game's deck</button><p class="mini">Leave it in your collection by continuing below.</p>`:`<p class="mini">${[...save.playbook[d.side].base,...save.playbook[d.side].wrinkles,...save.playbook[d.side].tactics].includes(d.id)?'In your deck for next game.':'Earned for your collection.'}</p>`}
    ${others.length?`<details><summary>Other milestones (${others.length})</summary>${others.map(a=>`<p class="mini">${esc(a.name)} · ${esc(P.cardDef(a.reward)?.name||a.reward)} earned</p>`).join('')}</details>`:''}</section>`;
}
function bindMilestone(){
  const el=$('#equipMilestone');if(!el)return;
  const offered=milestoneOption();if(!offered)return;
  el.onclick=()=>{
    if(b._closed||b._packPicked)return;
    const o=milestoneOption();if(!o||o.d.id!==offered.d.id){refreshMilestone();return}
    P.moveCard(save.playbook,o.d.side,o.pile,o.index,true);
    b._installedMilestone=o.d.id;writeSave();
    refreshMilestone();
    $('#openPack')?.focus?.();
  };
}
function refreshMilestone(){const box=$('#milestoneReward');if(box){box.outerHTML=milestoneHTML();bindMilestone()}}

function finalScreen(){
  if(b._packPicked){const over=P.overCapacity(save.playbook);if(over)cutScreen(over);else afterPack();return}
  $('#sheetToggle').hidden=true;$('#hand').classList.add('away');$('#hand').inert=true;$('#look').innerHTML='';renderBug();
  const won=b.game.score[b.user]>b.game.score[b.user==='home'?'away':'home'];
  if(DYN&&!b._recorded){
    try{b._saved=HOST.record(JSON.parse(JSON.stringify(b.game)),B.duelTally(b),B.decidingMoments(b),B.callFilm(b),B.archivedDrive(b,[DYN.playbook,DYN.oppPlaybook]))}catch(e){b._saved={ok:false,error:e.message||String(e)}}
    if(!b._saved?.ok){
      const m=$('#modal');m.innerHTML=`<div class="mwrap"><p class="big red">RESULT NOT SAVED</p><p class="statline">${esc(b._saved?.error||'The result could not be recorded.')}</p><p>Your season and card rewards are unchanged. Retry to record this finished game.</p><button class="btn go" id="retryRecord">RETRY SAVE</button><button class="btn" id="leaveUnsaved">RETURN TO DYNASTY</button></div>`;
      m.classList.add('on');$('#retryRecord').onclick=()=>finalScreen();$('#leaveUnsaved').onclick=()=>HOST.close();return;
    }
  }
  if(!b._recorded){
    // The host awards program/rivalry cards while recording. Adopt that committed inventory before
    // this frame adds game reps and achievements, so its next snapshot cannot erase the host's awards.
    if(DYN){
      const committed=HOST.committedPlaybook();
      if(committed){
        const previous=new Set(save.playbook.programCards||[]);
        b._programMilestones=(committed.programCards||[]).filter(id=>!previous.has(id)).map(reward=>({
          reward,name:'Program milestone',how:committed.history?.find(h=>h.id===reward&&h.kind==='program')?.why||'Program achievement'
        }));
        save.playbook=committed;
      }
    }
    b._recorded=true;b._breakout=SG.candidate(b,b.user,save.playbook);save.playbook.record[won?'w':'l']++;save.games++;save.playbook.gamesPlayed=(save.playbook.gamesPlayed||0)+1;
    if(DYN){for(const [root,n] of Object.entries(DYN.practiceReps||{}))EV.addReps(save.playbook,root,n)}
    else{CL.recordCareers(save.world.userLineup,b.players);const op=save.world.programs[oppId()];if(op?.lineup)CL.recordCareers(op.lineup,b.players);save.pending={won,userTendency:b.tend[b.user]}}
    b._gained=EV.recordReps(save.playbook,b.log,b.user,b._trainingRates||DYN?.trainingRates||{});b._achievements=P.awardAchievements(save.playbook,b,b.user);if(DYN)b._gamePack=freezeReward(won);writeSave()}
  if(DYN&&!b._gamePack){b._gamePack=freezeReward(won);writeSave()} // older final, not yet opened
  const top=Object.values(b.players).filter(p=>p.side===b.user).sort((a,c)=>(c.passYds+c.rushYds*1.6+c.recYds*1.6+c.sacks*30+c.intDef*35)-(a.passYds+a.rushYds*1.6+a.recYds*1.6+a.sacks*30+a.intDef*35)).slice(0,3);
  const line=p=>[p.passAtt?`${p.comp}/${p.passAtt} · ${p.passYds} yds · ${p.passTD} TD`:'',p.rushAtt?`${p.rushAtt} car · ${p.rushYds} yds`:'',p.rec?`${p.rec} rec · ${p.recYds} yds`:'',p.sacks?`${p.sacks} sacks`:'',p.intDef?`${p.intDef} INT`:''].filter(Boolean).join(' · ');
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="big ${won?'gold':'red'}">${won?'VICTORY':'DEFEAT'}</p>
    <p class="statline">${esc(teamOf('home').short)} <b>${b.game.score.home}</b> — <b>${b.game.score.away}</b> ${esc(teamOf('away').short)}${DYN?'':` · record <b>${save.playbook.record.w}-${save.playbook.record.l}</b>`}</p>
    ${DYN?(b._saved?.ok?'<p class="statline" style="color:var(--win)">✓ SAVED TO YOUR SEASON</p>':`<p class="statline" style="color:var(--lose)">NOT SAVED: ${esc(b._saved?.error||'unknown error')}. Your season is unchanged.</p>`):''}
    <div style="margin:14px 0">${top.map(p=>`<div class="statline" style="font-size:16px"><b>${esc(p.name)}</b> ${p.role} · ${esc(line(p))}</div>`).join('')}</div>
    ${deciderHTML()}${takeawayHTML()}
    ${b.rivalry?(DYN?`<p class="statline">RIVALRY ${won?'WON':'LOST'}</p>`:`<div class="trophyWrap ${won?'won':''}">${trophyImg()}<p class="statline">${won?`<b>${esc(trophyName())}</b> ${save.world.trophy.holder==='user'?'stays':'comes'} home`:`${esc(specOf(oppId()).short)} keeps <b>${esc(trophyName())}</b>`}</p></div>`):''}
    ${milestoneHTML()}
    <button class="btn go" id="openPack">${b._breakout&&!b._breakoutResolved?'⭐ SEE THE BREAKOUT':won?(P.STAGE_PACKS?.[DYN?.stage]?`OPEN ${P.STAGE_PACKS[DYN.stage].title.toUpperCase()}`:b.rivalry?'OPEN RIVALRY PACK':'OPEN VICTORY PACK'):'OPEN FILM STUDY PACK'}</button>${bankButton()}</div>`;
  m.classList.add('on');
  if(won){PT.confetti(220);S.fanfare()}else S.groan();
  const swapBtn=m.querySelector('[data-film-swap]');if(swapBtn)swapBtn.onclick=()=>{const swap=lossSwapFor(B.postgameTakeaway(b));if(!swap){swapBtn.remove();return}
    window.CallSheet.playbookUI.open(save.playbook,{suggest:swap,maxStored:DYN?500:Infinity,maxUnusedSignatures:DYN?100:Infinity,team:teamOf(b.user),onSave:pb=>{save.playbook=pb;writeSave()},onClose:()=>{refreshMilestone();const again=lossSwapFor(B.postgameTakeaway(b));if(!again)swapBtn.remove();(m.querySelector('[data-film-swap]')||m.querySelector('[data-film-deck]'))?.focus()}})};
  const review=m.querySelector('[data-film-deck]');if(review)review.onclick=()=>window.CallSheet.playbookUI.open(save.playbook,{maxStored:DYN?500:Infinity,maxUnusedSignatures:DYN?100:Infinity,team:teamOf(b.user),onSave:pb=>{save.playbook=pb;writeSave()},onClose:()=>{refreshMilestone();review.focus()}});
  bindMilestone();bindBank();$('#openPack').onclick=()=>b._breakout&&!b._breakoutResolved?breakoutScreen(won):packScreen(won);
}
async function packScreen(won){
  S.init();
  const frozen=b._gamePack,pack=frozen?{...frozen,cards:P.gamePackChoices(save.playbook,frozen,HOST.rewardContext().worldTaken)}:drawGamePack(won);
  const post=P.STAGE_PACKS?.[pack.type]||null;
  const pc=pack.type==='title'?['#fff2b0','#8a5a00']:post?['#d8dee9','#2c3448']:pack.type==='rivalry'?['#e0322a','#3a0705']:won?['#ffcc33','#7a4a00']:['#3f8fe0','#0d2a55'];
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="big ${won?'gold':''}" style="font-size:clamp(40px,7vw,80px)">${esc(pack.title.toUpperCase())}</p><p class="statline">${esc(pack.subtitle)}</p>
    <button type="button" class="pack" id="pk" aria-label="Open pack" style="--pa:${pc[0]};--pb:${pc[1]}"><div class="pt">${post?post.wrap:pack.type==='rivalry'?'RIVALRY':won?'VICTORY':'FILM<br>STUDY'}</div><div class="ps">TAP TO OPEN</div></button>
    <div class="reveal" id="rv"></div><div id="pkMsg" class="statline"></div><div id="pkBtns">${bankButton()}</div></div>`;
  bindBank();
  const pk=$('#pk');
  pk.onclick=async()=>{
    pk.onclick=null;$('#bankPack')?.remove();pk.style.animation='none';pk.querySelector('.ps').textContent='';
    for(let i=0;i<3;i++){S.rattle(i);await FX.anim(pk,[{transform:'rotate(0)'},{transform:`rotate(${(i+1)*3}deg) scale(${1+i*.03})`},{transform:`rotate(${-(i+1)*3}deg) scale(${1+i*.03})`},{transform:'rotate(0)'}],{duration:240+i*60})}
    S.rip();const r=pk.getBoundingClientRect();
    FX.anim($('#flash'),[{opacity:.9},{opacity:0}],300);PT.burst(r.left+r.width/2,r.top+r.height/2,{n:90,speed:11,colors:won?['#fff','#ffe066','#ffb03c']:['#fff','#9ad8ff','#3fc1ff']});
    await FX.anim(pk,[{transform:'scale(1)',opacity:1},{transform:'scale(1.4)',opacity:0}],260);pk.remove();
    await revealCards(pack);
  };
}
async function revealCards(pack){
  const rv=$('#rv');rv.innerHTML='';
  // Card backs in your program's colors.
  const tc=b?.teams?.[b.user]?.colors||[],target=DYN?HOST.rewardContext().pursuit:null;
  const fit=P.packFit(save.playbook,pack.cards,{target,reserveLimit:DYN?500:Infinity});
  const slots=pack.cards.map(c=>{const s=document.createElement('div');s.className='slot';s.innerHTML=`<div class="back" style="${tc[0]?`--tb1:${esc(tc[0])};--tb2:${esc(tc[1]||tc[0])}`:''}">${DYN?esc(teamOf(b.user).short):'CALL<br>SHEET'}</div><div class="front"></div><div class="why"></div>`;
    s.querySelector('.front').appendChild(card(c.id,{finish:null}));s.querySelector('.why').textContent=[c.why,target?.missing.includes(c.id)?'For your '+target.name+' album':''].filter(Boolean).join(' · ');rv.appendChild(s);return s});
  for(const [i,s] of slots.entries()){S.whoosh();FX.anim(s,[{transform:'translateY(-300px) rotate(-20deg) scale(.4)',opacity:0},{transform:'none',opacity:1}],{duration:380,easing:'cubic-bezier(.2,1.3,.4,1)'});await FX.wait(120)}
  await FX.wait(300);
  for(const [i,s] of slots.entries()){
    const c=pack.cards[i];
    if(c.rarity==='legendary'){
      $('#rays').classList.add('on');document.body.insertAdjacentHTML('beforeend','<div class="legend" id="lg"><p class="big gold">LEGENDARY</p></div>');
      S.groan();await FX.wait(250);S.fanfare();S.crowd(2.2,.6);FX.shake($('#modal'),2.2);
    }
    await FX.anim(s,[{transform:'scaleX(1)'},{transform:'scaleX(0) scaleY(1.06)'}],{duration:c.rarity==='common'?110:180,easing:'ease-in'});
    s.classList.add('flipped');
    FX.anim(s,[{transform:'scaleX(0) scaleY(1.06)'},{transform:'scaleX(1.08)'},{transform:'none'}],{duration:c.rarity==='common'?160:320,easing:'cubic-bezier(.2,1.6,.4,1)'});
    const r=s.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    if(c.rarity==='common'){S.tick(8)}
    if(c.rarity==='rare'){S.chime();FX.anim($('#flash'),[{opacity:.35},{opacity:0}],250);PT.burst(cx,cy,{n:50,colors:['#ffe066','#fff6d5','#ffb03c'],speed:7})}
    if(c.rarity==='legendary'){PT.burst(cx,cy,{n:160,speed:13,colors:['#ff5a5a','#ffd84d','#72f08a','#3fc1ff','#c07bff','#fff']});PT.confetti(120);await FX.wait(1200);document.getElementById('lg')?.remove();$('#rays').classList.remove('on')}
    await FX.wait(c.rarity==='common'?260:600);
  }
  if(fit){
    const i=pack.cards.findIndex(c=>c.id===fit.id),tag=slots[i].querySelector('.why'),button=slots[i].querySelector('.front button');
    tag.dataset.packFit=fit.id;tag.textContent='Coach’s pick';tag.title=fit.reason;
    button?.setAttribute('aria-label',button.getAttribute('aria-label')+' Coach’s pick: '+fit.reason);
    $('#pkMsg').innerHTML=`<b>Coach’s pick: ${esc(P.cardDef(fit.id).name)}</b> · ${esc(fit.reason)}<br>Pick any card, then choose where to put it.`;
  }else $('#pkMsg').textContent='Pick one card, then choose where to put it.';
  const bar=$('#pkBtns'),limit=DYN?500:Infinity;
  const preview=i=>{
    const c=pack.cards[i],name=P.cardDef(c.id).name;
    slots.forEach((s,j)=>s.querySelector('.front button').setAttribute('aria-pressed',String(i===j)));
    const wants=c.kind==='upgrade'?['upgrade']:['deck','collection'];
    $('#pkMsg').innerHTML=`<b>${esc(name)}</b> · ${c.exchangeFor?esc(c.why)+' ':''}${c.kind==='upgrade'?'Replaces the original copy.':'Add it to your deck to draw it in games, or keep it in your collection for later.'}`;
    bar.innerHTML=wants.map(want=>{
      const full=P.rewardDestination(save.playbook,c,true,limit,want)==='full',label=want==='upgrade'?'Upgrade '+P.cardDef(c.replaces).name:want==='deck'?(full?'Deck limit reached':'Add to deck'):(full?'Collection limit reached':'Add to collection');
      return `<button type="button" class="btn" data-pack-destination="${want}"${full?' disabled':''}>${esc(label)}</button>`;
    }).join('')+'<button type="button" class="btn" data-try-card>Try this card</button>'+bankButton()+'<p class="statline" role="status" data-try-result></p>';bindBank();
    bar.querySelector('[data-try-card]').onclick=()=>{bar.querySelector('[data-try-result]').textContent=B.tryRewardCard({battle:b},c.id)};
    bar.querySelectorAll('[data-pack-destination]').forEach(button=>button.onclick=()=>choose(pack,slots,i,button.dataset.packDestination));
    (bar.querySelector('[data-pack-destination]:not(:disabled)')||bar.querySelector('#bankPack'))?.focus();
  };
  slots.forEach((s,i)=>{s.classList.add('pickable');s.onclick=()=>preview(i)});
  bar.innerHTML=bankButton();bindBank();
}
async function choose(pack,slots,i,want){
  if(b._packPicked||b._closed||!slots[i].classList.contains('pickable'))return;
  const dest=P.rewardDestination(save.playbook,pack.cards[i],true,DYN?500:Infinity,want);
  if(dest==='invalid'||dest==='full')return;
  $('#pkBtns').innerHTML='';
  slots.forEach(s=>{s.onclick=null;s.classList.remove('pickable')});
  const c=pack.cards[i];S.chime();
  slots[i].classList.add('chosen');
  for(const [j,s] of slots.entries()){if(j===i)continue;s.classList.add('burn');const r=s.getBoundingClientRect();S.burn();PT.embers(r.left+r.width/2,r.top+r.height*.7)}
  await FX.wait(1000);
  const res=P.applyPick(save.playbook,c,{serial:b._gamePack?.serial??save.playbook.packsOpened,stored:dest==='stored',from:b._gamePack?{pack:b._gamePack.key,source:b._gamePack.source}:null});b._packPicked=true;writeSave();
  if(c.finish)callout(c.finish==='gold'?'GOLD PRINT':'FOIL PRINT','small',900,`${P.cardDef(c.id)?.name||c.id} · a ${c.finish} card for your collection`);
  const def=P.cardDef(c.id);
  $('#pkMsg').innerHTML=`<b>${esc(def.name)}</b> ${dest==='upgrade'?'upgraded.':dest==='stored'?'added to your collection, not your deck.':'added to your deck.'}`;
  if(res.over){await cutScreen(res.over,c);return}
  afterPack();
}
async function cutScreen(over,added){
  const pb=save.playbook,list=pb[over.side][over.pile];
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="big red" style="font-size:clamp(40px,7vw,80px)">PLAYBOOK FULL</p>
    <p class="statline">You can select up to ${pb.capacity[over.pile]} ${over.side==='off'?'offensive':'defensive'} ${over.pile==='wrinkles'?'plays':'tactics'}. <b>Remove one card from your deck.</b> You still own it and can add it again between games.</p>
    <div class="pbgrid" id="cutg"></div></div>`;
  const g=$('#cutg');
  list.forEach((id,i)=>{const w=document.createElement('div');w.className='cutme';const el=card(id,{small:true});w.appendChild(el);w.onclick=async()=>{
    if(g.inert)return;
    g.inert=true;
    S.burn();el.style.transition='filter .6s, opacity .8s, transform .8s';el.style.filter='brightness(1.8) sepia(1) saturate(4)';el.style.opacity=0;el.style.transform='translateY(30px) scale(.8)';
    const r=el.getBoundingClientRect();PT.embers(r.left+r.width/2,r.top+r.height/2);
    P.cut(pb,over.side,over.pile,i);writeSave();await FX.wait(700);
    const again=P.overCapacity(pb);if(again)cutScreen(again,added);else afterPack();
  };g.appendChild(w)});
}
// In a dynasty, branches unlock with the players who run them (the battle's real lineup). The sandbox has no gates.
const evoReady=pb=>EV.ready(pb,{lineup:DYN&&b?b.teams[b.user].lineup:null}).filter(x=>!(DYN&&pb.deferredEvolutions?.includes(x.rootId))&&x.options.some(id=>!x.locks?.[id]));
async function afterPack(){
  await FX.wait(900);
  const r=evoReady(save.playbook);
  if(r.length){evolutionScreen(r[0]);return}
  afterWeek();
}

// ================================================================ weather, rivalry, breakouts
const WX={clear:{label:'Clear',icon:'☀',note:'No effect on the duels'},rain:{label:'Rain',icon:'🌧',note:'Wet ball: every pass Finish −1'},wind:{label:'Wind',icon:'🌬',note:'Swirling wind: deep passes Key −1'},snow:{label:'Snow',icon:'❄',note:'Every Finish −1; run Gates +1'}};
function weatherFor(){if(DYN)return DYN.weather||'clear';const r=window.DynastyRng.create(`wx:${save.world.seed}:${save.games}`).next();return r<.55?'clear':r<.72?'rain':r<.88?'wind':'snow'}
let wxLoop=null;
function setWeather(kind){
  let cv=$('#wx');if(!cv){cv=document.createElement('canvas');cv.id='wx';$('#stage').prepend(cv)}
  cancelAnimationFrame(wxLoop);const ctx=cv.getContext('2d');
  const fit=()=>{cv.width=cv.clientWidth;cv.height=cv.clientHeight};fit();
  ctx.clearRect(0,0,cv.width,cv.height);
  if(kind==='clear'||FX.reduce){cv.style.display=kind==='clear'?'none':'block';return}
  cv.style.display='block';
  const N=kind==='rain'?260:kind==='snow'?220:60,parts=Array.from({length:N},()=>({x:Math.random()*cv.width,y:Math.random()*cv.height,v:Math.random()}));
  const tick=()=>{
    if(cv.width!==cv.clientWidth)fit();
    ctx.clearRect(0,0,cv.width,cv.height);
    for(const p of parts){
      if(kind==='rain'){p.x+=-2-p.v;p.y+=14+p.v*8;ctx.strokeStyle='rgba(190,215,255,.55)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+4,p.y-20);ctx.stroke()}
      else if(kind==='snow'){p.x+=Math.sin((p.y+p.v*99)/40)*.8;p.y+=1+p.v*1.5;ctx.fillStyle='rgba(255,255,255,.9)';ctx.beginPath();ctx.arc(p.x,p.y,1.8+p.v*2.6,0,7);ctx.fill()}
      else{p.x+=9+p.v*7;p.y+=Math.sin(p.x/60)*.6;ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-40-p.v*40,p.y);ctx.stroke()}
      if(p.y>cv.height+20){p.y=-20;p.x=Math.random()*cv.width}if(p.x<-60)p.x=cv.width+20;if(p.x>cv.width+80)p.x=-20;
    }
    wxLoop=requestAnimationFrame(tick);
  };tick();
}
const trophyName=()=>'The Iron Lantern';
function trophyImg(cls='trophy'){const src=$('#trophySrc')?.src;return src?`<div class="${cls}" role="img" aria-label="${esc(trophyName())}" style="background-image:url('${src}')"></div>`:''}
// A player had a breakout game: he earns his own card.
async function breakoutScreen(won){
  const c=b._breakout,p=c.p,me=teamOf(b.user),pb=save.playbook,m=$('#modal');
  const spec=breakoutSpec();
  m.innerHTML=`<div class="mwrap"><div class="spot"></div><p class="statline">BREAKOUT PERFORMANCE</p>
    <div class="bo"><canvas id="boFace" width="180" height="180"></canvas><div class="boText"><div class="boNum" style="color:${me.colors[0]}">#${p.number}</div><p class="big gold" id="boName" style="font-size:clamp(40px,8vw,96px)">${esc(p.name.toUpperCase())}</p>
    <p class="statline">${esc(p.role)} · ${esc(p.archetype)} · <b>${c.wins}</b> of ${c.duels} duels won${c.fire?` · caught fire <b>${c.fire}×</b>`:''}</p></div></div>
    <p class="statline" id="boMsg" style="margin-top:10px;opacity:0">SIGNATURE CARD UNLOCKED</p><div class="pbgrid" id="boCard"></div><div id="boSlots"></div><div id="boBtns"></div></div>`;
  m.classList.add('on');
  paintPortrait($('#boFace'),p,me.colors,180);
  $('#rays').classList.add('on');S.crowd(2.4,.55);
  await FX.anim($('#boFace'),[{opacity:0,transform:'scale(.3) rotate(-10deg)'},{opacity:1,transform:'none'}],{duration:500,easing:'cubic-bezier(.2,1.4,.4,1)'});
  S.clash();FX.shake(m,1.6);FX.anim($('#boName'),[{opacity:0,transform:'scale(2.4)'},{opacity:1,transform:'none'}],{duration:300,easing:'cubic-bezier(.2,1.4,.4,1)'});
  await FX.wait(700);
  const full=(pb.signatures||[]).length>=SG.SLOTS;
  SG.register(spec);
  const holder=$('#boCard'),cel=card(spec.id,{});holder.appendChild(cel);
  $('#boMsg').style.opacity=1;S.fanfare();
  const r=holder.getBoundingClientRect();PT.burst(r.left+r.width/2,r.top+100,{n:140,speed:12,colors:['#ffd84d','#fff6d5','#000','#e5c766']});
  await FX.anim(cel,[{opacity:0,transform:'scale(0) rotate(-30deg)'},{opacity:1,transform:'scale(1.15)'},{transform:'none'}],{duration:600,easing:'cubic-bezier(.2,1.4,.4,1)'});
  $('#rays').classList.remove('on');
  const done=()=>{b._breakoutResolved=true;writeSave();$('#boBtns').innerHTML=`<button class="btn go" id="toPack">${won?(P.STAGE_PACKS?.[DYN?.stage]?`OPEN ${P.STAGE_PACKS[DYN.stage].title.toUpperCase()}`:b.rivalry?'OPEN RIVALRY PACK':'OPEN VICTORY PACK'):'OPEN FILM STUDY PACK'}</button>${bankButton()}`;bindBank();$('#toPack').onclick=()=>packScreen(won)};
  if(!full){SG.add(pb,spec);done();return}
  $('#boSlots').innerHTML=`<p class="statline">ALL ${SG.SLOTS} SIGNATURE SLOTS ARE FULL. <b>Replace one</b>, or let this card go.</p><div class="pbgrid" id="boOld"></div><button class="btn" id="boSkip">LET IT GO</button>`;
  pb.signatures.forEach((sg,i)=>{const w=document.createElement('div');w.className='cutme';w.appendChild(card(sg.id,{small:true}));w.onclick=()=>{S.burn();SG.add(pb,spec,i);$('#boSlots').innerHTML=`<p class="statline">${esc(sg.name)}'s card retires. <b>${esc(p.name)}</b> takes the slot.</p>`;done()};$('#boOld').appendChild(w)});
  $('#boSkip').onclick=()=>{pb.lastSignatureGame=pb.record.w+pb.record.l;$('#boSlots').innerHTML='';done()};
}

// ================================================================ seasons, graduation, signing day
const ROLE_NAME={QB:'Quarterback',RB:'Running back',X:'Receiver',Z:'Receiver',SLOT:'Slot receiver',TE:'Tight end',LT:'Tackle',RT:'Tackle',LG:'Guard',RG:'Guard',C:'Center',RUSH:'Edge rusher',SET:'Edge',NT:'D-tackle',DT3:'D-tackle',MIKE:'Linebacker',WILL:'Linebacker',FCB:'Corner',BCB:'Corner',NICKEL:'Nickel back',FS:'Safety',BOXS:'Safety'};
const starStr=n=>'★'.repeat(n)+'☆'.repeat(5-n);
// What a player changes on Saturday, in a few words: his archetype's card effect if it has one, otherwise
// the plays whose duels he fights.
function gameImpact(p){
  const sg=D.SIGNATURES[p.archetype];if(sg)return sg.text;
  const plays=Object.values(D.PLAYS).filter(pl=>!pl.signature&&!pl.evolvedFrom&&!pl.upgradeOf&&Object.values(pl.duels).some(d=>d.off.includes(p.role)||d.def.includes(p.role))).slice(0,3).map(pl=>pl.name);
  const calls=['MIKE','WILL','RUSH','SET','NT','DT3','FCB','BCB','NICKEL','FS','BOXS'].includes(p.role)?Object.values(D.PLAYS).filter(pl=>!pl.signature&&!pl.evolvedFrom&&!pl.upgradeOf&&Object.values(pl.duels).some(d=>d.def.includes(p.role))).slice(0,3).map(pl=>pl.name):[];
  const list=plays.length?plays:calls;return list.length?`Duels in ${list.join(', ')}`:'';
}
// The next game in one strip, with the kickoff button: no separate screen needed.
function nextStrip(){
  const oid=oppId(),sp=specOf(oid),wx=WX[weatherFor()],riv=W.isRivalry(save.world);
  return`<div class="nextStrip ${riv?'riv':''}"><div><div class="mini">NEXT · WEEK ${save.world.week%save.world.order.length+1}${riv?' · RIVALRY':''}</div><div class="nsName" style="color:${sp.colors[0]}">${esc(sp.name)}</div><div class="mini">${esc(identity(sp))} · ${wx.icon} ${wx.label}</div></div><button class="btn go" id="nextG">KICKOFF</button></div>`;
}
function playerTile(p,colors,extra=''){
  return`<div class="ptile"><canvas data-pid="${esc(p.id)}" width="72" height="72"></canvas><div class="ptName">${esc(p.name)}</div><div class="mini">${esc(ROLE_NAME[p.role]||p.role)} · <b>${CL.YEARS[p.year]||''}</b>${extra}</div></div>`;
}
function paintTiles(root,players,colors){for(const cv of root.querySelectorAll('canvas[data-pid]')){const p=players.find(x=>x.id===cv.dataset.pid);if(p)paintPortrait(cv,p,colors,72)}}
// Season over: champion, then the senior send-off.
async function seasonEndScreen(){
  const me=specOf(save.team),o=W.startOffseason(save.world,save.playbook,me.name);writeSave();
  const champYou=o.champion.id==='user',hist=save.world.history.at(-1),you=hist.rows.find(r=>r.id==='user');
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="statline">SEASON ${hist.season} COMPLETE · YOU WENT <b>${you.w}-${you.l}</b></p>
    <p class="big ${champYou?'gold':''}" style="font-size:clamp(44px,9vw,110px)">${champYou?'CHAMPIONS!':esc(o.champion.name.toUpperCase())}</p>
    ${champYou?'':'<p class="statline">WON THE LEAGUE</p>'}
    <p class="statline" style="margin-top:22px">SENIOR SEND-OFF</p>
    <div class="ptiles" id="seniors">${o.gone.map(g=>playerTile(g.player,me.colors,`<br>${esc(CL.careerLine(g.player))}${o.retired.some(r=>r.playerId===g.player.id)?'<br><span class="roh">★ RING OF HONOR</span>':''}`)).join('')||'<p class="mini">No seniors this year.</p>'}</div>
    <p class="statline">Everyone else is a year older: <b>+${o.growth.toFixed(1)}</b> overall on average.</p>
    <button class="btn go" id="toSign">SIGNING DAY · ${o.spots.length} SPOTS →</button></div>`;
  m.classList.add('on');m.scrollTop=0;paintTiles(m,o.gone.map(g=>g.player),me.colors);
  if(champYou){PT.confetti(260);S.fanfare();$('#rays').classList.add('on');setTimeout(()=>$('#rays').classList.remove('on'),2500)}else S.crowd(1.2,.3);
  m.querySelectorAll('.ptile').forEach((t,i)=>FX.anim(t,[{opacity:0,transform:'translateY(30px)'},{opacity:1,transform:'none'}],{duration:350,delay:120*i}));
  $('#toSign').onclick=()=>signingDayScreen();
}
// Signing Day: your class in one row, best recruit already in each spot. Tap a card to see the next option.
function recruitCard(sp,j){
  const p=sp.prospects[j],signature=SG.describe(SG.specFor(p)).def;
  const strengths=D.STYLE_TRAITS[p.archetype]||[];
  const jobs=window.CallSheet.program.prospectJobs(save.playbook,p.pos,null,sp.role).map(job=>{
    const fit=job.traits.filter(t=>strengths.includes(t)).map(t=>t==='iq'?'IQ':t);
    const matchup=job.opposingPlay?` vs. ${job.opposingPlay}`:'';
    return `<span class="mini" data-prospect-job><b>${esc(job.name+matchup)}</b> · ${esc(job.label)}<br>${fit.length?'Style fits '+esc(fit.join(' + ')):'Outside his style strengths'}</span>`;
  }).join('');
  return`<span class="spotLab">${esc(ROLE_NAME[sp.role]||sp.role)}</span><canvas data-pid="${esc(p.id)}" width="56" height="56"></canvas><span class="rs">${starStr(p.stars)}</span><span class="rn">${esc(p.name)}</span><span class="mini">${esc(p.archetype)}</span><span class="rimp">${esc(gameImpact(p))}</span><span class="recruit-signature">Possible signature: <b>${esc(signature.name)}</b><br>${esc(signature.matchupText)}</span>${jobs}<span class="rcycle">${j+1} of ${sp.prospects.length} ↻</span>`;
}
function signingDayScreen(){
  const o=save.world.offseason,me=specOf(save.team),m=$('#modal');
  if(!o||o.stage!=='signing'){seasonEndScreen();return}
  const picks=o.spots.map(()=>0);
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(40px,8vw,96px)">SIGNING DAY</p>
    <p class="statline">Your class is ready. Tap a recruit to see another option.</p>
    <div class="classRow" id="spots"></div><button class="btn go" id="signAll">SIGN THIS CLASS</button></div>`;
  m.classList.add('on');m.scrollTop=0;
  const box=$('#spots');
  o.spots.forEach((sp,i)=>{
    const el=document.createElement('button');el.className='recruit on';el.innerHTML=recruitCard(sp,0);box.appendChild(el);paintTiles(el,sp.prospects,me.colors);
    FX.anim(el,[{opacity:0,transform:'translateY(40px) rotate(-4deg)'},{opacity:1,transform:'none'}],{duration:380,delay:110*i,easing:'cubic-bezier(.2,1.4,.4,1)'});
    el.onclick=async()=>{
      if(el.dataset.locked)return;picks[i]=(picks[i]+1)%sp.prospects.length;S.whoosh();
      await FX.anim(el,[{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:120,easing:'ease-in'});
      el.innerHTML=recruitCard(sp,picks[i]);paintTiles(el,sp.prospects,me.colors);
      FX.anim(el,[{transform:'scaleX(0)'},{transform:'none'}],{duration:180,easing:'cubic-bezier(.2,1.6,.4,1)'});
    };
  });
  $('#signAll').onclick=async()=>{
    $('#signAll').disabled=true;
    for(const el of box.querySelectorAll('.recruit')){el.dataset.locked='1';el.insertAdjacentHTML('beforeend','<span class="signed">SIGNED</span>');S.clash();FX.shake(m,.5);const r=el.getBoundingClientRect();PT.burst(r.left+r.width/2,r.top+r.height/2,{n:30,colors:[me.colors[0],'#fff','#ffd84d']});await FX.wait(220)}
    const res=W.finishOffseason(save.world,picks);writeSave();
    S.fanfare();PT.confetti(160);
    $('#signAll').remove();
    m.querySelector('.mwrap').insertAdjacentHTML('beforeend',`<p class="statline" style="margin-top:12px">CLASS RATING <b class="gold">${starStr(Math.round(res.rating))}</b></p><button class="btn go" id="toS2">ON TO SEASON ${save.world.season} →</button>`);
    $('#toS2').onclick=()=>scoutingReport();
  };
}
function rosterView(){
  const me=specOf(save.team),lu=save.world.userLineup,m=$('#modal');
  const group=(lab,side)=>`<p class="statline" style="margin-top:14px">${lab}</p><div class="ptiles">${Object.values(lu[side]).map(p=>playerTile(p,me.colors,` · ${p.ovr}${p.year===4?' · <span class="roh">final year</span>':''}`)).join('')}</div>`;
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(36px,6vw,72px)">ROSTER</p><p class="statline">${CL.allPlayers(lu).filter(p=>p.year===4).length} seniors leave after this season.</p>
    ${group('OFFENSE','off')}${group('DEFENSE','def')}<button class="btn go" id="back">BACK</button></div>`;
  m.classList.add('on');m.scrollTop=0;paintTiles(m,CL.allPlayers(lu),me.colors);$('#back').onclick=title;
}
// Three steps, shown once (and from the side panel any time).
function howToPlay(then){
  const m=$('#modal'),guided=!!then&&O.eligible(save);
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(40px,7vw,80px)">HOW TO PLAY</p>
    <div class="howto"><div><b>1</b><span class="hi">🃏</span>Read the look</div><div><b>2</b><span class="hi">🪙</span>Choose your call</div><div><b>3</b><span class="hi">⚔️</span>Snap and watch the matchup</div></div>
    <p class="statline">Choose a play, add a tactic if it fits, then hit Snap It below the cards. Quick calls offers a shorter list of plays.</p>
    ${guided?'<p class="statline">Try a guided opening drive: call every offensive snap, with optional coaching tips. Then choose your pace.</p><button class="btn go" id="guideStart">COACH MY FIRST DRIVE</button>':''}
    <button class="btn" id="gotIt">${guided?'SKIP GUIDE · START GAME':'GOT IT'}</button></div>`;
  m.classList.add('on');
  const begin=guidedDrive=>{save.settings.guidedDrivePending=guidedDrive;save.seenHelp=true;if(guidedDrive&&b)O.start(b);writeSave();m.classList.remove('on');if(then)then()};
  $('#gotIt').onclick=()=>begin(false);if(guided)$('#guideStart').onclick=()=>begin(true);
}

// ================================================================ title, league and playbooks
const identity=s=>{const pr=s.passRate??.5;return`${pr<=.42?'Run-heavy':pr>=.56?'Air raid':'Balanced'} · ${(s.discipline??4)<=3?'aggressive':(s.discipline??4)>=5?'disciplined':'steady'} defense`};
function standingsHTML(compact){
  if(!save.world)return'';
  const all=W.standings(save.world,save.playbook,specOf(save.team).name);
  const rows=compact?all.filter((r,i)=>i<4||r.you):all;
  return`<table class="stand"><tr><th></th><th>Program</th><th>W-L</th><th>Notable</th></tr>${rows.map(r=>`<tr class="${r.you?'you':''}" ${r.you?'':`data-prog="${r.id}"`}><td>${all.indexOf(r)+1}</td><td><b>${esc(r.name)}</b>${r.you?' <span class="mini">(you)</span>':''}</td><td>${r.w}-${r.l}</td><td class="mini">${r.legendaries.map(id=>`<span class="leg">★ ${esc(P.cardDef(id).name)}</span>`).join(' ')} ${r.evolved.length?`${r.evolved.length} evolved`:''}</td></tr>`).join('')}</table>`;
}
function challengeSticker(award){
  return `<span class="challenge-sticker" data-sticker="${esc(award.id)}" data-challenge-earned>${esc(award.name)}</span>`;
}
function challengeMenu(){
  if(busy)return;
  if(!campaignSave){
    campaignSave=save;
    save={team:null,world:null,playbook:P.newPlaybook(),settings:JSON.parse(JSON.stringify(save.settings)),combos:[],games:0,seenHelp:true};
  }
  activeChallenge=null;b=null;req=null;
  $('#challengeExit')?.remove();
  const m=$('#modal'),awards=window.ChallengeAwards;
  const options=B.DRIVE_CHALLENGES.map(c=>{
    const earned=awards.get(c.id);
    return `<button type="button" class="challenge-option" data-challenge="${esc(c.id)}"><small>${c.role==='off'?'OFFENSE':'DEFENSE'}</small><strong>${esc(c.name)}</strong><span>${esc(c.situation)}</span><span class="challenge-objective">${esc(c.objective)}</span>${earned?challengeSticker(earned):''}</button>`;
  }).join('');
  m.innerHTML=`<section class="challenge-menu"><h1>Drive Challenges</h1><p>Coach one possession. Retry with the same roster and opening hand.</p><p class="statline">Helmet stickers · ${awards.list().length} / ${B.DRIVE_CHALLENGES.length}</p><div class="challenge-list">${options}</div><button class="tbtn" id="challengeBack">${challengeFrame?'Return to Dynasty':'Back to Quick Battle'}</button></section>`;
  m.classList.add('on');m.scrollTop=0;
  for(const option of m.querySelectorAll('[data-challenge]'))option.onclick=()=>startChallenge(option.dataset.challenge);
  $('#challengeBack').onclick=()=>{
    if(challengeFrame){window.frameElement.dispatchEvent(new Event('closechallenge'));return}
    save=campaignSave;campaignSave=null;readMode=save.settings.readMode==='primary'?'primary':'auto';fullSheet=save.settings.sheetView!=='quick';
    FX.speed=save.settings.fast?.45:1;S.on=save.settings.sound!==false;FX.setMotion(save.settings.motion||'system');
    title();
  };
}
function startChallenge(id){
  activeChallenge=B.DRIVE_CHALLENGES.find(c=>c.id===id);
  b=B.createChallenge(id);req=b.pending;seen=b.log.length;err='';lastLook={};sel={play:null,tac:[]};
  save.combos=[];FX.skipping=false;S.init();hideTip();clearGlow();
  b._lastScore={...b.game.score};setWeather(b.weather);drawField();setMarkers(null);
  $('#ticker').replaceChildren();const story=$('#matchupStory');if(story)story.hidden=true;
  const exit=$('#challengeExit')||document.createElement('button');
  exit.type='button';exit.id='challengeExit';exit.className='tbtn';exit.textContent='Challenges';exit.title='Return to Drive Challenges';exit.onclick=challengeMenu;
  $('#scorebar').appendChild(exit);
  $('#modal').classList.remove('on');decide();
}
function challengeFinish(result){
  const c=activeChallenge,awards=window.ChallengeAwards,first=result.won&&awards.earn(c.id);
  const earned=awards.get(c.id),opponent=b.user==='home'?'away':'home',score=b.game.score;
  const m=$('#modal');
  m.innerHTML=`<section class="challenge-result"><p class="statline">${esc(c.name)}</p><h1>${result.won?'Challenge cleared':'Drive over'}</h1><p class="challenge-score">${esc(teamOf(b.user).short)} ${score[b.user]} · ${esc(teamOf(opponent).short)} ${score[opponent]}</p><p><strong>${esc(result.reason)}</strong></p><p>${esc(result.recap)}</p>${result.won&&earned?`<p>${first?'Helmet sticker earned':'Helmet sticker collected'} · ${challengeSticker(earned)}</p>`:''}<button class="btn go" id="challengeRetry">Retry this drive</button><button class="btn" id="challengeMenu">All challenges</button></section>`;
  m.classList.add('on');m.scrollTop=0;
  if(first)S.fanfare();
  $('#challengeRetry').onclick=()=>startChallenge(c.id);$('#challengeMenu').onclick=challengeMenu;
}
function title(){
  const m=$('#modal'),pb=save.playbook,st=save.settings;
  const opt=(k,v,l)=>`<button class="opt ${st[k]===v?'on':''}" data-k="${k}" data-v="${v}">${l}</button>`;
  const picker=!save.team;
  m.innerHTML=`<div class="mwrap"><p class="big gold">CALL SHEET</p><button class="tbtn" id="driveChallenges">Drive Challenges</button><p class="statline">${picker?'CHOOSE YOUR PROGRAM':`${esc(specOf(save.team).name)} · SEASON <b>${save.world.season}</b> · WEEK <b>${save.world.week%save.world.order.length+1}</b> · RECORD <b>${pb.record.w}-${pb.record.l}</b> · PACKS <b>${pb.packsOpened}</b>`}</p>
    ${picker?`<div class="teams">${Object.entries(W.SPECS).map(([k,p])=>`<button class="tcard" data-team="${k}"><div class="tn">${esc(p.name)}</div><div class="ts" style="background:linear-gradient(90deg,${p.colors[0]},${p.colors[1]})"></div><div class="mini">${esc(identity(p))}<br>Coordinator ${esc(p.coach)}</div></button>`).join('')}</div>`
      :`<div class="box" style="text-align:left;margin:14px auto;max-width:720px"><h3>The league</h3>${standingsHTML()}<div class="mini" style="margin-top:6px">Tap a program to scout its playbook. AI programs open packs, cut cards and evolve plays every week too.</div></div>`}
    <div class="opts">${opt('mode','key','Key moments')}${opt('mode','snap','Every snap')}</div>
    <div class="opts">${opt('control','offense','Coach offense')}${opt('control','both','Coach both sides')}</div>
    ${st.mode==='key'?`<details class="headset-options"><summary>Key Moments headset</summary>${headsetInputs()}</details>`:''}
    <div>${save.team?`<button class="btn go" id="play">${save.activeBattle?'RESUME GAME':save.world?.offseason?'SEASON FINALE →':`PLAY · vs ${esc(specOf(oppId()).name)}`}</button><button class="btn" id="rost">ROSTER</button><button class="btn" id="pbv" ${save.activeBattle?'disabled title="Finish the current game before editing"':''}>BUILD DECK</button><button class="btn" id="reset">NEW DYNASTY</button>`:''}</div>
    <p class="mini" style="margin-top:14px">Progress stays in this browser only.</p></div>`;
  m.classList.add('on');
  $('#driveChallenges').onclick=challengeMenu;
  m.querySelectorAll('[data-team]').forEach(el=>el.onclick=()=>{S.init();save.team=el.dataset.team;save.playbook=P.newPlaybook();save.combos=[];save.games=0;save.world=W.newWorld(save.team,`w${Date.now()%1e6}`);writeSave();S.chime();title()});
  m.querySelectorAll('[data-prog]').forEach(el=>el.onclick=()=>{S.tick(6);playbookView(save.world.programs[el.dataset.prog].playbook,specOf(el.dataset.prog).name,el.dataset.prog)});
  m.querySelectorAll('[data-k]').forEach(el=>el.onclick=()=>{st[el.dataset.k]=el.dataset.v;writeSave();S.tick(5);title()});
  m.querySelectorAll('[data-headset]').forEach(input=>input.onchange=()=>updateHeadset(input));
  const p=$('#play');if(p)p.onclick=()=>{S.init();if(save.activeBattle){resumeBattle();return}if(save.world.offseason?.stage==='signing')signingDayScreen();else if(save.world.offseason)seasonEndScreen();else scoutingReport()};
  const ro=$('#rost');if(ro)ro.onclick=rosterView;
  const v=$('#pbv');if(v)v.onclick=()=>{if(save.activeBattle){resumeBattle();return}window.CallSheet.playbookUI.open(save.playbook,{team:W.teamFor(save.team,save.playbook,save.world?.userLineup),onSave:pb=>{save.playbook=pb;writeSave()}})};
  const r=$('#reset');if(r)r.onclick=()=>{if(r.dataset.armed!=='1'){r.dataset.armed='1';r.textContent='TAP AGAIN: ERASE THIS DYNASTY';r.style.borderColor='var(--lose)';S.error();return}save={team:null,playbook:P.newPlaybook(),settings:st,combos:[],games:0};writeSave();title()};
}
function playbookView(pb,name,progId){
  const m=$('#modal');
  const group=(lab,ids)=>{const counts={};for(const id of ids)counts[id]=(counts[id]||0)+1;return`<p class="statline" style="margin-top:16px">${lab} · <b>${ids.length}</b></p><div class="pbgrid">${Object.entries(counts).map(([id,n])=>`<div style="position:relative" data-c="${id}">${n>1?`<span class="statline" style="position:absolute;top:-8px;left:-6px;z-index:3;background:#000;border-radius:8px;padding:0 6px">×${n}</span>`:''}</div>`).join('')}</div>`};
  const spec=progId?specOf(progId):null;
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(36px,6vw,72px)">${esc(name.toUpperCase())}</p>
    ${spec?`<p class="statline">${esc(identity(spec))} · coordinator ${esc(spec.coach)} · record <b>${save.world.programs[progId].record.w}-${save.world.programs[progId].record.l}</b></p>`:''}
    ${group('OFFENSE · CALL SHEET',pb.off.base)}${group(`OFFENSE · PLAY PILE (max ${pb.capacity.wrinkles})`,pb.off.wrinkles)}${group(`OFFENSE · TACTICS (max ${pb.capacity.tactics})`,pb.off.tactics)}
    ${(pb.signatures||[]).length?group(`SIGNATURE CARDS (max ${SG.SLOTS})`,pb.signatures.map(s=>s.id)):''}
    ${(pb.ringOfHonor||[]).length?group('RING OF HONOR · retired with their players',pb.ringOfHonor.map(s=>s.id)):''}
    ${group('DEFENSE · CALL SHEET',pb.def.base)}${group(`DEFENSE · CALL PILE (max ${pb.capacity.wrinkles})`,pb.def.wrinkles)}${group(`DEFENSE · TACTICS (max ${pb.capacity.tactics})`,pb.def.tactics)}
    <button class="btn go" id="back">BACK</button></div>`;
  m.querySelectorAll('[data-c]').forEach(w=>w.appendChild(card(w.dataset.c,{small:true,mastery:progId?null:EV.progress(pb,w.dataset.c)})));
  $('#back').onclick=title;
}
// Before kickoff: what this opponent has built.
function scoutingReport(){
  const oid=oppId(),spec=specOf(oid),prog=save.world.programs[oid],pb=prog.playbook;
  const watch=[...pb.legendaries,...Object.values(pb.evolved||{}),...pb.history.filter(h=>h.kind!=='evolution').slice(-3).map(h=>h.id)];
  const uniq=[...new Set(watch)].filter(id=>[...(pb.signatures||[]).map(s=>s.id),...pb.off.base,...pb.off.wrinkles,...pb.off.tactics,...pb.def.base,...pb.def.wrinkles,...pb.def.tactics].includes(id)).slice(0,6);
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="statline">SCOUTING REPORT · WEEK ${save.world.week%save.world.order.length+1}</p>
    <p class="big" style="font-size:clamp(40px,8vw,96px);color:${spec.colors[0]};-webkit-text-stroke:2px #fff">${esc(spec.name.toUpperCase())}</p>
    <p class="statline">${esc(identity(spec))} · coordinator <b>${esc(spec.coach)}</b> · record <b>${prog.record.w}-${prog.record.l}</b> · ${pb.packsOpened} packs opened</p>
    ${W.isRivalry(save.world)?`<div class="rivalry"><div class="rivTag">RIVALRY WEEK</div>${trophyImg()}<p class="statline"><b>${esc(trophyName())}</b> · held by <b>${esc(save.world.trophy.holder==='user'?'YOU':specOf(save.world.trophy.holder).name)}</b> · win it for a 5-card rivalry pack</p></div>`:''}
    <p class="statline">FORECAST: <b>${WX[weatherFor()].icon} ${WX[weatherFor()].label}</b> · ${WX[weatherFor()].note}</p>
    <p class="statline" style="margin-top:14px">${uniq.length?'WATCH FOR':'A STOCK PLAYBOOK. THEY HAVEN\'T BUILT ANYTHING YET.'}</p>
    <div class="pbgrid" id="watch"></div>
    <button class="btn go" id="kick">KICKOFF</button><button class="btn" id="back">BACK</button></div>`;
  const g=$('#watch');
  for(const id of uniq){const w=document.createElement('div');w.appendChild(card(id,{small:true}));g.appendChild(w);FX.anim(w,[{opacity:0,transform:'translateY(30px) scale(.8)'},{opacity:1,transform:'none'}],{duration:350,delay:120*g.children.length,easing:'cubic-bezier(.2,1.4,.4,1)'})}
  m.classList.add('on');
  $('#kick').onclick=()=>{m.classList.remove('on');S.whistle();if(!save.seenHelp)howToPlay(startGame);else startGame()};
  $('#back').onclick=title;
}
// A card has enough reps: pick its future.
function evolutionScreen(r){
  const pb=save.playbook,m=$('#modal'),from=r.rootId,held=[...pb[r.side].base,...pb[r.side].wrinkles].find(id=>EV.rootOf(id)===from)||from;
  m.innerHTML=`<div class="mwrap"><p class="big gold">EVOLUTION</p>
    <p class="statline"><b>${esc(P.cardDef(held).name)}</b> has <b>${pb.mastery[from]}</b> reps. Your program has mastered it. <b>Choose its future.</b> ${DYN?'One branch can be retrained each offseason.':'This choice is permanent.'}</p>
    <div class="evo"><div class="evoRoot" id="evoRoot"></div></div>
    <div class="branches">${r.options.map(id=>`<div class="branch${r.locks?.[id]?' locked':''}" data-b="${id}" ${r.locks?.[id]?`title="${esc(r.locks[id])}" style="opacity:.55"`:''}><div class="btag">${esc(EV.branchTag(id).toUpperCase())}${r.locks?.[id]?` · 🔒 ${esc(r.locks[id])}`:''}</div></div>`).join('')}</div>${DYN?'<button class="btn" id="deferEvolution">DECIDE LATER IN DECK ROOM</button>':''}</div>`;
  m.classList.add('on');
  const defer=$('#deferEvolution');if(defer)defer.onclick=()=>{
    pb.deferredEvolutions=[...new Set([...(pb.deferredEvolutions||[]),...evoReady(pb).map(x=>x.rootId)])];
    $('#rays').classList.remove('on');b._closed=true;save.activeBattle=null;writeSave();HOST.close('Ready evolutions are waiting in Deck Room.');
  };
  const root=card(held,{});$('#evoRoot').appendChild(root);
  $('#rays').classList.add('on');S.fire();
  m.querySelectorAll('.branch').forEach((w,i)=>{const c=card(w.dataset.b,{});w.appendChild(c);
    FX.anim(w,[{opacity:0,transform:`translate(${i?'-':''}160px,-160px) scale(.3)`},{opacity:1,transform:'none'}],{duration:520,delay:300+i*160,easing:'cubic-bezier(.2,1.4,.4,1)'});
    if(w.classList.contains('locked'))return;
    w.onclick=async()=>{
      if(defer)defer.disabled=true;
      m.querySelectorAll('.branch').forEach(x=>x.onclick=null);
      S.fanfare();FX.anim($('#flash'),[{opacity:.9},{opacity:0}],450);FX.shake(m,1.6);
      const rr=w.getBoundingClientRect();PT.burst(rr.left+rr.width/2,rr.top+rr.height/2,{n:140,speed:12,colors:['#3cf0c0','#c8fff0','#ffe066','#fff']});
      m.querySelectorAll('.branch').forEach(x=>{if(x!==w)FX.anim(x,[{opacity:1},{opacity:0,transform:'scale(.7) translateY(40px)'}],400)});
      FX.anim($('#evoRoot'),[{opacity:1,filter:'brightness(1)'},{opacity:0,filter:'brightness(3)',transform:'scale(1.3)'}],450);
      await FX.anim(w,[{transform:'none'},{transform:'scale(1.25) translateY(-20px)'}],{duration:500,easing:'cubic-bezier(.2,1.4,.4,1)'});
      EV.evolve(pb,from,w.dataset.b,{lineup:DYN&&b?b.teams[b.user].lineup:null});writeSave();
      w.insertAdjacentHTML('beforeend','<div class="evostamp">EVOLVED</div>');
      await FX.wait(1300);$('#rays').classList.remove('on');
      const more=evoReady(pb);if(more.length)evolutionScreen(more[0]);else afterWeek();
    };
  });
}
// Close out the week: the AI programs play, open packs, cut and evolve.
// After the pack and evolutions: back to the sandbox league, or home to the dynasty.
function afterWeek(){b._closed=true;save.activeBattle=null;writeSave();if(DYN){dynastyDone();return}leagueScreen()}
function dynastyDone(){
  const m=$('#modal');writeSave();
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(40px,7vw,80px)">BACK TO THE WEEK</p><p class="statline">${b._saved?.ok?'The game, your playbook and your cards are saved.':'Your playbook and cards are saved. The game was not recorded.'}</p><button class="btn go" id="home">RETURN TO DYNASTY</button></div>`;
  m.classList.add('on');$('#home').onclick=()=>HOST.close();
}
// Dynasty game day: the battle starts at once with the real teams.
// A playbook from the save only plays cards this build knows; anything else is dropped (base calls fall back).
function sanitizePlaybook(pb){
  const known=id=>!!(D.PLAYS[id]||D.CALLS[id]||D.TACTICS[id]);
  for(const side of ['off','def']){const d=pb[side];if(!d)continue;
    if(!(d.base||[]).every(known)||(d.base||[]).length!==4)d.base=[...D.DEFAULT_DECKS[side].base];
    d.wrinkles=(d.wrinkles||[]).filter(known);d.tactics=(d.tactics||[]).filter(known);}
  pb.signatures=(pb.signatures||[]).filter(sg=>known(sg.id));
  return pb;
}
function dynastyStart(){
  if(DYN.classicDrive){
    SG.registerAll({signatures:DYN.classicDrive.signatures});
    b=B.replayDrive(DYN.classicDrive);seen=b.log.length;req=null;busy=false;sel={play:null,tac:[]};lastLook={};
    b._lastScore={...b.game.score};setWeather(b.weather);drawField();renderBug();setMarkers(null);
    $('#modal').classList.remove('on');$('#ticker').innerHTML='';go(null);return;
  }
  if(DYN.oppPlaybook)SG.registerAll(DYN.oppPlaybook);
  if(save.activeBattle?.seed===DYN.seed){resumeBattle();return}
  registerSignatures();sanitizePlaybook(save.playbook);
  const AD=window.CallSheet.adapter;
  const opp=DYN.oppPlaybook?sanitizePlaybook(DYN.oppPlaybook):null;if(opp)SG.registerAll(opp);
  const deckFor=side=>DYN.userSide===side?P.decksOf(save.playbook):(opp?P.decksOf(opp):null);
  b=B.create({coachingWindows:true,home:AD.battleTeam(DYN.home,deckFor('home'),DYN.program?.home),away:AD.battleTeam(DYN.away,deckFor('away'),DYN.program?.away),
    classicSide:DYN.userSide,user:DYN.userSide,mode:save.settings.mode,control:save.settings.control,headset:save.settings.headset,seed:DYN.seed,weather:DYN.weather||'clear',rivalry:!!DYN.rivalry,conditions:DYN.conditions||null});
  b._trainingRates=DYN.trainingRates||{};
  setWeather(b.weather);seen=0;sel={play:null,tac:[]};err='';lastLook={};b._lastScore={home:0,away:0};
  drawField();renderBug();setMarkers(null);$('#ticker').innerHTML='';
  const begin=async()=>{
    for(const mv of DYN.moves||[]){
      if(mv.how==='ring'){$('#rays').classList.add('on');S.fanfare();await callout('RING OF HONOR','',1600,`${mv.name} · ${mv.exit||'graduated'} · his card retires`);$('#rays').classList.remove('on')}
      else if(mv.how==='arrived')await callout('SIGNATURE ARRIVES','cool small',1200,`${mv.name} · from ${mv.from} · his card follows him`);
      else await callout(mv.how==='transfer'?'TRANSFERRED':'MOVED ON','cool small',1200,`${mv.name}${mv.to?` · now at ${mv.to}`:''} · his card leaves with him`);
    }
    await callout(DYN.stage?String(DYN.label||'POSTSEASON').toUpperCase():DYN.rivalry?'RIVALRY WEEK':'KICKOFF','small',800,`${teamOf('away').name} ${DYN.neutral?'vs':'at'} ${teamOf('home').name}${DYN.neutral?' · neutral site':''}`);go(null);
  };
  if(!save.seenHelp)howToPlay(begin);else begin();
}
function leagueScreen(){
  if(save.pending){W.advanceWeek(save.world,save.playbook,save.pending);save.pending=null;writeSave()}
  const news=save.world.news||[],name=id=>id==='user'?specOf(save.team).name:specOf(id).name;
  const pulls=news.filter(n=>n.type==='pick'),evos=news.filter(n=>n.type==='evolve'),results=news.filter(n=>n.type==='result');
  const m=$('#modal');
  m.innerHTML=`<div class="mwrap"><p class="big gold" style="font-size:clamp(40px,7vw,84px)">AROUND THE LEAGUE</p>
    <p class="statline">${results.map(r=>`<b>${esc(specOf(r.winner).short)}</b> def. ${esc(specOf(r.loser).short)}`).join(' · ')}</p>
    ${news.some(n=>n.type==='trophy')?`<p class="statline" style="color:var(--gold)">${esc(trophyName())} CHANGES HANDS</p>`:''}
    ${news.some(n=>n.type==='season')?`<p class="statline" style="color:var(--gold)">A NEW SEASON BEGINS · SEASON ${save.world.season}</p>`:''}
    <div class="news" id="news"></div>
    <div>${save.world.offseason?`<button class="btn go" id="nextG">SEASON FINALE →</button>`:nextStrip()}<button class="btn" id="toTitle">PROGRAM</button></div>
    <div class="box" style="text-align:left;margin:14px auto;max-width:720px"><h3>Standings</h3>${standingsHTML(true)}</div></div>`;
  m.classList.add('on');
  const g=$('#news');
  const items=[...pulls.sort((a,c)=>({legendary:0,rare:1,common:2}[a.rarity]-{legendary:0,rare:1,common:2}[c.rarity])).map(n=>({id:n.card,txt:`${name(n.program)} pulled`,leg:n.rarity==='legendary'})),...evos.map(n=>({id:n.to,txt:`${name(n.program)} evolved ${P.cardDef(n.from).name} into`})),...news.filter(n=>n.type==='signature').map(n=>({id:n.card,txt:`${name(n.program)}: ${n.player} broke out`,leg:true}))];
  items.slice(0,5).forEach((it,i)=>{
    const w=document.createElement('div');w.className=`nitem ${it.leg?'legpull':''}`;w.innerHTML=`<div class="ntxt">${esc(it.txt)}</div>`;w.appendChild(card(it.id,{small:true}));g.appendChild(w);
    FX.anim(w,[{opacity:0,transform:'translateY(40px) rotate(-6deg)'},{opacity:1,transform:'none'}],{duration:380,delay:140*i,easing:'cubic-bezier(.2,1.4,.4,1)'});
    if(it.leg)setTimeout(()=>{S.groan();FX.shake(m,1)},140*i+300);
  });
  if(!items.length)g.innerHTML='<p class="mini">A quiet week around the league.</p>';
  $('#nextG').onclick=()=>{if(save.world.offseason)seasonEndScreen();else{$('#modal').classList.remove('on');S.whistle();startGame()}};
  $('#toTitle').onclick=title;
  m.querySelectorAll('[data-prog]').forEach(el=>el.onclick=()=>playbookView(save.world.programs[el.dataset.prog].playbook,specOf(el.dataset.prog).name,el.dataset.prog));
}

// ================================================================ start
function resumeBattle(){
  try{b=B.load(save.activeBattle.battle);b.headset=B.headsetSettings(save.settings.headset);b.coachingWindows=true}catch(e){err='Could not resume this battle: '+e.message;return}
  for(const side of ['home','away']){
    const roster=DYN?DYN[side]?.roster:Ro.lineupPlayers(side==='home'?save.world?.userLineup:save.world?.programs[oppId()]?.lineup);
    if(roster)Ro.syncBattleUniforms(b,side,roster,DYN?'jerseyNumber':'number');
  }
  req=b.pending;seen=b.log.length;busy=false;sel={play:null,tac:[]};lastLook={};
  b._lastScore={...b.game.score};setWeather(b.weather);drawField();renderBug();setMarkers(null);
  $('#modal').classList.remove('on');$('#ticker').innerHTML='';if(!req&&b.game.status!=='final')go(null);else decide();
}
function startGame(){
  const oid=oppId(),me=W.teamFor(save.team,save.playbook,save.world.userLineup),opp=W.teamFor(oid,save.world.programs[oid].playbook,save.world.programs[oid].lineup);
  b=B.create({coachingWindows:true,home:me,away:opp,user:'home',mode:save.settings.mode,control:save.settings.control,headset:save.settings.headset,seed:`slice:${save.team}:${save.games}`,weather:weatherFor(),rivalry:W.isRivalry(save.world)});
  if(save.settings.guidedDrivePending)O.start(b);
  setWeather(b.weather);
  seen=0;sel={play:null,tac:[]};err='';lastLook={};b._lastScore={home:0,away:0};
  drawField();renderBug();setMarkers(null);
  $('#ticker').innerHTML='';
  callout('KICKOFF','small',700,`${me.name} vs ${opp.name}`).then(()=>go(null));
}
$('#skip').onclick=()=>{FX.skipping=true};
$('#stage').addEventListener('click',()=>{if(busy&&$('#skip').classList.contains('on'))FX.skipping=true});
FX.speed=save.settings.fast?.45:1;S.on=save.settings.sound!==false;FX.setMotion(save.settings.motion||'system');
PT.mount($('#fx'));
// Test hook: lets automated checks drive the slice without pixel hunting.
window.__slice={resumeBattle,seasonEndScreen,signingDayScreen,rosterView,howToPlay,get b(){return b},get req(){return req},get busy(){return busy},save:()=>save,go,startGame,title,evolutionScreen,leagueScreen,breakoutScreen,setWeather,scoutingReport};
if(challengeFrame||(!DYN&&new URLSearchParams(window.location?.search||'').get('mode')==='challenges'))challengeMenu();
else if(DYN)dynastyStart();else title();
})();
