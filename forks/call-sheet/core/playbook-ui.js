// Shared pregame collection/deck editor for the sandbox and Dynasty Lab.
(function(root){
'use strict';
// Card faces shared by the deck editor and the dynasty's reward packs: rarity frame, origin ribbon, cost bubble.
const escF=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function originOf(id,c){const weather=(c.matchups||[]).some(m=>['rain','snow','wind'].includes(m.when));return c.legacy?'legacy':c.program?'coaching tree':c.era?({single_wing:'single wing',option:'option era',west_coast:'west coast',blitz:'blitz era'}[c.era]||c.era.replace(/_/g,' ')):c.drill?'two-minute drill':c.special?'special teams':c.trick?'trick':weather?'weather':id==='giant_killer'?'milestone':''}
// Print finishes come from the collection being shown (the deck editor sets it while open).
let finishes=null;
function faceClass(id,printFinishes=finishes){const {packs:P,data:D}=root.CallSheet,c=P.cardDef(id)||{},o=originOf(id,c),f=printFinishes?.[id];return`cs-face r-${D.rarityOf(id)}${c.legacy?' r-legacy':''}${o?' o-'+o.replace(/[^a-z]+/g,'-'):''}${f?' f-'+f:''}`}
function originHTML(id){const c=root.CallSheet.packs.cardDef(id)||{},o=originOf(id,c);return o?`<span class="cs-face-origin">${escF(o)}</span>`:''}
function cleanText(t){return String(t||'').replace(/^(EVOLVED|COACHING TREE|TRICK|TWO-MINUTE DRILL|OPTION ERA|SINGLE WING|WEST COAST|46|ZONE BLITZ|IRON MAN) · /,'').replace(/^LEGACY of #\S* [^·]*· /,'')}
function faceHTML(id,{footer='',printFinishes=finishes}={}){
  const {packs:P,data:D}=root.CallSheet,c=P.cardDef(id)||{},r=D.rarityOf(id);
  const type=c.family?`${c.family}${c.trick?' · once per game':''}`:c.box?`${c.coverage} · ${c.box} box`:'tactic';
  return`<article class="${faceClass(id,printFinishes)}" data-face="${escF(id)}"><span class="cs-face-cost">${c.cost??0}</span>${originHTML(id)}<b class="cs-face-name">${escF(c.name||id)}</b><small class="cs-face-type">${escF(type)}</small><p class="cs-face-text">${escF(cleanText(c.text))}</p>${r!=='common'?`<span class="cs-face-rar">${escF(r)}</span>`:''}${footer}</article>`;
}
const FACE_CSS=`.cs-face{position:relative;display:flex;flex-direction:column;gap:4px;padding:12px 12px 22px;border:1px solid #384555;border-radius:12px;background:linear-gradient(170deg,#1c2533,#121821 70%);color:#f2efe5;text-align:left}
.cs-face.r-rare{border-color:#ffd84d;background:linear-gradient(170deg,#3a2f12,#161a22 70%)}
.cs-face.r-legendary{border:2px solid transparent;background:linear-gradient(170deg,#24123a,#101522 70%) padding-box,linear-gradient(120deg,#ff7a7a,#ffe066,#7af0a0,#7ad0ff,#d09bff) border-box}
.cs-face.r-evolved{border-color:#3cf0c0;background:linear-gradient(170deg,#0f3a33,#101826 70%)}
.cs-face.r-signature{border:2px solid #ffd84d;background:linear-gradient(160deg,#1a1408,#050505 60%,#1a1408)}
.cs-face.r-legacy{border:2px solid #9fc3ff;background:linear-gradient(160deg,#0e1a2e,#05070c 60%,#0e1a2e)}
.cs-face.f-foil{box-shadow:0 0 0 1px #9ad8ff,0 0 14px rgba(224,176,255,.35)}.cs-face.f-foil::after{content:'FOIL';position:absolute;right:10px;bottom:5px;font:800 9px system-ui;letter-spacing:.14em;color:#0b0f18;background:linear-gradient(90deg,#9ad8ff,#e0b0ff,#a6ffd8);padding:1px 5px;border-radius:6px}
.cs-face.f-gold{box-shadow:0 0 0 2px #e5b53a,0 0 18px rgba(229,181,58,.45)}.cs-face.f-gold::after{content:'GOLD';position:absolute;right:10px;bottom:5px;font:800 9px system-ui;letter-spacing:.14em;color:#1a1200;background:linear-gradient(90deg,#ffe58a,#c8901a);padding:1px 5px;border-radius:6px}
.cs-face-cost{position:absolute;right:-7px;top:-7px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#1a1200;background:radial-gradient(circle at 35% 30%,#fff3b0,#e5b53a)}
.cs-face-origin{align-self:flex-start;margin:-12px 0 2px -12px;padding:2px 8px;border-radius:12px 0 10px 0;font:800 10px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#0b0f18;background:#e5c766}
.cs-face.o-legacy .cs-face-origin{background:#9fc3ff}.cs-face.o-coaching-tree .cs-face-origin{background:#7ad0a6}.cs-face.o-two-minute-drill .cs-face-origin{background:#ff9f5a}.cs-face.o-trick .cs-face-origin{background:linear-gradient(90deg,#ff7a7a,#ffe066)}.cs-face.o-weather .cs-face-origin{background:#8fd3ff}.cs-face.o-milestone .cs-face-origin{background:#d09bff}
.cs-face-name{font-size:15px;padding-right:14px}.cs-face-type{color:#aab6e8;text-transform:capitalize;font-size:12px}.cs-face-text{margin:0;color:#c9cfdc;font-size:13px;flex:1}
.cs-face-rar{position:absolute;left:12px;bottom:5px;font:800 10px system-ui;letter-spacing:.16em;text-transform:uppercase;color:#ffd84d}
.cs-face.r-legendary .cs-face-rar{background:linear-gradient(90deg,#ff7a7a,#ffe066,#7af0a0,#7ad0ff,#d09bff);-webkit-background-clip:text;background-clip:text;color:transparent}.cs-face.r-evolved .cs-face-rar{color:#7dffd8}.cs-face.r-legacy .cs-face-rar{color:#cfe0ff}`;
function injectFaceCSS(doc=document){if(doc.getElementById('csFaceStyles'))return;const st=doc.createElement('style');st.id='csFaceStyles';st.textContent=FACE_CSS;doc.head.appendChild(st)}
// Presets store selections, never a second collection. Loading reconciles against today's inventory.
const copyDeck=x=>JSON.parse(JSON.stringify(x));
function validPreset(p){
  return p&&typeof p.name==='string'&&p.name.trim()&&['off','def'].every(side=>p[side]&&['base','wrinkles','tactics'].every(pile=>Array.isArray(p[side][pile])&&p[side][pile].every(id=>typeof id==='string')));
}
function presetList(pb){return(Array.isArray(pb.deckPresets)?pb.deckPresets:[]).filter(validPreset).slice(0,8).map(p=>({...p,name:p.name.trim().slice(0,40)}))}
function savePreset(pb,name){
  name=String(name||'').trim().slice(0,40);if(!name)throw new Error('Give this preset a name.');
  const presets=presetList(pb),i=presets.findIndex(p=>p.name.toLowerCase()===name.toLowerCase());
  if(i<0&&presets.length>=8)throw new Error('Delete a preset first (8 maximum).');
  const entry={name,off:copyDeck(pb.off),def:copyDeck(pb.def)};
  pb.deckPresets=presets;if(i<0)presets.push(entry);else presets[i]=entry;
}
function loadPreset(pb,index){
  const preset=pb.deckPresets?.[index],{data:D,packs:P}=root.CallSheet;
  if(!Number.isInteger(index)||!validPreset(preset))throw new Error('Choose a valid saved preset.');
  const next=copyDeck(pb);P.ensureCollection(next);
  const changes=[],name=id=>P.cardDef(id)?.name||id;
  function current(id){
    const nextId=P.awardedId(pb,id);
    if(nextId!==id)changes.push(`${name(id)} now uses ${name(nextId)}.`);
    return nextId;
  }
  for(const side of ['off','def']){
    const d=copyDeck(preset[side]),table=side==='off'?D.PLAYS:D.CALLS;
    const baseOK=id=>Object.hasOwn(table,id)&&!table[id].trick&&!table[id].signature;
    const free=id=>table[id].cost===0&&!table[id].needs;
    if(d.base.length!==4||new Set(d.base).size!==4||!d.base.every(baseOK)||!d.base.some(free))throw new Error('Preset needs four valid base calls, including a free unrestricted call.');
    for(const pile of ['wrinkles','tactics']){
      if(d[pile].length>pb.capacity[pile])throw new Error('Preset exceeds your current deck capacity.');
      const catalog=pile==='wrinkles'?table:D.TACTICS;
      if(!d[pile].every(id=>Object.hasOwn(catalog,id)&&catalog[id].side===side&&!catalog[id].signature))throw new Error('A preset card is not available in this catalog.');
      const available=[...(pile==='wrinkles'?pb[side].base:[]),...pb[side][pile],...next.reserve[side][pile]];
      const take=id=>{const i=available.indexOf(id);if(i<0)return false;available.splice(i,1);return true};
      if(pile==='wrinkles'){
        const requested=d.base.map(current),selected=[];
        d.base=requested.map(id=>{
          if(!selected.includes(id)&&take(id)){selected.push(id);return id}
          return null;
        });
        for(const [slot,id] of d.base.entries())if(!id){
          const needFree=!selected.some(free),choices=available.filter(x=>baseOK(x)&&!selected.includes(x));
          const replacement=choices.find(x=>!needFree||free(x));
          if(!replacement)throw new Error('No owned replacement can keep this preset’s four base calls playable.');
          take(replacement);selected.push(replacement);d.base[slot]=replacement;
          changes.push(`Base slot ${slot+1} uses ${name(replacement)} in place of ${name(requested[slot])}.`);
        }
        if(!d.base.some(free))throw new Error('Choose a free unrestricted base call before loading this preset.');
      }
      d[pile]=d[pile].map(current).filter(id=>{
        if(take(id))return true;
        changes.push(`${name(id)} is unavailable. One ${pile==='wrinkles'?'play':'tactic'} slot is open for an owned replacement.`);return false;
      });
      next.reserve[side][pile]=available;
    }
    next[side]=d;
    if(side==='off'&&d.openingScript){d.openingScript=current(d.openingScript);if(!D.canScriptOpener(d,d.openingScript))delete d.openingScript}
  }
  pb.off=next.off;pb.def=next.def;pb.reserve=next.reserve;
  return [...new Set(changes)];

}
function deckAdvice(pb,lineup=null){
  const {data:D,resolver:R}=root.CallSheet,off=lineup?.off||lineup;
  const plays=[...new Set([...pb.off.base,...pb.off.wrinkles])].map(id=>D.PLAYS[id]).filter(Boolean);
  const usable=plays.filter(p=>!off||!R.playBlocked(p,off)),warnings=[],suggestions=[];
  const cheap=p=>p.pass&&p.cost<=1&&!p.fourthOnly&&!p.thirdOnly;
  if(!usable.some(cheap)){
    warnings.push('No low-cost passing answer in your active plays.');
    const alt=(pb.reserve?.off?.wrinkles||[]).map(id=>D.PLAYS[id]).find(p=>p&&cheap(p)&&(!off||!R.playBlocked(p,off)));
    if(alt)suggestions.push(`Consider adding ${alt.name} to your deck for a low-cost passing option.`);
  }
  if(off)for(const p of plays){const reason=R.playBlocked(p,off);if(reason)warnings.push(`${p.name}: ${reason}.`)}
  for(const id of new Set(pb.off.tactics)){
    const t=D.TACTICS[id];if(!t?.needs||t.special)continue;
    // Without a lineup, don't pretend to assess personnel requirements.
    if(!off)continue;
    if(!usable.some(p=>!R.tacticBlocked(t,p,off))){
      warnings.push(`${t.name} has no compatible play with this lineup.`);
      const alt=(pb.reserve?.off?.wrinkles||[]).map(id=>D.PLAYS[id]).find(p=>p&&!R.playBlocked(p,off)&&!R.tacticBlocked(t,p,off));
      if(alt)suggestions.push(`Try adding ${alt.name} to give ${t.name} a partner.`);
      else suggestions.push(`Consider removing ${t.name} from the deck until your plays or personnel fit it.`);
    }
  }
  const runs=plays.filter(p=>p.family==='run').length,total=plays.length;
  return{identity:total&&runs/total>=.6?'Run-heavy':total&&runs/total<=.25?'Pass-first':'Balanced',warnings,suggestions:[...new Set(suggestions)].slice(0,3)};
}
// Ground the opener in the user's own depth chart. No opponent call, forecast or hidden rating here.
// The first hand is sampled without replacement. If a legal script misses the
// hand, the engine substitutes it for the top draw, leaving the other slots intact.
function firstHandChance(pb,side,id,lineup=null){
  const {data:D,resolver:R}=root.CallSheet,deck=pb[side],card=D.TACTICS[id]||D.PLAYS[id]||D.CALLS[id];
  if(!card||card.side!==side||card.special)return 0;
  if(deck.base.includes(id))return 1;
  const tactic=!!D.TACTICS[id],pile=tactic?'tactics':'wrinkles';
  const draws=[...deck[pile],...(pb.signatures||[]).filter(s=>s.side===side&&s.pile===pile).map(s=>s.id)].filter(x=>!D.TACTICS[x]?.special);
  const n=draws.length,count=draws.filter(x=>x===id).length,hand=Math.min(n,tactic?D.RULES.tacticHand:D.RULES.wrinkleRow);
  if(!count||!hand)return 0;
  function allFrom(eligible,total,k){
    let p=1;for(let i=0;i<k;i++){if(i>=eligible)return 0;p*=(eligible-i)/(total-i)}return p;
  }
  const chance=1-allFrom(n-count,n,hand);
  const opener=deck.openingScript,off=lineup?.off||lineup;
  if(tactic||side!=='off'||!D.canScriptOpener(deck,opener)||off&&R.playBlocked(D.PLAYS[opener],off))return chance;
  if(id===opener)return 1;
  const scripts=draws.filter(x=>x===opener).length;
  return Math.max(0,chance-count/n*allFrom(n-count-scripts,n-1,hand-1));
}
// Keep copies shared by both decks in the same physical slots. A one-for-one swap
// changes exactly that slot in every deal, even if the editor appended the new card.
function pairedDrawSlots(saved,draft){
  const remaining=[...draft];
  const slots=saved.map(id=>{
    const index=remaining.indexOf(id);
    return {saved:id,draft:index<0?null:remaining.splice(index,1)[0]};
  });
  for(const slot of slots)if(!slot.draft&&remaining.length)slot.draft=remaining.shift();
  return slots.concat(remaining.map(id=>({saved:null,draft:id})));
}
const PRACTICE_THREATS=['deep_cross','screen'];
function thirdDownHands(saved,draft,lineup,team=null,unit='off',practiceFilm=null,useFilm=true){
  if(!lineup?.off||!lineup?.def)return [];
  const {battle:B,data:D,packs:P,resolver:R}=root.CallSheet;
  const decks={saved:P.decksOf(saved),draft:P.decksOf(draft)},slots={};
  for(const pile of ['wrinkles','tactics']){
    const cards=side=>decks[side][unit][pile].filter(id=>!D.TACTICS[id]?.special);
    slots[pile]=pairedDrawSlots(cards('saved'),cards('draft'));
  }
  const situation={down:3,distance:7,field:45,period:2,clock:480};
  const call=D.CALLS.cover3,command=2,projections=new Map();
  // Dress the personnel Auto uses on this down in a real game (four wide on 3rd & 7 when depth allows), so plays the
  // game would block there are not counted and the package's own edges apply. Without depth, the game stays in 11 too.
  const dressed={off:{...lineup.off},def:lineup.def};
  let grouping='11';
  if(team){
    const practiceTeam={...team,lineup:dressed};
    if(team.packageStarters)practiceTeam.packageStarters={...team.packageStarters};
    grouping=B.dressPackage({game:{...situation,fieldPosition:situation.field},teams:{home:practiceTeam},box:{home:{plays:2}}},'home');
  }
  const recorded=unit==='def'&&practiceFilm?Object.entries(practiceFilm.counts||{}):[];
  const eligible=recorded.filter(([id,n])=>{
    if(!Number.isInteger(n)||n<1||!Object.hasOwn(D.PLAYS,id))return false;
    const play=D.PLAYS[id];return !play.quickKick&&!play.drill&&!play.setupPlay&&!R.playBlocked(play,dressed.off,situation);
  }).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,2);
  const usingFilm=useFilm&&eligible.length===2;
  const threats=usingFilm?eligible.map(([id])=>id):PRACTICE_THREATS;
  function project(card,tactic){
    const key=JSON.stringify([card.id,tactic?.id]);
    if(!projections.has(key)){
      const ctx={...dressed,grouping,read:'auto',weather:'clear',situation};
      const tactics=tactic?[tactic.id]:[];
      if(unit==='off'){
        const snap=R.buildSnap({...ctx,play:card,call,offTactics:tactics});
        projections.set(key,{chance:R.evaluate(snap,situation).first});
      }else{
        // Commit the same coverage and tactic against both threats before ranking the call.
        const stops=threats.map(id=>{
          const snap=R.buildSnap({...ctx,play:D.PLAYS[id],call:card,defTactics:tactics});
          return 1-R.evaluate(snap,situation).first;
        });
        projections.set(key,{chance:Math.min(...stops),stops});
      }
    }
    return projections.get(key);
  }
  const out=Array.from({length:10},(_,index)=>{
    const hands={saved:{},draft:{}};
    for(const [pile,limit] of [['wrinkles',D.RULES.wrinkleRow],['tactics',D.RULES.tacticHand]]){
      const rng=root.DynastyRng.create('third-and-seven:'+index+':'+pile);
      const order=slots[pile].map(slot=>({slot,priority:rng.next()})).sort((a,b)=>a.priority-b.priority);
      for(const side of ['saved','draft'])hands[side][pile]=order.map(item=>item.slot[side]).filter(Boolean).slice(0,limit);
    }
    for(const side of ['saved','draft']){
      const hand=hands[side];
      const state={game:{...situation,fieldPosition:situation.field},decks:{home:decks[side]},
        teams:{home:{lineup:dressed},away:{lineup:dressed}},hands:{home:{...hand,role:unit,command,onceUsed:[]}}};
      const options=unit==='off'?B.offOptions(state,'home'):B.defOptions(state,'home');
      const calls=new Map();
      for(const p of options.plays){
        if(calls.has(p.id)||p.blocked||p.cost>command)continue;
        let best={id:p.id,cost:p.cost,...project(p.card),tactic:null};
        for(const t of options.tactics){
          const cost=p.cost+t.cost;
          if(t.card.info||cost>command)continue;
          const blocked=unit==='off'?R.tacticBlocked(t.card,p.card,dressed.off):R.signatureBlocked(t.card,dressed.def);
          if(blocked)continue;
          const result=project(p.card,t.card);
          if(result.chance>best.chance||result.chance===best.chance&&cost<best.cost)best={id:p.id,cost,...result,tactic:t.id};
        }
        calls.set(p.id,best);
      }
      hand.calls=[...calls.values()].sort((a,b)=>b.chance-a.chance||a.cost-b.cost);
    }
    return hands;
  });
  out.grouping=grouping;
  if(unit==='def'){
    out.threats=threats;
    if(practiceFilm)out.film={name:practiceFilm.name,meetings:practiceFilm.meetings,eligible,usingFilm,
      sample:recorded.reduce((sum,[,n])=>sum+n,0)};
  }
  return out;
}
function thirdDownHTML(hands,unit){
  const name=id=>escF(root.CallSheet.packs.cardDef(id)?.name||id);
  const pct=x=>Math.round(100*x)+'%';
  const defense=unit==='def';
  const metric=defense?'weaker matchup stop chance':'best conversion';
  function report(h){
    const best=h.calls[0];
    const odds=!best?'':defense?hands.threats.map((id,i)=>pct(best.stops[i])+' stop vs '+name(id)).join(' · '):pct(best.chance)+' to convert';
    return (best?`<b>${name(best.id)}${best.tactic?' + '+name(best.tactic):''}</b> · ${odds} · ${best.cost} Command`:'No affordable call')+
      `<small>Play draws · ${h.wrinkles.map(name).join(', ')||'None'}<br>Tactic draws · ${h.tactics.map(name).join(', ')||'None'}${defense?'':'<br>Calls at 30% or better · '+(h.calls.filter(c=>c.chance>=.3).map(c=>name(c.id)).join(', ')||'None')}</small>`;
  }
  const personnel=root.CallSheet.battle.GROUPINGS[hands.grouping];
  const score=side=>defense?pct(hands.reduce((total,h)=>total+(h[side].calls[0]?.chance||0),0)/hands.length):hands.filter(h=>h[side].calls.filter(c=>c.chance>=.3).length>=2).length+'/10';
  const film=hands.film;
  let source='';
  if(film){
    const opponent=escF(film.name);
    if(film.eligible.length===2){
      const calls=film.eligible.map(([id,n])=>name(id)+' ×'+n).join(' · ');
      source=`<label>Practice opponent<select data-practice-source><option value="film" ${film.usingFilm?'selected':''}>${opponent} film</option><option value="standard" ${!film.usingFilm?'selected':''}>Standard drill</option></select></label>`;
      if(film.usingFilm)source+=`<p>${opponent} ran ${film.sample} recorded third-down snaps in ${film.meetings} prior card meeting${film.meetings===1?'':'s'}. ${calls}. Your scout-team offense runs these plays for the drill.</p>`;
    }else source=`<p>${opponent} film has fewer than two different third-down plays your scout team can run here. This drill uses the standard pair.</p>`;
  }
  return `${source}<p>${defense?'Your defense faces '+hands.threats.map(name).join(' and ')+' from the offense’s 45. Each hand uses one defensive call and tactic against both plays.':'Your offense faces your defense in Cover 3 at your 45.'} Each sample gives you a fresh hand, two Command left, and up to one non-info tactic per call. Base calls and available player discounts apply.</p>
    <p>Auto personnel on offense: <b>${escF(personnel)}</b>.${!defense&&hands.grouping==='10'?' Plays that need an inline tight end are left out, as in a game.':''}</p>
    <p><b>${defense?'Average stop chance against the tougher matchup':'Hands with two or more calls at 30% or better to convert'}</b><br>Saved ${score('saved')} · Draft ${score('draft')}</p>
    <p>Change a card to replay these draws before saving.</p>
    ${hands.map((h,i)=>`<details><summary>Hand ${i+1} · ${metric} ${pct(h.saved.calls[0]?.chance||0)} → ${pct(h.draft.calls[0]?.chance||0)}</summary><p>Saved · ${report(h.saved)}</p><p>Draft · ${report(h.draft)}</p></details>`).join('')}`;
}
function openingScriptHTML(deck,lineup){
  const {data:D,resolver:R}=root.CallSheet;
  const choices=[...new Set(deck.wrinkles)].filter(id=>D.canScriptOpener(deck,id));
  const selected=choices.includes(deck.openingScript)?D.PLAYS[deck.openingScript]:null,off=lineup?.off||lineup;
  let assignment='',heading='Your key matchup';
  if(selected&&off){
    const blocked=R.playBlocked(selected,off),key=selected.duels.K;
    if(blocked){assignment=blocked+'. You would draw normally.';heading='Personnel check'}
    else assignment=key.label+': '+key.off.map(role=>(off[role]?.name||role)+' ('+role+')').join(' & ')+' · '+key.ot.join(' + ')+'.';
  }
  return `<section><h3>Opening script</h3><label>First-series play<select id="openingScript" aria-describedby="openingRules${assignment?' openingPersonnel':''}"><option value="">Normal draw (no script)</option>${choices.map(id=>`<option value="${escF(id)}" ${selected?.id===id?'selected':''}>${escF(D.PLAYS[id].name)} · ${D.PLAYS[id].cost} Command</option>`).join('')}</select></label>
  ${assignment?`<p id="openingPersonnel"><b>${heading}</b> · ${escF(assignment)}</p>`:''}
  <p id="openingRules" class="de-muted">Reserve one of your three play draws for your first set of downs on offense. It costs the usual Command and you can call something else. If your lineup can’t run it, you draw normally.</p></section>`;
}
// Small, deliberate packages rather than random rerolls. No receipt, unlock, or new copy is created.
const GAME_PLANS={
  off:{
    ground:{name:'Run & play-action',edge:'Keep an extra run in your base four. Use Seal Block to open a lane, then show run and throw off play-action.',cost:'Fewer deep throws; a stacked box can force you away from the run.',base:['inside_zone','outside_zone','power','quick_slant'],plays:['pa_boot','read_option','screen'],tactics:['seal_block','hard_count','motion'],opener:'pa_boot'},
    air:{name:'Vertical passing',edge:'Keep a crossing route on call and script a deep throw. Max Protect buys time for long routes.',cost:'Deep throws need time and Command. Max Protect also takes a receiver out of the route.',base:['quick_slant','stick','deep_cross','inside_zone'],plays:['vertical_shot','screen','pa_boot'],tactics:['max_protect','route_adjust','motion'],opener:'vertical_shot'}
  },
  def:{
    shell:{name:'Two-high coverage',edge:'Keep extra coverage calls in your base four. Bracket their best receiver or disguise the coverage.',cost:'Choosing a light box leaves fewer defenders against the run.',base:['two_high','two_man','cover3','cover1'],plays:['robber','sim_pressure','zone_pressure'],tactics:['bracket','disguise','film_tell']},
    heat:{name:'Pressure front',edge:'Keep extra rushers on call. Draw a heavy front for short yardage or blitz without deep help.',cost:'An all-out blitz leaves receivers without deep safety help if the rush misses.',base:['run_fit','zone_pressure','sim_pressure','cover1'],plays:['cover0','bear','robber'],tactics:['identify_protection','press','disguise']}
  }
};
const storageBlock=(r,limit)=>['wrinkles','tactics'].find(p=>r[p].length>limit)||null;
function previewPlan(pb,side,key,maxStored=Infinity){
  const spec=GAME_PLANS[side]?.[key];if(!spec)return null;
  const {packs:P,data:D}=root.CallSheet,d=pb[side],r=pb.reserve?.[side]||{};
  const pool=[...d.base,...d.wrinkles,...(r.wrinkles||[])],ts=[...d.tactics,...(r.tactics||[])];
  const rootOf=id=>{const c=P.cardDef(id);return c?.evolvedFrom||c?.upgradeOf||id};
  const take=(pool,root)=>{const i=pool.findIndex(id=>rootOf(id)===root);return i<0?null:pool.splice(i,1)[0]};
  const base=spec.base.map(id=>take(pool,id));if(base.some(id=>!id)||new Set(base).size!==4||!base.some(id=>{const c=P.cardDef(id);return c.cost===0&&!c.needs}))return null;
  const draw=(pool,want,limit)=>{const list=[];for(let copy=0;copy<2;copy++)for(const target of want){if(list.length>=limit)return list;const got=take(pool,target);if(got)list.push(got)}return list};
  const deck={...d,base,wrinkles:draw(pool,spec.plays,pb.capacity.wrinkles),tactics:draw(ts,spec.tactics,pb.capacity.tactics)};
  if(!spec.plays.every(target=>deck.wrinkles.some(id=>rootOf(id)===target))||!spec.tactics.every(target=>deck.tactics.some(id=>rootOf(id)===target)))return null;
  if(side==='off'){const opener=deck.wrinkles.find(id=>rootOf(id)===spec.opener);if(D.canScriptOpener(deck,opener))deck.openingScript=opener;else delete deck.openingScript}
  const reserve={...r,wrinkles:pool,tactics:ts};return{deck,reserve,storageBlock:storageBlock(reserve,maxStored)};
}
// Count copies, not distinct card faces. Team signatures use one shared pool outside the two regular decks.
function deckCounts(pb,side){
  const group=pile=>({active:pb[side][pile].length,limit:pb.capacity[pile],stored:pb.reserve?.[side]?.[pile]?.length||0});
  const plays=group('wrinkles'),tactics=group('tactics');
  const sigLimit=root.CallSheet.signatures.slotsFor?root.CallSheet.signatures.slotsFor(pb):root.CallSheet.signatures.SLOTS;
  const signatures={active:pb.signatures?.length||0,limit:sigLimit,stored:pb.reserveSignatures?.length||0};
  const sides=['off','def'],regularCount=s=>pb[s].base.length+pb[s].wrinkles.length+pb[s].tactics.length;
  const sideLimit=4+plays.limit+tactics.limit,teamActive=sides.reduce((n,s)=>n+regularCount(s),signatures.active);
  const teamStored=sides.reduce((n,s)=>n+(pb.reserve?.[s]?.wrinkles?.length||0)+(pb.reserve?.[s]?.tactics?.length||0),signatures.stored);
  return{plays,tactics,signatures,regular:regularCount(side),sideLimit,teamActive,teamLimit:sideLimit*2+signatures.limit,teamStored,teamOwned:teamActive+teamStored};
}
// One entry per owned card in a draw group. The alphabetical order does not depend on selection.
// Base slots are a different kind of selection: a base copy is not counted as a draw copy.
function ownedRows(active,unused){
  const rows=new Map(),add=(id,selected)=>{if(!rows.has(id))rows.set(id,{id,inDeck:0,owned:0});
    const r=rows.get(id);r.owned++;if(selected)r.inDeck++};
  active.forEach(id=>add(id,true));unused.forEach(id=>add(id,false));
  const name=id=>root.CallSheet.packs.cardDef(id)?.name||id;
  return [...rows.values()].sort((a,b)=>name(a.id).localeCompare(name(b.id),'en')||a.id.localeCompare(b.id,'en'));
}
const EDITOR_CSS=`
#deckEditor{width:min(940px,calc(100vw - 40px));height:min(850px,92vh);height:min(850px,92dvh);max-width:none;max-height:none;padding:0;border:1px solid #4b5360;border-radius:16px;background:#101720;color:#f1f4f7;font:15px/1.45 system-ui,sans-serif;text-align:left;box-shadow:0 18px 80px #0008;overflow:hidden;z-index:2147483646}
#deckEditor[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}#deckEditor::backdrop{background:#050912d9}
#deckEditor *,#deckEditor{box-sizing:border-box}#deckEditor h2,#deckEditor h3,#deckEditor h4,#deckEditor p{margin:0;color:inherit;letter-spacing:normal;text-transform:none}#deckEditor h2{font:750 clamp(22px,4vw,31px)/1.15 system-ui,sans-serif}#deckEditor h3{font:700 19px/1.25 system-ui,sans-serif}#deckEditor p{line-height:1.45}#deckEditor h4{font:700 16px/1.25 system-ui,sans-serif}
#deckEditor .de-head,#deckEditor .de-body,#deckEditor .de-foot{padding:18px 24px}
#deckEditor .de-head{background:#171f2a;border-bottom:1px solid #354454}
#deckEditor .de-kicker{color:#d1b765;font:750 10px/1.2 system-ui,sans-serif;letter-spacing:.15em;margin:0 0 5px}
#deckEditor .de-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
#deckEditor .de-intro{color:#c9d3df;margin:7px 0 15px;font-size:14px}
#deckEditor .de-type-legend{font:700 11px/1.3 system-ui,sans-serif;letter-spacing:.08em;color:#aab8c8;margin:0 0 5px}#deckEditor .de-type-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
#deckEditor button,#deckEditor input,#deckEditor select{font:600 14px/1.2 system-ui,sans-serif;text-transform:none;letter-spacing:normal;text-shadow:none;box-shadow:none;border-radius:7px;background:#273444;border:1px solid #526479;color:#eff5fa;padding:8px 12px;max-width:100%;min-width:0;cursor:pointer;min-height:36px}
#deckEditor button:hover:not(:disabled){border-color:#b0c1d2}#deckEditor :focus-visible{outline:3px solid #88d2ff;outline-offset:2px}
#deckEditor button:disabled{opacity:1;color:#91a1b2;background:#17212c;border-color:#354353;cursor:not-allowed}
#deckEditor .de-side-nav{display:flex;padding:3px;border:1px solid #425163;border-radius:9px;background:#0c131d;gap:2px}
#deckEditor [data-side]{background:transparent;border:0;color:#bec9d4;min-height:32px}#deckEditor [data-side][aria-pressed=true]{background:#364457;color:#fff}
#deckEditor [data-category]{display:flex;justify-content:space-between;align-items:center;gap:4px;padding:8px 10px;background:#141d28;color:#c1cfdb;border-color:#384757}
#deckEditor [data-category][aria-pressed=true]{border-color:#dfbc62;color:#ffe3a1;background:#312d22}
#deckEditor [data-type-count]{font:700 13px/1.1 ui-monospace,monospace;white-space:nowrap;color:inherit}
#deckEditor .de-body{overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;min-height:0}
#deckEditor #de-hand-report small{display:block;margin-top:3px;color:#bac8d7}#deckEditor [data-hand-test]{margin-top:10px}
#deckEditor .de-sub{margin:4px 0 13px;font-size:14px;color:#bac8d7}#deckEditor .de-grid,#deckEditor .de-cards,#deckEditor .de-base{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#deckEditor .de-card{border:1px solid #354354;border-radius:10px;background:#19232f;padding:12px 14px;display:flex;flex-direction:column;gap:7px;min-width:0}
#deckEditor .de-card[data-selected=true]{border-left:3px solid #80bfae;padding-left:12px}
#deckEditor .de-card-title{display:flex;align-items:baseline;justify-content:space-between;gap:6px}#deckEditor .de-card-title h4{min-width:0;overflow-wrap:anywhere}#deckEditor .de-card small{font-size:12px;color:#b5c4d3}
#deckEditor [data-copy-count]{font-size:12px;font-weight:700;color:#b9ebd9;white-space:nowrap}#deckEditor [data-selected=false] [data-copy-count]{color:#bdc8d4}
#deckEditor .de-card .de-text{color:#d3dbe4;font-size:13px;flex:1}
#deckEditor .de-card-actions{display:flex;gap:6px;flex-wrap:wrap}
#deckEditor .de-card-actions button{font-size:13px}#deckEditor [data-move=add]:not(:disabled),#deckEditor [data-sig-equip]:not(:disabled){color:#beefdf;border-color:#588e7e;background:#203c35}
#deckEditor .de-card .de-edition{color:#e5c775;font-weight:650}#deckEditor .de-base label{padding:12px;border:1px solid #354354;border-radius:9px;background:#19232f}
#deckEditor label{display:grid;gap:5px;color:#d1d9e2;font:600 13px/1.3 system-ui,sans-serif;text-transform:none;letter-spacing:normal}#deckEditor select,#deckEditor input{width:100%}
#deckEditor .de-banner{padding:8px 10px;margin:0 0 11px;border-left:3px solid #e1bd63;background:#2c2920;color:#fbe4a7;font-size:13px}
#deckEditor details{margin:12px 0;background:transparent}#deckEditor summary{cursor:pointer;color:#e6cb82;font-weight:650}
#deckEditor [data-more-options]{padding:12px 0 0;border-top:1px solid #354354;margin-top:20px}
#deckEditor [data-more-options] section,#deckEditor [data-more-options] details{margin:15px 0}#deckEditor [data-more-options] p{margin:7px 0;color:#c4ceda;font-size:14px}#deckEditor [data-more-options] button{margin:5px 0}
#deckEditor .de-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #354454;background:#171f2a}
#deckEditor [data-deck-status]{font-size:13px;color:#b4dbce}#deckEditor [data-deck-status][data-error=true]{color:#ffcf9f}
#deckEditor .de-family{margin:0 0 10px}#deckEditor .de-family>summary{cursor:pointer;font-weight:700;font-size:15px;padding:6px 2px;color:#f4edda}#deckEditor .de-family>summary small{font-weight:400;color:#9fb0c8;margin-left:6px}
#deckEditor .de-suggest{margin:8px 0 0;padding:8px 11px;border:1px solid #ffdb7299;border-radius:9px;background:#2a2410;color:#f6ecd0;font-size:14px;line-height:1.4}#deckEditor .de-save-actions{display:flex;gap:7px;flex-shrink:0}#deckEditor [data-save]{background:#ffdb72;color:#251e0e;border-color:#ffdb72}
@media(max-width:650px){#deckEditor{width:calc(100vw - 12px);height:94vh;height:94dvh;border-radius:12px}#deckEditor .de-head,#deckEditor .de-body,#deckEditor .de-foot{padding:12px}
#deckEditor .de-side-nav button{font-size:13px;padding:6px 8px}#deckEditor .de-type-nav{gap:4px}
#deckEditor [data-category]{display:grid;justify-content:center;justify-items:center;gap:4px;font-size:12px;padding:6px 2px;min-height:44px}
#deckEditor .de-grid,#deckEditor .de-cards,#deckEditor .de-base{grid-template-columns:minmax(0,1fr)}
#deckEditor .de-intro{font-size:13px;margin:6px 0 10px}#deckEditor .de-card-actions button,#deckEditor .de-save-actions button,#deckEditor select,#deckEditor [data-side]{min-height:44px}
#deckEditor .de-foot{flex-wrap:wrap;gap:6px}#deckEditor .de-save-actions{margin-left:auto}#deckEditor .de-foot [data-deck-status]{flex:1 1 110px;font-size:12px}#deckEditor .de-kicker{display:none}}
@media(max-width:720px){#deckEditor button,#deckEditor input,#deckEditor select,#deckEditor [data-side],#deckEditor [data-category]{min-height:44px}#deckEditor summary{display:list-item;min-height:44px;align-content:center}}
@media(max-width:360px){#deckEditor h2{font-size:20px}#deckEditor .de-top{gap:5px}#deckEditor .de-side-nav{padding:1px}#deckEditor .de-side-nav button{padding:5px}#deckEditor .de-body{scrollbar-gutter:auto}}
`;
function open(pb,{onSave=()=>{},onClose=()=>{},team=null,lineup=team?.lineup||null,maxStored=Infinity,maxUnusedSignatures=Infinity,suggest=null,practiceFilm=null}={}){
  injectFaceCSS();finishes=pb?.finishes||null;
  const {packs:P,data:D,signatures:S}=root.CallSheet,draft=copyDeck(pb),esc=escF;
  P.ensureCollection(draft);S.registerAll(draft);draft.signatures??=[];draft.reserveSignatures??=[];draft.deckPresets=presetList(draft);
  let side='off',category='wrinkles',planKey='',presetChanges=[],repairingPreset=null,showHands=false,useFilm=true;
  // A suggested swap is staged in the draft only; Save keeps it, Cancel discards it with everything else.
  let staged=null;
  if(suggest?.remove&&suggest?.add){const deck=draft.off.wrinkles,res=draft.reserve.off.wrinkles,i=deck.indexOf(suggest.remove),j=res.indexOf(suggest.add);
    if(i>=0&&j>=0){deck.splice(i,1);res.splice(j,1);deck.push(suggest.add);res.push(suggest.remove);staged=suggest}}
  const dialog=document.createElement('dialog');dialog.id='deckEditor';dialog.setAttribute('aria-labelledby','de-title');
  dialog.innerHTML=`<style>${EDITOR_CSS}</style><div class="de-head"><div class="de-top"><div><div class="de-kicker">DECK ROOM</div><h2 id="de-title">Choose your cards</h2></div>
    <div class="de-side-nav" role="group" aria-label="Choose a side"><button type="button" data-side="off">Offense</button><button type="button" data-side="def">Defense</button></div></div>
    <p class="de-intro">Keep 4 base calls, at least ${P.MIN_CAPACITY?.wrinkles||6} plays, and at least ${P.MIN_CAPACITY?.tactics||6} tactics on each side. Cards you remove stay in your collection.</p>
    <p class="de-type-legend">IN DECK / LIMIT</p><div class="de-type-nav" role="group" aria-label="Card types. Counts show copies in deck and their limit."></div>${staged?`<p class="de-suggest" data-suggested-swap><b>Staged from last game:</b> −1 ${esc(staged.removeName||staged.remove)}, +1 ${esc(staged.addName||staged.add)}. ${esc(staged.why||'')} Save deck to keep it, or Cancel to change nothing.</p>`:''}</div>
    <div class="de-body"></div><div class="de-foot"><div data-deck-status role="status" aria-live="polite"></div>
    <div class="de-save-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-save>Save deck</button></div></div>`;
  document.body.appendChild(dialog);
  const $=s=>dialog.querySelector(s),body=$('.de-body'),close=()=>{dialog.close();dialog.remove();onClose()};
  const status=(msg,error=false)=>{const el=$('[data-deck-status]');el.textContent=msg;el.dataset.error=String(error)};
  const cardName=(id)=>P.cardDef(id)?.name||id;
  const titleOf={wrinkles:'Plays',tactics:'Tactics',base:'Base calls',signatures:'Signatures'};
  const categories=Object.keys(titleOf),nounOf={wrinkles:'play',tactics:'tactic',signatures:'signature'};
  // Plays and calls grouped by family (run, quick, deep...; zone, man, pressure) to shorten the list on a phone. Groups
  // start collapsed on narrow screens; the choice survives the redraw after each add or remove.
  const narrow=typeof matchMedia==='function'&&matchMedia('(max-width:600px)').matches,folded=new Set(),touched=new Set();
  const familyOf=id=>(D.PLAYS[id]||D.CALLS[id])?.family||'other';
  const FAMILY={run:'Run',quick:'Quick',deep:'Deep',constraint:'Constraint',trick:'Trick',zone:'Zone',man:'Man',pressure:'Pressure',other:'Other'};
  const familyGroups=(rows,tile)=>{
    const groups=new Map();for(const r of rows){const f=familyOf(r.id);(groups.get(f)||groups.set(f,[]).get(f)).push(r)}
    const rank=Object.keys(FAMILY);return [...groups].sort((a,c)=>rank.indexOf(a[0])-rank.indexOf(c[0])).map(([f,list])=>{const key=side+':'+f,open=touched.has(key)?!folded.has(key):!narrow,inDeck=list.reduce((n,r)=>n+r.inDeck,0);
      return`<details class="de-family" data-family="${esc(key)}" ${open?'open':''}><summary>${esc(FAMILY[f]||f)} <small>${list.length} card${list.length===1?'':'s'} · ${inDeck} in deck</small></summary><div class="de-grid">${list.map(r=>tile(r.id,r.inDeck,r.owned)).join('')}</div></details>`}).join('');
  };
  dialog.addEventListener('toggle',e=>{const d=e.target;if(!d?.matches?.('details.de-family'))return;const key=d.dataset.family;touched.add(key);if(d.open)folded.delete(key);else folded.add(key)},true);
  const cardNames=ids=>{const groups=new Map();ids.forEach(id=>groups.set(id,(groups.get(id)||0)+1));return [...groups].map(([id,n])=>esc(cardName(id))+(n>1?' ×'+n:'')).join(' · ')||'None'};
  const info=id=>{const c=P.cardDef(id);return `<b>${esc(c.name)}</b><small>${c.cost} Command · ${esc(c.family||'Tactic')}</small><p>${esc(cleanText(c.text))}</p>`};
  const tooManyUnusedSignatures=()=>draft.reserveSignatures.length>maxUnusedSignatures;
  function invalidDraft(){
    const over=P.overCapacity(draft);if(over){
      const n=draft[over.side][over.pile].length-draft.capacity[over.pile];
      return{side:over.side,category:over.pile,msg:`Remove ${n} ${nounOf[over.pile]}${n===1?'':'s'} before saving. This type is over its deck limit.`};
    }
    const under=P.underMinimum?.(draft);if(under){
      const n=under.min-draft[under.side][under.pile].length;
      return{side:under.side,category:under.pile,msg:`Add ${n} ${under.side==='off'?'offensive':'defensive'} ${nounOf[under.pile]}${n===1?'':'s'} before saving. Minimum ${under.min} ${nounOf[under.pile]}s per side.`};
    }
    for(const s of ['off','def']){
      const pile=storageBlock(draft.reserve[s],maxStored);if(pile){const n=draft.reserve[s][pile].length-maxStored;
        return{side:s,category:pile,msg:`Add ${n} ${s==='off'?'offensive':'defensive'} ${nounOf[pile]}${n===1?'':'s'} to the deck before saving. Only ${maxStored} copies of this type can stay outside it.`};}
    }
    if(tooManyUnusedSignatures())return{side,category:'signatures',msg:`Too many signatures outside the deck (maximum ${maxUnusedSignatures}). Add one back before saving.`};
    return null;
  }
  function render({reset=false,focus=null}={}){
    const prevScroll=reset?0:body.scrollTop;
    const moreOpen=!!$('[data-more-options]')?.open,advancedOpen=!!$('[data-deck-advice]')?.open,plansOpen=!!$('[data-plans]')?.open,presetName=$('#deckPresetName')?.value||'';
    const deck=draft[side],reserve=draft.reserve[side],sideName=side==='off'?'Offense':'Defense',adjective=side==='off'?'offensive':'defensive';
    const c=deckCounts(draft,side),group={wrinkles:c.plays,tactics:c.tactics,base:{active:deck.base.length,limit:4},signatures:c.signatures},g=group[category];
    dialog.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(side===b.dataset.side)));
    $('.de-type-nav').innerHTML=categories.map(k=>`<button type="button" data-category="${k}" aria-pressed="${category===k}" aria-label="${k==='signatures'?'Team signatures':sideName+' '+titleOf[k]}: ${group[k].active} of ${group[k].limit}${k==='base'?' required':' maximum'}"><span>${titleOf[k]}</span><span data-type-count="${k}">${group[k].active} / ${group[k].limit}</span></button>`).join('');
    const shared=category==='signatures',heading=shared?'Team signatures':sideName+' · '+titleOf[category];
    const full=g.active>=g.limit,noun=nounOf[category],unused=group[category].stored||0;
    const note=category==='base'?'Exactly 4 different calls, always available. Swap a call below; its old card takes the new card’s place. Keep one free call with no special requirements.':
      shared?`Pick up to ${g.limit} across the whole team. These use no regular slots. You can only play a signature when its player is on the field.`:
      `Pick ${P.MIN_CAPACITY?.[category]||6} to ${g.limit} ${adjective} ${titleOf[category].toLowerCase()}. Each copy uses one slot. ${category==='wrinkles'?'Extra copies make a play more likely to turn up.':'A larger pile gives you more options but dilutes each draw.'}`;
    const wrong=invalidDraft();
    const warning=wrong&&wrong.category===category&&(shared||side===wrong.side)?wrong.msg:full&&unused>0&&noun?`All ${g.limit} slots are in use. Remove one ${noun} from the deck before adding another.`:'';
    const help=`<h3 id="de-list-title" tabindex="-1">${heading}</h3><p class="de-sub">${note}</p>${warning?`<p class="de-banner" id="de-limit-note">${esc(warning)}</p>`:''}`;
    function tile(id,inDeck,owned,sg=null){
      const def=P.cardDef(id),baseAlso=category==='wrinkles'&&deck.base.includes(id);
      const unavailable=sg&&lineup&&root.CallSheet.resolver.signatureBlocked(def,lineup[sg.side]||{});
      const probability=book=>Math.round(100*firstHandChance(book,sg?.side||side,id,lineup));
      const access=unavailable?esc(unavailable):def.special?'Special teams · available in its game situation':`First ${(sg?.side||side)==='off'?'offensive':'defensive'} series · saved ${probability(pb)}% → draft ${probability(draft)}%`;
      const edition=[originOf(id,def),D.rarityOf(id)!=='common'&&D.rarityOf(id),draft.finishes?.[id]].filter(Boolean).join(' · ');
      const addDisabled=inDeck>=owned||full,removeDisabled=!inDeck;
      const control=(add,disabled)=>`<button type="button" ${sg?(add?'data-sig-equip':'data-sig-store')+'="'+esc(id)+'"':'data-move="'+(add?'add':'remove')+'"'} aria-label="${add?'Add one':'Remove one'} ${esc(def.name)} ${add?'to':'from'} deck"${disabled?' disabled':''}${add&&full&&warning?' aria-describedby="de-limit-note"':''}>${add?'Add to deck':'Remove from deck'}</button>`;
      return `<article class="de-card" data-owned-card="${esc(id)}" data-selected="${inDeck>0}" tabindex="-1"><div class="de-card-title"><h4>${esc(def.name)}</h4><span data-copy-count title="${owned} owned in this type">${inDeck} of ${owned} in deck</span></div>
        <small>${sg?esc(sg.name)+' · '+esc(sg.role)+' · ':''}${def.cost} Command · ${esc(def.family||'Tactic')}${baseAlso?' · 1 more copy is a base call':''}${edition?' · <span class="de-edition">'+esc(edition)+'</span>':''}</small>
        <p class="de-text">${esc(cleanText(def.text))}</p><small data-draw-chance>${access}</small><div class="de-card-actions">${control(true,addDisabled)}${control(false,removeDisabled)}</div></article>`;
    }
    let list='';
    if(category==='base'){
      const table=side==='off'?D.PLAYS:D.CALLS,owned=ownedRows([...deck.base,...deck.wrinkles],reserve.wrinkles).map(r=>r.id);
      list=`<div class="de-base">${deck.base.map((id,i)=>`<label>Base call ${i+1}<select data-base="${i}" aria-label="Base call ${i+1}">${owned.filter(x=>!table[x]?.trick&&!table[x]?.signature).map(x=>{const dup=x!==id&&deck.base.includes(x),wouldLoseFree=!deck.base.map((old,j)=>j===i?x:old).some(y=>table[y].cost===0&&!table[y].needs);return `<option value="${esc(x)}"${x===id?' selected':''}${dup||wouldLoseFree?' disabled':''}>${esc(cardName(x))} · ${table[x].cost} Command${dup?' (already a base call)':wouldLoseFree?' (keep a free call)':''}</option>`}).join('')}</select></label>`).join('')}</div>`;
    }else if(shared){
      const all=[...draft.signatures,...draft.reserveSignatures],rows=ownedRows(draft.signatures.map(s=>s.id),draft.reserveSignatures.map(s=>s.id));
      list=rows.length?`<div class="de-grid">${rows.map(r=>tile(r.id,r.inDeck,r.owned,all.find(s=>s.id===r.id))).join('')}</div>`:'<p class="de-banner">No signatures yet. Player breakouts can earn them; you don’t need one to play.</p>';
    }else{
      const rows=ownedRows(deck[category],reserve[category]);
      list=rows.length?(category==='wrinkles'?familyGroups(rows,tile):`<div class="de-grid">${rows.map(r=>tile(r.id,r.inDeck,r.owned)).join('')}</div>`):`<p class="de-banner">You don’t own any ${adjective} ${titleOf[category].toLowerCase()} yet. You can still play with your base calls.</p>`;
    }
    const plan=previewPlan(draft,side,planKey,maxStored),spec=GAME_PLANS[side][planKey],advice=deckAdvice(draft,lineup);
    const ready=root.CallSheet.evolution?.ready(draft,{lineup})||[];
    body.innerHTML=help+(presetChanges.length?`<aside class="de-banner" data-preset-repair><b>Preset repairs</b><ul>${presetChanges.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>Save deck to keep these selections and update the repaired preset.</aside>`:'')+list+(lineup?.off&&lineup?.def?`<section><button type="button" data-hand-test aria-expanded="${showHands}" aria-controls="de-hand-report">Test ten third-and-seven ${side==='def'?'defensive ':''}hands</button><div id="de-hand-report" ${showHands?'':'hidden'}>${showHands?thirdDownHTML(thirdDownHands(pb,draft,lineup,team,side,practiceFilm,useFilm),side):''}</div></section>`:'')+`<details data-more-options ${moreOpen?'open':''}><summary>More deck options${ready.length?' · '+ready.length+' ready to evolve':''}</summary>
    <p>Each series, draw up to ${D.RULES.wrinkleRow} extra plays and ${D.RULES.tacticHand} tactics. Base calls are always available. Special-teams tactics trigger in their own situations instead of being drawn.</p>
    ${side==='off'?openingScriptHTML(deck,lineup):''}
<details data-plans ${plansOpen?'open':''}><summary>Try a different ${adjective} build</summary>
<p class="de-muted">Preview a tighter draw pile using cards you already own. Only ${sideName.toLowerCase()} changes.</p>
<label>Game plan<select data-plan><option value="">Choose a build to preview</option>${Object.entries(GAME_PLANS[side]).map(([key,p])=>`<option value="${key}" ${key===planKey?'selected':''}>${p.name}</option>`).join('')}</select></label>
${spec?(plan?`<div data-plan-preview><p><b>${spec.name}</b> · ${spec.edge}</p><p><b>Tradeoff:</b> ${spec.cost}</p><p><b>Base:</b> ${cardNames(plan.deck.base)}<br><b>Play draws:</b> ${cardNames(plan.deck.wrinkles)}<br><b>Tactic draws:</b> ${cardNames(plan.deck.tactics)}${side==='off'?`<br><b>Opener:</b> ${plan.deck.openingScript?cardNames([plan.deck.openingScript]):'Normal draw'}`:''}</p>
<p class="de-muted">${plan.reserve.wrinkles.length} play copies and ${plan.reserve.tactics.length} tactic copies will stay out of the deck. All signatures stay as they are.</p>
${plan.storageBlock?`<small>This build would leave out more than ${maxStored} ${plan.storageBlock==='wrinkles'?'plays':'tactics'}. Keep more copies in the deck by choosing cards yourself.</small>`:'<button type="button" data-plan-apply>Use this build</button><small>You can adjust it before you save.</small>'}</div>`:'<p>This build needs cards that are missing from your collection or do not fit the current limits. Your deck is unchanged.</p>'):''}</details>
<details data-deck-advice ${advancedOpen?'open':''}><summary>Deck advice &amp; presets</summary><h3>${esc(advice.identity)} · your offensive identity</h3><p class="de-muted">${lineup?'Advice uses your current lineup.':'Personnel advice appears when a lineup is available.'} These are suggestions, not automatic changes.</p>${advice.warnings.map(x=>`<p>${esc(x)}</p>`).join('')}${advice.suggestions.map(x=>`<p class="de-muted">${esc(x)}</p>`).join('')}
<label>Preset name<input id="deckPresetName" maxlength="40" placeholder="Power run, Balanced, Two-minute…"></label><button type="button" data-preset-save>Save current selections as preset</button>
<p class="de-muted">Presets include offense and defense. Changes are kept only when you choose Save deck. Reusing a name replaces that preset.</p>
${(draft.deckPresets||[]).map((p,i)=>`<div><b>${esc(p.name)}</b> <button type="button" data-preset-load="${i}">Load ${esc(p.name)}</button> <button type="button" data-preset-delete="${i}" aria-label="Delete preset ${esc(p.name)}">Delete</button></div>`).join('')}</details>
${ready.map(r=>`<section><h3>Ready to evolve · ${esc(P.cardDef(r.rootId).name)}</h3><p class="de-muted">Your practice and game reps earned a playbook branch. It takes effect when you save this deck.</p><div class="de-cards">${r.options.map(id=>`<article class="${faceClass(id)}">${originHTML(id)}${info(id)}${r.locks?.[id]?`<small class="de-lock">🔒 ${esc(r.locks[id])}</small><button type="button" disabled>Locked</button>`:`<button type="button" data-evolve="${r.rootId}:${id}">Choose ${esc(P.cardDef(id).name)}</button>`}</article>`).join('')}</div></section>`).join('')}

<details><summary>Achievements · ${draft.achievements.length}/${P.ACHIEVEMENTS.length}</summary>${P.ACHIEVEMENTS.map(a=>`<p><b>${draft.achievements.includes(a.id)?'✓ ':''}${esc(a.name)}</b> — ${esc(a.how)}<small>Reward: ${esc(P.cardDef(a.reward).name)} · added to your collection once</small></p>`).join('')}</details>
<details><summary>More cards to discover</summary><p class="de-muted">Win or lose, every completed game awards a choice pack. Achievements unlock specific cards. Repeated use evolves plays; player breakouts create signatures.</p><div class="de-cards">${P.POOL.filter(c=>c.side===side&&![...deck.base,...deck.wrinkles,...deck.tactics,...reserve.wrinkles,...reserve.tactics].includes(c.id)).map(c=>`<article class="${faceClass(c.id)}">${originHTML(c.id)}${info(c.id)}<small>${esc(c.rarity)} · Pack reward</small></article>`).join('')}</div></details>

    </details>`;
    $('#deckPresetName').value=presetName;body.scrollTop=prevScroll;
    if(focus){const el=$(focus);el?.focus({preventScroll:true})}
  }
  const at=(sel,id)=>sel+'="'+String(id).replace(/["\\]/g,'\\$&')+'"]';
  const focusCard=(id,action,isSig)=>{
    const row=$(at('[data-owned-card',id));
    const same=row?.querySelector(isSig?(action==='add'?'[data-sig-equip]':'[data-sig-store]'):'[data-move="'+action+'"]');
    (same&&!same.disabled?same:row?.querySelector('button:not(:disabled)')||row)?.focus({preventScroll:true});
  };
  const act=(fn,ok,focus)=>{try{fn();render();const wrong=invalidDraft();status(wrong?.msg||ok,!!wrong)}catch(e){render();status(e.message,true)}if(focus)focus()};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  dialog.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.hasAttribute('data-side')){side=b.dataset.side;if(category==='signatures')category='wrinkles';planKey='';render({reset:true,focus:at('[data-side',side)});status(invalidDraft()?.msg||'Ready to play.',!!invalidDraft());return}
    if(b.hasAttribute('data-category')){category=b.dataset.category;render({reset:true,focus:at('[data-category',category)});status(invalidDraft()?.msg||'Ready to play.',!!invalidDraft());return}
    if(b.hasAttribute('data-hand-test')){showHands=!showHands;render({focus:'[data-hand-test]'});return}
    if(b.hasAttribute('data-cancel')){close();return}
    if(b.hasAttribute('data-save')){const wrong=invalidDraft();if(wrong){side=wrong.side;category=wrong.category;render({reset:true,focus:'#de-list-title'});status(wrong.msg,true);return}if(repairingPreset&&draft.deckPresets.includes(repairingPreset))savePreset(draft,repairingPreset.name);onSave(draft);close();return}
    const sig=b.hasAttribute('data-sig-store')||b.hasAttribute('data-sig-equip');
    if(b.dataset.move||sig){
      const add=sig?b.hasAttribute('data-sig-equip'):b.dataset.move==='add',id=b.closest('[data-owned-card]').dataset.ownedCard;
      {const fam=b.closest('details.de-family')?.dataset.family;if(fam){touched.add(fam);folded.delete(fam)}} // keep the card you just changed in view
      act(()=>{if(sig){const from=add?draft.reserveSignatures:draft.signatures,to=add?draft.signatures:draft.reserveSignatures,i=from.findIndex(s=>s.id===id);if(i<0||add&&to.length>=S.SLOTS)throw Error('No signature slot available.');to.push(from.splice(i,1)[0])}
        else{const list=add?draft.reserve[side][category]:draft[side][category];P.moveCard(draft,side,category,list.indexOf(id),add)}},
        `${cardName(id)} ${add?'added to':'removed from'} deck.`,()=>focusCard(id,add?'add':'remove',sig));return;
    }
    if(b.hasAttribute('data-plan-apply')){const plan=previewPlan(draft,side,planKey,maxStored);if(!plan||plan.storageBlock)return;const name=GAME_PLANS[side][planKey].name;draft[side]=plan.deck;draft.reserve[side]=plan.reserve;planKey='';category='wrinkles';presetChanges=[];repairingPreset=null;render({reset:true,focus:'#de-list-title'});status(name+' selected. Save deck to keep it.');return}
    if(b.hasAttribute('data-preset-save')){act(()=>savePreset(draft,$('#deckPresetName').value),'Preset saved in this draft.',()=>$('[data-preset-save]')?.focus({preventScroll:true}));return}
    if(b.hasAttribute('data-preset-load')){const i=Number(b.dataset.presetLoad);act(()=>{presetChanges=loadPreset(draft,i);repairingPreset=presetChanges.length?draft.deckPresets[i]:null},'Preset selected.',()=>$(at('[data-preset-load',String(i)))?.focus({preventScroll:true}));return}
    if(b.hasAttribute('data-preset-delete')){act(()=>{const [removed]=draft.deckPresets.splice(Number(b.dataset.presetDelete),1);if(removed===repairingPreset){repairingPreset=null;presetChanges=[]}},'Preset removed from this draft.',()=>$('[data-preset-save]')?.focus({preventScroll:true}));return}
    if(b.dataset.evolve){const [from,to]=b.dataset.evolve.split(':');act(()=>root.CallSheet.evolution.evolve(draft,from,to,{lineup}),cardName(to)+' selected. Save deck to keep it.',()=>$('[data-more-options] summary')?.focus({preventScroll:true}));return}
  });
  dialog.addEventListener('change',e=>{
    const el=e.target;
    if(el.hasAttribute('data-practice-source')){useFilm=el.value==='film';render({focus:'[data-practice-source]'});return}
    if(el.hasAttribute('data-plan')){planKey=el.value;render({focus:'[data-plan]'});status(invalidDraft()?.msg||'Ready to play.',!!invalidDraft());return}
    if(el.hasAttribute('data-base')){const i=Number(el.dataset.base),id=el.value;act(()=>P.setBase(draft,side,i,id),`Base call ${i+1}: ${cardName(id)}.`,()=>$(at('[data-base',String(i)))?.focus({preventScroll:true}));return}
    if(el.id==='openingScript'){act(()=>P.setOpeningScript(draft,el.value),'Opening script updated.',()=>$('#openingScript')?.focus({preventScroll:true}));return}
  });
  render();const initialIssue=invalidDraft();status(initialIssue?.msg||'Ready to play.',!!initialIssue);dialog.showModal();return dialog;
}
root.CallSheet.playbookUI={thirdDownHands,firstHandChance,openingScriptHTML,presetList,savePreset,loadPreset,deckAdvice,deckCounts,ownedRows,previewPlan,open,faceHTML,faceClass,injectFaceCSS};
})(typeof window==='object'?window:globalThis);
