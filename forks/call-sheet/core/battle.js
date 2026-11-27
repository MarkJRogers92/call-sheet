// Call Sheet battle: series-based hands and Command on top of Game Engine 2.
//
//   const b = battle.create({home, away, user:'home', mode:'series', seed:'x'});
//   let req = battle.advance(b);          // runs AI and scripted snaps until a person must decide
//   battle.submit(b, {type:'call', play:'inside_zone', tactics:[]});
//
// Modes (the control dial; every mode plays the same rules, so stats agree):
//   snap   — you call every snap
//   series — at each new set of downs you script 1st and 2nd down (or hand them to the coordinator);
//            you call 3rd and 4th down, the red zone and the last two minutes of each half live
//   key    — the coordinator plays every routine snap with your cards; you take the key downs only
//   sim    — the coordinators play everything
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const deps=node?[require('./data.js'),require('./resolver.js'),require('../../../rng.js'),require('../../../game-engine-v2.js'),require('./roster.js')]
    :[root.CallSheet.data,root.CallSheet.resolver,root.DynastyRng,root.DynastyGameEngineV2,root.CallSheet.roster];
  const api=factory(...deps);
  if(node)module.exports=api;else root.CallSheet.battle=api;
})(typeof window==='object'?window:globalThis,function(D,R,DynastyRng,Engine,Ro){
'use strict';
const VERSION=1;
const other=s=>s==='home'?'away':'home';
const clone=v=>JSON.parse(JSON.stringify(v));
const OFF_FAMILIES=['run','quick','deep','constraint'];
const DEFENSIVE_PLANS={
  pressure:{opening:'They favor sending extra rushers.',counter:'Two screens gained ground against extra rushers. Expect more defenders to drop into coverage.'},
  two_high:{opening:'They favor keeping two safeties deep.',counter:'Two runs gained ground against two deep safeties. Expect them to bring a safety closer to the line.'}
};

// ---------------------------------------------------------------- setup
function create(opts){
  const seed=String(opts.seed??'call-sheet');
  const game=Engine.createGame({home:{id:'home',name:opts.home.name,rating:70},away:{id:'away',name:opts.away.name,rating:70},seed,rules:{penalties:true,returns:true,pressure:true,...(opts.conditions?{conditions:opts.conditions}:{})}});
  const b={version:VERSION,seed,mode:opts.mode||'series',user:opts.user||null,control:opts.control||'both',weather:opts.weather||'clear',conditions:opts.conditions||null,grouping:{home:'auto',away:'auto'},specialUsed:{home:{},away:{}},rivalry:!!opts.rivalry,game,
    teams:{home:clone(opts.home),away:clone(opts.away)},
    decks:{home:clone(opts.home.decks||D.DEFAULT_DECKS),away:clone(opts.away.decks||D.DEFAULT_DECKS)},
    piles:{},hands:{home:null,away:null},
    tend:{home:blankTend(),away:blankTend()},
    seriesKey:null,seriesSnap:0,plan:null,period:1,coachingWindows:!!opts.coachingWindows,
    snap:null,pending:null,log:[],lastResult:null,headset:headsetSettings(opts.headset),
    streaks:{},fire:{},workload:{},drive:{key:null,fams:[],firsts:0},bonusCommand:{home:0,away:0},exhausted:{home:[],away:[]},
    box:{home:blankBox(),away:blankBox()},players:{},personnel:{},backfieldMode:{home:'auto',away:'auto'},
    telemetry:{decisions:{plan:0,snap:0,info:0,fourth:0},snaps:0,series:0,userSnaps:0,lineCounts:{},cardsPlayed:0},
    rng:DynastyRng.create(`${seed}:cards`).snapshot()};
  if(opts.classicSide==='home'||opts.classicSide==='away')b.classicSide=opts.classicSide;
  if(opts.openingDrive&&b.user)b.driveCoach={opening:'pending',next:false,history:{}};
  if(b.user&&b.mode!=='sim'){
    const discipline=b.teams[other(b.user)].coach?.discipline;
    const id=opts.defensivePlan==='auto'?(discipline<=3?'pressure':discipline>=5?'two_high':null):opts.defensivePlan;
    if(Object.hasOwn(DEFENSIVE_PLANS,id))b.opponentDefense={id,counters:0};
  }
  const rematch=opts.rivalryPlan;
  if(b.rivalry&&['home','away'].includes(rematch?.side)&&Object.hasOwn(D.PLAYS,rematch.play))b.rivalryPlan={side:rematch.side,play:rematch.play};
  // Game-day form: every team is a little sharp or a little flat on a given day (its own seeded stream, so nothing
  // else shifts). Talent still decides each duel; form is what lets an underdog win on a good day.
  {const fr=DynastyRng.create(`${seed}:form`);b.form={};for(const side of ['home','away'])b.form[side]=Math.round(Math.max(-2*FORM_SIGMA,Math.min(2*FORM_SIGMA,fr.gauss()*FORM_SIGMA))*100)/100}
  for(const side of ['home','away']){
    b.piles[side]={off:freshPiles(b,b.decks[side].off),def:freshPiles(b,b.decks[side].def)};
    const deck=b.decks[side].off;
    if(D.canScriptOpener(deck,deck.openingScript))(b.pendingOpeners??={})[side]=deck.openingScript;
    const t=b.teams[side];
    for(const p of [...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.backfield||[]),...(t.packageDepth||[])])b.personnel[p.id]=p;
  }
  return b;
}
function blankTend(){return{run:0,quick:0,deep:0,constraint:0,pressure:0,man:0,zone:0}}
// The adjustment meter cools at halftime and resets on counters. Charted calls remain on film.
function tendencyCounts(b,side){
  const counts=blankTend();
  for(const e of b?.log||[]){
    if(e.type!=='snap'||e.penalty||e.category==='kick')continue;
    if(e.offSide===side){
      const family=D.PLAYS[e.play]?.family;
      if(OFF_FAMILIES.includes(family))counts[family]++;
    }
    if(e.defSide===side){
      const call=D.CALLS[e.call];
      if(call)counts[call.family==='pressure'?'pressure':call.coverage]++;
    }
  }
  return counts;
}
function blankBox(){return{plays:0,yards:0,rushAtt:0,rushYds:0,passAtt:0,comp:0,passYds:0,sacks:0,ints:0,fumbles:0,firstDowns:0,thirdAtt:0,thirdConv:0,fourthAtt:0,fourthConv:0,penalties:0,penaltyYds:0,punts:0,explosives:0,cardsPlayed:0}}
function withRng(b,fn){const rng=DynastyRng.create(b.rng);const out=fn(rng);b.rng=rng.snapshot();return out}
function shuffle(rng,arr){for(let i=arr.length-1;i>0;i--){const j=rng.int(0,i);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
function freshPiles(b,deck){return withRng(b,rng=>({wrinkle:{draw:shuffle(rng,[...deck.wrinkles]),discard:[]},tactic:{draw:shuffle(rng,deck.tactics.filter(id=>!D.TACTICS[id]?.special)),discard:[]}}))}
function drawFrom(b,pile,n){
  const out=[];
  while(out.length<n){
    if(!pile.draw.length){if(!pile.discard.length)break;pile.draw=withRng(b,rng=>shuffle(rng,pile.discard.splice(0)))}
    out.push(pile.draw.pop());
  }
  return out;
}

// ---------------------------------------------------------------- helpers
const offSide=b=>b.game.possession;
const defSide=b=>other(b.game.possession);
function lineupOf(b,side,role){return b.teams[side].lineup[role]}
// Select before either team commits. Auto spells the lead back every fourth offensive snap.
const BACKFIELD_MODES={auto:'Auto rotation',starter:'Starter',power:'Power',receiving:'Receiving'};
function chooseBack(b,side){
  const t=b.teams[side],starter=t.backfield?.[0]||t.packageStarters?.RB||t.restBench?.RB||t.lineup.off.RB;
  let pool=t.backfield;
  if(b.resting?.[side]){
    const reserves=[...(pool||[]),...(t.packageDepth||[])].filter(p=>p.pos==='RB'&&p.id!==starter?.id);
    if(reserves.length)pool=reserves;
  }
  if(!pool?.length){if(starter)t.lineup.off.RB=starter;return}
  const mode=b.backfieldMode?.[side]||'auto',sit=situation(b);
  let p=pool[0];
  if(mode==='power'||mode==='receiving'){
    const traits=mode==='power'?['power','technique']:['technique','iq','versatility'];
    const fit=x=>traits.reduce((v,k)=>v+(x.traits[k]||50),0)/traits.length+(x.cond||[]).filter(c=>c.when==='any'||c.when==='late'&&sit.period>=4||c.when==='money'&&sit.down>=3).reduce((v,c)=>v+c.v*10,0);
    p=pool.slice().sort((a,c)=>fit(c)-fit(a))[0];
  }else if(mode==='auto'&&pool.length>1&&b.box[side].plays%4===3){p=pool[1]}
  t.lineup.off.RB=p;
}
function setBackfield(b,side,mode){
  if(!Object.hasOwn(BACKFIELD_MODES,mode))throw new Error('Unknown backfield package.');
  if(b.pending?.kind!=='snap'||b.pending.side!==side||b.pending.role!=='off')throw new Error('Change backs before your offensive snap.');
  (b.backfieldMode??={home:'auto',away:'auto'})[side]=mode;
  b.snap.grouping=dressPackage(b,side);
  b.pending=snapRequest(b,side);return b.pending;
}
// Snapshots hold IDs, with each player's card stored once. Old battle saves fall back to their fixed lineup.
function snapLineup(b,e,role){
  const ids=e.lineups?.[role];
  return ids?Object.fromEntries(Object.entries(ids).map(([r,id])=>[r,b.personnel?.[id]]).filter(([,p])=>p)):b.teams[role==='off'?e.offSide:e.defSide].lineup[role];
}
function situation(b){const g=b.game;return{down:g.down,distance:g.distance,field:g.fieldPosition,period:g.period,clock:g.clock,score:{...g.score},possession:g.possession}}
function seriesKeyOf(g){return`${g.drive}:${g.possession}:${g.fieldPosition+g.distance}:${g.ot?g.ot.period+'.'+g.ot.possessions:''}`}
// The person controls a side's snaps when it is their team and the control setting covers that unit.
// Program edges (scheme fit, weekly prep, home crowd): each team's offensive edges help its offense, its
// defensive edges help its defense. They come from the Dynasty Lab program via the adapter.
// Form affects the execution read (Key), not all three rolls on every snap.
// Clamp old checkpoints too; already played snaps and season scores are not touched.
const FORM_SIGMA=.25;
function formEdge(b,side){const f=b.form?.[side]||0;if(Math.abs(f)<.15)return[];const t=b.teams[side];return[{duel:'K',v:Math.max(-.5,Math.min(.5,f)),src:`${t?.short||t?.name||side} ${f>0?'sharp':'flat'} today`}]}
function edgesFor(b,offSide){const def=other(offSide);return{offEdges:[...(b.teams[offSide]?.edges?.off||[]),...formEdge(b,offSide)],defEdges:[...(b.teams[def]?.edges?.def||[]),...formEdge(b,def)]}}
const HEADSET_RULES=[
  {id:'openingDrive',label:'Coach my opening offensive drive from 1st down',initial:true},
  {id:'fourth',label:'Call fourth downs on the sides I coach',initial:true},
  {id:'inside25',label:'On offense, call the first snap at or inside their 25',initial:false},
  {id:'defendLead',label:'Call defense when I lead by 1–8 points',initial:false},
  {id:'restStarters',label:'Rest offensive starters when up 28+ in the second half',initial:true},
  {id:'readOption',label:'Read the unblocked end myself on Read Option',initial:false}
];
function headsetSettings(raw){
  return Object.fromEntries(HEADSET_RULES.map(({id,initial})=>[id,typeof raw?.[id]==='boolean'?raw[id]:initial]));
}
function reached25(b){
  return b.mode==='key'&&b.headset.inside25&&b.game.possession===b.user&&b.game.fieldPosition>=75&&b.headset25Drive!==b.game.drive;
}
function defendLead(b){
  const margin=b.game.score[b.user]-b.game.score[other(b.user)];
  return b.mode==='key'&&b.headset.defendLead&&b.user!==b.game.possession&&margin>=1&&margin<=8;
}
// Scoped to this possession so a conversion keeps the coach in charge and a turnover hands back the headset.
function coachingDrive(b){return b.mode==='key'&&b.coachedDrive===driveKey(b.game,b.game.possession)}
function isUser(b,side){
  if(b.user!==side||!b.game.possession)return false;
  if(b.control==='both'||defendLead(b)||coachingDrive(b))return true;
  return(b.control==='offense')===(side===b.game.possession);
}
function keyMoment(b){
  const g=b.game;
  if(b.mode==='key'){
    if(g.down===4)return b.headset.fourth;
    if(defendLead(b)||reached25(b))return true;
  }
  return g.down>=3||g.fieldPosition>=D.RULES.redZone||((g.period===2||g.period===4)&&g.clock<=D.RULES.twoMinute)||g.period>4;
}
function leanFor(b){ // the defense leans when the offense's tendency reaches its coordinator's discipline
  const off=b.tend[offSide(b)],disc=b.teams[defSide(b)].coach.discipline??4;
  let best=null,bv=0;for(const f of ['run','quick','deep']){if(off[f]>bv){bv=off[f];best=f}}
  return bv>=disc?best:null;
}
function heatFor(b){return b.tend[defSide(b)].pressure>=3}
function covTendFor(b){
  const dt=b.tend[defSide(b)],disc=b.teams[offSide(b)]?.coach?.discipline??4;
  if(!dt)return null;
  const man=dt.man||0,zone=dt.zone||0;
  if(Math.max(man,zone)<disc||man===zone)return null;
  return man>zone?'man':'zone';
}
// How close the offense is to drawing a lean: its most-called family against the coordinator's public discipline.
// Only the offense's own call counts and the defense's scouted temperament are used, never the hidden next call.
function leanMeter(b){
  const scouted=!!b.snap?.look?.lean?.confirmed;
  if(scouted&&leanFor(b))return null;
  const t=b.tend[offSide(b)],threshold=b.teams[defSide(b)].coach?.discipline??4;
  let family=null,count=0;for(const f of ['run','quick','deep'])if(t[f]>count){count=t[f];family=f}
  return family?{family,count,...(scouted?{threshold}:{})}:null;
}

// Effective cost of a card for a side, given signatures. onceUsed tracks "once per series" discounts.
function costOf(b,side,card){
  const hand=b.hands[side],lineup=b.teams[side].lineup[hand.role];
  let cost=card.cost;
  for(const p of Object.values(lineup)){
    const s=D.SIGNATURES[p.archetype];if(!s?.cost||s.cost[card.id]===undefined)continue;
    if(s.costOnce&&hand.onceUsed.includes(card.id))continue;
    cost=Math.min(cost,s.cost[card.id]);
  }
  return cost;
}
function markCostUse(b,side,card){
  const hand=b.hands[side],lineup=b.teams[side].lineup[hand.role];
  for(const p of Object.values(lineup)){const s=D.SIGNATURES[p.archetype];if(s?.costOnce&&s.cost?.[card.id]!==undefined&&card.cost>s.cost[card.id]&&!hand.onceUsed.includes(card.id)){hand.onceUsed.push(card.id);return}}
}

// ---------------------------------------------------------------- series
function ensureSeries(b){
  const g=b.game,key=seriesKeyOf(g);
  if(b.period<=2&&g.period>=3){
    halftime(b);
    b.period=g.period;
    if(b.coachingWindows&&b.user&&b.mode!=='sim'){
      b.pending=halftimeRequest(b);
      return false;
    }
  }
  b.period=g.period;
  if(g.possession)updateRest(b,g.possession);
  if(key===b.seriesKey)return false;
  b.seriesKey=key;b.seriesSnap=0;b.plan=null;b.telemetry.series++;
  dressPackage(b,g.possession);
  for(const side of ['home','away'])dealHand(b,side,side===g.possession?'off':'def');
  return true;
}
function dealHand(b,side,role){
  const old=b.hands[side];
  // Move one physical copy across the series boundary only after an earned first down.
  const kept=[];
  if(old?.earnedFirst&&old.role==='off'&&role==='off'&&old.keepTactic){
    const index=old.tactics.indexOf(old.keepTactic);
    if(index>=0)kept.push(...old.tactics.splice(index,1));
  }
  if(old){const p=b.piles[side][old.role];p.wrinkle.discard.push(...old.wrinkles);p.tactic.discard.push(...old.tactics)}
  const p=b.piles[side][role];
  // Pin one existing copy for this team's first offensive series only. A normal draw is byte-for-byte
  // unchanged if no opener is set, the personnel no longer fit it, or the card would be drawn already.
  const script={},id=role==='off'&&b.pendingOpeners?.[side];
  if(id)delete b.pendingOpeners[side];
  if(id&&D.canScriptOpener(b.decks[side].off,id)){
    const play=D.PLAYS[id],reason=R.playBlocked(play,b.teams[side].lineup.off,situation(b));
    if(reason)script.openingScriptMiss=play.name+': '+reason;
    else{
      const pile=p.wrinkle.draw,i=pile.lastIndexOf(id),top=pile.length-1;
      if(i>=0){
        if(i<pile.length-D.RULES.wrinkleRow)[pile[i],pile[top]]=[pile[top],pile[i]];
        script.openingScript=id;
      }
    }
  }
  const bonus=role==='off'?(b.bonusCommand?.[side]||0):0;if(bonus)b.bonusCommand[side]=0;
  const staffBonus=b.teams[side]?.coach?.commandBonus?.[role]||0;
  const extra=role==='off'&&b.challengeDraft?.playbook==='tempo'&&old?.tempoDraw;
  const wrinkles=drawFrom(b,p.wrinkle,D.RULES.wrinkleRow+Number(!!extra));
  const tempoExtra=extra&&wrinkles.length>D.RULES.wrinkleRow;
  if(tempoExtra)b.challengeDraft.tempoUsed=true;
  b.hands[side]={role,...script,wrinkles,...(tempoExtra?{tempoExtra:true}:{}),tactics:kept.concat(drawFrom(b,p.tactic,D.RULES.tacticHand-kept.length)),...(kept.length?{retained:kept[0]}:{}),command:D.RULES.seriesCommand+bonus+staffBonus,onceUsed:[]};
}
function halftimeRequest(b){
  const side=b.user,plays=b.log.filter(e=>e.type==='snap'&&e.sit?.period<=2&&!e.penalty&&e.duelResults);
  const lostProtection=plays.filter(e=>e.offSide===side&&D.PLAYS[e.play]?.duels.G.protect&&!e.duelResults[0].won).length;
  const allowed=plays.filter(e=>e.defSide===side&&e.completed&&e.yards>=10),allowedPasses=allowed.length;
  // Name the receiver behind those completions so a Bracket suggestion points at a real player.
  const byReceiver=new Map();
  for(const e of allowed){const id=e.lineups?.off?.[e.participants?.target];if(id)byReceiver.set(id,(byReceiver.get(id)||0)+1)}
  const receivers=[...byReceiver.entries()].sort((a,c)=>c[1]-a[1]);
  const [threatId,threatCount]=receivers[0]||[];
  const lineup=b.teams[other(side)].lineup.off,eligible=R.bracketOptions(lineup);
  const bracketed=receivers.map(([id])=>eligible.find(o=>lineup[o.role].id===id)).find(Boolean);
  const bracketTarget=bracketed?{id:lineup[bracketed.role].id,name:bracketed.name}:null;
  const options=[];
  for(const role of ['off','def']){
    if((b.control==='offense'&&role==='def')||(b.control==='defense'&&role==='off'))continue;
    // Only tactics this unit can field from the shuffled deck. Keep the private draw order hidden.
    const ids=[...new Set(b.piles[side][role].tactic.draw)].sort();
    for(const id of ids){
      const card=D.TACTICS[id];
      if(!card||R.signatureBlocked(card,b.teams[side].lineup[role]))continue;
      options.push({id,role});
    }
  }
  const suggestion=lostProtection>0&&options.some(o=>o.id==='max_protect')?'max_protect':
    bracketTarget&&options.some(o=>o.id==='bracket')?'bracket':null;
  const packages=b.control==='defense'?[]:groupingOptions(b,side).filter(o=>o.available&&o.id!==b.grouping?.[side]);
  const threat=threatId&&threatCount>=2?{id:threatId,name:b.personnel?.[threatId]?.name||null,count:threatCount}:null;
  return {kind:'halftime',side,situation:situation(b),options,packages,suggestion,lostProtection,allowedPasses,...(bracketTarget?{bracketTarget}:{}),...(threat?{threat}:{})};
}
function applyHalftimeChoice(b,req,id){
  if(typeof id==='string'&&id.startsWith('package:')){
    const mode=id.slice(8);
    if(!req.packages?.some(o=>o.id===mode))throw new Error('This personnel package is unavailable.');
    b.grouping[req.side]=mode;
  }else if(id!=null){
    const choice=req.options.find(o=>o.id===id);
    if(!choice)throw new Error('Choose an equipped halftime tactic.');
    const draw=b.piles[req.side][choice.role].tactic.draw,index=draw.indexOf(id);
    if(index<0)throw new Error('That halftime tactic is unavailable.');
    draw.push(...draw.splice(index,1));
    if(id==='bracket'&&req.bracketTarget)b.halftimeBracketId=req.bracketTarget.id;
  }
  b.halftimeAdjustment=id||null;
  b.pending=null;
  return advance(b);
}
function halftime(b){
  delete b.clockIntent;
  for(const id of Object.keys(b.workload||{}))b.workload[id]=Math.max(0,b.workload[id]-10);
  for(const side of ['home','away']){
    const t=b.tend[side];for(const k of Object.keys(t))t[k]=Math.floor(t[k]/2);
    if(b.hands[side]){const p=b.piles[side][b.hands[side].role];p.wrinkle.discard.push(...b.hands[side].wrinkles);p.tactic.discard.push(...b.hands[side].tactics);b.hands[side]=null}
    {// Trick plays are once per game: copies already used stay out of the second-half reshuffle.
      const used=[...(b.exhausted?.[side]||[])],keep=deck=>({...deck,wrinkles:deck.wrinkles.filter(id=>{const k=used.indexOf(id);if(k<0)return true;used.splice(k,1);return false})});
      b.piles[side]={off:freshPiles(b,keep(b.decks[side].off)),def:freshPiles(b,keep(b.decks[side].def))}}
  }
  b.seriesKey=null;b.log.push({type:'halftime',text:'Halftime. Tendencies cool off, decks reshuffle.'});
  // Weather can turn at halftime (outdoors only, from its own seeded stream): clouds bring rain or snow, light rain can clear.
  if(b.conditions?.roof!=='dome'){const r=DynastyRng.create(`${b.seed}:weather2`).next(),cold=Number(b.conditions?.temp??60)<=33;
    const next=b.weather==='clear'&&Number(b.conditions?.wind??0)>=12&&r<.2?(cold?'snow':'rain'):b.weather==='rain'&&Number(b.conditions?.precip??1)<=1&&r<.25?'clear':null;
    if(next){b.log.push({type:'weather',from:b.weather,to:next,text:next==='clear'?'The rain clears for the second half.':`${next==='snow'?'Snow':'Rain'} moves in for the second half.`});b.weather=next}}
}

// ---------------------------------------------------------------- the Look
// Built from the committed defensive call. Confirmed facts are true; uncertain facts may not be.
function lookFor(b,defCommit){
  const call=D.CALLS[defCommit.play],off=b.teams[offSide(b)],qb=off.lineup.off.QB,disguised=defCommit.tactics.includes('disguise');
  const qbSig=D.SIGNATURES[qb?.archetype]?.look,qbSees=(R.traitGrade(qb,'iq')>=8||qbSig==='shell')&&qbSig!=='noShell';
  const shownShell=disguised?(call.shell===2?1:2):call.shell;
  const lean=leanFor(b),covTend=covTendFor(b);
  return{
    box:{value:call.box,confirmed:true},
    shell:{value:shownShell,confirmed:qbSees&&!disguised},
    pressure:{value:call.look.pressureShown,confirmed:false},
    coverage:{value:null,confirmed:false},
    lean:{value:lean,confirmed:!!off.coach.film},
    covTend,
    heat:heatFor(b)
  };
}
function blindLook(b){
  return{box:{value:'normal',confirmed:false},shell:{value:1,confirmed:false},pressure:{value:heatFor(b),confirmed:false},coverage:{value:null,confirmed:false},lean:{value:leanFor(b),confirmed:true},covTend:covTendFor(b),heat:heatFor(b)};
}
// What the offense believes the call is: a pseudo-call built only from the Look.
function presumedCall(look,confirmedLeanOnly=false){
  const shell=look.shell.value===0?0:look.shell.value;
  const coverage=look.coverage?.confirmed?look.coverage.value:(look.covTend||(shell===2?'zone':'man'));
  const pressure=look.pressure.confirmed&&Number.isFinite(look.pressure.realLevel)?look.pressure.realLevel:(look.pressure.value?1:0);
  return{id:'presumed',box:look.box.value,shell,coverage,pressure,counters:look.lean.value&&(!confirmedLeanOnly||look.lean.confirmed)?[look.lean.value]:[],look:{}};
}
// What the defense knows of the offense: family if Film Tell confirmed it, else its tendency.
function offFamilyWeights(g,t,revealedFamily){
  if(revealedFamily)return Object.fromEntries(OFF_FAMILIES.map(f=>[f,f===revealedFamily?1:0]));
  const w={run:1.1,quick:1,deep:.7,constraint:.45};
  if(g.distance<=2){w.run*=2.2;w.deep*=.5}else if(g.distance>=8&&g.down>=2){w.run*=.45;w.deep*=1.5;w.quick*=1.3}
  for(const f of OFF_FAMILIES)w[f]*=1+(t[f]||0)*.18;
  const s=Object.values(w).reduce((a,v)=>a+v,0);for(const f of OFF_FAMILIES)w[f]/=s;return w;
}
const REP_PLAYS={run:['inside_zone','outside_zone','power'],quick:['quick_slant','stick'],deep:['deep_cross','vertical_shot'],constraint:['pa_boot','screen']};

// ---------------------------------------------------------------- special teams and situations (rules v0.9)
// Timeout cards spend one of the engine's real timeouts (three per half).
const TIMEOUT_CARDS=['timeout_settle','timeout_ice'];
const timeoutsLeft=(b,side)=>Number(b.game.timeouts?.[side]??3);
// Personnel grouping: 11 (balanced), 12 and 21 (heavy), 10 (spread). Auto picks by situation.
const GROUPINGS={auto:'Auto','11':'11 · balanced','12':'12 · two tight ends','21':'21 · two backs','10':'10 · four wide'};
const PACKAGE_ROLES=['X','Z','TE','SLOT'];
const PACKAGE_POS={10:['WR','WR','WR','WR'],12:['WR','WR','TE','TE'],21:['WR','WR','TE','RB']};
function packageLineup(b,side,mode){
  const team=b.teams[side],off=team.lineup.off,base={...(team.packageStarters||off)};
  const excluded=new Set();
  if(b.resting?.[side]){
    const used=new Set(Object.values(base).filter(Boolean).map(p=>p.id));
    used.add(off.RB?.id);
    for(const role of ['Z','TE']){
      const original=base[role];
      const replacement=original&&team.packageDepth?.find(p=>p.pos===original.pos&&!used.has(p.id));
      if(replacement){base[role]=replacement;used.add(replacement.id);excluded.add(original.id)}
    }
    if(base.RB&&base.RB.id!==off.RB?.id)excluded.add(base.RB.id);
  }
  if(mode==='11')return Object.fromEntries(PACKAGE_ROLES.map(role=>[role,base[role]]).filter(([,p])=>p));
  const positions=PACKAGE_POS[mode];if(!positions)return null;
  const players=PACKAGE_ROLES.map(role=>base[role]).concat(team.packageDepth||[],team.backfield||[]).filter(p=>p&&!excluded.has(p.id));
  const chosen={},used=new Set([off.RB?.id]);
  // Keep a starter in his usual alignment if he fits. Fill each open alignment
  // from eligible depth, without playing one person twice in the same eleven.
  for(const [i,role] of PACKAGE_ROLES.entries()){
    const p=base[role];if(p?.pos===positions[i]&&!used.has(p.id)){chosen[role]=p;used.add(p.id)}
  }
  for(const [i,role] of PACKAGE_ROLES.entries()){
    if(chosen[role])continue;
    const p=players.find(p=>p.pos===positions[i]&&!used.has(p.id));
    if(!p)return null;
    chosen[role]=p;used.add(p.id);
  }
  return chosen;
}
function groupingFor(b,side){
  const m=b.grouping?.[side]||'auto',g=b.game;
  const candidates=m!=='auto'?[m]:g.distance<=2?['21','12']:g.down>=3&&g.distance>=7?['10']:g.fieldPosition>=80?['12']:[];
  return candidates.find(id=>id==='11'||packageLineup(b,side,id))||'11';
}
function groupingOptions(b,side){
  const team=b.teams[side],base=team.packageStarters||team.lineup.off;
  return Object.entries(GROUPINGS).map(([id,name])=>{
    if(id==='auto')return{id,name,available:true,detail:`Current package: ${GROUPINGS[groupingFor(b,side)]}. Changes with down, distance and field position.`};
    const lineup=packageLineup(b,side,id);
    if(!lineup)return{id,name,available:false,detail:`Eligible depth cannot field ${name}.`};
    const swaps=PACKAGE_ROLES.filter(role=>lineup[role]?.id!==base[role]?.id)
      .map(role=>`${lineup[role].name} (${lineup[role].pos}) for ${base[role]?.name||role}`);
    const rule={10:'A fourth receiver spreads the coverage; Power and PA Boot need the inline end.',12:'The second tight end joins the run Gate and can release from the slot.',21:'The second back joins the run Gate; one fewer receiver runs routes.'}[id];
    return{id,name,available:true,detail:[swaps.join(' · '),rule].filter(Boolean).join('. ')||'Starting receivers and tight end.'};
  });
}
function dressPackage(b,side){
  const team=b.teams[side],off=team.lineup.off;
  team.packageStarters??=Object.fromEntries(PACKAGE_ROLES.map(role=>[role,off[role]]).filter(([,p])=>p));
  // V20 checkpoints may have saved the starting back on the bench.
  team.packageStarters.RB??=team.backfield?.[0]||team.restBench?.RB||off.RB;
  delete team.restBench;
  chooseBack(b,side);
  const mode=groupingFor(b,side),lineup=packageLineup(b,side,mode);
  for(const role of PACKAGE_ROLES){if(lineup[role])off[role]=lineup[role];else delete off[role]}
  return mode;
}
function setGrouping(b,side,mode){
  if(!Object.hasOwn(GROUPINGS,mode))throw new Error('Unknown personnel grouping.');
  if(b.pending?.kind!=='snap'||b.pending.side!==side||b.pending.role!=='off'||b.snap?.off)throw new Error('Change personnel before your offensive call.');
  if(mode!=='auto'&&!packageLineup(b,side,mode))throw new Error('No eligible players for that package.');
  (b.grouping??={home:'auto',away:'auto'})[side]=mode;
  b.snap.grouping=dressPackage(b,side);
  b.pending=snapRequest(b,side);return b.pending;
}
// Kickers and punters: their real ratings move the kick (grade = rating ÷ 10; 7 is average). Labeled in the log.
const gradeOf=(p,ks)=>p?ks.reduce((n,k)=>n+(Number(p.traits?.[k])||50),0)/ks.length/10:7;
function kickerEdge(b,side){
  const K=b.teams[side]?.specialists?.K,rush=Math.max(...['RUSH','SET'].map(r=>gradeOf(b.teams[other(side)]?.lineup?.def?.[r],['speed'])));
  const adj=Math.max(-.09,Math.min(.09,(gradeOf(K,['power','technique'])-7)*.03))-Math.max(-.03,Math.min(.03,(rush-7)*.01));
  return{adjust:Math.round(adj*100)/100,name:K?.name||null};
}
function punterEdge(b,side){const P=b.teams[side]?.specialists?.P;return{netAdjust:Math.round(Math.max(-6,Math.min(6,(gradeOf(P,['power'])-7)*2))),name:P?.name||null}}
// Special cards act on their own: an onside try late when trailing, a Swinging Gate two-point try when the chart says go.
const hasSpecial=(b,side,id)=>(b.decks[side]?.off?.tactics||[]).includes(id)&&!b.specialUsed?.[side]?.[id];
function armSpecials(b,side){
  const g=b.game,opp=other(side),behind=g.score[opp]-g.score[side];
  if(hasSpecial(b,side,'onside_kick')&&g.period===4&&g.clock<=360&&behind>=1&&behind<=16){
    const hands=['X','Z','SLOT','TE'].map(r=>gradeOf(b.teams[side].lineup.off[r],['technique','speed'])),theirs=['X','Z','SLOT','TE'].map(r=>gradeOf(b.teams[opp].lineup.off[r],['technique','speed']));
    const edge=(hands.reduce((a,x)=>a+x,0)-theirs.reduce((a,x)=>a+x,0))/hands.length;g.onside={kicker:side,chance:Math.max(.08,Math.min(.24,.14+edge*.03))};
  }
  if(hasSpecial(b,side,'swinging_gate')&&g.period>=3&&g.period<=4&&(Engine.TWO_POINT_CHART||[]).includes(g.score[side]+6-g.score[opp]))g.twoPointCall={side,boost:.12};
}
function settleSpecials(b,side,evStart){
  const g=b.game,used=(b.specialUsed??={})[side]??={},notes=[];
  for(const ev of g.events.slice(evStart)){
    if(ev.type==='kickoff'&&ev.onside){used.onside_kick=true;notes.push(`${b.teams[side].short} tries an onside kick: ${ev.recovered?'RECOVERED!':'they cover it'}`)}
    if(ev.type==='two_point'&&ev.gate){used.swinging_gate=true;notes.push(`Swinging Gate two-point try: ${ev.points?'GOOD':'no good'}`)}
  }
  g.onside=null;if(g.twoPointCall?.side===side)g.twoPointCall=null;
  return notes;
}

// ---------------------------------------------------------------- legal options
// The two-minute drill: the last two minutes of each half. Drill cards are free and join every offense's options.
function sidelineOptions(b){
  const req=b.pending;
  if(req?.kind!=='snap'||req.side!==b.user)return null;
  const hand=b.hands[req.side],late=drillOn(b);
  const lineup=b.teams[req.side].lineup.off,f=b.featured?.[req.side],half=halfOf(b.game);
  const featurable=req.role==='off'?FEATURE_ROLES.filter(r=>lineup[r]?.id!=null&&lineup[r].name).map(r=>({role:r,id:lineup[r].id,name:lineup[r].name})):[];
  return {canCoachDrive:b.mode==='key'&&b.game.period<=4&&!b.guidedDrive?.active,coachDrive:coachingDrive(b),offense:req.role==='off',late,intent:b.clockIntent||'normal',
    featurable,featured:f&&f.half===half?{id:f.id,name:b.personnel?.[f.id]?.name||null,touches:f.touches,left:Math.max(0,FEATURE_TOUCHES-f.touches)}:null,
    timeouts:timeoutsLeft(b,req.side),timeoutNext:!!b.snap.timeoutNext,
    tactics:req.role==='off'?[...new Set(hand.tactics)]:[],keep:hand.tactics.includes(hand.keepTactic)?hand.keepTactic:null,
    retained:hand.retained||null};
}
function setSideline(b,{keep=null,intent='normal',timeoutNext=false,feature=null,coachDrive}){
  const options=sidelineOptions(b);
  if(!options)throw new Error('Choose sideline instructions before a coached snap.');
  let pick=null;
  if(feature!==null){
    pick=options.featurable.find(p=>p.id===feature||p.role===feature);
    if(!pick)throw new Error('Feature a skill player on the field for your offense.');
    if(options.featured&&options.featured.id!==pick.id)throw new Error('You already featured a player this half.');
  }
  if(keep!==null&&!options.tactics.includes(keep))throw new Error('Choose a tactic still in your hand.');
  if(!['normal','preserve','drain'].includes(intent))throw new Error('Unknown clock policy.');
  if(intent!==options.intent&&(!options.late||!options.offense))throw new Error('Choose a tempo on offense in the final two minutes of a half.');
  if(timeoutNext&&(!options.late||!options.timeouts))throw new Error('No late-game timeout available.');
  if(coachDrive===true&&!options.canCoachDrive)throw new Error('Drive control is available in Key Moments.');
  if(coachDrive===true){b.coachedDrive=driveKey(b.game,b.game.possession);if(b.driveCoach)driveHistory(b,b.coachedDrive).source??='chosen'}
  if(coachDrive===false)delete b.coachedDrive;
  if(pick&&!options.featured)(b.featured??={home:null,away:null})[b.user]={id:pick.id,half:halfOf(b.game),touches:0};
  b.hands[b.user].keepTactic=keep;
  b.clockIntent=intent;
  b.snap.timeoutNext=!!timeoutNext;
}
function drillOn(b){const g=b.game;return(g.period===2||g.period===4)&&Number(g.clock)<=120&&!g.ot}
// The quick face stays callable until the coach spends the double-move card.
function showsQuickOut(b,side){
  const isDoubleMove=id=>id==='out_and_up'||D.PLAYS[id]?.evolvedFrom==='out_and_up';
  return b.hands[side].wrinkles.some(isDoubleMove)||b.decks[side].off.base.some(isDoubleMove);
}
function sneakAvailable(b){return b.game.distance>=1&&b.game.distance<=D.PLAYS.qb_sneak.maxDistance}
// Wiped by a change of possession, including the same team taking consecutive overtime possessions.
function driveKey(g,side){return `${possessionKey(g)}:${side}`}
function popPassReady(b,side){return b.drive?.key===driveKey(b.game,side)&&b.drive.plays?.at(-1)===D.PLAYS.te_pop_pass.setupPlay}
function freeCard(b,side,role,id){
  if(b.decks[side][role].base.includes(id))return true;
  return role==='off'&&((id==='qb_sneak'&&sneakAvailable(b))||(id==='te_pop_pass'&&popPassReady(b,side))||(id==='quick_out'&&showsQuickOut(b,side))||((D.DRILL_CARDS||[]).includes(id)&&drillOn(b)));
}
function offOptions(b,side){
  const hand=b.hands[side],team=b.teams[side],lineup=team.lineup.off;
  const bases=[...b.decks[side].off.base];
  if(sneakAvailable(b)&&!bases.includes('qb_sneak'))bases.push('qb_sneak');
  if(popPassReady(b,side)&&!bases.includes('te_pop_pass'))bases.push('te_pop_pass');
  if(showsQuickOut(b,side)&&!bases.includes('quick_out'))bases.push('quick_out');
  const plays=[...bases.map(id=>({id,base:true})),...(drillOn(b)?(D.DRILL_CARDS||[]).map(id=>({id,base:true,drill:true})):[]),...hand.wrinkles.map((id,i)=>({id,base:false,slot:i}))]
    .map(o=>({...o,card:D.PLAYS[o.id],cost:costOf(b,side,D.PLAYS[o.id]),blocked:R.playBlocked(D.PLAYS[o.id],lineup,situation(b))}));
  const tactics=hand.tactics.map((id,i)=>({id,slot:i,card:D.TACTICS[id],cost:costOf(b,side,D.TACTICS[id])})).filter(t=>!b.snap?.offInfo?.includes(t.id)&&(!TIMEOUT_CARDS.includes(t.id)||timeoutsLeft(b,side)>0));
  return{plays,tactics,command:hand.command,...(canRedraw(b,side)?{redraw:{cost:redrawCost(b,side),count:hand.wrinkles.length}}:{}),...(hand.openingScript?{openingScript:hand.openingScript}:{}),...(hand.openingScriptMiss?{openingScriptMiss:hand.openingScriptMiss}:{})};
}
function preparedBracket(b,side){
  const off=b.teams[other(side)].lineup.off,eligible=R.bracketOptions(off);
  for(const id of [side===b.user&&b.halftimeBracketId,b.teams[side].rivalryBracketId]){
    if(id){const choice=eligible.find(o=>String(off[o.role].id)===String(id));if(choice)return choice}
  }
  return null;
}
function defOptions(b,side){
  const hand=b.hands[side];
  const plays=[...b.decks[side].def.base.map(id=>({id,base:true})),...hand.wrinkles.map((id,i)=>({id,base:false,slot:i}))]
    .map(o=>({...o,card:D.CALLS[o.id],cost:costOf(b,side,D.CALLS[o.id]),blocked:R.signatureBlocked(D.CALLS[o.id],b.teams[side].lineup.def)}));
  const tactics=hand.tactics.map((id,i)=>({id,slot:i,card:D.TACTICS[id],cost:costOf(b,side,D.TACTICS[id])})).filter(t=>!b.snap?.defInfo?.includes(t.id)&&(!TIMEOUT_CARDS.includes(t.id)||timeoutsLeft(b,side)>0));
  const bracketPlan=preparedBracket(b,side);
  return{plays,tactics,command:hand.command,...(canRedraw(b,side)?{redraw:{cost:redrawCost(b,side),count:hand.wrinkles.length}}:{}),...(bracketPlan?{bracketPlan}:{})};
}
function subsets(arr,max){const out=[[]];for(const x of arr){const n=out.length;for(let i=0;i<n;i++)if(out[i].length<max)out.push([...out[i],x])}return out}
function uniqTactics(list){const seen=new Set();return list.filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true})}

// ---------------------------------------------------------------- AI
function opponentPlanRead(b,req=b?.pending){
  if(req?.kind!=='snap'||req.role!=='off'||req.side!==b?.user)return null;
  const state=b.opponentDefense,plan=Object.hasOwn(DEFENSIVE_PLANS,state?.id)?DEFENSIVE_PLANS[state.id]:null;
  const memory=rivalryFilmPlay(b,other(req.side));
  if(!plan&&!memory)return null;
  const adjusted=state?.counters===2;
  const lines=[];
  if(plan)lines.push(adjusted?plan.counter:plan.opening);
  if(memory)lines.push(`Rivalry film: They prepared for ${memory.name} after it worked in the last meeting.`);
  return{adjusted,text:lines.join(' ')};
}
function rivalryFilmPlay(b,side){
  const memory=b.rivalryPlan;
  return b.rivalry&&memory?.side===other(side)&&Object.hasOwn(D.PLAYS,memory.play)?D.PLAYS[memory.play]:null;
}
function defensePlanBonus(b,side,call,sit){
  const plan=b.opponentDefense;
  if(!plan||b.user!==other(side))return 0;
  const adjusted=plan.counters===2;
  const preferred=plan.id==='pressure'?(adjusted?call.pressure===0&&call.coverage==='zone':call.pressure>0):
    plan.id==='two_high'&&(adjusted?call.box==='loaded':call.shell===2);
  // Keep the call's assessed matchup and the scoreboard more important than the coach's preference.
  return preferred?(sit.down>=3||protectLead(sit,side)?1.4:2.4):0;
}
function chartDefenseCounter(b,result,play,call){
  const plan=b.opponentDefense;
  if(!plan||plan.counters>=2||result.offSide!==b.user||result.penalty||result.turnover||result.category==='kick')return;
  const productive=result.yards>0&&(result.yards>=5||result.yards>=result.sit.distance);
  if(!productive)return;
  const root=play.evolvedFrom||play.upgradeOf||play.id;
  const counter=plan.id==='pressure'?root==='screen'&&call.pressure>0:
    plan.id==='two_high'&&play.family==='run'&&call.shell===2;
  if(counter)plan.counters++;
}
function utility(ev,sit){
  if(sit.down>=3)return 22*ev.first+.25*ev.yards-30*ev.turnover;
  return ev.yards+5*ev.first-30*ev.turnover;
}
function softPick(rng,items,temp){
  const m=Math.max(...items.map(i=>i.u)),ws=items.map(i=>Math.exp((i.u-m)/temp)),s=ws.reduce((a,v)=>a+v,0);
  let r=rng.next()*s;for(let i=0;i<items.length;i++){r-=ws[i];if(r<=0)return items[i]}return items[items.length-1];
}
// Reserve Command for 3rd down on early downs.
function budget(b,side,scripted){const g=b.game,c=b.hands[side].command;return g.down>=3||scripted==='all'?c:Math.max(0,c-2)}

function autoRead(sit,twoDown=false){return !twoDown&&sit.down>=3&&sit.distance>=8?'primary':'auto'}
function activeTactics(b,role,tactics){return [...new Set([...(b.snap?.[role+'Info']||[]),...tactics])]}
// Four scores up in the third, three scores up in the fourth, two scores up inside six minutes, or any lead inside two.
function protectLead(sit,side){
  const lead=sit.score[side]-sit.score[other(side)];
  return(sit.period===3&&lead>=28)||sit.period===4&&(lead>=17||(sit.clock<=360&&lead>=9)||(sit.clock<=120&&lead>0));
}
// The trailing coordinator mirrors protectLead: behind by three scores in the second half, two scores inside six
// minutes, or any deficit inside two. Regulation only.
function chasing(b,side){
  const g=b.game,deficit=g.score[other(side)]-g.score[side];
  return g.period>=3&&g.period<=4&&(deficit>=17||(g.period===4&&g.clock<=360&&deficit>=9)||(g.period===4&&g.clock<=120&&deficit>0));
}
// Rest starters once a second-half lead reaches 24 (Q3) or 21 (Q4); bring them back if it falls to 16.
// Backups play at their own ratings and appear in the box score. The person's side follows the headset setting.
function applyRestLineup(b,side,rest){
  const team=b.teams?.[side];if(!team?.bench)return;
  b._starterLineup??={};
  if(rest){
    if(!b._starterLineup[side]){
      b._starterLineup[side]={off:{...team.lineup.off},def:{...team.lineup.def}};
    }
    for(const unit of ['off','def']){
      for(const [role,bp] of Object.entries(team.bench[unit]||{})){
        if(!bp||role==='K'||role==='P')continue;
        team.lineup[unit][role]=bp;
        b.personnel??={};
        if(!b.personnel[bp.id])b.personnel[bp.id]={id:bp.id,name:bp.name,pos:bp.pos,number:bp.number,side,archetype:bp.archetype,portraitSeed:bp.portraitSeed,height:bp.height,weight:bp.weight};
      }
    }
  }else if(b._starterLineup[side]){
    team.lineup.off={...b._starterLineup[side].off};
    team.lineup.def={...b._starterLineup[side].def};
    delete b._starterLineup[side];
  }
}
function updateRest(b,side){
  const g=b.game,lead=g.score[side]-g.score[other(side)];
  b.resting??={home:false,away:false};
  const allowed=(b.user||b.headsetSide)!==side||b.headset?.restStarters!==false;
  const was=!!b.resting[side];
  if(!was&&allowed&&((g.period===3&&lead>=24)||(g.period===4&&lead>=21)))b.resting[side]=true;
  else if(was&&(lead<=16||!allowed))b.resting[side]=false;
  if(was!==b.resting[side]){
    applyRestLineup(b,side,b.resting[side]);
    b.log.push({type:'rest',side,resting:b.resting[side],sit:situation(b),text:b.resting[side]?`${b.teams[side].short} rests its starters, up ${lead}.`:`${b.teams[side].short} sends its starters back in.`});
  }
}
function aiOffense(b,side,look,opts={}){
  const o=offOptions(b,side),team=b.teams[side],sit=situation(b),def=b.teams[other(side)].lineup.def;
  const call=presumedCall(look),cap=opts.cap??budget(b,side),closing=protectLead(sit,side);
  if(closing)b.snap.closeout=true; // Mark the coordinator's call, not a manual or scripted selection.
  const tacs=uniqTactics(o.tactics.filter(t=>!(closing&&t.id==='hurry_up')&&!t.card.info&&!R.signatureBlocked(t.card,team.lineup[b.hands[side].role])));
  // Coordinators keep to their scheme's run/pass mix: the further off it, the stronger the pull back.
  const bx=b.box[side],calls=bx.rushAtt+bx.passAtt+bx.sacks,runShare=calls?bx.rushAtt/calls:1-(team.coach.passRate??.5);
  const balance=sit.down>=3&&sit.distance>4?0:6*((1-(team.coach.passRate??.5))-runShare)+1.1;
  const lines=[];
  const bias=b.aiBias?.[side],shaped=bias&&o.plays.filter(p=>!p.blocked&&p.cost<=cap&&Object.entries(bias).every(([k,v])=>p.card[k]===v));
  for(const p of shaped?.length?shaped:o.plays){
    if(p.blocked||p.cost>cap)continue;
    for(const ts of subsets(tacs,2)){
      const cost=p.cost+ts.reduce((s,t)=>s+t.cost,0);if(cost>cap)continue;
      if(ts.some(t=>R.tacticBlocked(t.card,p.card,team.lineup.off)))continue;
      const snap=R.buildSnap({weather:b.weather,...edgesFor(b,side),off:team.lineup.off,def,play:p.card,...knownEffects(b,p.card,call),call,offTactics:activeTactics(b,'off',ts.map(t=>t.id)),read:autoRead(sit,b.snap?.twoDown),situation:sit,lean:look.lean.confirmed?look.lean.value:null,heat:look.heat,motionConfirmed:!!b.snap?.motionConfirmed});
      const ev=R.evaluate(snap,sit);
      const isRun=!p.card.pass;
      // A safe carry is worth clock as well as yards. Don't trade a realistic conversion for a long-yardage handoff.
      const clockValue=closing?((p.card.family==='run'&&(sit.down<3||sit.distance<=3)?4:0)-(p.card.clockStop?4:0)-20*ev.turnover):0;
      // A gain leaving fourth-and-one or two retains value when the coach intends to go.
      const shortFourth=b.snap?.twoDown&&sit.distance>2?R.evaluate(snap,{...sit,distance:sit.distance-2}).first-ev.first:0;
      lines.push({play:p.id,tactics:ts.map(t=>t.id),u:utility(ev,sit)+14*shortFourth+clockValue-cost*(sit.down>=3?.2:.55)-(p.base?0:.15)+(isRun?balance:-balance)});
    }
  }
  if(!lines.length)return{play:b.decks[side].off.base[0],tactics:[]};
  const pick=withRng(b,rng=>softPick(rng,lines,sit.down>=3?.8:1.2));
  return{play:pick.play,tactics:pick.tactics};
}
function aiDefense(b,side,opts={}){
  const o=defOptions(b,side),team=b.teams[side],offTeam=b.teams[other(side)],sit=situation(b),cap=opts.cap??budget(b,side);
  const weights=offFamilyWeights(b.game,b.tend[offSide(b)],opts.revealedFamily),lean=leanFor(b),heat=heatFor(b);
  const threat=revealedThreat(b,other(side));
  const remembered=rivalryFilmPlay(b,side);
  const studied=remembered&&(!opts.revealedFamily||remembered.family===opts.revealedFamily)&&!R.playBlocked(remembered,offTeam.lineup.off,sit)?remembered:null;
  const tacs=uniqTactics(o.tactics.filter(t=>!t.card.info&&!R.signatureBlocked(t.card,team.lineup[b.hands[side].role])));
  // A drive challenge's alternate look restricts the coordinator to calls with the documented shape, when it has one.
  const bias=b.aiBias?.[side],shaped=bias&&o.plays.filter(p=>!p.blocked&&p.cost<=cap&&Object.entries(bias).every(([k,v])=>p.card[k]===v));
  const lines=[];
  for(const p of shaped?.length?shaped:o.plays){
    if(p.blocked||p.cost>cap)continue;
    const preference=defensePlanBonus(b,side,p.card,sit);
    for(const ts of subsets(tacs,2)){
      const cost=p.cost+ts.reduce((s,t)=>s+t.cost,0);if(cost>cap)continue;
      const context={weather:b.weather,...edgesFor(b,other(side)),off:offTeam.lineup.off,def:team.lineup.def,call:p.card,bracketRole:o.bracketPlan?.role,
        defTactics:activeTactics(b,'def',ts.map(t=>t.id)),offTactics:b.snap?.offLook?.protection?.confirmed&&b.snap.offLook.protection.value?['max_protect']:[],read:autoRead(sit),situation:sit,lean,heat};
      const project=play=>utility(R.evaluate(R.buildSnap({...context,play,...knownEffects(b,play,p.card)}),sit),sit);
      let u=0,rematchValue=null;
      for(const f of OFF_FAMILIES){
        if(weights[f]<.02)continue;const reps=REP_PLAYS[f].filter(id=>!R.playBlocked(D.PLAYS[id],offTeam.lineup.off));let best=-99;
        for(const id of reps){
          const value=project(D.PLAYS[id]);
          if(id===studied?.id)rematchValue=value;
          best=Math.max(best,value);
        }
        u+=weights[f]*(best===-99?0:best);
      }
      // A bounded preference (in expected-yard utility), scaled by how often the strength appeared.
      const relevant=threat&&(!opts.revealedFamily||opts.revealedFamily===threat.family);
      const counters=relevant&&p.card.counters?.includes(threat.family);
      const doubles=relevant&&ts.some(t=>t.id==='bracket')&&
        offTeam.lineup.off[o.bracketPlan?.role||R.bracketRole(offTeam.lineup.off)]?.id===threat.playerId;
      const film=(counters||doubles)?Math.min(1.25,threatWeight(threat)*.28):0;
      // Tilt the same legal call evaluation toward the actual card from the prior meeting, even if it wasn't a base representative.
      const rivalry=studied?Math.max(-2,Math.min(2,(u-(rematchValue??project(studied)))*.3)):0;
      lines.push({play:p.id,tactics:ts.map(t=>t.id),u:-u+film+preference+rivalry-cost*(sit.down>=3?.2:.55)-(p.base?0:.15)});
    }
  }
  const pick=withRng(b,rng=>softPick(rng,lines,sit.down>=3?.8:1.2));
  return{play:pick.play,tactics:pick.tactics};
}
// Coordinators use information cards in simple, honest ways.
function aiInfoOffense(b,side,look){
  const o=offOptions(b,side),cap=budget(b,side);let spent=0;const used=[];
  const t=id=>o.tactics.find(x=>x.id===id);
  const c=b.teams[side].lineup.off.C,risky=D.SIGNATURES[c?.archetype]?.flag!=='noFalseStart'&&R.traitGrade(c,'composure')<=5;
  if(look.pressure.value&&!risky&&t('hard_count')&&t('hard_count').cost<=cap){used.push('hard_count');spent+=t('hard_count').cost}
  if(!look.coverage.confirmed&&t('motion')&&spent+t('motion').cost<=cap&&b.game.down>=2&&b.game.distance>=4)used.push('motion');
  return used;
}
function aiInfoDefense(b,side){
  const o=defOptions(b,side),cap=budget(b,side),t=o.tactics.find(x=>x.id==='film_tell');
  return b.game.down>=3&&t&&t.cost<=cap?['film_tell']:[];
}

// ---------------------------------------------------------------- committing
function payAndRemove(b,side,kind,id){
  const hand=b.hands[side],card=kind==='tactic'?D.TACTICS[id]:(hand.role==='off'?D.PLAYS[id]:D.CALLS[id]);
  const cost=costOf(b,side,card);if(cost>hand.command)throw new Error(`Not enough Command for ${card.name} (${cost} > ${hand.command}).`);
  if(kind==='tactic'){const i=hand.tactics.indexOf(id);if(i<0)throw new Error(`${card.name} is not in hand.`);hand.tactics.splice(i,1);b.piles[side][hand.role].tactic.discard.push(id)}
  else{
    const base=freeCard(b,side,hand.role,id);
    if(!base){const i=hand.wrinkles.indexOf(id);if(i<0)throw new Error(`${card.name} is not on your call sheet.`);hand.wrinkles.splice(i,1);if(hand.openingScript===id)delete hand.openingScript;
      // Trick plays are exhausted: once per game.
      if(card.trick)(b.exhausted[side]??=[]).push(id);else b.piles[side][hand.role].wrinkle.discard.push(id)}
  }
  markCostUse(b,side,card);hand.command-=cost;
  if(kind==='tactic'||(!['quick_out','qb_sneak','te_pop_pass'].includes(id)&&!b.decks[side][hand.role].base.includes(id)))b.box[side].cardsPlayed++;
}
// Line check / redraw: cycle current wrinkle plays or defensive calls once per series.
function redrawCost(b,side){
  const hand=b.hands?.[side],lu=b.teams?.[side]?.lineup;
  if(!hand||!lu)return 1;
  if(hand.role==='off'&&['Field Architect','Rhythm Distributor'].includes(lu.off?.QB?.archetype))return 0;
  if(hand.role==='def'&&lu.def?.MIKE?.archetype==='Traffic Director')return 0;
  return 1;
}
function canRedraw(b,side){
  const hand=b.hands?.[side],p=hand&&b.piles?.[side]?.[hand.role];
  if(!hand||!p||hand.checkedLine||!hand.wrinkles.length)return false;
  if(hand.role==='off'?b.snap?.off:b.snap?.def)return false;
  if(hand.command<redrawCost(b,side))return false;
  return (p.wrinkle.draw.length+p.wrinkle.discard.length)>0;
}
function applyRedraw(b,side){
  if(!canRedraw(b,side))throw new Error('Cannot check plays at the line right now.');
  const hand=b.hands[side],p=b.piles[side][hand.role],cost=redrawCost(b,side);
  hand.command-=cost;hand.checkedLine=true;
  const old=hand.wrinkles.splice(0);
  if(hand.openingScript&&old.includes(hand.openingScript))delete hand.openingScript;
  const fresh=drawFrom(b,p.wrinkle,old.length);
  p.wrinkle.discard.push(...old);
  if(fresh.length<old.length)fresh.push(...drawFrom(b,p.wrinkle,old.length-fresh.length));
  hand.wrinkles=fresh;
  b.telemetry.decisions.redraw=(b.telemetry.decisions.redraw||0)+1;
}
// Info tactics resolve at once and change what the side knows this snap.
function applyInfo(b,side,id){
  const s=b.snap,hand=b.hands[side];
  const card=D.TACTICS[id],role=hand.role;
  const call=s?.def&&D.CALLS[s.def.play],offPlay=s?.off&&D.PLAYS[s.off.play];
  if(!card?.info||card.side!==role)throw new Error('Choose an information card for your side.');
  if((role==='off'&&(!call||!s.look))||(role==='def'&&(!offPlay||!s.offLook)))throw new Error('The opponent must commit first.');
  if((role==='off'?s.offInfo:s.defInfo).includes(id))throw new Error('That information card is already active.');
  const blocked=R.signatureBlocked(card,b.teams[side].lineup[role]);if(blocked)throw new Error(blocked);
  payAndRemove(b,side,'tactic',id);
  if(role==='off'){
    s.offInfo.push(id);
    if(id==='motion'){s.look.coverage={value:call.coverage,confirmed:true};s.motionConfirmed=true}
    if(id==='hard_count'){
      s.look.pressure={value:call.pressure>0,confirmed:true,realLevel:call.pressure};
      const c=b.teams[side].lineup.off.C,safe=D.SIGNATURES[c?.archetype]?.flag==='noFalseStart';
      if(!safe&&R.traitGrade(c,'composure')<=5&&withRng(b,rng=>rng.next())<.15)s.falseStart=true;
    }
    const reveal=D.TACTICS[id].reveal||[];
    if(reveal.includes('shell'))s.look.shell={value:call.shell,confirmed:true};
    if(reveal.includes('pressure'))s.look.pressure={value:call.pressure>0,confirmed:true,realLevel:call.pressure};
    if(reveal.includes('coverage')){s.look.coverage={value:call.coverage,confirmed:true};s.motionConfirmed=true}
    if(id==='check_with_me'){
      s.look.shell={value:call.shell,confirmed:true};s.look.pressure={value:call.pressure>0,confirmed:true,realLevel:call.pressure};
      s.look.coverage={value:call.coverage,confirmed:true};s.motionConfirmed=s.motionConfirmed||false;
    }
  }else{
    s.defInfo.push(id);
    const play=s.off?D.PLAYS[s.off.play]:null;
    if(id==='film_tell'&&play)s.offLook.family={value:play.family,confirmed:true};
    if(id==='identify_protection'&&s.off)s.offLook.protection={value:s.off.tactics.includes('max_protect'),confirmed:true};
  }
}
function commit(b,side,choice){
  const hand=b.hands[side],role=hand.role;
  const printed=(role==='off'?D.PLAYS:D.CALLS)[choice.play];
  if(!printed)throw new Error(`Unknown play ${choice.play}.`);
  if(choice.target&&role!=='off')throw new Error('Only the offense selects a primary target.');
  const card=role==='off'?R.targetedPlay(printed,choice.target,b.teams[side].lineup.off):printed;
  const sig=R.signatureBlocked(card,b.teams[side].lineup[role]);if(sig)throw new Error(sig);
  if(role==='off'){const why=R.playBlocked(card,b.teams[side].lineup.off,situation(b));if(why)throw new Error(why)}
  const tactics=[...new Set(choice.tactics||[])];
  if(choice.edgeAssignment!=null&&(role!=='def'||!['crash','contain'].includes(choice.edgeAssignment)))throw new Error('Choose a defensive edge assignment: crash or contain.');
  if(role==='def'&&!choice.bracketRole&&tactics.includes('bracket'))choice={...choice,bracketRole:preparedBracket(b,side)?.role};
  if(choice.bracketRole){
    if(role!=='def'||!tactics.includes('bracket'))throw new Error('Select Bracket to assign a defender.');
    R.validateBracketRole(choice.bracketRole,b.teams[other(side)].lineup.off);
  }
  for(const id of tactics){
    const t=D.TACTICS[id];if(!t||t.side!==role)throw new Error(`Unknown tactic ${id}.`);
    const sig=R.signatureBlocked(t,b.teams[side].lineup[role]);if(sig)throw new Error(sig);
    if(t.info)throw new Error(`${t.name} is an information card; play it before the call.`);
    if(role==='off'){const why=R.tacticBlocked(t,card,b.teams[side].lineup.off);if(why)throw new Error(`${t.name}: ${why}`)}
  }
  const total=costOf(b,side,card)+tactics.reduce((s,id)=>s+costOf(b,side,D.TACTICS[id]),0);
  if(total>hand.command)throw new Error(`That costs ${total} Command; you have ${hand.command}.`);
  if(!freeCard(b,side,role,choice.play)&&!hand.wrinkles.includes(choice.play))throw new Error('That play is not in hand.');
  if(tactics.some(id=>!hand.tactics.includes(id)))throw new Error('That tactic is not in hand.');
  const outs=tactics.filter(id=>TIMEOUT_CARDS.includes(id));if(outs.length>timeoutsLeft(b,side))throw new Error('No timeouts left.');
  // Only the defensive commitment can be cancelled by an offensive false start.
  // All affected piles are append-only until the snap, so their previous lengths
  // plus the small hand snapshot restore identity, order, actual costs and discounts.
  const restore=role==='def'&&!b.snap.off?{
    hand:clone(hand),discardPlays:b.piles[side].def.wrinkle.discard.length,
    discardTactics:b.piles[side].def.tactic.discard.length,exhausted:b.exhausted[side].length,
    cardsPlayed:b.box[side].cardsPlayed,timeouts:b.game.timeouts?.[side]
  }:null;
  payAndRemove(b,side,'play',choice.play);for(const id of tactics)payAndRemove(b,side,'tactic',id);
  if(outs.length&&b.game.timeouts)b.game.timeouts[side]=Math.max(0,b.game.timeouts[side]-outs.length);
  return{play:choice.play,tactics,...(choice.edgeAssignment?{edgeAssignment:choice.edgeAssignment}:{}),...(restore?{restore}:{}),...(choice.target?{target:choice.target}:{}),...(choice.bracketRole?{bracketRole:choice.bracketRole}:{}),...(role==='off'&&choice.read==='primary'?{read:'primary'}:{})};
}

// ---------------------------------------------------------------- the loop
function startSnap(b){
  const off=offSide(b),def=defSide(b);
  const grouping=dressPackage(b,off);
  b.snap={grouping,off:null,def:null,offInfo:[],defInfo:[],look:null,offLook:{family:{value:null,confirmed:false},protection:{value:null,confirmed:false}},motionConfirmed:false,falseStart:false};
  // Whoever is not the person commits first; with no person, the defense commits first.
  if(isUser(b,def)){b.snap.off=decideAI(b,off,'off')}
  else{b.snap.def=decideAI(b,def,'def')}
  if(b.snap.def)b.snap.look=lookFor(b,b.snap.def);
}
function decideAI(b,side,role){
  if(role==='def'){
    if(b.snap.off&&!b.snap.offLook.family.confirmed){
      for(const id of aiInfoDefense(b,side))applyInfo(b,side,id);
    }
    const family=b.snap.offLook.family;
    return commit(b,side,aiDefense(b,side,{revealedFamily:family.confirmed?family.value:null}));
  }
  // An offense that commits before the defense has lined up (the person is on defense) sees only a blind look.
  if(!b.snap.def)return commit(b,side,aiOffense(b,side,blindLook(b)));
  const look=b.snap.look||lookFor(b,b.snap.def);b.snap.look=look;
  for(const id of aiInfoOffense(b,side,look))if(!b.snap.offInfo.includes(id))applyInfo(b,side,id);
  return commit(b,side,aiOffense(b,side,b.snap.look));
}
// Mode rules: does the person decide this snap live?
function liveFor(b,side){
  if(!isUser(b,side))return false;
  if(b.mode==='snap'||coachingDrive(b))return true;if(b.mode==='sim')return false;
  return keyMoment(b);
}
function needsPlan(b,side){return isUser(b,side)&&b.mode==='series'&&!b.plan&&!keyMoment(b)}

// Keep one start-of-possession checkpoint. The archive only retains it for a one-score finish.
// Scoring events preserve the engine's score ledger. Previous snap history is for presentation.
function possessionKey(g){
  return g.ot?`OT:${g.ot.period}:${g.ot.possessions}`:g.drive;
}
function rememberDrive(b){
  const g=b.game;
  if(!b.classicSide||g.period<3||b.classicDrive?.drive===possessionKey(g)||b.snap)return;
  const checkpoint={...b,classicDrive:undefined,classicSide:undefined,guidedDrive:undefined,coachedSnap:undefined,
    log:b.log.slice(-4),game:{...g,events:g.events.filter(e=>e.points).map((e,i)=>({...e,seq:i+1}))}};
  b.classicDrive={drive:possessionKey(g),side:b.classicSide,battle:JSON.stringify(checkpoint)};
}
function archivedDrive(b,playbooks=[]){
  const g=b.game;
  if(!b.classicDrive||g.status!=='final'||g.ot?.period>=3||Math.abs(g.score.home-g.score.away)>8)return null;
  const signatures=playbooks.flatMap(pb=>[...(pb?.signatures||[]),...(pb?.reserveSignatures||[])]);
  return {...b.classicDrive,signatures:clone(signatures)};
}
function replayDrive(record){
  const b=load(record.battle);
  b.user=record.side;b.mode='snap';b.control='both';b.plan=null;b.replayDrive=possessionKey(b.game);
  return b;
}

// Short, repeatable single-possession scenarios. The starting points are recorded as a
// scoreboard snapshot, so the engine can audit subsequent scores without invented plays.
const DRIVE_CHALLENGES=[
  {id:'need_six',name:'Need Six',role:'off',situation:'Down 4 · 1:12 · Opp 38 · 1 timeout',objective:'Score a touchdown on this drive.',
    home:'aerial',away:'ground',score:[20,24],clock:72,field:62,down:1,distance:10,timeouts:[1,2],seed:'need-six-9',
    alternate:{id:'prevent_umbrella',name:'Face another look',change:'Their coordinator stays in a two-high zone shell to keep everything in front of the sticks.',defense:{shell:2,coverage:'zone'}}},
  {id:'goal_line_stand',name:'Goal-Line Stand',role:'def',situation:'Up 4 · 1:32 · 1st and goal at your 4',objective:'Keep the opponent out of the end zone on this drive.',
    home:'ground',away:'tempo',score:[24,20],clock:92,field:96,down:1,distance:4,timeouts:[2,2],seed:'goal-line-11',
    alternate:{id:'spread_pylon',name:'Face another look',change:'Their coordinator spreads the goal line and throws for the end zone on every down.',offense:{pass:true}}},
  {id:'four_minute_offense',name:'Four-Minute Offense',role:'off',situation:'Up 2 · 1:48 · 3rd and 3 · Defense has 2 timeouts',objective:'Run out the clock, reach kneel-down range, or take a two-score lead.',
    home:'ground',away:'aerial',score:[23,21],clock:108,field:42,down:3,distance:3,timeouts:[2,2],seed:'four-minute-1',
    // Same clock, down, distance, field position, rosters and seed. Only the opposing coordinator's behavior changes.
    alternate:{id:'stacked_box',name:'Face another look',change:'Their coordinator keeps a loaded box on every snap. Expect run fits and run blitzes, not two deep safeties.',defense:{box:'loaded'}}}
];
const THREE_DRIVE_CHALLENGE={id:'three_drive',name:'Three-Drive Challenge',playbooks:[
  {id:'power',name:'Power',description:'Call Power or Outside Zone from the base sheet. Run twice in a row to set up a PA Boot draw.',
    combo:{id:'establish',play:'pa_boot'},base:['inside_zone','outside_zone','quick_slant','power'],
    wrinkles:['pa_boot','pa_boot','deep_cross','deep_cross','vertical_shot','read_option','read_option','screen']},
  {id:'tempo',name:'Tempo',description:'Quick Out and Stick are both free base calls. Get a first down in two snaps to draw an extra play once per drive. Fewer deep throws in the deck.',
    combo:{id:'sell_the_slant',play:'deep_cross'},base:['inside_zone','quick_slant','quick_out','stick'],
    wrinkles:['screen','screen','rpo_bubble','rpo_bubble','deep_cross','out_and_up','qb_draw','qb_draw']}
],routes:[
  [{id:'opener',challenge:'need_six',name:'Need Six',brief:'Down 4 with 1:12 left at the opposing 38.',plan:'pressure',loans:[]}],
  [{id:'protect_lead',challenge:'four_minute_offense',name:'Clock Protection',brief:'Up 2, second-and-four with 1:20 left. They have one timeout.',
    plan:'two_high',start:{clock:80,down:2,distance:4,timeouts:[2,1]},loans:['max_protect','seal_block']},
   {id:'goal_line',challenge:'goal_line_stand',name:'Goal-Line Stand',brief:'Up 4, first-and-goal from your 4. One touchdown beats you.',
    start:{seed:'goal-line-draft-6'},reward:'Clear the stand to unlock a third tactic choice for your last drive.',loans:['stunt','lock']}],
  [{id:'close_it_out',challenge:'four_minute_offense',name:'Four-Minute Offense',brief:'Up 2, third-and-three with 1:48 left. They have two timeouts.',
    plan:'two_high',loans:['hurry_up','route_adjust'],bonusLoan:'giant_killer'},
   {id:'last_stop',challenge:'goal_line_stand',name:'Last Stand',brief:'Up 4, third-and-goal from your 6. Keep them out of the end zone.',
    start:{clock:49,field:94,down:3,distance:6,timeouts:[2,1]},loans:['disguise','bracket'],bonusLoan:'spy'}]
],stages:[
  {id:'need_six',plan:'pressure',combo:{id:'establish',play:'pa_boot'}},
  {id:'goal_line_stand',loans:['stunt','lock']},
  {id:'four_minute_offense',plan:'two_high',loans:['hurry_up','max_protect']}
]};
function createChallenge(id,opts={}){
  const base=DRIVE_CHALLENGES.find(c=>c.id===id);
  if(!base)throw new Error('Unknown drive challenge.');
  const run=THREE_DRIVE_CHALLENGE;
  const route=opts.route&&Number.isInteger(opts.runStage)&&run.routes[opts.runStage]?.find(r=>r.id===opts.route);
  const stage=opts.route?null:run.stages[opts.runStage];
  if((opts.runStage!=null||opts.route)&&((route?.challenge||stage?.id)!==id||opts.look||opts.alternate))throw new Error('That drive is not part of this run.');
  if(opts.loan&&!stage?.loans?.includes(opts.loan))throw new Error('That card is not offered for this drive.');
  const playbook=route&&run.playbooks.find(p=>p.id===opts.playbook);
  const loans=route?opts.loans??[]:opts.loan?[opts.loan]:[];
  if(route){
    const offered=run.routes.slice(1,opts.runStage+1).flat().flatMap(r=>[...r.loans,...(r.bonusLoan?[r.bonusLoan]:[])]);
    if(!playbook||!Array.isArray(loans)||loans.length!==opts.runStage||new Set(loans).size!==loans.length||loans.some(id=>!offered.includes(id)))
      throw new Error('Choose a playbook and one offered tactic per completed drive.');
    if(loans.length&&![...route.loans,route.bonusLoan].includes(loans.at(-1)))throw new Error('That tactic is not offered for this matchup.');
  }
  const c={...base,...route?.start};
  const lookId=opts.look||(opts.alternate?c.alternate?.id:null);
  if(lookId&&lookId!==c.alternate?.id)throw new Error('That challenge has no such alternate look.');
  const homeTeam=Ro.preset(route?'aerial':c.home);
  const combo=playbook?.combo||stage?.combo;
  if(stage||route){
    homeTeam.decks=clone(D.DEFAULT_DECKS);
    if(playbook){
      homeTeam.decks.off.base=[...playbook.base];
      homeTeam.decks.off.wrinkles=[...playbook.wrinkles];
    }
    if(combo)homeTeam.decks.off.comboPlan={...combo};
    for(const role of ['off','def']){
      const borrowed=loans.filter(id=>D.TACTICS[id].side===role),deck=homeTeam.decks[role],capacity=deck.tactics.length;
      for(const id of borrowed){const index=deck.tactics.indexOf(id);if(index>=0)deck.tactics.splice(index,1)}
      deck.tactics=[...borrowed,...deck.tactics.slice(0,capacity-borrowed.length)];
    }
  }
  const seed='challenge:'+c.seed+(route&&opts.runStage>0?':'+route.id:'');
  const b=create({seed,home:homeTeam,away:Ro.preset(c.away),user:'home',mode:'snap',coachingWindows:true,
    defensivePlan:route?.plan??stage?.plan??opts.defensivePlan??false});
  if(route)b.challengeDraft={playbook:playbook.id,route:route.id,loans:[...loans]};
  // The showcase starts with the payoff still in the pile. A loan occupies a normal opening tactic slot.
  if(combo){
    b.grouping.home='11';
    const draw=b.piles.home.off.wrinkle.draw,payoff=combo.play;
    b.piles.home.off.wrinkle.draw=[...draw.filter(card=>card===payoff),...draw.filter(card=>card!==payoff)];
  }
  for(const id of loans){
    const draw=b.piles.home[D.TACTICS[id].side].tactic.draw,index=draw.indexOf(id);
    if(index>=0)draw.push(...draw.splice(index,1));
  }
  if(lookId){b.challengeLook=lookId;b.aiBias={[other(b.user)]:{...(c.alternate.defense||c.alternate.offense)}}}
  const g=b.game;Engine.startGame(g);
  const [home,away]=c.timeouts;
  const state={...g.events.at(-1).state,period:4,clock:c.clock,elapsed:4*Engine.QUARTER_SECONDS-c.clock,
    possession:c.role==='off'?'home':'away',fieldPosition:c.field,down:c.down,distance:c.distance,timeouts:{home,away},score:{home:0,away:0}};
  Object.assign(g,state);g.events=[];
  for(const [index,side] of ['home','away'].entries()){
    g.score[side]=c.score[index];
    g.events.push({seq:index+1,type:'challenge_opening_score',team:side,points:c.score[index],state:{...state,score:{...g.score},timeouts:{...state.timeouts}}});
  }
  b.period=4;b.challenge=id;b.replayDrive=possessionKey(g);
  advance(b);return b;
}
function challengeResult(b){
  if(!b?.challenge||!b.log.length)return null;
  const g=b.game,last=b.log.at(-1),end=g.status==='final'||possessionKey(g)!==b.replayDrive;
  let won=false,reason;
  switch(b.challenge){
    case 'need_six':
      if(g.events.some(e=>e.type==='touchdown'&&e.team==='home')){won=true;reason='Touchdown on the final drive.';}
      else if(end)reason=g.status==='final'?'Time expired before the touchdown.':'The drive ended without the touchdown.';
      break;
    case 'goal_line_stand':
      if(g.events.some(e=>e.type==='touchdown'&&e.team==='away'))reason='The opponent scored a touchdown.';
      else if(end){won=true;reason='The defense kept the opponent out of the end zone.';}
      break;
    case 'four_minute_offense': {
      const lead=g.score.home-g.score.away;
      if(lead>8){won=true;reason='The offense built a two-score lead.';}
      else if(g.status==='final'&&lead>0){won=true;reason='Time expired with the lead.';}
      else if(end)reason='The drive ended before the lead was secured.';
      // Even with a stopped clock, three kneels from first down supply three 40-second
      // windows. Each defensive timeout removes a window; allow field room for all knees.
      else if(g.possession==='home'&&g.down===1&&g.fieldPosition>3&&lead>0&&g.clock<=40*(3-g.timeouts.away)){
        won=true;reason='A first down left enough downs to kneel out the clock.';
      }
      break;
    }
  }
  return reason?{won,reason,recap:last.text}:null;
}

// ---------------------------------------------------------------- drive ownership (V29)
// create({openingDrive:true}): in Key Moments the person coaches their first offensive possession from its first
// snap, so the opening Command is theirs to spend. A coached possession runs to its real end (fourth down, score,
// turnover, half). Then the battle pauses with a 'drive_end' request: coach the next offensive possession, or hand
// routine downs back to the staff. Claiming a drive changes who calls the snaps, never the rules or the RNG streams.
function driveHistory(b,key){return (b.driveCoach.history??={})[key]??={}}
function claimDrive(b){
  const dc=b.driveCoach,g=b.game;
  if(!dc||b.pending||g.status!=='live'||g.period>4||!b.user||g.possession!==b.user)return;
  const key=driveKey(g,g.possession);
  if(b.coachedDrive===key||dc.history?.[key]?.source)return;
  const want=dc.opening==='pending'?'opening':dc.next?'next':null;
  if(!want)return;
  if(want==='opening')dc.opening=b.mode==='key'?'claimed':'not_needed';else dc.next=false;
  if(b.mode!=='key')return;
  b.coachedDrive=key;driveHistory(b,key).source=want;
}
function driveEndRequest(b,key){
  const summary=driveSummary(b,key);if(!summary)return null;
  return{kind:'drive_end',side:b.user,situation:situation(b),summary};
}
const keyOwner=key=>key.slice(key.lastIndexOf(':')+1);
const article=n=>/^(8|11|18)$|^8\d$/.test(String(n))?'An':'A';
// One possession from the log: plays, net yards, how it ended and one factual line. Reads the log; never mutates.
function driveSummary(b,key){
  const entries=(b?.log||[]).filter(e=>e.drive===key&&(e.type==='snap'||e.type==='kick'));
  const snaps=entries.filter(e=>e.type==='snap');
  if(!snaps.length)return null;
  const side=keyOwner(key),last=entries.at(-1),lastSnap=snaps.at(-1),start=snaps[0].sit.field;
  const td=snaps.find(e=>!e.turnover&&e.score&&e.sit?.score&&e.score[side]-e.sit.score[side]>=6);
  const safety=snaps.find(e=>e.score&&e.sit?.score&&e.score[other(side)]-e.sit.score[other(side)]===2);
  const spot=e=>e.after?.possession===side&&!e.turnover?e.after.field:Math.max(0,Math.min(100,e.sit.field+(e.turnover==='interception'?0:Number(e.yards)||0)));
  const end=td?100:last.type==='kick'?last.sit.field:spot(lastSnap);
  const third=[...snaps].reverse().find(e=>!e.penalty&&e.sit?.down===3);
  const thirdStop=third&&!(third.after?.possession===side&&third.after.down===1)&&!third.turnover?
    (third.kind==='sack'?'A third-down sack':third.kind==='inc'?'A third-down incompletion':`${article(Math.max(0,Number(third.yards)||0))} ${Math.max(0,Number(third.yards)||0)}-yard third-down ${third.kind==='catch'?'catch':'run'}`):null;
  let result,line;
  if(td){
    result='touchdown';const long=snaps.reduce((m,e)=>!e.penalty&&(Number(e.yards)||0)>(Number(m?.yards)||0)?e:m,null);
    line=long&&long.yards>=15?`Touchdown. The big play was ${article(long.yards).toLowerCase()} ${long.yards}-yard ${D.PLAYS[long.play]?.name||'gain'}.`:'Touchdown.';
  }else if(safety){result='safety';line='Safety.'}
  else if(lastSnap.turnover&&last===lastSnap){result=lastSnap.turnover;line=lastSnap.turnover==='interception'?'An interception ended it.':'A lost fumble ended it.'}
  else if(last.type==='kick'&&last.kick==='punt'){result='punt';line=thirdStop?`${thirdStop} forced a punt.`:'Punt.'}
  else if(last.type==='kick'&&last.kick==='field_goal'){result=last.made?'field_goal':'missed_field_goal';line=`${thirdStop?thirdStop+' set up a field goal try. It was':'Field goal'} ${last.made?'good':'no good'}.`}
  else if(lastSnap.sit?.down===4&&lastSnap.after?.possession!==side){result='downs';line='Stopped on fourth down.'}
  else if(b.game.status==='final'){result='end_of_game';line='The game ended.'}
  else{result='end_of_half';line='The half ran out.'}
  const plays=snaps.filter(e=>!e.penalty).length,yards=Math.round(end-start);
  const user=snaps.filter(e=>e.userCalled),firstUser=user[0];
  return{key,side,plays,yards,start,end,result,line,text:`${plays} ${plays===1?'play':'plays'}, ${yards} ${Math.abs(yards)===1?'yard':'yards'}. ${line}`,
    userCalls:user.length,staffCalls:snaps.length-user.length,firstUserDown:firstUser?firstUser.sit.down:null};
}
// The possessions the staff ran since log index `since` (both teams), oldest first, each as a one-line recap.
// The full play-by-play stays in the log for playback.
function delegatedRecap(b,since=0){
  const keys=[];
  for(const e of (b?.log||[]).slice(since))if(e.drive&&(e.type==='snap'||e.type==='kick')&&!keys.includes(e.drive))keys.push(e.drive);
  return keys.map(k=>{
    const entries=b.log.filter(e=>e.drive===k&&e.type==='snap');
    if(entries.some(e=>e.userCalled))return null;
    const current=b.game.status!=='final'&&driveKey(b.game,b.game.possession)===k;
    if(current)return null;
    const s=driveSummary(b,k);return s&&{...s,team:b.teams[s.side]?.short||s.side};
  }).filter(Boolean);
}
// Playtest instrumentation: every possession of the person's team, in order. Where the first coached decision came,
// with how much Command, who called each snap, whether a setup cue was offered or used, and whether the coach asked
// for the next drive. Reads the log and telemetry only.
function driveLog(b){
  const keys=[];
  for(const e of b?.log||[])if(e.drive&&keyOwner(e.drive)===b.user&&!keys.includes(e.drive))keys.push(e.drive);
  return keys.map(k=>{
    const s=driveSummary(b,k);if(!s)return null;
    const h=b.driveCoach?.history?.[k]||{},hand=b.telemetry?.handoff?.[k]||null;
    return{key:k,coached:h.source||null,plays:s.plays,yards:s.yards,result:s.result,userCalls:s.userCalls,staffCalls:s.staffCalls,
      firstDecision:hand?{down:hand.down,distance:hand.distance,command:hand.command}:null,cuesShown:h.cuesShown||[],cuesUsed:h.cuesUsed||[],coachNext:h.coachNext??null};
  }).filter(Boolean);
}

// ---------------------------------------------------------------- reading the decision (V29)
// One real sequencing opportunity on this snap: a combo (data.COMBOS) that this drive's memory has already set up,
// offered only when a card that completes it is in hand, legal and affordable, and only while it has not paid out
// this half. Reads public drive memory, never the hidden call. A setup bonus helps one matchup; it does not repair a
// bad down and distance, so long-yardage cues say so.
function setupCue(b,req){
  if(req?.kind!=='snap'||!b?.game)return null;
  const opts=req.options||{},offense=req.role==='off',sit=req.situation;
  const usable=(opts.plays||[]).filter(o=>!o.blocked&&o.cost<=opts.command);
  const catalog=offense?D.PLAYS:D.CALLS;
  const ready=usable.map(o=>({card:catalog[o.id],hit:comboRead(b,req,catalog[o.id])})).filter(o=>o.hit);
  const plan=b.decks?.[req.side]?.[req.role]?.comboPlan;
  const choice=ready.find(o=>o.card.id===plan?.play&&o.hit.id===plan.id)||ready.find(o=>!o.hit.condition)||ready[0];
  if(!choice)return null;
  const {hit,card}=choice;
  const def=(D.COMBOS||[]).find(x=>x.id===hit.id);
  const longYardage=offense&&sit?.down>=3&&sit.distance>=7;
  return{id:hit.id,name:hit.name,play:card.id,playName:card.name,duel:hit.duel,reward:hit.reward,how:def?.how||'',
    text:`${hit.name} is set up. ${card.name} on this snap earns ${hit.reward}${hit.condition?' '+hit.condition:''}${hit.alternate?` (${hit.alternate} if they run)`:''}.`,
    caution:longYardage?`It is still ${['','1st','2nd','3rd','4th'][sit.down]} and ${sit.distance}: the bonus helps one matchup, not the whole down.`:null};
}
function comboPayoff(b,req){
  if(req?.kind!=='snap'||req.side!==b.user||!b.snap)return null;
  const {side,role}=req,hand=b.hands[side],deck=b.decks[side][role],plan=deck?.comboPlan,play=plan?.play;
  if(!hand||hand.role!==role||!plan||b.snap[role]||b.drive.key!==driveKey(b.game,offSide(b))||b.drive.payoffs?.includes(side))return null;
  if(!deck.wrinkles.includes(play)||hand.wrinkles.includes(play)||freeCard(b,side,role,play)||b.exhausted[side].includes(play))return null;
  const pile=b.piles[side][role].wrinkle;
  if(!pile.draw.includes(play)&&!pile.discard.includes(play))return null;
  const card=(role==='off'?D.PLAYS:D.CALLS)[play],cost=D.RULES.comboDrawCost;
  if(!card||card.trick||card.drill||card.signature||cost+costOf(b,side,card)>hand.command||R.playBlocked(card,lineupOf(b,side,role),req.situation))return null;
  const combo=comboRead(b,req,card);
  return combo?.id===plan.id?{id:combo.id,play,name:combo.name,playName:card.name,cost,condition:combo.condition||null}:null;
}
function drawComboPayoff(b,req){
  const payoff=comboPayoff(b,req);
  if(!payoff)throw new Error('No installed combo payoff is available on this snap.');
  const {side,role}=req,hand=b.hands[side],pile=b.piles[side][role].wrinkle;
  const from=pile.draw.includes(payoff.play)?pile.draw:pile.discard;
  hand.wrinkles.push(...from.splice(from.lastIndexOf(payoff.play),1));
  hand.command-=payoff.cost;
  (b.drive.payoffs??=[]).push(side);
}
// What the offense actually knows about the look, and what is still a guess. Display only.
function lookCertainty(look){
  if(!look)return null;
  const shell=v=>v===0?'no deep safety':v===2?'two deep safeties':'one deep safety';
  const facts=[
    ['box',look.box,v=>`${v} box`],
    ['shell',look.shell,shell],
    ['pressure',look.pressure,v=>v?'pressure shown':'no pressure shown'],
    ['coverage',look.coverage,v=>v?`${v} coverage`:'coverage'],
    ['covTend',!look.coverage?.confirmed&&look.covTend?{value:look.covTend,confirmed:true}:null,v=>`${v} tendency`],
    ['lean',look.lean,v=>v?`leaning ${v}`:null]
  ];
  const known=[],guess=[];
  for(const [id,f,label] of facts){
    if(!f)continue;const text=label(f.value);if(!text)continue;
    (f.confirmed?known:guess).push(id==='coverage'&&!f.confirmed?'coverage':text);
  }
  return{known,guess};
}
// Which logged modifiers a tactic produced. Built-in tactics use their resolver labels; generic ones use the card name.
const TACTIC_SRCS={max_protect:['Max protect','One fewer route'],seal_block:['Seal block'],motion:['Motion'],route_adjust:['Route adjustment','Adjusted to confirmed coverage'],
  disguise:['Disguised coverage'],bracket:['Bracketed','Bracket left him alone'],spy:['QB spy','One fewer rusher'],press:['Press'],identify_protection:['Aimed pressure']};
function tacticMods(id,d){
  const T=D.TACTICS[id],srcs=TACTIC_SRCS[id]||[];
  return (d?.mods||[]).filter(m=>srcs.includes(m.src)||(T&&(m.src===T.name||String(m.src).startsWith(T.name+' matchup'))));
}
const wasCheckdown=e=>!!e.checkdown||/\bchecks down to\b/.test(e.text||'');
function snapResultLabel(e){
  const y=Number(e.yards)||0,yards=`${y>0?'+':y<0?'−':''}${Math.abs(y)} ${Math.abs(y)===1?'yard':'yards'}`;
  if(e.turnover==='interception')return 'Interception';
  if(e.turnover==='fumble')return 'Fumble lost · '+yards;
  if(e.kind==='inc')return 'Incomplete · 0 yards';
  if(e.kind==='sack')return 'Sack · '+yards;
  if(e.score?.[e.offSide]-e.sit?.score?.[e.offSide]>=6)return 'Touchdown · '+yards;
  if(e.score?.[e.defSide]-e.sit?.score?.[e.defSide]===2)return 'Safety · '+yards;
  if(e.sit?.down===4&&y<e.sit.distance&&e.after?.possession===e.defSide)return 'Turnover on downs · '+yards;
  const first=e.after?.possession===e.offSide&&e.after?.down===1&&y>=e.sit?.distance;
  return [wasCheckdown(e)?'Checkdown':null,yards,first?'First down':null].filter(Boolean).join(' · ');
}
function snapSucceeded(e){
  if(e.turnover||e.kind==='inc'||e.kind==='sack')return false;
  if(e.score?.[e.offSide]-e.sit?.score?.[e.offSide]>=6)return true;
  return e.sit?.down>=3?e.yards>=e.sit.distance:e.yards>0;
}
function snapEvidence(e){
  const reached=e.duelResults.slice(0,e.duelResults[0].won?Math.min(3,e.duels?.length||0):1);
  const wlw=reached.length>=3&&!reached[1].won&&reached[2].won;
  const loss=reached.findIndex(r=>!r.won),index=wlw||loss<0?reached.length-1:loss;
  const result=snapResultLabel(e);
  return{reached,index,result,recovery:wlw&&snapSucceeded(e)&&!wasCheckdown(e)};
}
// One short explanation of a recorded snap, from the side of `side`: where the coach's tactic did (or did not) act,
// then the duel that decided the play. A tactic is credited only for a modifier on a duel that was actually reached.
function snapVerdict(e,side=e?.offSide){
  if(!e||e.penalty||e.category==='kick'||!e.duelResults?.length||!e.duels?.length)return null;
  const offense=side===e.offSide,sign=offense?1:-1;
  const {reached,index:i,recovery,result}=snapEvidence(e),reachedN=reached.length;
  const d=e.duels[i];if(!d)return null;
  const offWon=!!e.duelResults[i].won,mineWon=offense?offWon:!offWon;
  const label=x=>String(x?.label||'The matchup'),names=a=>(a||[]).filter(Boolean).join(' & ');
  // Whose player is whose, from the side reading it: "their safety beat your receiver".
  const own=(mine,list)=>{const n=names(list);return n?`${mine?'your':'their'} ${n}`:mine?'your side':'their side'};
  const winner=own(mineWon,offWon?d.offNames:d.defNames),loser=own(!mineWon,offWon?d.defNames:d.offNames);
  const decisive=recovery?`${label(d)}: ${winner} beat ${loser}, recovering after losing ${label(e.duels[1])}.`:`${label(d)}: ${winner} beat ${loser}.`;
  const tactics=[];
  for(const id of (offense?e.offTactics:e.defTactics)||[]){
    const T=D.TACTICS[id];if(!T||T.info)continue;
    let best=null,unreached=null,touched=false;
    e.duels.forEach((duel,j)=>{
      const v=tacticMods(id,duel).reduce((n,m)=>n+sign*(Number(m.v)||0),0);if(!v)return;touched=true;
      if(j<reachedN){if(v>0&&(!best||v>best.v))best={j,v}}else if(v>0&&unreached==null)unreached=j;
    });
    const credit=best?((e.duelResults[best.j].won===offense)?'helped':'outweighed'):unreached!=null?'unreached':touched?'cost':'none';
    tactics.push({id,name:T.name,credit,duel:best?e.duels[best.j].key:unreached!=null?e.duels[unreached].key:null,index:best?best.j:unreached});
  }
  const lead=tactics.find(t=>t.credit==='helped'||t.credit==='outweighed')||tactics.find(t=>t.credit==='unreached')||tactics[0];
  let detail=decisive;
  if(lead){
    const at=lead.index!=null?label(e.duels[lead.index]):null;
    if(lead.credit==='helped'&&lead.index===i)detail=`${at}: ${winner} beat ${loser}, with help from ${lead.name}.`;
    else if(lead.credit==='outweighed'&&lead.index===i)detail=`${at}: ${lead.name} helped, but ${winner} still beat ${loser}.`;
    else if(lead.credit==='helped')detail=`${at}: won with help from ${lead.name}. ${decisive}`;
    else if(lead.credit==='unreached')detail=`${lead.name} would have helped at ${at}, but the play ended first. ${decisive}`;
    else if(lead.credit==='none')detail=`${lead.name} did not change a matchup on this play. ${decisive}`;
    else detail=`${lead.name} cost a step on this play. ${decisive}`;
  }
  return{result,detail,text:`${result}. ${detail}`,won:mineWon,decisive:{key:d.key,label:d.label,won:mineWon},tactics};
}

// Run until a person must decide or the game ends. Returns the pending request or null.
function advance(b){
  let guard=0;
  while(++guard<5000){
    const g=b.game;
    if(b.replayDrive!=null&&(possessionKey(g)!==b.replayDrive||g.status==='final'||challengeResult(b)))return null;
    if(b.pending)return b.pending;
    if(b.coachedDrive!=null&&(g.status==='final'||!coachingDrive(b))){
      const ended=b.coachedDrive;delete b.coachedDrive;
      if(b.driveCoach&&b.mode==='key'&&g.status!=='final'){b.pending=driveEndRequest(b,ended);if(b.pending)return b.pending}
    }
    if(g.status==='pregame')Engine.startGame(g);
    if(g.status==='final'){finalize(b);return null}
    if(g.period>4&&g.ot&&g.ot.period>=3){Engine.step(g);continue}
    ensureSeries(b);
    if(b.pending)return b.pending;
    rememberDrive(b);
    const off=offSide(b),def=defSide(b);
    if(!b.snap)claimDrive(b);
    if(!b.snap){
      if(g.down===4&&!b.fourthGo){
        const choice=fourthChoice(b);
        if(choice==='ask'){b.pending=fourthRequest(b);b.telemetry.decisions.fourth++;return b.pending}
        if(choice!=='go'){kick(b,choice);continue}
      }
      if(isUser(b,off)||isUser(b,def)){
        const userSide=isUser(b,off)?off:def;
        if(needsPlan(b,userSide)){b.pending=planRequest(b,userSide);b.telemetry.decisions.plan++;return b.pending}
      }
      startSnap(b);
      const userSide=isUser(b,off)?off:isUser(b,def)?def:null;
      if(userSide){
        const scripted=scriptedCall(b,userSide);
        if(liveFor(b,userSide)&&!scripted){
          if(reached25(b))b.headset25Drive=g.drive;
          b.pending=snapRequest(b,userSide);b.telemetry.decisions.snap++;return b.pending;
        }
        if(scripted)fillScripted(b,userSide,scripted);else fillAI(b,userSide);
      }else if(!b.snap.off)b.snap.off=decideAI(b,off,'off');
    }
    resolveSnap(b);
  }
  throw new Error('Battle loop guard exceeded.');
}
function fillAI(b,side){const role=b.hands[side].role;if(role==='off')b.snap.off=decideAI(b,side,'off');else b.snap.def=decideAI(b,side,'def');if(!b.snap.look)b.snap.look=lookFor(b,b.snap.def)}
function scriptedCall(b,side){
  if(b.mode!=='series'||!b.plan||keyMoment(b))return null;
  const c=b.plan.calls[b.seriesSnap];return c||null;
}
function fillScripted(b,side,call){
  const role=b.hands[side].role;
  let res;try{res=commit(b,side,call)}catch(e){res=null}
  if(!res){fillAI(b,side);return}
  if(role==='off')b.snap.off=res;else{b.snap.def=res;b.snap.look=lookFor(b,res)}
}

// ---------------------------------------------------------------- requests (what the sandbox renders)
function snapRequest(b,side){
  const role=b.hands[side].role;
  const req={kind:'snap',side,role,situation:situation(b),look:role==='off'?b.snap.look:null,offLook:role==='def'?b.snap.offLook:null,
    options:role==='off'?offOptions(b,side):defOptions(b,side),lean:leanFor(b),heat:heatFor(b),...(role==='off'?{leanMeter:leanMeter(b)}:{}),
    offTendency:tendencyCounts(b,offSide(b)),info:role==='off'?b.snap.offInfo:b.snap.defInfo};
  if(side===b.user){
    const cue=setupCue(b,req);if(cue)req.setupCue=cue;
    const payoff=comboPayoff(b,req);if(payoff)req.comboPayoff=payoff;
    const defensePlan=opponentPlanRead(b,req);if(defensePlan)req.defensePlan=defensePlan;
    const key=driveKey(b.game,b.game.possession);
    if(role==='off')(b.telemetry.handoff??={})[key]??={down:req.situation.down,distance:req.situation.distance,command:req.options.command};
    if(cue&&b.driveCoach){const h=driveHistory(b,key);h.cuesShown??=[];if(!h.cuesShown.includes(cue.id))h.cuesShown.push(cue.id)}
  }
  return req;
}
function planRequest(b,side){
  const role=b.hands[side].role;
  return{kind:'plan',side,role,situation:situation(b),options:role==='off'?offOptions(b,side):defOptions(b,side),lean:leanFor(b),offTendency:tendencyCounts(b,offSide(b))};
}
function followsTwoDownPlan(b){
  const last=b.lastResult;
  return !!(last?.twoDown&&last.offSide===offSide(b)&&last.sit.down===3);
}
function fourthRecommendation(b){
  const g=b.game,off=offSide(b);
  if(chasing(b,off)){
    // A field goal only helps when it closes the gap to one score; otherwise keep the ball on a makeable distance.
    const deficit=g.score[other(off)]-g.score[off];
    if((deficit<=3||(deficit>=9&&deficit<=11))&&Engine.fieldGoalInRange(g))return 'field_goal';
    if(g.distance<=5||(g.period===4&&g.clock<=120))return 'go';
  }
  const d=followsTwoDownPlan(b)&&g.distance<=2?'go':Engine.defaultFourthDown(g);
  return d==='play'?'go':d;
}
function fourthChoice(b){
  const g=b.game,off=offSide(b);
  if(g.period>4){if(g.fieldPosition>=55&&Engine.fieldGoalInRange(g))return'ot_fg';return'go'}
  if(isUser(b,off)&&b.mode!=='sim'&&(b.mode!=='key'||b.headset.fourth||coachingDrive(b)))return'ask';
  return fourthRecommendation(b);
}
function fourthRequest(b){
  const g=b.game,opts=['go','punt'];if(Engine.fieldGoalInRange(g,Engine.FG_OFFER_CHANCE))opts.push('field_goal');
  const ke=kickerEdge(b,offSide(b)),twoDown=followsTwoDownPlan(b);
  return{kind:'fourth',twoDown,side:offSide(b),situation:situation(b),options:opts,recommended:fourthRecommendation(b),fgChance:Math.max(.02,Math.min(.99,Engine.fieldGoalChance(g,Engine.fieldGoalDistance(g))+ke.adjust)),kicker:ke};
}
function kick(b,choice){
  const g=b.game,off=offSide(b),before=g.fieldPosition;
  if(choice==='ot_fg'){Engine.step(g);b.log.push({type:'kick',text:'Overtime field goal attempt.'});return}
  const sit=situation(b),drive=driveKey(g,off);
  if(choice==='punt'){const pe=punterEdge(b,off);Engine.punt(g,{netAdjust:pe.netAdjust});b.box[off].punts++;b.log.push({type:'kick',kick:'punt',drive,side:off,sit,after:situation(b),score:{...g.score},text:`${b.teams[off].short} punts from the ${yardLine(before)}${pe.name&&pe.netAdjust?` (${pe.name}: ${pe.netAdjust>0?'+':''}${pe.netAdjust} yards)`:''}.`})}
  else{const ke=kickerEdge(b,off),evStart=g.events.length;armSpecials(b,off);const made=Engine.attemptFieldGoal(g,{adjust:ke.adjust});const notes=settleSpecials(b,off,evStart);
    b.log.push({type:'kick',kick:'field_goal',drive,made,side:off,sit,after:situation(b),score:{...g.score},text:`${b.teams[off].short} ${made?'makes':'misses'} a ${100-before+17}-yard field goal${ke.adjust?` (${ke.name?ke.name+': ':''}${ke.adjust>0?'+':''}${Math.round(ke.adjust*100)}%)`:''}.${notes.length?' '+notes.join('. ')+'.':''}`})}
}

// ---------------------------------------------------------------- submit
function submit(b,action){
  const req=b.pending;if(!req)throw new Error('Nothing is waiting for a decision.');
  if(req.kind==='mesh'){
    const choice=action.choice;
    if(action.type!=='auto'&&(action.type!=='mesh'||!['give','keep'].includes(choice)))throw new Error('Choose Give or Keep at the mesh.');
    if(action.type==='mesh')b.snap.off.meshChoice=choice;
    b.pending=null;
    resolveSnap(b);
    return advance(b);
  }
  if(req.kind==='drive_end'){
    const next=action.type==='drive_end'&&!!action.coachNext;
    if(action.type!=='auto'&&action.type!=='drive_end')throw new Error('Choose whether to coach the next drive.');
    b.pending=null;b.driveCoach.next=next;driveHistory(b,req.summary.key).coachNext=next;
    return advance(b);
  }
  if(req.kind==='halftime'){
    if(action.type==='auto')return applyHalftimeChoice(b,req,null);
    if(action.type!=='halftime')throw new Error('Choose a halftime adjustment or continue.');
    return applyHalftimeChoice(b,req,action.adjustment??action.tactic??null);
  }
  if(req.kind==='fourth'){
    b.pending=null;
    if(action.choice==='go'){b.fourthGo=true;return advance(b)}
    if(action.choice==='punt'||action.choice==='field_goal'){kick(b,action.choice);return advance(b)}
    throw new Error('Choose go, punt or field_goal.');
  }
  if(req.kind==='plan'){
    const calls=(action.calls||[]).slice(0,2).map(c=>c&&c.play?{play:c.play,tactics:(c.tactics||[]).filter(id=>!D.TACTICS[id]?.info)}:null);
    b.plan={calls};b.pending=null;return advance(b);
  }
  if(req.kind==='snap'){
    const side=req.side,role=req.role;
    if(action.type==='two_down'){
      if(role!=='off'||req.situation.down!==3||req.situation.period>4)throw new Error('Choose two-down territory on offensive third downs in regulation.');
      b.snap.twoDown=!!action.active;
      return req;
    }
    if(action.type==='info'){
      if(!D.TACTICS[action.tactic]?.info)throw new Error('That is not an information card.');
      applyInfo(b,side,action.tactic);b.telemetry.decisions.info++;
      if(b.snap.falseStart){b.pending=null;falseStart(b,side);return advance(b)}
      b.pending=snapRequest(b,side);return b.pending;
    }
    if(action.type==='redraw'){
      applyRedraw(b,side);
      b.pending=snapRequest(b,side);return b.pending;
    }
    if(action.type==='combo_payoff'){
      drawComboPayoff(b,req);
      b.pending=snapRequest(b,side);return b.pending;
    }
    if(action.type==='auto'){b.pending=null;fillAI(b,side);resolveSnap(b);return advance(b)}
    if(action.type==='call'){
      const res=commit(b,side,action);
      if(role==='off')b.snap.off=res;else{b.snap.def=res;b.snap.look=lookFor(b,res)}
      b.pending=null;b.telemetry.userSnaps++;b.snap.userCalled=true;
      if(action.coachingReview&&side===b.user)b.snap.coachingReview=prepareCoachingReview(b,req,res,action.coachingReview.estimate);
      if(req.setupCue&&b.driveCoach&&[res.play,D.PLAYS[res.play]?.evolvedFrom,D.PLAYS[res.play]?.upgradeOf].includes(req.setupCue.play)){
        const h=driveHistory(b,driveKey(b.game,b.game.possession));h.cuesUsed??=[];if(!h.cuesUsed.includes(req.setupCue.id))h.cuesUsed.push(req.setupCue.id);
      }
      if(role==='def'&&!b.snap.off)b.snap.off=decideAI(b,offSide(b),'off');
      const card=D.PLAYS[res.play];
      // Opt-in: the cue states the end's real first step, so the prompt is a choice only for coaches who want it.
      if(role==='off'&&b.headset?.readOption&&keyMoment(b)&&(card.evolvedFrom||card.upgradeOf||card.id)==='read_option'){
        const snap=committedSnap(b,req.situation,res,b.snap.def);
        const off=b.teams[side].lineup.off,def=b.teams[other(side)].lineup.def;
        const firstStep=snap.edgeAssignment==='crash'?'steps inside toward the back':'stays wide with the quarterback';
        b.pending={kind:'mesh',side,situation:req.situation,cue:`${def.SET.name} ${firstStep}.`,qb:off.QB.name,back:off.RB.name,linebacker:def.WILL.name};
        return b.pending;
      }
      resolveSnap(b);return advance(b);
    }
  }
  throw new Error(`Unknown action for ${req.kind}.`);
}
function falseStart(b,side){
  const g=b.game;
  // The defense's committed cards return to its hand: no snap happened.
  const def=defSide(b),committed=b.snap.def;
  if(committed?.restore){
    const r=committed.restore,piles=b.piles[def].def;
    b.hands[def]=r.hand;piles.wrinkle.discard.length=r.discardPlays;
    piles.tactic.discard.length=r.discardTactics;b.exhausted[def].length=r.exhausted;
    b.box[def].cardsPlayed=r.cardsPlayed;
    if(r.timeouts!=null&&b.game.timeouts)b.game.timeouts[def]=r.timeouts;
  }else if(committed){
    // Older mid-snap saves lack a receipt. Recover the exact card identity
    // from its actual destination; never remove an unrelated discard.
    const h=b.hands[def],piles=b.piles[def].def,call=D.CALLS[committed.play];
    const restore=(id,pile,hand)=>{const i=pile.lastIndexOf(id);if(i>=0){pile.splice(i,1);hand.push(id);b.box[def].cardsPlayed--}};
    if(!b.decks[def].def.base.includes(call.id))restore(call.id,call.trick?b.exhausted[def]:piles.wrinkle.discard,h.wrinkles);
    const prior=b.seriesSnap?b.log.filter(e=>e.type==='snap').slice(-b.seriesSnap):[];
    const paid=card=>{
      const used=h.onceUsed.indexOf(card.id);
      if(used>=0&&!prior.some(e=>e.call===card.id||e.defTactics?.includes(card.id)||e.defInfo?.includes(card.id))&&!b.snap.defInfo?.includes(card.id))h.onceUsed.splice(used,1);
      return costOf(b,def,card);
    };
    h.command+=paid(call);
    for(const id of committed.tactics){
      restore(id,piles.tactic.discard,h.tactics);
      h.command+=paid(D.TACTICS[id]);
      if(TIMEOUT_CARDS.includes(id)&&g.timeouts)g.timeouts[def]=Math.min(3,g.timeouts[def]+1);
    }
  }
  const foul=enforcePenalty(b,'false_start');
  b.log.push({type:'penalty',side,yards:foul.yards,text:`False start on the hard count, ${b.teams[side].short}. ${foul.yards} ${foul.yards===1?'yard':'yards'}.`});
  b.snap=null;b.fourthGo=false;
}

// The first combo (rules v0.8, data.COMBOS) this play/call would complete, from this drive's memory. Offense combos
// need only the play; defense combos also need the call (null when only the offense is known).
const comboById=new Map(D.COMBOS.map(recipe=>[recipe.id,recipe]));
function comboFor(b,play,call=null,role=null){
  if(!play)return null;
  const mine=b.drive?.key===driveKey(b.game,offSide(b)),dr=mine?b.drive:{};
  const c={play,call,root:play.evolvedFrom||play.upgradeOf||play.id,fams:dr.fams||[],plays:dr.plays||[],calls:dr.calls||[],results:dr.results||[]};
  // Each team completes each combo at most once per half (overtime is its own half).
  const half=b.game.period<=2?1:b.game.period<=4?2:3,usedBy=side=>b.comboLog?.[side]?.[half]||[];
  const eligible=x=>(!role||x.side===role)&&!usedBy(x.side==='def'?defSide(b):offSide(b)).includes(x.id)&&x.test(c);
  const installed=(unit,card,side)=>{
    const plan=b.decks?.[side]?.[unit]?.comboPlan;
    const recipe=plan?.play===card.id?comboById.get(plan?.id):null;
    return recipe?.side===unit&&eligible(recipe)?recipe:null;
  };
  const hit=installed('off',play,offSide(b))||(call&&installed('def',call,defSide(b)))||
    D.COMBOS.find(x=>(x.side==='off'||call)&&eligible(x));
  return hit?{id:hit.id,name:hit.name,duel:hit.duel,v:hit.v,side:hit.side,reward:hit.reward}:null;
}
function combosFor(b,play,call){
  return [comboFor(b,play),call&&comboFor(b,play,call,'def')].filter(Boolean);
}
// Defensive readiness depends on public drive history, the selected call, and only a confirmed offensive family.
function comboRead(b,req,card){
  if(!b?.game||req?.kind!=='snap'||!card)return null;
  if(req.role==='off')return comboFor(b,card);
  if(req.role!=='def')return null;
  const read=req.offLook?.family;
  if(read?.confirmed)return comboFor(b,{family:read.value},card,'def');
  const ready=comboFor(b,{},card,'def'),ifRun=comboFor(b,{family:'run'},card,'def');
  const plan=b.decks?.[req.side]?.def?.comboPlan;
  if(ifRun&&ready?.id!==ifRun.id&&plan?.id===ifRun.id&&plan.play===card.id)return{...ifRun,condition:'if they run'};
  if(ready)return ifRun&&ifRun.id!==ready.id?{...ready,alternate:ifRun.name}:ready;
  return ifRun?{...ifRun,condition:'if they run'}:null;
}
// Track the setup steps of the installed offensive sequence on public drive
// history. The combo's real predicate still determines payoff readiness.
const OFFENSIVE_SETUP={
  sell_the_sneak:{steps:1,plays:['qb_sneak']},
  establish:{steps:2,family:'run'},
  shot_after_run:{steps:2,family:'run'},
  sell_the_slant:{steps:2,family:'quick'},
  counter_the_flow:{steps:1,plays:['outside_zone','buck_sweep','jet_sweep','toss_crack','jet_reverse']},
  rhythm_and_bruise:{steps:2,family:'quick',yards:5},
  change_of_pace:{steps:1,family:'run',yards:8}
};
function equippedComboSetup(b,req=b?.pending){
  if(!b?.game||req?.kind!=='snap'||req.side!==b.user||!['off','def'].includes(req.role))return null;
  const deck=b.decks?.[req.side]?.[req.role],plan=deck?.comboPlan,recipe=comboById.get(plan?.id);
  const card=(req.role==='off'?D.PLAYS:D.CALLS)[plan?.play];
  if(!card||recipe?.side!==req.role||!deck.wrinkles?.includes(card.id)||
    b.comboLog?.[req.side]?.[halfOf(b.game)]?.includes(recipe.id))return null;
  const hit=comboRead(b,req,card),ready=hit?.id===recipe.id;
  const view={id:recipe.id,name:recipe.name,play:card.id,playName:card.name,how:recipe.how,reward:recipe.reward,ready};
  if(ready&&hit.condition)view.condition=hit.condition;
  const spec=OFFENSIVE_SETUP[recipe.id];
  if(!spec)return view;
  const drive=b.drive?.key===driveKey(b.game,offSide(b))?b.drive:{};
  const history=(spec.plays?drive.plays:spec.yards?drive.results:drive.fams)||[];
  const counts=value=>spec.plays?spec.plays.includes(value):spec.yards?value?.family===spec.family&&value.yards>=spec.yards:value===spec.family;
  let step=0;
  for(let i=history.length-1;i>=0&&step<spec.steps&&counts(history[i]);i--)step++;
  return{...view,step,steps:spec.steps};
}
function setupProgress(b,card,role='off'){
  if(!b?.game||!card)return null;
  if(role==='off'&&comboFor(b,card))return null;
  const half=b.game.period<=2?1:b.game.period<=4?2:3,side=role==='def'?defSide(b):offSide(b);
  const used=b.comboLog?.[side]?.[half]||[],mine=b.drive?.key===driveKey(b.game,offSide(b)),dr=mine?b.drive:{};
  const fams=dr.fams||[],calls=dr.calls||[],results=dr.results||[],root=card.evolvedFrom||card.upgradeOf||card.id;
  if(role==='off'){
    if(root==='out_and_up'&&boundaryOuts(b,offSide(b))===1)return{step:1,of:2,label:'SET UP 1/2 · 1 more Quick Out'};
    if(root==='pa_boot'&&!used.includes('establish')&&fams.at(-1)==='run'&&fams.at(-2)!=='run')return{step:1,of:2,label:'SET UP 1/2 · 1 more run'};
    if(card.family==='deep'&&!card.trick&&!used.includes('shot_after_run')&&fams.at(-1)==='run'&&fams.at(-2)!=='run')return{step:1,of:2,label:'SET UP 1/2 · 1 more run'};
    if(card.family==='deep'&&!card.trick&&!used.includes('sell_the_slant')&&fams.at(-1)==='quick'&&fams.at(-2)!=='quick')return{step:1,of:2,label:'SET UP 1/2 · 1 more quick'};
    if(['inside_zone','power','draw','qb_draw','wishbone_dive','power_lead'].includes(root)&&!used.includes('rhythm_and_bruise')&&results.at(-1)?.family==='quick'&&results.at(-1)?.yards>=5&&!(results.at(-2)?.family==='quick'&&results.at(-2)?.yards>=5))return{step:1,of:2,label:'SET UP 1/2 · 1 more quick'};
  }else{
    if(card.coverage==='man'&&card.pressure===0&&!used.includes('bait_the_throw')&&(results.at(-1)?.yards??0)>=3&&calls.at(-1)?.coverage==='zone'&&calls.at(-1)?.pressure===0&&!(calls.at(-2)?.coverage==='zone'&&calls.at(-2)?.pressure===0))return{step:1,of:2,label:'SET UP 1/2 · 1 more zone'};
    if(!used.includes('wall_up')&&results.at(-1)?.family==='run'&&results.at(-1)?.yards<=2&&!(results.at(-2)?.family==='run'&&results.at(-2)?.yards<=2))return{step:1,of:2,label:'SET UP 1/2 · 1 more run stop'};
  }
  return null;
}
// Count positive primary completions against this corner, out of the last eight offensive snaps.
function boundaryOuts(b,side,grouping=b.snap?.grouping||groupingFor(b,side),wide=b.teams[side].lineup.off.X?.id){
  const corner=b.teams[other(side)].lineup.def.BCB?.id;
  if(corner==null||wide==null)return 0;
  let count=0,snaps=0;
  for(let i=(b.log?.length||0)-1;i>=0&&snaps<8;i--){
    const e=b.log[i];
    if(e.type==='halftime')break;
    if(e.type!=='snap'||e.offSide!==side||e.penalty||e.category==='kick')continue;
    if(e.sit&&halfOf(e.sit)!==halfOf(b.game))break;
    snaps++;
    if(e.lineups?.off?.X!==wide||e.lineups?.def?.BCB!==corner||e.grouping!==grouping)continue;
    const play=D.PLAYS[e.play],id=play?.evolvedFrom||play?.upgradeOf||e.play;
    if(id==='out_and_up')break;
    if(id==='quick_out'&&e.completed&&!e.turnover&&e.yards>0&&e.participants?.target==='X'){
      count++;
      if(count===2)break;
    }
  }
  return count;
}
// The corner's read of the quick out belongs to one personnel grouping. Report the count for this snap's grouping and,
// when Auto personnel has moved off it, the grouping where the setup still stands.
function setupLook(b,side){
  const current=b.snap?.grouping||groupingFor(b,side),outs=boundaryOuts(b,side,current);
  let elsewhere=null;
  for(const g of Object.keys(GROUPINGS)){
    if(g==='auto'||g===current)continue;
    const lineup=packageLineup(b,side,g);if(!lineup?.X)continue;
    const n=boundaryOuts(b,side,g,lineup.X.id);if(n>outs&&(!elsewhere||n>elsewhere.outs))elsewhere={grouping:g,outs:n,name:GROUPINGS[g]};
  }
  return{current,name:GROUPINGS[current],outs,elsewhere};
}
function knownEffects(b,play,call=null){return{boundaryOuts:(play.evolvedFrom||play.upgradeOf||play.id)==='out_and_up'?boundaryOuts(b,offSide(b)):0,momentum:b.momentum?.side===offSide(b)&&b.momentum.left>0,fire:b.fire,workload:b.workload||{},combos:combosFor(b,play,call),grouping:b.snap?.grouping||groupingFor(b,offSide(b)),featured:featuredEdge(b,offSide(b))}}
// Boost his duels on calls designed for him until he has two actual carries or receptions.
const FEATURE_ROLES=['RB','X','Z','SLOT','TE'],FEATURE_TOUCHES=2;
const halfOf=g=>g.period<=2?1:g.period<=4?2:3;
function featuredEdge(b,side){
  const f=b.featured?.[side];if(!f||f.half!==halfOf(b.game)||f.touches>=FEATURE_TOUCHES)return null;
  const off=b.teams[side].lineup.off,role=FEATURE_ROLES.find(r=>off[r]?.id===f.id);
  return role?{id:f.id,role,v:1}:null;
}
function touchRole(e){
  return e.completed?e.participants?.target:e.participants?.carrier;
}

// ---------------------------------------------------------------- resolution
function enforcePenalty(b,kind,clock){
  const start=b.game.events.length;
  Engine.applyScrimmage(b.game,{penalty:{kind},clock});
  const foul=b.game.events[start],box=b.box[foul.against];
  box.penalties++;box.penaltyYds+=foul.yards;
  return foul;
}
function rollPenalty(b,play){
  return withRng(b,rng=>{
    let r=rng.next();
    for(const [kind,p] of Object.entries(Engine.PENALTY_TYPES)){if(p.pass&&!play.pass)continue;r-=p.weight;if(r<0)return{kind,spec:p}}
    return null;
  });
}
function manageClock(b,out,play){
  const g=b.game,off=offSide(b),def=defSide(b);
  if(out.turnover||out.kind==='inc'||play.clockStop)return '';
  const spot=g.fieldPosition+out.yards;
  if(spot<=0||spot>=100||g.down===4&&out.yards<g.distance){
    if(drillOn(b))out.clock=Math.min(out.clock,6);
    return '';
  }
  const closing=b.snap.closeout&&!b.snap.off.tactics.includes('hurry_up');
  if(closing)out.clock=Math.max(40,out.clock);
  const note=closing?' The offense takes its time in the huddle.':'';
  if(!drillOn(b)||out.clock<=10)return note;
  const coached=(b.coachingWindows||b.snap.timeoutNext||b.clockIntent)&&b.mode!=='sim'&&b.user&&isUser(b,b.user);
  const manual=coached?b.user:null;
  if(manual===off){
    if(b.clockIntent==='preserve')out.clock=Math.min(out.clock,13);
    if(b.clockIntent==='drain')out.clock=Math.min(45,out.clock+10);
  }
  if(g.clock<=6||!g.timeouts)return note;
  let who=manual&&b.snap.timeoutNext&&g.timeouts[manual]>0?manual:null;
  if(!who&&manual!==off&&g.score[off]<=g.score[def]&&g.timeouts[off]>0)who=off;
  if(!who&&manual!==def&&g.period===4&&g.score[def]<g.score[off]&&g.timeouts[def]>0)who=def;
  if(!who)return note;
  g.timeouts[who]--;
  out.clock=6;
  return ` ${b.teams[who].short} calls timeout (${g.timeouts[who]} left).`;
}
// Build both pre-snap practice estimates and the live roll from the same committed calls.
function committedContext(b,sit,offCall,defCall,cornerRoll){
  const off=offSide(b),def=defSide(b),players=b.teams[off].lineup.off;
  const play=R.targetedPlay(D.PLAYS[offCall.play],offCall.target,players),call=D.CALLS[defCall.play];
  const read=offCall.read||(b.snap.userCalled&&isUser(b,off)?'auto':autoRead(sit,b.snap.twoDown));
  return {weather:b.weather,cornerRoll,...edgesFor(b,off),off:players,def:b.teams[def].lineup.def,play,call,
    bracketRole:defCall.bracketRole,edgeAssignment:defCall.edgeAssignment,meshChoice:offCall.meshChoice,offTactics:activeTactics(b,'off',offCall.tactics),
    defTactics:activeTactics(b,'def',offCall.tactics.includes('hurry_up')?[]:defCall.tactics),
    situation:sit,lean:leanFor(b),heat:heatFor(b),motionConfirmed:b.snap.motionConfirmed,read,...knownEffects(b,play,call)};
}
function committedSnap(...args){return R.buildSnap(committedContext(...args))}
function prepareCoachingReview(b,req,choice,estimate){
  const {side,role,options}=req,offense=role==='off',lineup=b.teams[side].lineup[role];
  const play=offense?R.targetedPlay(D.PLAYS[choice.play],choice.target,lineup):D.CALLS[choice.play];
  const command=options.command-(options.plays.find(p=>p.id===choice.play)?.cost??Infinity);
  const alternatives=choice.tactics.length?['']:[];
  for(const {id,card,cost} of options.tactics){
    if(!card||card.info||card.special||TIMEOUT_CARDS.includes(id)||cost>command||alternatives.includes(id)||
      choice.tactics.length===1&&choice.tactics[0]===id||R.signatureBlocked(card,lineup)||offense&&R.tacticBlocked(card,play,lineup))continue;
    alternatives.push(id);
  }
  return{role,estimate:typeof estimate==='string'?estimate.slice(0,160):'',alternatives};
}
function resolveSnap(b){
  const g=b.game,off=offSide(b),def=defSide(b),s=b.snap;
  if(!s.def)s.def=decideAI(b,def,'def');
  if(!s.look)s.look=lookFor(b,s.def);
  if(!s.off)s.off=decideAI(b,off,'off');
  const sit=situation(b),lean=leanFor(b),heat=heatFor(b);
  // Drive memory for combos.
  const dkey=driveKey(g,off);if(b.drive.key!==dkey)b.drive={key:dkey,fams:[],plays:[],calls:[],results:[],combos:[],firsts:0};
  b.drive.plays??=[];b.drive.calls??=[];b.drive.results??=[];b.drive.combos??=[];
  const card=D.PLAYS[s.off.play];
  const cornerRoll=(card.evolvedFrom||card.upgradeOf||card.id)==='out_and_up'?withRng(b,rng=>rng.next()):undefined;
  const context=committedContext(b,sit,s.off,s.def,cornerRoll),snap=R.buildSnap(context),{play,call}=snap;
  const fams=b.drive.fams,combos=combosFor(b,play,call);
  const hurried=s.off.tactics.includes('hurry_up')&&s.def.tactics.length>0;
  b.telemetry.snaps++;b.seriesSnap++;
  const lineKey=`${play.id}${s.off.tactics.length?'+'+[...s.off.tactics].sort().join('+'):''}`;b.telemetry.lineCounts[lineKey]=(b.telemetry.lineCounts[lineKey]||0)+1;
  // Tendencies move whether or not a flag flies, and decay when calling another core family.
  if(['run','quick','deep'].includes(play.family)){
    for(const f of OFF_FAMILIES)b.tend[off][f]=f===play.family?(b.tend[off][f]||0)+1:Math.max(0,(b.tend[off][f]||0)-0.5);
  }else if(play.family==='constraint')b.tend[off].constraint=(b.tend[off].constraint||0)+1;
  const defBucket=call.family==='pressure'?'pressure':call.coverage;
  b.tend[def][defBucket]=(b.tend[def][defBucket]||0)+1;
  if(defBucket==='man'||defBucket==='zone'){
    const other=defBucket==='man'?'zone':'man';
    b.tend[def][other]=Math.max(0,(b.tend[def][other]||0)-0.5);
  }
  const pen=g.period>4?null:rollPenalty(b,play);
  const lineups={off:Object.fromEntries(Object.entries(b.teams[off].lineup.off).map(([r,p])=>[r,p.id])),def:Object.fromEntries(Object.entries(b.teams[def].lineup.def).map(([r,p])=>[r,p.id]))};
  const result={drive:dkey,lineups,...(s.twoDown?{twoDown:true}:{}),...(snap.edgeAssignment?{edgeAssignment:snap.edgeAssignment,meshChoice:play.carrier==='QB'?'keep':'give'}:{}),primaryTarget:play.target||null,bracketRole:snap.bracketRole,grouping:s.grouping||groupingFor(b,off),userCalled:!!s.userCalled,sit,offSide:off,defSide:def,play:play.id,call:call.id,offTactics:[...s.off.tactics],defTactics:[...s.def.tactics],offInfo:[...s.offInfo],defInfo:[...s.defInfo],lean,heat,duels:snap.duels,look:s.look};
  if(s.coachingReview){
    const {role,estimate,alternatives}=s.coachingReview;
    const practice=!pen&&!play.quickKick&&play.id!=='spike'&&alternatives.length?clone({
      context,rng:b.rng,alternatives,ownInfo:role==='off'?s.offInfo:s.defInfo,
      opposingDefense:role==='off'?activeTactics(b,'def',s.def.tactics):[],
      opposingInfo:role==='off'?s.defInfo:[],
      hurried:role==='def'&&s.off.tactics.includes('hurry_up')
    }):null;
    b.coachedSnap={index:b.log.length,role,estimate,practice};
  }
  if(pen){
    const {against,yards}=enforcePenalty(b,pen.kind,pen.spec.dead?4:8);
    result.penalty={kind:pen.kind,label:pen.spec.label,against,yards};result.text=`Flag: ${pen.spec.label} on ${b.teams[against].short}, ${yards} ${yards===1?'yard':'yards'}.`;
  }else if(play.quickKick){
    // Quick kick: punt from a running formation on 3rd down; with nobody back, it rolls (+8 yards, plus the punter).
    const pe=punterEdge(b,off),from=g.fieldPosition;Engine.punt(g,{netAdjust:8+pe.netAdjust});b.box[off].punts++;
    Object.assign(result,{category:'kick',kind:'punt',yards:0,turnover:null,completed:false,duelResults:snap.duels.map(()=>({won:true})),participants:{}});
    result.text=`${play.name}: ${b.teams[off].short} quick-kicks from the ${yardLine(from)} on 3rd down.`;result.events=[];
    fams.push(play.family);b.drive.plays.push(play.id);
  }else{
    const out=withRng(b,rng=>R.resolve(snap,rng,sit));
    if(b.momentum?.side===off)b.momentum.left=0;
    if(out.turnover)b.momentum={side:def,left:1};
    const before={down:g.down,distance:g.distance,field:g.fieldPosition,quarter:g.period,score:{...g.score}};
    const evStart=g.events.length;armSpecials(b,off);
    const clockNote=manageClock(b,out,play);
    if(!drillOn(b)&&before.quarter>=3&&before.quarter<=4&&!b.snap?.hurried&&(before.score[off]-before.score[def]>=17)&&!out.turnover&&out.kind!=='inc'&&!play.clockStop&&out.clock>0){
      out.clock=Math.max(out.clock,Math.min(42,out.clock+10));
    }
    Engine.applyScrimmage(g,{yards:out.yards,clock:out.clock,kind:out.engineKind,completed:out.completed,turnover:out.turnover});
    const specialNotes=settleSpecials(b,off,evStart);
    // Tag the play the way Dynasty Lab's attribution expects (run/pass, completion, sack), plus who actually played it.
    for(let i=g.events.length-1;i>=evStart;i--){const ev=g.events[i];if(!['scrimmage','interception','fumble'].includes(ev.type))continue;
      // A pick travels to the turnover spot but gives the passing offense zero yards.
      out.yards=ev.type==='interception'?0:ev.yards;
      ev.kind=out.engineKind;if(typeof out.completed==='boolean')ev.completed=out.completed;if(out.kind==='sack')ev.sack=true;
      const P=out.participants,O=b.teams[off].lineup.off,Df=b.teams[def].lineup.def,id=(lu,r)=>r&&lu[r]?String(lu[r].id):null;
      ev.card={play:play.id,call:call.id,category:out.category,actors:{qb:play.pass?id(O,'QB'):null,carrier:id(O,P.carrier),target:id(O,P.target),
        sacker:id(Df,P.sacker),...(out.kind==='sack'?{blockers:play.duels.G.protect?[...new Set(snap.duels[0].offRoles.map(r=>id(O,r)).filter(Boolean))]:[]}:{}),tackler:out.kind==='sack'||out.turnover==='interception'||ev.state.fieldPosition===100?null:id(Df,P.defender),interceptor:out.turnover==='interception'?id(Df,P.defender):null}};break}
    Object.assign(result,{category:out.category,kind:out.kind,yards:out.yards,turnover:out.turnover||null,completed:out.completed,...(out.checkdown?{checkdown:true}:{}),duelResults:out.duels,participants:out.participants});
    b.workload??={};for(const p of [...Object.values(b.teams[off].lineup.off),...Object.values(b.teams[def].lineup.def)])b.workload[p.id]=(b.workload[p.id]||0)+1;
    recordStats(b,off,def,out,before);
    const featured=b.featured?.[off],recipient=touchRole(out);
    if(featured&&featured.half===halfOf(sit)&&recipient&&lineups.off[recipient]===featured.id){
      result.featuredTouch=featured.id;
      featured.touches++;
    }
    result.text=storyLine(b,off,def,play,out,before,snap.edgeAssignment)+(specialNotes.length?` ${specialNotes.join('. ')}.`:'')+clockNote;
    const step=snap.flags.cornerStep;
    if(step){
      // Every duel is rolled, but only reached duels happened. A lost pocket ends the play before the route.
      const reached=!!out.wins[0];
      result.cornerStep={...step,reached};
      const corner=b.teams[def].lineup.def.BCB.name,wide=b.teams[off].lineup.off.X.name;
      if(reached){
        const route=step.jumped?'drove on the out':'stayed over the top';
        const finish=out.wins[1]?(step.jumped?`${wide} got behind him.`:`${wide} still won separation.`):`${wide} had no clean separation.`;
        result.text+=` ${corner} ${route}. ${finish}`;
      }else result.text+=out.kind==='sack'?' The rush got home before the route developed.':' The pocket broke down before the route developed.';
    }
    if(specialNotes.length)result.special=specialNotes;
    result.events=[];
    if(hurried)result.events.push({type:'hurry',side:off,name:'Hurry-up',reward:'their adjustments never got in'});
    fams.push(play.family);b.drive.plays.push(play.evolvedFrom||play.upgradeOf||play.id);
    b.drive.calls.push({pressure:call.pressure,shell:call.shell,coverage:call.coverage,shown:!!call.look?.pressureShown});b.drive.results.push({family:play.family,yards:out.yards});
    for(const k of ['plays','calls','results'])if(b.drive[k].length>6)b.drive[k].splice(0,b.drive[k].length-6);
    const sameSeries=g.status==='live'&&g.possession===off&&!out.turnover&&seriesKeyOf(g)===b.seriesKey
      &&halfOf(g)===halfOf(sit)&&g.score[off]===before.score[off]&&g.score[def]===before.score[def];
    for(const combo of combos){
      b.drive.combos.push(combo.id);
      const earner=combo.side==='def'?def:off,half=halfOf(sit),hand=b.hands[earner];
      const used=((b.comboLog??={})[earner]??={});
      (used[half]??=[]).push(combo.id);
      const commandRefund=sameSeries&&hand&&hand.command<D.RULES.seriesCommand?1:0;
      if(commandRefund)hand.command+=commandRefund;
      result.events.push({type:'combo',...combo,side:earner,commandRefund});
    }
    if(g.possession===off&&g.down===1&&g.score[off]===before.score[off]&&!out.turnover){
      if(b.hands[off]&&out.yards>=before.distance&&before.field+out.yards<100&&!(sit.period===2&&g.period!==2)&&g.status==='live'){
        b.hands[off].earnedFirst=true;
        if(off===b.user&&b.challengeDraft?.playbook==='tempo'&&!b.challengeDraft.tempoUsed&&b.seriesSnap<=2)b.hands[off].tempoDraw=true;
      }
      b.drive.firsts++;
      if(b.drive.firsts===3){b.bonusCommand[off]=1;result.events.push({type:'combo',id:'chain_gang',name:'Chain Gang',reward:'+1 Command next series',side:off})}
    }
    if(s.userCalled&&sameSeries){
      if(isUser(b,off)&&out.wins[0]&&out.wins[1]&&out.wins[2]&&out.yards>0&&b.hands[off]&&b.hands[off].command<D.RULES.seriesCommand){
        b.hands[off].command++;
        result.events.push({type:'surge',id:'clean_sweep',name:'Clean Execution',reward:'+1 Command',side:off,commandRefund:1});
      }else if(isUser(b,def)&&!out.wins[0]&&out.yards<=0&&b.hands[def]&&b.hands[def].command<D.RULES.seriesCommand){
        b.hands[def].command++;
        result.events.push({type:'surge',id:'stonewalled',name:'Stonewalled',reward:'+1 Command',side:def,commandRefund:1});
      }
    }
    updateFire(b,off,def,snap,out.wins,result.events);
    // A constraint play that works resets the tendency it punished.
    if(!out.turnover&&out.yards>0&&['success','explosive'].includes(out.category)){
      if(play.punishes==='run'&&lean==='run'){b.tend[off].run=0;result.reset='run'}
      if(play.id==='vertical_shot'&&lean==='quick'){b.tend[off].quick=0;result.reset='quick'}
      if(play.family==='run'&&lean==='deep'){b.tend[off].deep=0;result.reset='deep'}
      if((play.id==='screen'||play.id==='draw'||play.punishes==='pressure')&&heat){b.tend[def].pressure=0;result.reset='pressure'}
    }
  }
  result.after=situation(b);result.score={...g.score};
  b.lastResult=result;b.log.push({type:'snap',...result});
  chartDefenseCounter(b,result,play,call);
  b.snap=null;b.fourthGo=false;
  return result;
}
// On Fire: a playmaker who wins every duel he's in for three straight snaps gets a half-grade edge until he loses one.
const OFF_SKILL=['QB','RB','X','Z','SLOT','TE'],DEF_SKILL=['RUSH','SET','MIKE','WILL','FCB','BCB','NICKEL','FS','BOXS'];
function updateFire(b,off,def,snap,wins,events){
  const tally=new Map();
  snap.duels.forEach((d,i)=>{
    if(i>0&&!wins[0])return;
    for(const r of d.offRoles)if(OFF_SKILL.includes(r)){const p=b.teams[off].lineup.off[r];if(p){const t=tally.get(p.id)||{p,side:off,ok:true};t.ok=t.ok&&wins[i];tally.set(p.id,t)}}
    for(const r of d.defRoles)if(DEF_SKILL.includes(r)){const p=b.teams[def].lineup.def[r];if(p){const t=tally.get(p.id)||{p,side:def,ok:true};t.ok=t.ok&&!wins[i];tally.set(p.id,t)}}
  });
  for(const [id,t] of tally){
    if(t.ok){b.streaks[id]=(b.streaks[id]||0)+1;if(b.streaks[id]>=D.RULES.fireStreak&&!b.fire[id]){b.fire[id]=true;events.push({type:'fire',name:t.p.name,role:t.p.role,side:t.side,id})}}
    else{b.streaks[id]=0;if(b.fire[id]){delete b.fire[id];events.push({type:'cooled',name:t.p.name,role:t.p.role,side:t.side,id})}}
  }
}

function coachedSnapReview(b){
  const review=b?.coachedSnap,e=b?.log?.[review?.index];
  if(!e?.userCalled)return null;
  const pick=review.role==='off'?D.PLAYS[e.play]:D.CALLS[e.call];
  return{call:pick?.name,estimate:review.estimate,actual:e.penalty?e.text:e.category==='kick'?'Quick kick':snapResultLabel(e),
    detail:snapVerdict(e,b.user)?.detail,alternatives:[...(review.practice?.alternatives||[])]};
}
// Replay one archived snap with different tactics and the same sampled game conditions. Only the local resolver
// consumes a cloned RNG. Possession, records, rewards and the live battle are never written.
function practiceCoachedSnap(b,tactic){
  const review=b?.coachedSnap,practice=review?.practice,e=b?.log?.[review?.index];
  if(!e?.userCalled||!practice?.alternatives.includes(tactic))return null;
  const {context,rng,ownInfo,opposingDefense,opposingInfo,hurried}=practice;
  const tactics=tactic?[...ownInfo,tactic]:ownInfo,offense=review.role==='off';
  const situ=context.situation,adjusted=offense?{...context,offTactics:tactics,defTactics:tactic==='hurry_up'?opposingInfo:opposingDefense}:
    {...context,defTactics:hurried?ownInfo:tactics};
  const snap=R.buildSnap(adjusted),out=R.resolve(snap,DynastyRng.create(rng),situ);
  const yards=out.turnover==='interception'?0:Math.max(-situ.field,Math.min(100-situ.field,out.yards));
  const score={...situ.score};
  if(!out.turnover&&situ.field+yards>=100)score[e.offSide]+=6;
  else if(situ.field+yards<=0)score[e.defSide]+=2;
  const first=yards>=situ.distance&&!out.turnover;
  const after={down:first?1:situ.down+1,possession:out.turnover||!first&&situ.down===4?e.defSide:e.offSide};
  const sampled={...e,...out,turnover:out.turnover||null,checkdown:!!out.checkdown,text:'',duels:snap.duels,duelResults:out.duels,yards,score,after,
    offTactics:adjusted.offTactics,defTactics:adjusted.defTactics};
  const verdict=snapVerdict(sampled,b.user);
  return{actual:verdict?.result||snapResultLabel(sampled),detail:verdict?.detail};
}

// Two players run the same eight scripted snaps with the same teammates and draws. Count only
// assignments that reached their duel. A lost protection/blocking Gate can end the rep early.
function practiceRoleReps({lineup,role,players,seed}){
  const side=Object.hasOwn(D.OFF_ROLES,role)?'off':Object.hasOwn(D.DEF_ROLES,role)?'def':null;
  if(!side||players?.length!==2||!(lineup?.off?.QB||role==='QB'))return null;
  const plays=[...new Set([...D.DEFAULT_DECKS.off.base,...D.DEFAULT_DECKS.off.wrinkles])];
  const calls=D.DEFAULT_DECKS.def.base;
  const situations=[{down:1,distance:10,field:30},{down:2,distance:6,field:45},
    {down:3,distance:4,field:62},{down:3,distance:8,field:72}];
  const roles=`${side}Roles`,script=plays.flatMap((id,i)=>{
    const play=D.PLAYS[id],call=D.CALLS[calls[i%calls.length]],situation=situations[i%situations.length];
    const ctx={...lineup,[side]:{...lineup[side],[role]:players[0]},play,call,situation};
    return R.buildSnap(ctx).duels.some(d=>d[roles].includes(role))?[ctx]:[];
  });
  if(!script.length)return null;
  return players.map(player=>{
    const result={snaps:0,assignments:0,wins:0,conversions:0};
    for(let i=0;i<8;i++){
      const ctx=script[i%script.length],rng=DynastyRng.create(`${seed}:${i}`);
      const snap=R.buildSnap({...ctx,[side]:{...lineup[side],[role]:player},cornerRoll:rng.next()});
      const out=R.resolve(snap,rng,ctx.situation),yards=out.turnover==='interception'?0:out.yards;
      result.snaps++;
      if(!out.turnover&&yards>=ctx.situation.distance)result.conversions++;
      for(const [index,duel] of snap.duels.entries()){
        if(duel[roles].includes(role)){
          result.assignments++;
          if(out.wins[index]===(side==='off'))result.wins++;
        }
        if(index===0&&!out.wins[0])break;
      }
    }
    return result;
  });
}

// A reward tryout uses the players from a legal game snap, then rolls one isolated practice rep.
function tryRewardCard({battle,team,seed},id){
  const card=D.PLAYS[id]||D.CALLS[id]||D.TACTICS[id],user=battle?.user||'home';
  if(!card)return 'This card is unavailable for practice.';
  const teams=battle?.teams||{home:team,away:team},off=card.side==='off'?user:other(user),def=other(off);
  const offense=teams[off].lineup.off,defense=teams[def].lineup.def;
  const practiceSit={period:4,clock:160,down:card.fourthOnly?4:3,distance:5,field:55,score:{home:0,away:0}};
  function relevance(e){
    const play=D.PLAYS[e.play],call=D.CALLS[e.call];
    const fit=card.counters?.includes(play.family)||card.punishes&&(card.punishes===e.lean||card.punishes==='pressure'&&call.pressure)
      ||card.upgradeOf===play.id||id==='hurry_up'&&e.defTactics?.length
      ||id==='spy'&&Object.values(play.duels).some(d=>d.qbRun)||id==='max_protect'&&call.pressure
      ||['bracket','press','stunt','lock','disguise'].includes(id)&&play.pass
      ||id==='kill_kill'&&call.counters.includes(play.family);
    return (id==='out_and_up'&&e.cornerStep?2+e.cornerStep.outs:0)+(fit?2:0)+Number(e.sit.down>=3);
  }
  const candidates=(battle?.log||[]).filter(e=>e.type==='snap'&&e.offSide===off&&e.sit.period<=4&&D.PLAYS[e.play]&&D.CALLS[e.call])
    .sort((a,b)=>relevance(b)-relevance(a));
  const fallbacks=['quick_slant','inside_zone','power','deep_cross'].map(play=>({play,call:'cover3',sit:practiceSit}));
  let selected,blocked;
  for(const e of [...candidates,...fallbacks]){
    const fromFilm=!!e.offSide,players=fromFilm?snapLineup(battle,e,'off'):offense,coverage=fromFilm?snapLineup(battle,e,'def'):defense;
    const play=D.PLAYS[id]||D.PLAYS[e.play],call=D.CALLS[id]||D.CALLS[e.call];
    blocked=R.playBlocked(play,players,e.sit)||R.signatureBlocked(card,card.side==='off'?players:coverage)
      ||(D.TACTICS[id]&&card.side==='off'&&R.tacticBlocked(card,play,players));
    if(blocked)continue;
    selected={e,fromFilm,players,coverage,play,call};break;
  }
  if(!selected)return 'Practice unavailable with this lineup. '+blocked+'.';
  const {e,fromFilm,players,coverage,play,call}=selected,sit=e.sit;
  const b=create({home:teams.home,away:teams.away,seed:(seed||battle?.seed||'reward')+':tryout:'+off+':'+sit.period+':'+sit.clock,weather:battle?.weather||'clear'});
  Engine.startGame(b.game);
  b.teams[off].lineup.off=clone(players);b.teams[def].lineup.def=clone(coverage);
  Object.assign(b.game,{possession:off,fieldPosition:sit.field,down:sit.down,distance:sit.distance,period:sit.period,clock:sit.clock,score:{...sit.score}});
  if(card.special){
    const g=b.game;g.period=4;g.clock=120;g.fieldPosition=99;g.score={[off]:8,[def]:16};
    b.decks[user].off.tactics=[id];armSpecials(b,user);
    if(card.special==='onside'){
      Engine.kickoffTo(g,def);
      return 'Special teams practice · Q4, down 8. '+card.name+': '+(g.events.at(-1).recovered?'your hands team recovered the kick.':'the receiving team covered the kick.');
    }
    Engine.applyScrimmage(g,{yards:1,clock:4,kind:'rush'});
    const tryEvent=g.events.findLast(ev=>ev.type==='two_point'&&ev.gate);
    return 'Special teams practice · Q4, down 2 after a touchdown. '+card.name+': '+(tryEvent?.made?'the two-point try was good.':'the two-point try failed.');
  }
  if(fromFilm){
    b.log=battle.log.slice(0,battle.log.indexOf(e));
    if(e.lean)b.tend[off][e.lean]=b.teams[def].coach.discipline??4;
    if(e.heat)b.tend[def].pressure=3;
    if(battle.form)b.form={...battle.form};
  }
  b.decks[off].off.tactics=b.decks[off].off.tactics.filter(t=>!D.TACTICS[t]?.special);
  const offTactics=(e.offTactics||[]).filter(t=>D.TACTICS[t]&&!R.tacticBlocked(D.TACTICS[t],play,players));
  const defTactics=e.defTactics||[];
  b.snap={grouping:e.grouping||'11',off:{play:play.id,tactics:card.side==='def'?offTactics:[]},
    def:{play:call.id,tactics:card.side==='off'?defTactics:[]},offInfo:card.side==='def'?[...(e.offInfo||[])]:[],defInfo:card.side==='off'?[...(e.defInfo||[])]:[],
    offLook:{},twoDown:!!e.twoDown,motionConfirmed:card.side==='def'&&!!e.offInfo?.includes('motion')};
  if(play.id===e.play&&R.targetOptions(play,players).some(t=>t.role===e.primaryTarget))b.snap.off.target=e.primaryTarget;
  if(e.edgeAssignment)b.snap.def.edgeAssignment=e.edgeAssignment;
  if(play.id===e.play&&e.meshChoice)b.snap.off.meshChoice=e.meshChoice;
  if(e.bracketRole&&b.snap.def.tactics.includes('bracket'))b.snap.def.bracketRole=e.bracketRole;
  b.snap.look=lookFor(b,b.snap.def);
  const context=fromFilm?'Game film vs '+teams[other(user)].name:'Practice field · '+(battle?'game-day lineups':'current roster scrimmage');
  const label=context+' · Q'+sit.period+', '+['','1st','2nd','3rd','4th'][sit.down]+' & '+sit.distance+'. ';
  if(card.info){
    b.hands[user]={role:card.side,command:card.cost,tactics:[id],onceUsed:[]};
    applyInfo(b,user,id);
    const facts=card.side==='off'?b.snap.look:b.snap.offLook;
    const fields=card.side==='def'?(id==='film_tell'?['family']:['protection']):id==='motion'?['coverage']:id==='hard_count'?['pressure']:id==='check_with_me'?['shell','pressure','coverage']:card.reveal||[];
    const read=fields.filter(k=>facts[k]?.confirmed).map(k=>k==='pressure'?(facts[k].value?'pressure coming':'no extra rush'):k==='protection'?(facts[k].value?'max protection':'no max protection'):k==='shell'?facts[k].value+'-high shell':facts[k].value+' '+(k==='family'?'play':k)).join(', ');
    return label+'Practice read with '+card.name+': '+(b.snap.falseStart?'false start on the offense.':read+'.');
  }
  if(D.TACTICS[id])b.snap[card.side].tactics.push(id);
  if(TIMEOUT_CARDS.includes(id)&&b.game.timeouts)b.game.timeouts[user]--;
  const odds=tryoutOdds(b,card,e);
  const result=resolveSnap(b);
  const actual=fromFilm?' In the game: '+D.PLAYS[e.play].name+', '+(e.penalty?e.penalty.label:e.turnover||({inc:'incomplete',punt:'punt'}[e.kind])||((Number(e.yards)||0)+' yards'))+'.':'';
  return label+(odds?odds+' ':'')+'Practice result · '+card.name+' vs '+(card.side==='off'?call.name:play.name)+(odds?' (one rep)':'')+'. '+result.text+actual;
}
// Scrimmage estimates exclude flags and kicks. Neither evaluation advances an RNG.
function tryoutOdds(b,card,e){
  const s=b.snap,sit=situation(b),id=card.id;
  let baseOff=s.off,baseDef=s.def,baseName='Without it';
  if(D.TACTICS[id]){
    if(card.side==='off')baseOff={...s.off,tactics:s.off.tactics.filter(t=>t!==id)};
    else baseDef={...s.def,tactics:s.def.tactics.filter(t=>t!==id)};
  }else if(card.side==='off'){
    const original=D.PLAYS[e.play],players=b.teams[offSide(b)].lineup.off;
    if(original.id===id||R.playBlocked(original,players,sit))return '';
    const target=R.targetOptions(original,players).some(t=>t.role===e.primaryTarget)?e.primaryTarget:null;
    baseOff={...s.off,play:original.id,target};baseName=original.name;
  }else{
    if(e.call===id)return '';
    baseDef={...s.def,play:e.call};baseName=D.CALLS[e.call].name;
  }
  if(D.PLAYS[s.off.play].quickKick||D.PLAYS[baseOff.play].quickKick)return '';
  const base=committedSnap(b,sit,baseOff,baseDef),withCard=committedSnap(b,sit,s.off,s.def);
  const pct=v=>Math.round(v*100)+'%',goal=sit.down>=3?'convert':'gain a first down';
  const line=snap=>{
    const odds=R.evaluate(snap,sit);
    return `${pct(odds.first)} to ${goal}${odds.sack>=.01?', '+pct(odds.sack)+' sack':''}${odds.turnover>=.01?', '+pct(odds.turnover)+' turnover':''}`;
  };
  const who=card.side==='off'?'Your odds':'Their odds',g0=base.duels[0],g1=withCard.duels[0];
  const gate=g0.label===g1.label&&g1.offNames[0]&&g1.defNames[0]?` ${g1.label}: ${g1.offNames[0]} vs ${g1.defNames[0]}, ${g0.chip===g1.chip?g1.chip:g0.chip+' → '+g1.chip}.`:'';
  return `${who} on this snap · ${card.name}: ${line(withCard)}. ${baseName}: ${line(base)}. Estimates exclude penalties.${gate}`;
}

function yardLine(f){return f>50?`opp ${100-f}`:f===50?'50':`own ${f}`}
function storyLine(b,off,def,play,out,before,edgeAssignment){
  const T=b.teams[off].lineup.off,DT=b.teams[def].lineup.def,P=out.participants;
  const nm=r=>T[r]?.name||r,dn=r=>DT[r]?.name||r;
  const reached=out.wins[0]?out.duels:out.duels.slice(0,1);
  const why=reached.map(d=>`${d.label} ${d.won?'✓':'✗'}`).join(' · ')+(out.wins[0]?'':' · Key and Finish not reached');
  let what;
  if(out.turnover==='interception')what=`${nm('QB')} intercepted by ${dn(P.defender)}`;
  else if(out.kind==='sack')what=`${nm('QB')} sacked by ${dn(P.sacker)}, ${out.yards}`+(out.turnover?' — fumble, recovered by the defense':'');
  else if(play.id==='spike')what=`${nm('QB')} spikes it to stop the clock`;
  else if(out.kind==='inc')what=`${nm('QB')} incomplete to ${nm(P.target)}`;
  else if(out.checkdown)what=`${nm('QB')} checks down to ${nm(P.target)} for ${out.yards}`;
  else if(out.kind==='catch')what=`${nm('QB')} to ${nm(P.target)} for ${out.yards}`;
  else what=`${nm(P.carrier)} ${out.kind==='scramble'?'scrambles':'runs'} for ${out.yards}`+(out.turnover?' — fumble, lost':'');
  if(!out.turnover){
    if(b.game.score[off]-before.score[off]>=6)what+=' — touchdown';
    else if(b.game.score[def]-before.score[def]===2)what+=' — safety';
    else if(before.down===4&&out.yards<before.distance)what+=' — turnover on downs';
  }
  const fit=edgeAssignment==='crash'?`${dn('SET')} crashes on the back. ${dn('WILL')} scrapes for the quarterback. `:edgeAssignment==='contain'?`${dn('SET')} contains the quarterback. ${dn('WILL')} fills inside for the back. `:'';
  const mesh=edgeAssignment?(play.carrier==='QB'?'Keeper outside. ':'Handoff inside. '):'';
  return`${play.name}: ${fit}${mesh}${what}. ${why}`;
}
function pstat(b,side,role,lineupKey){
  const p=b.teams[side].lineup[lineupKey][role];if(!p)return null;
  return b.players[p.id]??=(b.players[p.id]={id:p.id,name:p.name,side,role,archetype:p.archetype,rushAtt:0,rushYds:0,rushTD:0,passAtt:0,comp:0,passYds:0,passTD:0,ints:0,targets:0,rec:0,recYds:0,recTD:0,sacks:0,tackles:0,intDef:0,sacksTaken:0});
}
function recordStats(b,off,def,out,before){
  const bo=b.box[off],P=out.participants,g=b.game;
  const td=g.score[off]-before.score[off]>=6&&!out.turnover;
  bo.plays++;
  if(before.down===3){bo.thirdAtt++}if(before.down===4){bo.fourthAtt++}
  const gained=!out.turnover&&out.yards>=before.distance;
  if(gained){bo.firstDowns++;if(before.down===3)bo.thirdConv++;if(before.down===4)bo.fourthConv++}
  if(out.yards>=20&&!out.turnover)bo.explosives++;
  if(out.kind==='sack'){bo.sacks++;bo.rushAtt++;bo.rushYds+=out.yards;bo.yards+=out.yards;const q=pstat(b,off,'QB','off');q.sacksTaken++;q.rushAtt++;q.rushYds+=out.yards;const s=pstat(b,def,P.sacker,'def');if(s){s.sacks++;s.tackles++}}
  else if(out.engineKind==='pass'){
    bo.passAtt++;const q=pstat(b,off,'QB','off');q.passAtt++;const t=pstat(b,off,P.target,'off');if(t)t.targets++;
    if(out.completed){bo.comp++;bo.passYds+=out.yards;bo.yards+=out.yards;q.comp++;q.passYds+=out.yards;if(t){t.rec++;t.recYds+=out.yards}if(td){q.passTD++;if(t)t.recTD++}const d=pstat(b,def,P.defender,'def');if(d&&!td)d.tackles++}
    if(out.turnover==='interception'){bo.ints++;q.ints++;const d=pstat(b,def,P.defender,'def');if(d)d.intDef++}
  }else{
    bo.rushAtt++;bo.rushYds+=out.yards;bo.yards+=out.yards;const c=pstat(b,off,P.carrier,'off');if(c){c.rushAtt++;c.rushYds+=out.yards;if(td)c.rushTD++}
    if(out.turnover==='fumble')bo.fumbles++;const d=pstat(b,def,P.defender,'def');if(d&&!td)d.tackles++;
  }
  if(out.kind==='sack'&&out.turnover==='fumble')bo.fumbles++;
}
function finalize(b){
  if(b.final)return;b.final={score:{...b.game.score},winner:b.game.score.home>b.game.score.away?'home':'away'};
  for(const side of ['home','away'])if(b._starterLineup?.[side])applyRestLineup(b,side,false);
  // Postgame rewards and evolution read the regular starters. Recorded snaps
  // keep their package IDs and continue to resolve through snapLineup.
  for(const team of Object.values(b.teams)){
    if(team.packageStarters){
      for(const role of PACKAGE_ROLES){if(team.packageStarters[role])team.lineup.off[role]=team.packageStarters[role];else delete team.lineup.off[role]}
    }
  }
  try{Engine.validateGame(b.game)}catch(e){b.final.engineError=e.message}
}

// Projection for the sandbox: what the person's current choice is expected to do against the Look.
function preview(b,side,choice){
  const req=b.pending;if(!req||req.side!==side)return null;
  const role=b.hands[side].role,sit=situation(b);
  if(role==='off'){
    const printed=D.PLAYS[choice.play];if(!printed)return null;
    const play=R.targetedPlay(printed,choice.target,b.teams[side].lineup.off);
    const call=presumedCall(b.snap.look,true);
    const snap=R.buildSnap({weather:b.weather,...edgesFor(b,side),off:b.teams[side].lineup.off,def:b.teams[other(side)].lineup.def,play,...knownEffects(b,play,call),call,offTactics:activeTactics(b,'off',choice.tactics||[]),read:choice.read||'auto',situation:sit,lean:req.look?.lean?.confirmed?req.look.lean.value:null,heat:!!req.look?.heat,motionConfirmed:b.snap.motionConfirmed});
    return{snap,ev:R.evaluate(snap,sit),against:call};
  }
  const call=D.CALLS[choice.play];if(!call)return null;
  const fam=b.snap.offLook.family.confirmed?b.snap.offLook.family.value:null,w=offFamilyWeights(b.game,b.tend[offSide(b)],fam),out=[];
  for(const f of OFF_FAMILIES){if(w[f]<.02)continue;const id=REP_PLAYS[f].find(x=>!R.playBlocked(D.PLAYS[x],b.teams[other(side)].lineup.off));if(!id)continue;
    const snap=R.buildSnap({weather:b.weather,...edgesFor(b,other(side)),off:b.teams[other(side)].lineup.off,def:b.teams[side].lineup.def,play:D.PLAYS[id],...knownEffects(b,D.PLAYS[id],call),call,bracketRole:choice.bracketRole||req.options.bracketPlan?.role,edgeAssignment:choice.edgeAssignment,defTactics:activeTactics(b,'def',choice.tactics||[]),offTactics:b.snap.offLook.protection?.confirmed&&b.snap.offLook.protection.value?['max_protect']:[],read:autoRead(sit),situation:sit,lean:leanFor(b),heat:heatFor(b)});
    out.push({family:f,weight:w[f],play:id,snap,ev:R.evaluate(snap,sit)})}
  return{vs:out};
}
// Check the printed card rule against public facts only. Unknown does not mean false (notably a hidden spy).
function signatureRead(req,card,play){
  const m=card.signatureMatchup;if(!m)return null;
  const facts={},off=req.role==='off';
  if(off){
    for(const k of ['box','shell','coverage','pressure'])if(req.look?.[k]?.confirmed)facts[k]=req.look[k].value;
    facts.origin=play.evolvedFrom||play.upgradeOf||play.id;facts.family=play.family;facts.qbRead=!!play.duels?.[m.duel]?.qbRead;
  }else if(req.offLook?.family?.confirmed)facts.family=req.offLook.family.value;
  const matches=when=>{
    let result=true;
    for(const [k,v] of Object.entries(when)){
      if(k==='origin'&&!off&&facts.family&&D.PLAYS[v]?.family!==facts.family)return false;
      if(!(k in facts))result=null;else if(facts[k]!==v)return false;
    }
    return result;
  };
  const scope=matches(m.scope),counter=matches(m.counter.when),edge=matches(m.edge.when);
  if(scope===false)return null;
  if(scope===true&&counter===true)return{bad:true,text:`${m.label}: ${m.counter.label} gives you −1 here.`};
  if(scope===true&&edge===true&&counter===false)return{text:`${m.label}: ${m.edge.label} gives you +${m.gain} here.`};
  return (edge!==false||counter!==false)?{conditional:true,text:'If the matchup fits: '+card.matchupText}:null;
}
const needsProtection=c=>!!c.protection||Object.values(c.duels||{}).some(d=>d.protect);
// Shared between the two call boards. A shown or historically likely rush is not a live bonus for a Draw.
function counterBadge(req,card){
  if(req?.kind!=='snap'||!card)return null;
  if(req.role==='def'){
    const family=req.offLook?.family;
    return family?.confirmed&&card.counters?.includes(family.value)?'COUNTERS THEIR CALL':null;
  }
  const l=req.look||{},rush=l.pressure?.confirmed&&l.pressure.value,lean=l.lean?.confirmed&&l.lean.value;
  const root=card.evolvedFrom||card.upgradeOf||card.id;
  if(rush&&(root==='screen'||card.matchups?.some(m=>m.when==='pressure'&&m.v>0)))return 'BEATS THE BLITZ';
  if(lean&&((card.punishes===lean&&!(rush&&needsProtection(card)))||(lean==='quick'&&card.id==='vertical_shot'&&!rush)))return 'COUNTERS THEIR READ';
  return l.heat&&root==='screen'?'PRESSURE TENDENCY':null;
}
// One reason tied to this card and public evidence. Never inspect the opponent's committed card or ratings.
function callReason(req,c){
  if(req?.kind!=='snap'||!c)return '';
  const sig=signatureRead(req,c,c);if(sig)return sig.text;
  const known=k=>req.look?.[k]?.confirmed?req.look[k].value:null;
  const fam=req.offLook?.family?.confirmed?req.offLook.family.value:null;
  if(req.role==='def'){
    if(!fam)return '';
    if(fam==='run'&&c.box==='loaded')return 'Film shows run. The loaded box makes their first block harder.';
    if(fam==='run'&&c.box==='light')return 'Film shows run. The light box gives their blockers a head start.';
    if(c.counters?.includes(fam))return `Film shows ${fam}. This call is built to disrupt their Key duel.`;
    if(fam==='deep'&&c.shell===2)return 'Film shows a deep pass. Two deep safeties make separation harder.';
    return '';
  }
  if(c.quickKick||c.id==='spike')return '';
  const box=known('box'),shell=known('shell'),rush=known('pressure'),coverage=known('coverage')||(!req.look?.coverage?.confirmed?req.look?.covTend:null),lean=known('lean');
  const origin=c.evolvedFrom||c.upgradeOf||c.id;
  if(origin==='qb_sneak')return box==='loaded'?'The box is loaded. Your center and guards must move the interior front.':box==='light'?'The light box helps your line clear a yard or two for the QB.':'The QB follows the center for a short gain.';
  if(lean&&c.punishes===lean)return `${leanRead(lean)}. That helps this counter at the Key.`;
  const match=(c.matchups||[]).find(m=>({pressure:rush===true,shell1:shell===1,shell2:shell===2,man:coverage==='man',zone:coverage==='zone',loaded:box==='loaded',light:box==='light'})[m.when]);
  if(match){
    const tell={pressure:'confirmed rush',shell1:'confirmed single-high shell',shell2:'confirmed two-high shell',man:known('coverage')?'confirmed man coverage':'man-coverage tendency',zone:known('coverage')?'confirmed zone coverage':'zone-coverage tendency',loaded:'confirmed loaded box',light:'confirmed light box'}[match.when];
    return `The ${tell} gives this design ${match.v>0?'help':'trouble'} on ${c.duels[match.duel].label.toLowerCase()}.`;
  }
  if(c.family==='run'&&box==='light')return 'The light box helps your blockers at the Gate.';
  if(c.family==='run'&&box==='loaded')return 'The loaded box gives your blockers a tougher Gate.';
  if(c.family==='deep'&&shell===2)return 'Two deep safeties make the Key matchup harder.';
  if(c.family==='deep'&&shell===0)return 'No deep safety helps your receiver at the Key.';
  if(origin==='pa_boot'&&box==='loaded')return 'Crowded linebackers give the run fake help at the Key.';
  if(origin==='screen'&&rush===true)return 'The confirmed rush helps the screen at the Gate.';
  if(c.family==='quick'&&coverage==='man')return `${known('coverage')?'Tight man coverage':'Their man-coverage tendency'} makes the release harder at the Gate.`;
  if(rush===true&&Object.values(c.duels||{}).some(d=>d.protect))return 'Confirmed pressure gives your blockers less time to protect the passer.';
  if(c.family==='deep'&&req.situation?.field>=80)return 'Inside the 20, there is less room to get open deep.';
  return '';
}
// Suggest at most one affordable, useful card. A selected card is explained even if a later play change made it a bad fit.
function tacticRead(req,playId,lineup={},selected=[],primaryTarget,b=null,fog=false,read='auto'){
  const o=req?.options,p=o?.plays?.find(x=>x.id===playId);
  if(req?.kind!=='snap'||!p||p.blocked)return null;
  const off=req.role==='off',card=p.card||(off?D.PLAYS:D.CALLS)[p.id];
  if(!card)return null;
  const play=off?R.targetedPlay(card,primaryTarget,lineup):card;
  // On a live battle without scouting fog, suggest the affordable tactic that moves the public projection most.
  // Under fog, never call publicRead/buildSnap; rank duel-changing tactics ahead of info cards in the fallback loop.
  const base=b?.game&&off&&!fog&&!selected.length?publicRead(b,req,p.id,undefined,primaryTarget,[],read):null;
  if(base){
    let best=null;
    for(const t of o.tactics||[]){
      const tc=t.card||D.TACTICS[t.id];
      if(!tc||tc.info||p.cost+t.cost>o.command||R.tacticBlocked(tc,play,lineup))continue;
      const r=publicRead(b,req,p.id,undefined,primaryTarget,[t.id],read);
      const gain=r.u-base.u;
      if(gain>.25&&(!best||gain>best.gain))best={t,tc,gain,r};
    }
    if(best){
      const pct=x=>Math.round(x*100)+'%',before=base.ev,after=best.r.ev;
      const why={seal_block:'An extra block helps win the Gate before the runner cuts.',max_protect:'Extra protection buys the passer time, but leaves one fewer route to finish.'}[best.t.id]||best.tc.text;
      let effect=`Projected yards ${before.yards.toFixed(1)} → ${after.yards.toFixed(1)}.`;
      if(Math.round(after.first*100)>Math.round(before.first*100))effect=`Projected first down ${pct(before.first)} → ${pct(after.first)}.`;
      else if(Math.round(after.turnover*100)<Math.round(before.turnover*100))effect=`Projected turnover risk ${pct(before.turnover)} → ${pct(after.turnover)}.`;
      return{id:best.t.id,name:best.tc.name,cost:best.t.cost,reason:fog?why:why+' '+effect,selected:false};
    }
  }
  const l=req.look||{},family=req.offLook?.family,duels=Object.values(play.duels||{});
  const target=duels.find(d=>(d.release||d.separation)&&d.off.includes(play.target));
  function reason(t){
    switch(t.id){
      case 'seal_block':return 'An extra block helps win the Gate before the runner cuts.';
      case 'max_protect':return duels.some(d=>d.protect)?'Extra protection buys the passer time, but leaves one fewer route to finish.':'';
      case 'route_adjust':return target?`Adjust the route for ${target.label.toLowerCase()}${req.info?.includes('motion')?'; Motion has already read the coverage':''}.`:'';
      case 'motion':return !l.coverage?.confirmed&&(target||play.matchups?.some(m=>['man','zone'].includes(m.when)))?'Send a man across to find out if they follow him.':'';
      case 'hard_count':return l.pressure?.value&&!l.pressure.confirmed?'Test whether the shown rush is real before committing.':'';
      case 'check_with_me':case 'audible':return !l.shell?.confirmed&&play.family==='deep'?'Confirm the safeties before taking the deep shot.':'';
      case 'film_tell':return !family?.confirmed?'Find out whether to defend a run, quick pass, deep shot or counter.':'';
      case 'identify_protection':return play.pressure&&!req.offLook?.protection?.confirmed?'Check for extra blockers before sending pressure.':'';
      case 'press':case 'lock':return family?.confirmed&&family.value==='quick'?'Crowd their receivers if the quick throw starts with a release duel.':'';
      case 'stunt':return family?.confirmed&&family.value==='deep'?'Twist the rushers if the deep route needs protection.':'';
      case 'bracket':return !off?'Take away their primary receiver so the quarterback has to win elsewhere.':'';
      case 'timeout_settle':case 'timeout_ice':return req.situation?.down>=3?'Spend a timeout for help on the Key duel this down.':'';
      default:return '';
    }
  }
  const hand=o.tactics||[],isSelected=selected.length>0;
  const ordered=isSelected?selected.map(i=>hand.find(t=>t.slot===i)).filter(Boolean):[...hand].sort((a,c)=>((a.card||D.TACTICS[a.id])?.info?1:0)-((c.card||D.TACTICS[c.id])?.info?1:0));
  for(const t of ordered){
    const card=t.card||D.TACTICS[t.id];if(!card)continue;
    const blocked=R.signatureBlocked(card,lineup)||(off&&!card.info&&R.tacticBlocked(card,play,lineup));
    if(!isSelected&&(blocked||p.cost+t.cost>o.command||play.quickKick||play.id==='spike'))continue;
    const sig=signatureRead(req,card,play);
    if(!isSelected&&sig?.bad)continue;
    let why=blocked||(!sig?.conditional&&sig?.text)||reason(t);
    if(!why&&card.signature&&off){
      // Only name a base effect when its actual flag and phase belong to this play.
      const duel=Object.entries(play.duels||{}).find(([k,d])=>card.effects?.some(e=>e.v>0&&(!e.duel||e.duel===k)&&(e.flag==='run'?play.family==='run':!!d[e.flag])));
      if(duel)why=`${card.signature.name} gives you help on ${duel[1].label.toLowerCase()}.`;
    }
    if(!why&&sig?.conditional&&isSelected)why=sig.text;
    if(!why&&!isSelected)continue;
    if(!why&&t.id==='max_protect')why='No protection duel to help. You still lose a receiver: one fewer route at the Finish.';
    if(!why&&TIMEOUT_CARDS.includes(t.id))why='Spends a timeout but gives no Key bonus on this down.';
    if(!why)why=t.id==='route_adjust'?'This play has no target release or separation to adjust.':card.text;
    return{id:t.id,name:card.name,cost:t.cost,reason:why,selected:isSelected};
  }
  return null;
}
// The run and the boot share a mesh. Price the companion from the current hand and use only public reads.
function sameLookPair(b,req,id){
  if(req?.kind!=='snap')return null;
  const offense=req.role==='off',side=offense?req.side:other(req.side);
  const line=b.teams[side].lineup.off,def=b.teams[other(side)].lineup.def;
  const mike=def.MIKE?.name||'the middle linebacker',edge=def.SET?.name||'the edge defender';
  if(!offense){
    const families=b.drive?.key===driveKey(b.game,side)?b.drive.fams||[]:[];
    if(families.length<2||!families.slice(-2).every(f=>f==='run'))return null;
    return {title:'Two straight runs',read:`On the give, ${mike} fits the crease. If they fake it, ${edge} can stop the rollout before the throw.`};
  }
  const root=id=>{const c=D.PLAYS[id];return c?.evolvedFrom||c?.upgradeOf||id};
  const base=root(id);
  const pairs={qb_sneak:'te_pop_pass',te_pop_pass:'qb_sneak',inside_zone:'pa_boot',pa_boot:'inside_zone',quick_out:'out_and_up',out_and_up:'quick_out'};
  const mate=pairs[base],hand=req.options;
  if(!mate)return null;
  const matches=hand.plays.filter(p=>root(p.id)===mate);
  const option=matches.find(p=>!p.blocked&&p.cost<=hand.command)||matches[0];
  const name=option?D.PLAYS[option.id].name:D.PLAYS[mate].name;
  const reason=!option?'Outside this hand.':option.blocked||(option.cost>hand.command?'Insufficient Command.':'');
  if(base==='qb_sneak'||base==='te_pop_pass'){
    const inline=line.TE?.pos==='TE'?line.TE.name:'an inline tight end';
    const ready=popPassReady(b,side),combo=comboFor(b,D.PLAYS.te_pop_pass);
    const setup=!ready?'Keep the ball after the sneak to put the pop pass on your next call sheet.':
      combo?.id==='sell_the_sneak'?'Sell the Sneak is ready. The first pop pass off a sneak this half earns +1 Key and returns 1 Command.':
      'The sneak opened the pop pass again. Its combo reward has been used this half.';
    const missing=mate==='qb_sneak'?'Only with one or two yards to gain.':'Opens after the sneak.';
    return {title:'QB Sneak / TE Pop Pass',diagrams:['qb_sneak','te_pop_pass'],setup,
      read:`The quarterback follows the center on the sneak. On the fake, ${inline} slips behind ${mike}. A loaded front opens that window. A light box can take it away.`,
      mate:{id:option?.id||mate,name,cost:option?.cost,reason:option?reason:missing}};
  }
  if(base==='quick_out'||base==='out_and_up'){
    const receiver=line.X?.name||'X',corner=def.BCB?.name||'the boundary corner',look=setupLook(b,side),away=look.elsewhere;
    const canHold=!!away&&b.pending===req&&!b.snap?.off;
    const setup=away?`${corner} saw ${away.outs}/2 quick outs from ${away.name}. ${look.outs?`He has seen ${look.outs}/2 from your current ${look.name}.`:`This down you are in ${look.name}, so his read of the out starts over.`}`
      :`Quick outs completed against ${corner} from ${look.name} in your last eight snaps: ${look.outs}/2. ${look.outs===2?'He has seen it twice and may jump it.':'Counts are separate for each grouping. Quick Out keeps the double move in hand.'}`;
    return {title:'Quick Out / Out-and-Up',read:`${receiver} breaks toward the sideline on both calls. On the double move he plants and goes deep. Watch whether ${corner} drives on his break.`,
      setup,diagrams:['quick_out','out_and_up'],mate:{id:option?.id||mate,name,cost:option?.cost,reason},
      ...(canHold?{hold:{grouping:away.grouping,name:away.name,outs:away.outs}}:{})};
  }
  const rb=line.RB?.name||'your back',qb=line.QB?.name||'your quarterback';
  const ready=comboFor(b,D.PLAYS.pa_boot)?.id==='establish';
  const half=b.game.period<=2?1:b.game.period<=4?2:3;
  const spent=b.comboLog?.[side]?.[half]?.includes('establish');
  const setup=ready?'Two straight runs set up +1 Key on the next boot.':spent?'Establish the Run has been used this half.':'Two straight runs on this drive set up +1 Key on the following boot.';
  const lean=req.look?.lean,box=req.look?.box;
  const tell=lean?.confirmed&&lean.value==='run'?'The defense is leaning run. The fake gets help.':
    box?.confirmed&&box.value==='loaded'?'The loaded box crowds the give and helps sell the fake.':
    box?.confirmed&&box.value==='light'?'The light box helps the inside run.':'';
  return {title:'Inside Zone / PA Boot',read:`${qb} shows the ball to ${rb} on both calls. Give it and ${rb} reads the crease against ${mike}. Keep it and ${edge} must get past ${line.TE?.pos==='WR'?'an inline tight end':line.TE?.name||'the tight end'} to stop the boot.`,
    setup:[setup,tell].filter(Boolean).join(' '),
    mate:{id:option?.id||mate,name,cost:option?.cost,reason}};
}
// Coaching cues deliberately accept only the public request, never the hidden call or opponent traits.
function coachingRead(req,playId){
  if(req?.kind!=='snap')return[];
  const cues=[],play=(req.role==='off'?D.PLAYS:D.CALLS)[playId];
  const fit=callReason(req,play);if(fit)return [play.name+': '+fit];
  if(play&&req.role==='off'){
    if(play.quickKick||play.id==='spike')return [play.name+': '+play.text];
    cues.push(`${play.name}: start with ${play.duels.G.label.toLowerCase()} at the Gate.`);
  }else if(play)cues.push(`${play.name}: ${play.text}`);
  if(req.role==='off'){
    const l=req.look;
    if(l.lean.confirmed&&l.lean.value)cues.push(`${leanRead(l.lean.value)}. Look for a counter.`);
    if(l.box.confirmed&&l.box.value==='loaded')cues.push(play?.family==='run'?'Loaded box: your run has a tougher Gate. Consider changing the picture.':'Loaded box: fewer defenders are available behind the front.');
    if(l.box.confirmed&&l.box.value==='light')cues.push('Light box: a run gets help at the Gate.');
    if(l.heat&&l.pressure.confirmed&&!l.pressure.value)cues.push('They rushed often on film, but the current read confirms no extra rush.');
    else if(l.pressure.value||l.heat)cues.push(`${l.pressure.confirmed?'Confirmed pressure':l.heat?'Repeated pressure on film':'Pressure shown, not confirmed'}: protection or a screen may help.`);
    if(l.shell.confirmed&&l.shell.value===2)cues.push('Two deep safeties: deep routes face a tougher Key duel.');
    if(l.shell.confirmed&&l.shell.value===0)cues.push('No deep safety: a deep shot has help at the Key, if protection holds.');
    if(!l.coverage?.confirmed&&l.covTend)cues.push(`${l.covTend==='man'?'Man':'Zone'} coverage tendency on film.`);
    if(cues.length===(play?1:0))cues.push('No clear tell yet. Motion can confirm coverage; an unconfirmed shell may be a disguise.');
  }else{
    const f=req.offLook?.family;
    if(f?.confirmed)cues.push(`Film confirms ${f.value}. Match your call to that family.`);
    const counts=Object.entries(req.offTendency||{}).filter(([f])=>OFF_FAMILIES.includes(f)).sort((a,c)=>c[1]-a[1]);
    if(counts[0]?.[1]>=3)cues.push(`They have called ${counts[0][0]} ${counts[0][1]} times. That is a tendency, not a promise.`);
    if(req.lean)cues.push(`${leanRead(req.lean,false)}. Watch for a counter.`);
    if(!cues.length)cues.push('Little film yet. Use down and distance, or Film Tell to identify the play family.');
  }
  return cues.slice(0,2);
}
function explainSnap(e){
  if(!e)return null;
  if(e.penalty)return{summary:e.text,detail:'Flag on the play; no duel credit awarded.'};
  if(!e.duelResults?.length)return null;
  const {reached,index:at,result}=snapEvidence(e),d=e.duels?.[at];
  if(!d)return null;
  const won=reached[at].won;
  const names=won?d.offNames:d.defNames,opponents=won?d.defNames:d.offNames;
  const edge=d.mods.filter(m=>m.src!=='Play design'&&(m.v>0)===won).sort((a,c)=>Math.abs(c.v)-Math.abs(a.v))[0];
  const notes=[];
  if(e.offInfo?.includes('motion')&&!e.duels.some(d=>d.mods.some(m=>m.src==='Motion')))notes.push('Motion confirmed coverage. This call had no release or separation duel for the primary.');
  if(e.defInfo?.includes('identify_protection')&&!e.duels.some(d=>d.mods.some(m=>m.src==='Aimed pressure')))notes.push('Identify Protection read the blockers. Aimed pressure needs an extra rusher and a protection duel.');
  const duelSummary=`${d.label}: ${names.join(' & ')} beat ${opponents.join(' & ')}.`;
  return{result,duelSummary,summary:`${result}. ${duelSummary}`,
    detail:`${reached.map(d=>`${d.key} ${d.won?'won':'lost'}`).join(' · ')}${reached.length===1?' · Key and Finish not reached':''}${edge?` · Edge: ${edge.src.replace(/ \(health \d+\)/g,'')}`:''}${notes.length?' · '+notes.join(' '):''}`};
}

// Presentation-only evidence: these helpers never draw RNG or change the battle.
function matchupStory(e){
  if(!e||e.penalty||e.category==='kick'||!e.duelResults?.length)return null;
  const {reached,index:i,recovery,result}=snapEvidence(e),d=e.duels?.[i];
  if(!d)return null;
  const offWon=!!reached[i].won,winnerSide=offWon?e.offSide:e.defSide;
  const names=(offWon?d.offNames:d.defNames)||[],losers=(offWon?d.defNames:d.offNames)||[];
  const ratingEdge=Number.isFinite(d.offGrade)&&Number.isFinite(d.defGrade)?d.offGrade-d.defGrade:null;
  const setupEdge=(d.mods||[]).reduce((n,m)=>n+(Number(m.v)||0),0),sign=offWon?1:-1;
  let detail='A favorable matchup improves the odds; it never guarantees the duel.';
  if(ratingEdge!==null){
    if(sign*(ratingEdge+setupEdge)<0){
      // Name the favored side: "the other side" read as the opponent to the coach whose player lost.
      const lp=Number.isFinite(d.p)?Math.round(100*(offWon?1-d.p:d.p)):null,who=losers.filter(Boolean)[0]||'The other side';
      detail=`${who} was favored${lp!=null?` (${lp}%)`:''}, but winning it was not guaranteed.`;
    }
    else if(sign*ratingEdge>0&&sign*setupEdge<0)detail='The winner’s player-rating advantage overcame an unfavorable setup and situational edges.';
    else if(sign*ratingEdge<0&&sign*setupEdge>0)detail='Setup and situational edges helped the lower-rated matchup win.';
    else if(sign*ratingEdge>0)detail='The winner had the player-rating edge in the traits this duel tested.';
  }
  if(e.kind==='inc'&&!e.turnover&&reached.every(r=>r.won))detail='The offense won every reached duel. The pass still fell incomplete. '+detail;
  else if(recovery)detail=`${d.label} recovered the play after losing ${e.duels[1].label.toLowerCase()}. ${detail}`;
  const duelSummary=`${d.label}: ${names.filter(Boolean).join(' & ')||'The winner'} beat ${losers.filter(Boolean).join(' & ')||'the matchup'}.`;
  return{result,duelSummary,summary:`${result}. ${duelSummary}`,detail,defense:defenseNote(e,d,offWon),key:d.key,winnerSide,winnerRoles:offWon?d.offRoles:d.defRoles,loserRoles:offWon?d.defRoles:d.offRoles,offWon,ratingEdge,setupEdge};
}
// After the snap the defense's call is public. Name it with the scheme and situation edges that helped the winner of
// the deciding duel (player abilities and conditions stay in the full duel view).
function defenseNote(e,d,offWon){
  const call=D.CALLS[e.call];if(!call)return null;
  const tactics=(e.defTactics||[]).map(id=>D.TACTICS[id]?.name).filter(Boolean);
  const swing=(d.mods||[]).filter(m=>(offWon?m.v>0:m.v<0)&&m.src!=='Play design'&&!/[(:]/.test(m.src))
    .sort((a,c)=>Math.abs(c.v)-Math.abs(a.v)).slice(0,2).map(m=>`${m.src} ${m.v>0?'+':'−'}${Math.abs(m.v)}`);
  const adjustments=tactics.length&&e.offTactics?.includes('hurry_up')?`. Hurry-Up canceled ${tactics.join(' + ')}`:tactics.length?' + '+tactics.join(' + '):'';
  return`Defense: ${call.name}${adjustments}.${swing.length?` At ${String(d.label).toLowerCase()}: ${swing.join(', ')}.`:''}`;
}
// The call that set up this 4th down, if the coach made it. Only the immediately preceding snap counts: a staff
// call, penalty or kick in between means the coach's own call is not what led here. Reads the log; never mutates.
function lastCallRecap(b,side=b?.user){
  const e=[...(b?.log||[])].reverse().find(x=>x.type==='snap'||x.type==='kick');
  if(!e||e.type!=='snap'||!e.userCalled||e.offSide!==side||e.penalty||!D.PLAYS[e.play])return null;
  const story=matchupStory(e);
  return{play:e.play,name:D.PLAYS[e.play].name,down:e.sit?.down??null,result:snapResultLabel(e),summary:story?.duelSummary||null,verdict:snapVerdict(e,side)?.detail||null,defense:story?.defense||null,offWon:story?snapSucceeded(e):null};
}
// The coach's most recent own call on either side of the ball, and how many snaps have run since. The call board
// pins it once staff snaps have pushed it out of the ticker. Reads the log; never mutates.
function lastUserCall(b,side=b?.user){
  const log=b?.log||[];let since=0;
  for(let i=log.length-1;i>=0;i--){
    const e=log[i];if(e.type!=='snap')continue;
    if(!e.userCalled||e.penalty){since++;continue}
    const off=e.offSide===side,def=off?null:D.CALLS[e.call];if(off?!D.PLAYS[e.play]:!def)return null;
    const story=matchupStory(e);
    return{role:off?'off':'def',id:off?e.play:e.call,name:off?D.PLAYS[e.play].name:def.name,result:snapResultLabel(e),summary:story?.duelSummary||null,verdict:snapVerdict(e,side)?.detail||null,defense:story?.defense||null,won:story?snapSucceeded(e)===off:null,since};
  }
  return null;
}
// Film confidence (Dynasty: the coordinators' play-calling and the head coach's development rating) sets how
// precisely opponent grades show. Exact at 82+, a one-point range from 64, wider below. Display only: duel math never
// changes. One definition shared by the battle and the dynasty's pre-game note.
const FILM_EXACT=82,FILM_NARROW=64;
function filmFog(confidence){
  const c=Number(confidence);if(confidence==null||!Number.isFinite(c))return{spread:0,exact:true,nextAt:null};
  const spread=c>=FILM_EXACT?0:c>=FILM_NARROW?1:2;
  return{spread,exact:!spread,confidence:Math.round(c),nextAt:spread===2?FILM_NARROW:spread===1?FILM_EXACT:null};
}
// These anonymous scouting scenarios use league-average players with a broader range of
// plausible ratings when film is thin. An opponent's actual roster never sets the range.
const scoutPriors={};
for(const role of ['off','def']){
  scoutPriors[role]={};
  for(const rating of [50,60,70,80,90]){
    const traits=Object.fromEntries(D.TRAITS.map(t=>[t,rating]));
    const roles=role==='off'?D.OFF_ROLES:D.DEF_ROLES;
    scoutPriors[role][rating]=Object.fromEntries(Object.entries(roles).map(([spot,pos])=>[
      spot,{role:spot,id:'scout-prior-'+spot,name:spot,pos,traits}
    ]));
  }
}
const filmDefenses=['two_high','cover3','cover1','run_fit','zone_pressure','cover0','sim_pressure','cover2_trap','robber','two_man','bear'];
// Read Option is a public scenario when comparing the coach's edge assignment.
const filmOffense={...REP_PLAYS,run:[...REP_PLAYS.run,'read_option']};
const quickTargets=sit=>[Math.min(4,sit.distance),Math.min(20,100-sit.field)];
function lookUncertain(look){return !look?.coverage?.confirmed||!look?.pressure?.confirmed||!look?.shell?.confirmed}
function possibleFilmCalls(look){
  const fits=(fact,value)=>!fact?.confirmed||fact.value===value;
  const pressure=look.pressure;
  const fitsPressure=c=>pressure.confirmed
    ?(Number.isFinite(pressure.realLevel)?c.pressure===pressure.realLevel:(c.pressure>0)===pressure.value)
    :c.look.pressureShown===pressure.value;
  const fitsShell=c=>look.shell?.confirmed?c.shell===look.shell.value:(c.look?.shellShown?c.look.shellShown===look.shell.value:true);
  const calls=filmDefenses.map(id=>D.CALLS[id]).filter(c=>
    fits(look.box,c.box)&&fitsShell(c)&&fits(look.coverage,c.coverage)&&fitsPressure(c));
  // The shown alignment is one possible read even when no base defense matches the film.
  // A strong safety can disguise shell. A shown rush can still drop out.
  const shown=presumedCall(look,true);
  return calls.some(c=>c.id===shown.id)?calls:[shown,...calls];
}
function scoutedProjection(b,req,choice,confidence){
  const fog=filmFog(confidence),role=req?.role,offense=role==='off',sit=req?.situation;
  if(req?.kind!=='snap'||!['off','def'].includes(role)||!Number.isFinite(sit?.field)||!Number.isFinite(sit.distance)||!b?.game)return null;
  if(offense&&!fog.spread)return null;
  const id=choice?.play,card=(offense?D.PLAYS:D.CALLS)[id],line=b.teams?.[req.side]?.lineup?.[role];
  if(!line||!card||card.quickKick||card.id==='spike'||!req.options?.plays?.some(c=>c.id===id&&!c.blocked))return null;
  if(offense&&!req.look?.box||!offense&&!req.offLook)return null;
  if(offense&&choice.target&&!R.targetOptions(card,line).some(t=>t.role===choice.target))return null;
  const played=[...new Set([...(req.info||[]),...(choice.tactics||[])])];
  const context={situation:sit,weather:b.weather,read:choice.read||'auto',fire:b.fire,workload:b.workload};
  if(offense){
    context.off=line;context.offEdges=b.teams[req.side].edges?.off;context.play=R.targetedPlay(card,choice.target,line);
    context.offTactics=played;context.motionConfirmed=played.includes('motion')&&!!req.look.coverage?.confirmed;
    context.lean=req.look.lean?.confirmed?req.look.lean.value:null;context.heat=!!req.look.heat;
    context.grouping=groupingFor(b,req.side);context.combo=comboFor(b,context.play);
  }else{
    context.def=line;context.defEdges=b.teams[req.side].edges?.def;context.call=card;context.defTactics=played;
    context.read=autoRead(sit);
    context.bracketRole=choice.bracketRole||req.options.bracketPlan?.role;context.edgeAssignment=choice.edgeAssignment;
    context.lean=req.lean;context.heat=!!req.heat;
    context.offTactics=req.offLook.protection?.confirmed&&req.offLook.protection.value?['max_protect']:[];
  }
  const metrics=['yards','first','turnover'];
  const bounds=Object.fromEntries(metrics.map(m=>[m,[Infinity,-Infinity]]));
  const calls=offense?possibleFilmCalls(req.look):null;
  const grades=fog.spread===2?[50,60,70,80,90]:fog.spread===1?[60,70,80]:[null];
  const exactOff=!fog.spread&&!offense?b.teams?.[other(req.side)]?.lineup?.off:null;
  if(!offense&&!fog.spread&&!exactOff)return null;
  const callWeights=calls?.map(call=>!req.look.coverage?.confirmed&&call.coverage===req.look.covTend?1.75:1);
  const sampleWeight=callWeights?.reduce((total,weight)=>total+weight,0)*grades.length;
  const expected={yards:0,first:0,turnover:0,sack:0,floor:0,chunk:0};
  const family=req.offLook?.family;
  const confirmed=family?.confirmed&&OFF_FAMILIES.includes(family.value)?family.value:null;
  const weights=offense?null:offFamilyWeights(sit,req.offTendency||{},confirmed);
  const fieldGain=y=>Math.max(-sit.field,Math.min(100-sit.field,y));
  const targets=offense?quickTargets(sit):[];
  const evaluate=ctx=>R.evaluate(R.buildSnap(ctx),sit,targets);
  const include=(ev,weight)=>{
    expected.yards+=weight*fieldGain(ev.yards);
    expected.first+=weight*ev.first;
    expected.turnover+=weight*ev.turnover;
    expected.sack+=weight*ev.sack;
    if(offense){expected.floor+=weight*ev.targetOdds[0];expected.chunk+=weight*ev.targetOdds[1]}
  };
  for(const rating of grades){
    // Defensive forecasts weight each public offensive family by down, distance and
    // prior calls. Film Tell restricts that mixture to the confirmed family.
    const off=offense?null:exactOff||scoutPriors.off[rating];
    const groups=offense?[[1,calls.map(call=>evaluate({...context,def:scoutPriors.def[rating],call}))]]:
      OFF_FAMILIES.filter(f=>weights[f]>0).map(f=>[weights[f],filmOffense[f].map(id=>D.PLAYS[id])
        .filter(play=>!R.playBlocked(play,off,sit)).map(play=>
          evaluate({...context,off,play,combos:combosFor(b,play,card)}))]);
    if(offense)groups[0][1].forEach((ev,i)=>include(ev,callWeights[i]/sampleWeight));
    else for(const [weight,group] of groups)for(const ev of group)include(ev,weight/(grades.length*group.length));
    for(const m of metrics){
      let low=0,high=0;
      for(const [weight,group] of groups){
        const values=group.map(ev=>ev[m]);
        low+=weight*Math.min(...values);high+=weight*Math.max(...values);
      }
      bounds[m][0]=Math.min(bounds[m][0],low);bounds[m][1]=Math.max(bounds[m][1],high);
    }
  }
  // Projected gains use the ordinary result tables; a field boundary limits what
  // can be credited. The goal-to-go UI foregrounds the end-zone probability.
  bounds.yards=bounds.yards.map(fieldGain);
  const range={confidence:fog.spread===2?'Limited film':fog.spread===1?'Partial film':confirmed?'Scouted family':'Play tendencies',
    yards:[Math.floor(bounds.yards[0]*10)/10,Math.ceil(bounds.yards[1]*10)/10],
    first:[Math.floor(bounds.first[0]*100),Math.ceil(bounds.first[1]*100)],
    turnover:[Math.floor(bounds.turnover[0]*100),Math.ceil(bounds.turnover[1]*100)]};
  return{range,expected};
}
function scoutedForecast(b,req,choice,confidence){
  return scoutedProjection(b,req,choice,confidence)?.range??null;
}
// A duel as two vertical sums: each side's ability, plus the labeled modifiers that help that side, and a total.
// Resolver mods are signed for the offense (raw = offGrade - defGrade + sum of mods), so a negative mod is listed as a
// plus on the defense's column. Ability is rounded to 0.01 first and totals are added from the shown numbers, so the
// arithmetic on screen always checks out; the edge is the difference of the two shown totals. Display only.
function duelSum(d){
  if(!d||!Number.isFinite(d.offGrade)||!Number.isFinite(d.defGrade))return null;
  const r=x=>Math.round(x*100)/100,off={grade:r(d.offGrade),adds:[]},def={grade:r(d.defGrade),adds:[]};
  for(const m of d.mods||[]){const v=Number(m.v)||0;if(!v)continue;(v>0?off:def).adds.push({v:r(Math.abs(v)),src:String(m.src||'Effect')})}
  for(const c of [off,def])c.total=r(c.grade+c.adds.reduce((n,a)=>n+a.v,0));
  return{off,def,edge:r(off.total-def.total)};
}
// Film on the opponent from one battle: their defensive call families and their offense's run/pass mix, counted from
// the log. Stored by the dynasty so a later meeting can say what they actually did against you.
function rivalryCatch(b,e,groups){
  if(!e.completed||e.turnover||!Number.isInteger(e.yards))return;
  const role=e.participants?.target,id=e.lineups?.off?.[role],p=b.personnel?.[id],sit=e.sit;
  if(!['X','Z','SLOT','TE','RB'].includes(role)||!p?.name||!sit||!Number.isInteger(sit.field))return;
  const kind=sit.down===4&&e.yards>=sit.distance?'fourth':sit.down===3&&e.yards>=sit.distance?'third':
    e.yards>=100-sit.field?'touchdown':e.yards>=20?'explosive':null;
  if(!kind)return;
  const key=JSON.stringify([id,kind]),g=groups.get(key)||{id:String(id),name:p.name,role,kind,snaps:[]};
  if(g.snaps.length<2)g.snaps.push({play:D.PLAYS[e.play].name,down:sit.down,distance:sit.distance,period:sit.period,clock:sit.clock,yards:Math.min(e.yards,100-sit.field)});
  groups.set(key,g);
}
function chartRivalryWin(win,e,side){
  const play=D.PLAYS[e.play],root=play.evolvedFrom||play.upgradeOf||play.id;
  if(!Object.hasOwn(D.PLAYS,root)||D.PLAYS[root].signature||e.turnover||!Number.isInteger(e.yards)||e.yards<=0)return;
  const scored=e.yards>=(100-(e.sit?.field??0));
  if(!scored&&e.yards<8&&e.yards<(e.sit?.distance??100))return;
  const current=win.get(root)||{play:root,count:0,yards:0,peak:0};
  const payoff=e.events?.find(x=>x.type==='combo'&&x.side===side&&(x.duel==='G'||e.duelResults?.[0]?.won)&&
    D.COMBOS.some(c=>c.id===x.id&&c.side==='off'));
  current.count++;current.yards+=e.yards;current.peak=Math.max(current.peak,e.yards);
  if(scored)current.scored=true;
  if(payoff)current.combo=payoff.id;
  win.set(root,current);
}
function turningPointSnaps(b,limit=3){
  if(!b?.log?.length)return [];
  const scored=[];
  let index=0;
  for(const e of b.log){
    if(e.type!=='snap'||e.penalty||e.category==='kick')continue;
    index++;
    const sit=e.sit||{},down=sit.down||1,dist=sit.distance||10,yards=Number(e.yards)||0;
    const td=/touchdown/i.test(e.text||'');
    const converted=down>=3&&!e.turnover&&yards>=dist;
    const stopped=down>=3&&(e.turnover||yards<dist);
    let score=0,swungBy='';
    if(td){score+=5;swungBy='Touchdown strike'}
    if(e.turnover){score+=6;swungBy=e.turnover==='interception'?'Interception':'Fumble'}
    if(down===4){score+=4;swungBy=swungBy||(converted?'4th-down conversion':'4th-down stop')}
    else if(down===3){score+=2.5;swungBy=swungBy||(converted?'3rd-down conversion':'3rd-down stop')}
    if(Math.abs(yards)>=18){score+=2.5;swungBy=swungBy||'Explosive gain'}
    if(e.kind==='sack'){score+=2.5;swungBy=swungBy||'Pass rush sack'}
    if(score<3)continue;
    const play=D.PLAYS[e.play],call=D.CALLS[e.call];
    const userOff=e.offSide===b.user;
    let counterId=null;
    if(userOff&&(e.turnover||e.kind==='sack'||stopped))counterId=e.kind==='sack'?'max_protect':'inside_zone';
    else if(!userOff&&(td||converted||yards>=15))counterId=play?.family==='run'?'run_fit':'two_high';
    else counterId=D.PLAYS[e.play]?.id||D.CALLS[e.call]?.id||null;
    const counterDef=counterId?(D.PLAYS[counterId]||D.CALLS[counterId]||D.TACTICS[counterId]):null;
    scored.push({
      score,snap:index,quarter:sit.quarter||1,clock:sit.clock||0,down,distance:dist,spot:sit.field||25,
      offSide:e.offSide,playId:e.play,playName:play?.name||e.play||'Play',
      defId:e.call,defName:call?.name||e.call||'Defense',yards,
      result:e.text||`${yards} yd`,swungBy:swungBy||'Key snap',
      counterId:counterDef?counterId:null,counterName:counterDef?.name||null
    });
  }
  return scored.sort((a,b)=>b.score-a.score||a.snap-b.snap).slice(0,limit).map(({score,...rest})=>rest);
}
function callFilm(b,side=b?.user){
  if(!b?.log||!side)return null;const opp=side==='home'?'away':'home',film={def:{pressure:0,man:0,zone:0,total:0},off:{run:0,pass:0,total:0,thirdDown:{}},own:{plays:{},snaps:0,mine:0}};
  const protectionPrep='Weekly prep: Pass Protection',runPrep='Weekly prep: Run Fits';
  const protection=film.own.protection={attempts:0,lost:0,sacks:0,prepared:0,planned:!!b.teams?.[side]?.edges?.off?.some(e=>e.src===protectionPrep)};
  const runDefense=film.own.runDefense={attempts:0,yards:0,explosives:0,prepared:0,planned:!!b.teams?.[side]?.edges?.def?.some(e=>e.src===runPrep)};
  const catches=new Map();
  const win=b.rivalry&&b.game?.status==='final'&&b.game.score[side]>b.game.score[opp]?new Map():null;
  for(const e of b.log){
    if(e.type!=='snap'||e.penalty||e.category==='kick')continue;
    if(e.defSide===opp){const c=D.CALLS[e.call];if(c&&film.def[c.family]!==undefined){film.def[c.family]++;film.def.total++}}
    if(e.offSide===opp&&Object.hasOwn(D.PLAYS,e.play)){
      const p=D.PLAYS[e.play];
      film.off[p.family==='run'?'run':'pass']++;film.off.total++;
      if(e.sit?.down===3)film.off.thirdDown[e.play]=(film.off.thirdDown[e.play]||0)+1;
      if(b.rivalry)rivalryCatch(b,e,catches);
      if(e.defSide===side&&p.family==='run'&&e.kind==='run'&&Number.isInteger(e.yards)){
        runDefense.attempts++;runDefense.yards+=e.yards;if(e.yards>=10)runDefense.explosives++;
        if(e.duels?.[0]?.mods?.some(m=>m.src===runPrep))runDefense.prepared++;
      }
    }
    // Your own offensive calls, for the season recap: calls, yards, stops, and how many you called yourself.
    if(e.offSide===side&&D.PLAYS[e.play]&&Number.isFinite(e.yards)){const t=film.own.plays[e.play]??={n:0,yards:0,stops:0,mine:0};
      t.n++;t.yards+=e.yards;t.stops+=e.turnover||e.yards<=0?1:0;t.mine+=e.userCalled?1:0;film.own.snaps++;film.own.mine+=e.userCalled?1:0;
      if(win)chartRivalryWin(win,e,side);
      const duel=D.PLAYS[e.play].duels?.G?.protect&&e.duelResults?.[0];
      if(typeof duel?.won==='boolean'){
        protection.attempts++;if(!duel.won)protection.lost++;if(e.kind==='sack')protection.sacks++;
        if(e.duels?.[0]?.mods?.some(m=>m.src===protectionPrep))protection.prepared++;
      }
    }
  }
  const priority={fourth:5,third:3,touchdown:4,explosive:1},score=g=>priority[g.kind]+2*(g.snaps.length-1);
  const best=[...catches.values()].sort((a,b)=>score(b)-score(a))[0];if(best)film.rivalryPlay=best;
  const memory=win&&[...win.values()].filter(t=>t.count>=2||t.combo||t.scored||t.peak>=20)
    .sort((a,b)=>b.count-a.count||Number(!!b.combo)-Number(!!a.combo)||b.yards-a.yards)[0];
  if(memory){const {play,count,yards,combo}=memory;film.rivalryWin={play,count,yards,...(combo?{combo}:{})}}
  const tp=turningPointSnaps(b);
  if(tp.length)film.turningPoints=tp;
  return film.def.total||film.off.total||film.own.snaps||tp.length?film:null;
}
// A season of card battles summed by the dynasty: { games, snaps, mine, plays:{id:{n,yards,stops,mine}}, players:{id:{name,w,l}} }.
// The recap names the best call and the worst habit (each with 5+ calls) and the season's top duel winner on your side.
function seasonRecap(ledger){
  if(!ledger||!(ledger.games>=3))return null;
  const rows=Object.entries(ledger.plays||{}).filter(([id,t])=>D.PLAYS[id]&&t.n>=5).map(([id,t])=>({id,name:D.PLAYS[id].name,n:t.n,avg:t.yards/t.n,stops:t.stops,mine:t.mine}));
  const best=rows.slice().sort((a,c)=>c.avg-a.avg||c.n-a.n)[0]||null;
  const worst=rows.filter(r=>r!==best&&(r.avg<3||r.stops/r.n>=.5)).sort((a,c)=>a.avg-c.avg||c.n-a.n)[0]||null;
  const star=Object.entries(ledger.players||{}).map(([id,p])=>({id,...p})).filter(p=>(p.w|0)>=10).sort((a,c)=>(c.w-c.l)-(a.w-a.l)||c.w-a.w)[0]||null;
  const f=r=>`${r.name}: ${r.avg.toFixed(1)} yards per call on ${r.n} calls${r.mine?` (${r.mine} yours)`:''}`;
  return{games:ledger.games,snaps:ledger.snaps,mine:ledger.mine,best,worst,star,
    lines:[best&&`Best call · ${f(best)}.`,worst&&`Worst habit · ${f(worst)}, stopped ${worst.stops} times.`,star&&`Top duel winner · ${star.name}: won ${star.w} of ${star.w+star.l} duels.`,`You called ${ledger.mine} of ${ledger.snaps} offensive snaps across ${ledger.games} games; your staff called the rest.`].filter(Boolean)};
}
function postgameTakeaway(b,side=b?.user){
  if(!side)return null;
  const tally=onlyMine=>{
    const byPlay=new Map();
    for(const e of b.log||[]){
      if(e.type!=='snap'||e.offSide!==side||e.penalty||e.category==='kick'||!D.PLAYS[e.play]||!Number.isFinite(e.yards))continue;
      if(onlyMine&&!e.userCalled)continue;
      const t=byPlay.get(e.play)||{id:e.play,n:0,mine:0,yards:0,stops:0,gateLoss:0};
      t.n++;t.mine+=e.userCalled?1:0;t.yards+=e.yards;t.stops+=e.turnover||e.yards<=0?1:0;t.gateLoss+=e.duelResults?.[0]?.won===false?1:0;byPlay.set(e.play,t);
    }
    return[...byPlay.values()].filter(t=>t.n>=3);
  };
  // Prefer a repeatable problem over one spectacular play; small samples remain explicitly labeled.
  const isWeak=t=>t.yards/t.n<3||t.stops/t.n>=.5,worst=rows=>rows.filter(isWeak).sort((a,c)=>c.n-a.n||a.yards/a.n-c.yards/c.n)[0];
  const best=rows=>rows.slice().sort((a,c)=>c.n-a.n||c.yards/c.n-a.yards/a.n)[0];
  // The coach's own calls come first: a takeaway about a play they never called would not tell them what to change.
  const mine=tally(true),all=tally(false);if(!all.length)return null;
  const weak=worst(mine)||worst(all),t=weak||best(mine)||best(all),play=D.PLAYS[t.id];
  const caller=t.mine===t.n?'you':t.mine?'mixed':'staff';
  const owned=[...new Set([...(b.decks?.[side]?.off?.base||[]),...(b.decks?.[side]?.off?.wrinkles||[])])];
  const alternate=owned.find(id=>id!==t.id&&D.PLAYS[id]&&!D.PLAYS[id].trick&&D.PLAYS[id].family!==play.family)||owned.find(id=>id!==t.id&&D.PLAYS[id]&&!D.PLAYS[id].trick);
  const who=caller==='you'?(t.n===1?'your call':'your calls'):caller==='staff'?'all called by your staff':`you called ${t.mine}, your staff ${t.n-t.mine}`;
  const subject=caller==='staff'?`Your staff’s ${play.name} calls`:play.name;
  return{summary:weak?`${subject} struggled to move the ball.`:`${subject} ${caller==='staff'?'were':'was'} a repeatable part of your offense.`,
    evidence:`${t.n} recorded calls (${who}) · ${(t.yards/t.n).toFixed(1)} yards per call · ${t.gateLoss} lost at the Gate. One game, not a permanent verdict.`,
    recommendation:(caller==='staff'?'Staff calls come from your deck. ':'')+(weak?(alternate?`Consider mixing in ${D.PLAYS[alternate].name} from your current deck, then compare the matchup.`:`Consider reviewing ${play.name}'s Gate matchup before calling it again.`):`Consider keeping ${play.name} in your plan, but read the next opponent before leaning on it.`),
    playId:weak?(alternate||t.id):t.id,samples:t.n,caller,mine:t.mine,weakId:weak?t.id:null,avg:Math.round(t.yards/t.n*10)/10};
}
// Read only finished snaps. The same prior film is available before either coach commits.
const threatWeight=t=>t.count+(t.featuredTouches||0);
function revealedThreat(b,side){
  const recent=[];
  for(let i=(b.log?.length||0)-1;i>=0&&recent.length<6;i--){
    const e=b.log[i];
    if(e.type==='halftime'||(e.type==='snap'&&e.sit?.period&&b.game?.period&&halfOf(e.sit)!==halfOf(b.game)))break;
    if(e.type==='snap'&&e.offSide===side&&!e.penalty&&e.category!=='kick'&&D.PLAYS[e.play])recent.push(e);
  }
  const patterns=new Map(),active=b.teams?.[side]?.lineup?.off;
  for(const e of recent){
    if(e.turnover||!(e.yards>0&&(e.yards>=e.sit?.distance||e.yards>=8)))continue;
    const play=D.PLAYS[e.play],root=play.evolvedFrom||play.upgradeOf||play.id;
    const role=touchRole(e),playerId=e.lineups?.off?.[role];
    if(playerId==null||(active&&!Object.values(active).some(p=>p?.id===playerId)))continue;
    const key=root+'|'+playerId;
    const sample=patterns.get(key)||{play:root,role,playerId,count:0,yards:0,family:play.family};
    sample.count++;sample.yards+=e.yards;
    if(e.featuredTouch===playerId)sample.featuredTouches=(sample.featuredTouches||0)+1;
    patterns.set(key,sample);
  }
  return [...patterns.values()].filter(t=>threatWeight(t)>=2).sort((a,c)=>threatWeight(c)-threatWeight(a)||c.yards-a.yards)[0]||null;
}
function leanRead(family,offense=true){
  const unit=offense?'Their defense':'Your defense';
  const action={run:'is playing the run',quick:'is sitting on short passes',deep:'is protecting against deep passes',constraint:'is watching for fakes and screens'};
  return unit+' '+(action[family]||'is anticipating a counter');
}
function adaptationRead(b,req=b?.pending){
  if(req?.kind!=='snap'||!['off','def'].includes(req.role))return null;
  const offense=req.role==='off'?req.side:other(req.side);
  const recent=(b.log||[]).filter(e=>e.type==='snap'&&e.offSide===offense&&D.PLAYS[e.play]&&e.category!=='kick').slice(-5);
  const last=recent[recent.length-1],family=last&&D.PLAYS[last.play].family;
  let count=0;for(let i=recent.length-1;i>=0&&D.PLAYS[recent[i].play].family===family;i--)count++;
  const lean=req.role==='off'?(req.look?.lean?.confirmed?req.look.lean.value:null):req.lean;
  const threat=revealedThreat(b,offense);
  if(!lean&&threat){
    const name=b.personnel?.[threat.playerId]?.name||'the same player',play=D.PLAYS[threat.play];
    return {summary:`${name} has gained ${threat.yards} yards on ${threat.count} productive ${play.name} call${threat.count===1?'':'s'}.`,
      detail:'Recent film makes a counter more likely. A different target or play can test the adjustment.',
      family:threat.family,confirmed:false,count:threat.count,counterPlay:null};
  }
  if(!lean&&count<3)return null;
  const named=lean||family;
  const counter=req.role==='off'?(req.options?.plays||[]).find(p=>!p.blocked&&p.cost<=req.options.command&&D.PLAYS[p.id]?.punishes===named):null;
  return{summary:lean?`${leanRead(lean,req.role==='off')}.`:`${req.role==='off'?'You have':'They have'} called ${count} straight ${family} plays.`,
    detail:lean?`${count>=3&&family===lean?`The last ${count} calls repeated that family. `:''}${req.role==='off'?'A counter can use that defensive commitment if your players win their matchups.':'Your defense is vulnerable to a counter. Their next call is still unknown.'}`:`That pattern may invite an adjustment. It is film, not confirmation of the next call.`,family:named,confirmed:!!lean,count,counterPlay:counter?.id||null};
}

// What a call looks like on public information only: the Look the offense sees (confirmed lean only), the players on
// the field and labeled edges. The same inputs the full-sheet preview uses; the defense's committed call never enters.
function publicRead(b,req,id,confidence,target,tactics=[],read='auto',includeSpread=false){
  const side=req.side,printed=D.PLAYS[id],def=b?.teams?.[other(side)]?.lineup?.def;
  const sit=req.situation;
  if(!printed||printed.quickKick||id==='spike'||!def||!b.game||!req.look?.box||!Number.isFinite(sit?.field)||!Number.isFinite(sit.distance))return null;
  const off=b.teams[side].lineup.off,play=R.targetedPlay(printed,target,off);
  const goal=sit.field+sit.distance>=100?'touchdown':'first';
  if(filmFog(confidence).spread){
    const projection=scoutedProjection(b,req,{play:id,target,tactics,read},confidence);
    if(!projection)return null;
    const g=play.duels.G;
    const gate={label:g.label,offNames:g.off.map(r=>off[r]?.name),defNames:g.def.map(r=>def[r]?.name),chip:'?'};
    const {expected:ev,range:{yards,first,confidence:label}}=projection;
    return{u:utility(ev,sit),ev,gate,forecast:{yards,first,goal,confidence:label}};
  }
  const lean=req.look.lean?.confirmed?req.look.lean.value:null,call=presumedCall(req.look,true);
  const snap=R.buildSnap({weather:b.weather,...edgesFor(b,side),off,def,play,...knownEffects(b,play,call),call,
    offTactics:activeTactics(b,'off',tactics),read,situation:sit,lean,heat:!!req.look.heat,motionConfirmed:!!b.snap?.motionConfirmed});
  const result=R.evaluate(snap,sit,quickTargets(sit)),ev={...result,yards:Math.max(-sit.field,Math.min(100-sit.field,result.yards)),
    floor:result.targetOdds[0],chunk:result.targetOdds[1]};
  const calls=includeSpread?possibleFilmCalls(req.look):[];
  let yardsRange=[Math.round(ev.yards*10)/10,Math.round(ev.yards*10)/10];
  let firstRange=[Math.round(ev.first*100),Math.round(ev.first*100)];
  if(calls.length>1){
    const perCall=calls.map(c=>{
      const s=R.buildSnap({weather:b.weather,...edgesFor(b,side),off,def,play,...knownEffects(b,play,c),call:c,
        offTactics:activeTactics(b,'off',tactics),read,situation:sit,lean,heat:!!req.look.heat,motionConfirmed:!!b.snap?.motionConfirmed});
      const r=R.evaluate(s,sit,quickTargets(sit));
      return{yards:Math.max(-sit.field,Math.min(100-sit.field,r.yards)),first:r.first};
    });
    yardsRange=[Math.round(Math.min(...perCall.map(x=>x.yards))*10)/10,Math.round(Math.max(...perCall.map(x=>x.yards))*10)/10];
    firstRange=[Math.round(Math.min(...perCall.map(x=>x.first))*100),Math.round(Math.max(...perCall.map(x=>x.first))*100)];
  }
  const unconfirmed=yardsRange[0]!==yardsRange[1]||firstRange[0]!==firstRange[1];
  return{u:utility(ev,sit),ev,gate:snap.duels[0],forecast:{yards:yardsRange,first:firstRange,goal,confidence:confidence==null?(unconfirmed?'Unconfirmed look':'Shown look'):(unconfirmed?'Unconfirmed look':'Full film')}};
}
function publicChoiceRead(b,req,choice,confidence){
  if(req.role==='off')return publicRead(b,req,choice.play,confidence,choice.target,choice.tactics,choice.read,true);
  const projection=scoutedProjection(b,req,choice,confidence);
  if(!projection)return null;
  const {yards,first,confidence:label}=projection.range,sit=req.situation;
  return{u:-utility(projection.expected,sit),forecast:{yards,first,goal:sit.field+sit.distance>=100?'touchdown':'first',confidence:label}};
}
function quickForecast(b,req,choice,confidence){
  if(req?.kind!=='snap'||!['off','def'].includes(req.role)||!req.options?.plays?.some(p=>p.id===choice?.play&&!p.blocked))return null;
  return publicChoiceRead(b,req,choice,confidence)?.forecast??null;
}
// Compare affordable tactics against the same public look, keeping other selected cards fixed.
function quickTactics(b,req,choice,slots=[],confidence){
  const options=req?.options,play=options?.plays?.find(p=>p.id===choice?.play&&!p.blocked);
  const lineup=b?.teams?.[req?.side]?.lineup?.[req?.role];
  if(req?.kind!=='snap'||!play||!lineup||play.cost>options.command)return [];
  const off=req.role==='off',card=off?R.targetedPlay(play.card,choice.target,lineup):play.card;
  const hand=(options.tactics||[]).filter(t=>t.card?.side===req.role&&!t.card.info);
  const selected=hand.filter(t=>slots.includes(t.slot));
  const used=new Set(),spent=play.cost+selected.reduce((sum,t)=>sum+t.cost,0),rows=[];
  const project=tactics=>publicChoiceRead(b,req,{...choice,tactics},confidence);
  const base=project(selected.map(t=>t.id));
  for(const t of [...selected,...hand]){
    if(used.has(t.id))continue;
    used.add(t.id);
    const active=slots.includes(t.slot);
    if(!active&&(spent+t.cost>options.command||R.signatureBlocked(t.card,lineup)||off&&R.tacticBlocked(t.card,card,lineup)))continue;
    const reason=tacticRead(req,play.id,lineup,[t.slot],choice.target)?.reason||t.card.text;
    const otherTactics=selected.filter(s=>s.id!==t.id).map(s=>s.id);
    const without=active?project(otherTactics):base,withTactic=active?base:project([...otherTactics,t.id]);
    rows.push({slot:t.slot,name:t.card.name,cost:t.cost,active,reason,without:without?.forecast,with:withTactic?.forecast,
      change:(withTactic?.u??0)-(without?.u??0)});
  }
  return rows.sort((a,c)=>Number(c.active)-Number(a.active)||c.change-a.change||a.cost-c.cost||a.slot-c.slot)
    .slice(0,Math.max(3,selected.length)).map(({change,...row})=>row);
}
// A compact call sheet. Scout estimates determine which legal cards serve different purposes this down.
// A genuine counter, a ready combo that fits the down and the coach's opener still get priority.
function snapDecisions(b,req=b?.pending,selection={},confidence){
  if(req?.kind!=='snap'||!['off','def'].includes(req.role))return null;
  const offense=req.role==='off',catalog=offense?D.PLAYS:D.CALLS,look=req.look||{};
  const lean=offense?(look.lean?.confirmed?look.lean.value:null):req.lean;
  const heat=offense&&!!look.heat,adapt=adaptationRead(b||{},req);
  // A confirmed real rush outranks a lean in the clue: it is this snap's fact, and it changes which counter works.
  const blitz=offense&&!!look.pressure?.confirmed&&!!look.pressure.value;
  const twoDown=offense&&req.situation?.down===3&&!!b?.snap?.twoDown;
  let clue;
  if(!offense&&req.offLook?.family?.confirmed)clue=`Film confirms ${req.offLook.family.value}. Choose how to defend it.`;
  else if(blitz)clue=`Pressure confirmed: the rush is coming. ${lean?leanRead(lean)+', but a fake needs time the rush may not give. ':''}A quick throw or a screen can beat it.`;
  else if(lean)clue=`${leanRead(lean,offense)}. ${offense?'A counter can use that commitment.':'Watch for a counter.'}`;
  else if(heat)clue=look.pressure?.confirmed?(look.pressure.value?'Repeated pressure on film, and the rush is confirmed this time.':'They rushed often on film, but this read confirms no extra rush.'):'Repeated pressure on film. The next rush is not confirmed.';
  else if(adapt)clue=adapt.summary+' '+adapt.detail;
  else if(offense&&look.box?.confirmed&&look.box.value==='loaded')clue='They’ve loaded the box. Running inside is tougher; a fake can draw the linebackers in.';
  else if(offense&&look.box?.confirmed&&look.box.value==='light')clue='Light box. There’s room up front if your blockers can clear it.';
  else if(offense&&look.pressure?.value)clue=look.pressure.confirmed?'Pressure confirmed: protect the quarterback or invite the rush with a screen.':'Pressure shown, not confirmed. A screen risks calling into a bluff.';
  else if(offense&&look.shell?.confirmed&&look.shell.value===2)clue='Two safeties back. It’s harder to get a receiver behind them.';
  else if(offense&&look.shell?.confirmed&&look.shell.value===0)clue='No deep safety. A receiver can get behind them if protection holds.';
  else if(offense&&!look.coverage?.confirmed&&look.covTend)clue=`Film shows a ${look.covTend}-coverage tendency. Motion can confirm this snap.`;
  else clue=offense?'No clear tell. An unconfirmed shell may be a disguise.':'No confirmed play family. Use down and distance; their next call is unknown.';
  const seen=new Set(),legal=(req.options?.plays||[]).filter(o=>{
    if(!Object.hasOwn(catalog,o.id)||seen.has(o.id)||o.blocked||!Number.isFinite(o.cost)||o.cost>(req.options?.command??0))return false;
    seen.add(o.id);return true;
  });
  const origin=c=>c.evolvedFrom||c.upgradeOf||c.id;
  const counters=c=>counterBadge(req,c);
  const reads=new Map();
  if(b?.game)for(const o of legal){
    const result=publicChoiceRead(b,req,{play:o.id,read:selection.read},confidence);
    if(result)reads.set(o.id,result);
  }
  const best=reads.size?Math.max(...[...reads.values()].map(r=>r.u)):null;
  const ranked=best!==null?[...legal].sort((x,y)=>(reads.get(y.id)?.u??-99)-(reads.get(x.id)?.u??-99)):legal;
  // A combo set-up must still suit the down: no run set-up on long yardage, and nothing far below the best option.
  const fits=o=>{const c=catalog[o.id],sit=req.situation||{};
    if(sit.down>=3&&sit.distance>=5&&c.family==='run')return false;
    const r=reads.get(o.id);return !r||best==null||r.u>=best-1;};
  let comboSetup=equippedComboSetup(b,req);
  const chosen=[],families=new Set(),aims=new Map();
  const pick=(o,aim)=>{
    if(!o||chosen.includes(o))return;
    chosen.push(o);
    families.add(catalog[o.id].family);
    if(aim)aims.set(o.id,aim);
  };
  const setup=c=>comboRead(b,req,c);
  const qo=offense&&legal.find(o=>origin(catalog[o.id])==='quick_out');
  const ou=offense&&legal.find(o=>origin(catalog[o.id])==='out_and_up');
  const outLook=(qo||ou)&&b?.teams?.[other(req.side)]&&b.game?setupLook(b,req.side):null;
  const readyShot=ou&&(outLook?.outs===2||outLook?.elsewhere?.outs===2)?ou:null;
  if(twoDown){
    const distance=req.situation.distance,target=Math.max(1,distance-2);
    clue=`Two-down territory. ${distance>2?'Gain '+target+' to leave fourth-and-two or better.':'A short gain can keep fourth down manageable.'} ${clue}`;
    // Only the printed play outcomes enter this shortlist, regardless of the hidden defense.
    const gains=(c,tier)=>Math.max(0,...(c.results?.[tier]||[]).filter(r=>['catch','run'].includes(r.kind)).map(r=>r.yards[0]));
    const available=legal.filter(o=>!catalog[o.id].quickKick&&o.id!=='spike');
    const add=(options,score,aim)=>{
      const best=options.filter(o=>!aims.has(o.id)).sort((a,z)=>score(catalog[z.id])-score(catalog[a.id]))[0];
      pick(best,aim);
    };
    const rushScreen=available.find(o=>(blitz||heat)&&origin(catalog[o.id])==='screen');
    const setupOptions=rushScreen?[rushScreen]:available.filter(o=>['run','quick'].includes(catalog[o.id].family));
    add(setupOptions,c=>-Math.abs(gains(c,'success')-target),'Set up fourth down');
    add(available.filter(o=>gains(catalog[o.id],'success')>=distance),c=>-Math.abs(gains(c,'success')-distance),'Go for the sticks');
    if(readyShot&&!aims.has(readyShot.id))pick(readyShot,'Take a shot');
    else add(available.filter(o=>catalog[o.id].family==='deep'),c=>gains(c,'explosive'),'Take a shot');
  }
  if(outLook&&chosen.length<3)pick(readyShot||qo,readyShot?'Take a shot':'Set up the double move');
  if(chosen.length<3){
    const counter=ranked.find(o=>counters(catalog[o.id]));
    const payoff=comboSetup?.ready&&ranked.find(o=>o.id===comboSetup.play&&fits(o));
    pick(counter||payoff||ranked.find(o=>setup(catalog[o.id])&&fits(o)),counter?'Play the counter':'Use the setup');
  }
  if(chosen.length<3)pick(legal.find(o=>o.id===req.options?.openingScript),'Opening script');
  const sequence=comboSetup&&!comboSetup.ready&&comboSetup.step<comboSetup.steps&&OFFENSIVE_SETUP[comboSetup.id];
  if(sequence&&chosen.length<3&&!twoDown&&(!sequence.yards||100-(req.situation?.field??0)>sequence.yards)){
    const next=ranked.find(o=>{
      const c=catalog[o.id];
      const prepares=sequence.plays?sequence.plays.includes(origin(c)):c.family===sequence.family;
      return prepares&&!c.quickKick&&!c.drill&&fits(o);
    });
    if(next){
      const card=catalog[next.id];
      comboSetup={...comboSetup,nextCall:{id:next.id,name:card.name}};
      pick(next,'Build the setup');
    }
  }
  if(offense&&!twoDown&&reads.size&&chosen.length<3){
    const sit=req.situation,goal=sit.field+sit.distance>=100;
    const protectClock=sit.period===4&&sit.clock<=120&&sit.score?.[req.side]>sit.score?.[other(req.side)];
    const hurry=sit.clock<=45&&(b.clockIntent==='preserve'||sit.period===4&&sit.score?.[req.side]<sit.score?.[other(req.side)]);
    if(hurry&&sit.down<3)pick(legal.find(o=>o.id==='spike'),'Stop the clock');
    const floor={aim:protectClock?'Keep the clock moving':'Dependable gain',
      accept:c=>c.family==='run'||(!protectClock&&(c.family==='quick'||origin(c)==='screen')),
      score:(ev,o)=>6*ev.floor+.1*ev.yards-14*ev.turnover-3*ev.sack-.15*o.cost};
    const chains={aim:goal?'Reach the end zone':'Move the chains',accept:()=>true,score:(ev,o)=>utility(ev,{down:3})-.25*o.cost};
    const shot={aim:'Take a shot',accept:c=>c.family==='deep'||c.results?.explosive?.some(r=>r.yards[0]>=20),
      score:(ev,o)=>23*ev.chunk+.15*ev.yards-10*ev.turnover-.15*o.cost};
    const jobs=goal?[chains,floor]:sit.down<3?[floor,shot,chains]:[chains,shot,floor];
    for(const {aim,accept,score} of jobs){
      if(chosen.length>=3||[...aims.values()].includes(aim))continue;
      const options=ranked.filter(o=>reads.has(o.id)&&!chosen.includes(o)&&accept(catalog[o.id]));
      const different=options.filter(o=>!families.has(catalog[o.id].family));
      const pool=different.length?different:options;
      const candidate=pool.sort((a,z)=>score(reads.get(z.id).ev,z)-score(reads.get(a.id).ev,a))[0];
      pick(candidate,aim);
    }
  }
  // Keep the shortlist varied even when several calls have similar estimates.
  for(const o of ranked)if(chosen.length<3&&!families.has(catalog[o.id].family))pick(o);
  for(const o of ranked)if(chosen.length<2)pick(o);
  const lineup=b?.teams?.[req.side]?.lineup?.[req.role]||{};
  const names=(roles,fallback)=>[...new Set((roles||[]).map(r=>lineup[r]?.name).filter(Boolean))].join(' & ')||fallback;
  const choices=chosen.map(o=>{
    const card=catalog[o.id],c=offense&&selection.play===card.id?R.targetedPlay(card,selection.target,lineup):card,combo=setup(c);let detail;
    const actorRole=offense&&!c.quickKick&&origin(c)!=='read_option'&&(c.pass?c.target:c.carrier);
    const actorPlayer=actorRole&&lineup[actorRole];
    const actor=actorPlayer?.id!=null&&actorPlayer.name?{id:actorPlayer.id,name:actorPlayer.name,role:actorRole,kind:c.pass?'target':'runner'}:null;
    if(offense){
      const actor=names([c.target||c.carrier],c.pass?'Your receiver':'Your runner');
      if(c.quickKick)detail=`${b?.teams?.[req.side]?.specialists?.P?.name||'Your punter'} punts; give up possession for field position.`;
      else if(c.id==='spike')detail=`${names(['QB'],'Your QB')} spikes it to stop the clock. It costs a down.`;
      else if(c.family==='run')detail=`${actor} carries it. Repeating the run can make them lean in and open up play action.`;
      else if(c.family==='quick')detail=look.coverage?.confirmed&&look.coverage.value==='man'?`Find ${actor} quickly; tight man coverage makes the release harder.`:`Find ${actor} quickly; if they play tight man, the release gets harder.`;
      else if(c.family==='deep'){const sh=look.shell?.confirmed?look.shell.value:null;
        detail=`Look deep for ${actor}; protection must hold, and ${sh===2?'two safeties limit the shot':sh===0?'no deep safety can help':'a deep safety can still take it away'}.`}
      else if(origin(c)==='screen')detail=`Screen to ${actor}; invite the rush, but risk calling into a bluff.`;
      else detail=`Use ${actor} off the fake; the setup still needs winning player matchups.`;
      const fit=callReason(req,c);if(fit)detail=`${actor}: ${fit}`;
      if(!c.quickKick&&lean&&c.punishes===lean&&blitz&&needsProtection(c))detail=`${leanRead(lean)}, but the confirmed rush can get home before ${actor} comes open off the fake.`;
      else if(!c.quickKick&&lean&&c.punishes===lean)detail=`${leanRead(lean)}. Use ${actor} on the counter if the matchup holds.`;
      else if(lean==='quick'&&c.id==='vertical_shot')detail=`With defenders sitting on short passes, take a shot to ${actor} if protection holds.`;
      else if(blitz&&!heat&&origin(c)==='screen')detail=`Screen to ${actor}: the confirmed rush helps the screen at the Gate.`;
      else if(heat&&origin(c)==='screen')detail=`Screen to ${actor}: repeated pressure helps at the Key${look.pressure?.confirmed?(look.pressure.value?' and this rush helps at the Gate.':', even with no extra rush now.'):'; the next rush is unknown.'}`;
      else if(outLook&&['quick_out','out_and_up'].includes(origin(c))){
        const corner=b.teams[other(req.side)].lineup.def.BCB?.name||'The corner',away=outLook.elsewhere;
        detail=origin(c)==='quick_out'?`Setup: ${corner} has seen ${outLook.outs}/2 quick outs from ${outLook.name}.${away?` He saw ${away.outs} from ${away.name}.`:''}`
          :outLook.outs>=2?`${corner} has seen two quick outs from ${outLook.name}; he may jump the break.`
          :away?`${corner} saw ${away.outs}/2 from ${away.name}; ${outLook.outs?`he has seen ${outLook.outs}/2 from your current ${outLook.name}.`:`in ${outLook.name} his read starts over.`}`:`${corner} has seen ${outLook.outs}/2 quick outs; the double move works best after two.`;
      }
      else if(combo)detail=`${combo.name} ready: ${names(c.duels?.[combo.duel]?.off?.slice(0,1),actor)} gets help on ${String(c.duels?.[combo.duel]?.label||'the matchup').toLowerCase()}.`;
    }else if(c.pressure>0)detail=`Send ${names(['RUSH'],'your edge rusher')}; if they pass, rush the pocket. A screen can slip behind it.`;
    else if(c.shell===2)detail=`Keep ${names(['FS'],'your safety')} deep; limit deep throws, ${c.box==='light'?'but leave fewer bodies against the run':'but give the passer time'}.`;
    else detail=`Trust ${names(c.coverage==='man'?['FCB']:['MIKE'],'your coverage unit')} in ${c.coverage}; ${c.coverage==='man'?'if they throw quick, contest the release':'keep coverage numbers'}, but give the passer time.`;
    if(!offense){
      const fit=callReason(req,c);
      if(fit)detail=`${names([c.pressure?'RUSH':c.shell===2?'FS':'MIKE'],'Your defense')}: ${fit}`;
      if(combo)detail=`${combo.name}: ${combo.reward}${combo.condition?' '+combo.condition:''}${combo.alternate?` (${combo.alternate} if they run)`:''}.`;
    }
    // The duel the call has to win first, with both named players and the public chip.
    const selectedTactics=(req.options.tactics||[]).filter(t=>selection.tac?.includes(t.slot));
    const paired=selectedTactics.map(t=>t.id);
    const customized=selection.play===o.id&&(selection.target||paired.length||selection.edgeAssignment)&&reads.has(o.id);
    const projection=customized?publicChoiceRead(b,req,{...selection,play:o.id,tactics:paired},confidence):reads.get(o.id);
    const g=projection?.gate,forecast=projection?.forecast,aim=aims.get(o.id);
    const o1=g?.offNames?.find(Boolean),d1=g?.defNames?.find(Boolean);
    const matchup=g&&o1&&d1?{label:g.label,offense:o1,defense:d1,chip:g.chip}:null;
    const cost=o.cost+(selection.play===o.id?selectedTactics.reduce((sum,t)=>sum+t.cost,0):0);
    const refund=req.options.command-cost<D.RULES.seriesCommand;
    const badge=combo?(combo.condition?(refund?'+1 CMD IF THEY RUN':'COMBO IF THEY RUN'):(refund?'COMBO READY · +1 CMD':'COMBO READY')):counterBadge(req,card);
    return{id:o.id,label:c.name,detail:twoDown&&aim?aim+'. '+detail:detail,
      ...(aim?{aim}:{}),...(forecast?{forecast}:{}),...(badge?{badge}:{}),...(matchup?{matchup}:{}),...(actor?{actor}:{})};
  });
  const defensePlan=opponentPlanRead(b,req);
  return{clue,choices,...(defensePlan?{defensePlan}:{}),...(comboSetup?{comboSetup}:{})};
}

// Save/resume: the whole battle is plain data except nothing — it serializes as-is.
// Duel moments for the box score: the duel that decided the game (the snap where the winner took the lead for good) and
// up to two more swings (takeaways and the longest plays). Plain sentences, named players, no hidden numbers.
function decidingMoments(b){
  const snaps=b.log.filter(e=>e.type==='snap'&&e.category!=='kick'&&e.duels&&e.duelResults&&e.score),fs=b.game.score;if(!snaps.length||fs.home===fs.away)return[];
  const winner=fs.home>fs.away?'home':'away',opponent=other(winner);
  const q=p=>p>4?'OT':`Q${p}`,dd=s=>s.sit?.down?`${s.sit.down}${['th','st','nd','rd'][s.sit.down]||'th'} & ${s.sit.distance}`:'';
  // Credit the side that won the snap: a takeaway, or any snap the defense won for the eventual winner (a safety,
  // a stop), credits a defender's won duel; otherwise the offense's. Only reached duels count: every duel is rolled,
  // but a lost Gate ends the play, so the later duels never happened.
  const line=(s,why,defenseWon=!!s.turnover)=>{
    let best=null;const reached=s.duelResults[0]?.won?s.duelResults.length:1;
    s.duels.forEach((d,i)=>{const r=s.duelResults[i];if(!r||i>=reached)return;if((defenseWon?!r.won:r.won)&&(!best||Math.abs(d.margin||0)>Math.abs(best.d.margin||0)))best={d,r}});
    if(!best)return null;const w=best.r.won?best.d.offNames?.[0]:best.d.defNames?.[0],l=best.r.won?best.d.defNames?.[0]:best.d.offNames?.[0];
    if(!w||!l)return null;
    return`${why}: ${w} beat ${l} on ${best.d.label.toLowerCase()} (${q(s.sit.period)}${dd(s)?`, ${dd(s)}`:''}, ${D.PLAYS[s.play]?.name||s.play}).`;
  };
  // A between-snap kick, kickoff return or OT shootout can take the lead for good.
  // Only credit a scrimmage duel when that score actually came from scrimmage.
  const goAhead=b.game.events?.findLast(e=>{
    if(e.team!==winner||!(e.points>0)||!e.state?.score)return false;
    const lead=e.state.score[winner]-e.state.score[opponent];
    return lead>0&&lead<=e.points;
  });
  const scrimmageScore=goAhead?.type==='safety'||(goAhead?.type==='touchdown'&&goAhead.kind!=='return');
  const decisivePoints=goAhead?.state.score[winner];
  const decider=scrimmageScore&&snaps.find(s=>s.sit?.score?.[winner]<decisivePoints&&s.score[winner]>=decisivePoints);
  const out=[],used=new Set();
  if(decider){const t=line(decider,'Deciding duel',!!decider.turnover||decider.offSide!==winner);if(t){out.push(t);used.add(decider)}}
  // The lead can change on a field goal or a return, which is not a snap: then the winner's biggest play turned it.
  if(!out.length){const big=snaps.filter(x=>x.offSide===winner&&!x.turnover&&x.yards>0).sort((a,c)=>(c.yards||0)-(a.yards||0))[0];const t=big&&line(big,'Turning point');if(t){out.push(t);used.add(big)}}
  const swings=snaps.filter(s=>!used.has(s)&&(s.turnover||Math.abs(s.yards||0)>=25)).sort((a,c)=>(c.turnover?100:0)+Math.abs(c.yards||0)-((a.turnover?100:0)+Math.abs(a.yards||0))).slice(0,2);
  for(const s of swings){const t=line(s,s.turnover==='interception'?'Interception':s.turnover==='fumble'?'Fumble':s.turnover?'Fourth-down stop':'Big play');if(t)out.push(t)}
  return out.slice(0,3);
}
function save(b){return JSON.stringify(b)}
function load(text){
  const b=JSON.parse(text);if(b.version!==VERSION)throw new Error('Unsupported battle version.');
  // Older mid-snap saves hold a copy of the printed card. Keep the dealt slots and prices, but use
  // the registered definition the resolver will actually play. Do not deal again or reveal the opponent.
  const req=b.pending;
  if(req?.role==='def'&&['plan','snap'].includes(req.kind))req.offTendency=tendencyCounts(b,offSide(b));
  if(req?.kind==='snap'&&req.role==='def'&&req.side===b.user){
    const cue=setupCue(b,req);
    if(cue)req.setupCue=cue;else delete req.setupCue;
  }
  if(req?.kind==='snap'&&req.side===b.user){
    const payoff=comboPayoff(b,req);
    if(payoff)req.comboPayoff=payoff;else delete req.comboPayoff;
  }
  if(req?.kind==='snap')for(const [pile,catalog] of [['plays',req.role==='off'?D.PLAYS:D.CALLS],['tactics',D.TACTICS]])
    for(const o of req.options?.[pile]||[])if(Object.hasOwn(catalog,o.id)&&catalog[o.id].signature)o.card=catalog[o.id];
  // V20 snapshots printed a minimum QB speed on the ordinary Read Option.
  // Refresh that one option in place so resuming never spends Command or deals a new hand.
  if(req?.role==='off'&&['snap','plan'].includes(req.kind)){
    const situational=[];
    if(sneakAvailable(b))situational.push(D.PLAYS.qb_sneak);
    if(popPassReady(b,req.side))situational.push(D.PLAYS.te_pop_pass);
    for(const card of situational)if(req.options?.plays&&!req.options.plays.some(o=>o.id===card.id)){
      req.options.plays.push({id:card.id,base:true,card,cost:costOf(b,req.side,card),blocked:R.playBlocked(card,b.teams[req.side].lineup.off,req.situation)});
    }
    for(const o of req.options?.plays||[])if(o.id==='read_option'&&o.card?.needs?.trait==='speed'){
      o.card=D.PLAYS.read_option;
      o.blocked=R.playBlocked(o.card,b.teams[req.side].lineup.off,req.situation);
    }
  }
  b.headset=headsetSettings(b.headset);
  b.workload??={};b.personnel??={};b.backfieldMode??={home:'auto',away:'auto'};
  for(const t of Object.values(b.teams))for(const p of [...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.backfield||[]),...(t.packageDepth||[]),...Object.values(t.packageStarters||{})])b.personnel[p.id]??=p;
  return b;
}

function simulate(opts){
  const b=create({...opts,user:null,mode:'sim'});
  if(opts.user==='home'||opts.user==='away')b.headsetSide=opts.user;
  advance(b);return b;
}

// Who won and lost each duel this game, per player, plus the plays that made highlights.
// A lost Gate decides the play, so the duels after it never happened. Returns {playerId:{name,side,w,l,big}}.
function duelTally(b){
  const out={},rec=(p,side)=>p?(out[p.id]??={name:p.name,side,w:0,l:0,big:0}):null;
  for(const e of b.log||[]){
    if(e.type!=='snap'||!e.duelResults||!e.duels)continue;
    const O=snapLineup(b,e,'off'),Df=snapLineup(b,e,'def');
    for(let i=0;i<e.duelResults.length;i++){
      const d=e.duels[i],won=e.duelResults[i].won;if(!d)continue;
      for(const r of d.offRoles||[]){const t=rec(O[r],e.offSide);if(t)won?t.w++:t.l++}
      for(const r of d.defRoles||[]){const t=rec(Df[r],e.defSide);if(t)won?t.l++:t.w++}
      if(i===0&&!won)break;
    }
    const P=e.participants||{},td=/touchdown/i.test(e.text||'');
    if(Math.abs(e.yards||0)>=20||td||e.turnover||e.kind==='sack'){
      const defStar=e.kind==='sack'?Df[P.sacker]:e.turnover?Df[P.defender]:null;
      const offStar=defStar?null:(e.kind==='run'||e.kind==='scramble')?O[P.carrier]:e.completed?O[P.target]:null;
      const t=defStar?rec(defStar,e.defSide):rec(offStar,e.offSide);if(t)t.big++;
    }
  }
  return out;
}
return{driveSummary,delegatedRecap,driveLog,tendencyCounts,covTendFor,setupProgress,canRedraw,redrawCost,setupCue,equippedComboSetup,lookUncertain,lookCertainty,snapVerdict,coachedSnapReview,practiceCoachedSnap,practiceRoleReps,turningPointSnaps,DRIVE_CHALLENGES,THREE_DRIVE_CHALLENGE,createChallenge,challengeResult,setupLook,dressPackage,packageLineup,archivedDrive,replayDrive,tryRewardCard,sameLookPair,seasonRecap,callFilm,duelSum,filmFog,scoutedForecast,quickForecast,quickTactics,lastCallRecap,lastUserCall,VERSION,HEADSET_RULES,headsetSettings,sidelineOptions,setSideline,revealedThreat,GROUPINGS,setGrouping,groupingFor,groupingOptions,bracketOptions:R.bracketOptions,kickerEdge,punterEdge,decidingMoments,comboFor,comboRead,create,advance,submit,preview,save,load,simulate,offOptions,defOptions,leanFor,presumedCall,lookFor,duelTally,BACKFIELD_MODES,setBackfield,snapLineup,leanRead,counterBadge,callReason,tacticRead,coachingRead,explainSnap,matchupStory,postgameTakeaway,adaptationRead,snapDecisions};
});
