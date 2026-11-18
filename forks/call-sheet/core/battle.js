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
  const deps=node?[require('./data.js'),require('./resolver.js'),require('../../../rng.js'),require('../../../game-engine-v2.js')]
    :[root.CallSheet.data,root.CallSheet.resolver,root.DynastyRng,root.DynastyGameEngineV2];
  const api=factory(...deps);
  if(node)module.exports=api;else root.CallSheet.battle=api;
})(typeof window==='object'?window:globalThis,function(D,R,DynastyRng,Engine){
'use strict';
const VERSION=1;
const other=s=>s==='home'?'away':'home';
const clone=v=>JSON.parse(JSON.stringify(v));
const OFF_FAMILIES=['run','quick','deep','constraint'];

// ---------------------------------------------------------------- setup
function create(opts){
  const seed=String(opts.seed??'call-sheet');
  const game=Engine.createGame({home:{id:'home',name:opts.home.name,rating:70},away:{id:'away',name:opts.away.name,rating:70},seed,rules:{penalties:true,returns:true,pressure:true,...(opts.conditions?{conditions:opts.conditions}:{})}});
  const b={version:VERSION,seed,mode:opts.mode||'series',user:opts.user||null,control:opts.control||'both',weather:opts.weather||'clear',conditions:opts.conditions||null,grouping:{home:'auto',away:'auto'},specialUsed:{home:{},away:{}},rivalry:!!opts.rivalry,game,
    teams:{home:clone(opts.home),away:clone(opts.away)},
    decks:{home:clone(opts.home.decks||D.DEFAULT_DECKS),away:clone(opts.away.decks||D.DEFAULT_DECKS)},
    piles:{},hands:{home:null,away:null},
    tend:{home:blankTend(),away:blankTend()},
    seriesKey:null,seriesSnap:0,plan:null,period:1,
    snap:null,pending:null,log:[],lastResult:null,
    streaks:{},fire:{},workload:{},drive:{key:null,fams:[],firsts:0},bonusCommand:{home:0,away:0},exhausted:{home:[],away:[]},
    box:{home:blankBox(),away:blankBox()},players:{},personnel:{},backfieldMode:{home:'auto',away:'auto'},
    telemetry:{decisions:{plan:0,snap:0,info:0,fourth:0},snaps:0,series:0,userSnaps:0,lineCounts:{},cardsPlayed:0},
    rng:DynastyRng.create(`${seed}:cards`).snapshot()};
  // Game-day form: every team is a little sharp or a little flat on a given day (its own seeded stream, so nothing
  // else shifts). Talent still decides each duel; form is what lets an underdog win on a good day.
  {const fr=DynastyRng.create(`${seed}:form`);b.form={};for(const side of ['home','away'])b.form[side]=Math.round(Math.max(-2*FORM_SIGMA,Math.min(2*FORM_SIGMA,fr.gauss()*FORM_SIGMA))*100)/100}
  for(const side of ['home','away']){
    b.piles[side]={off:freshPiles(b,b.decks[side].off),def:freshPiles(b,b.decks[side].def)};
    const deck=b.decks[side].off;
    if(D.canScriptOpener(deck,deck.openingScript))(b.pendingOpeners??={})[side]=deck.openingScript;
    const t=b.teams[side];
    for(const p of [...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.backfield||[])])b.personnel[p.id]=p;
  }
  return b;
}
function blankTend(){return{run:0,quick:0,deep:0,constraint:0,pressure:0,man:0,zone:0}}
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
  const t=b.teams[side],pool=t.backfield;if(!pool?.length)return;
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
  (b.backfieldMode??={home:'auto',away:'auto'})[side]=mode;chooseBack(b,side);
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
// Form joins each side's edges on every duel, labeled, once it is big enough to notice.
const FORM_SIGMA=Number(globalThis.__CS_FORM_SIGMA)||.5;
function formEdge(b,side){const f=b.form?.[side]||0;if(Math.abs(f)<.15)return[];const t=b.teams[side];return[{v:f,src:`${t?.short||t?.name||side} ${f>0?'sharp':'flat'} today`}]}
function edgesFor(b,offSide){const def=other(offSide);return{offEdges:[...(b.teams[offSide]?.edges?.off||[]),...formEdge(b,offSide)],defEdges:[...(b.teams[def]?.edges?.def||[]),...formEdge(b,def)]}}
function isUser(b,side){
  if(b.user!==side||!b.game.possession)return false;
  if(b.control==='both')return true;
  return(b.control==='offense')===(side===b.game.possession);
}
function keyMoment(b){
  const g=b.game;
  return g.down>=3||g.fieldPosition>=D.RULES.redZone||((g.period===2||g.period===4)&&g.clock<=D.RULES.twoMinute)||g.period>4;
}
function leanFor(b){ // the defense leans when the offense's tendency reaches its coordinator's discipline
  const off=b.tend[offSide(b)],disc=b.teams[defSide(b)].coach.discipline??4;
  let best=null,bv=0;for(const f of ['run','quick','deep']){if(off[f]>bv){bv=off[f];best=f}}
  return bv>=disc?best:null;
}
function heatFor(b){return b.tend[defSide(b)].pressure>=3}

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
  if(b.period<=2&&g.period>=3){halftime(b)}
  b.period=g.period;
  if(key===b.seriesKey)return false;
  b.seriesKey=key;b.seriesSnap=0;b.plan=null;b.telemetry.series++;
  for(const side of ['home','away'])dealHand(b,side,side===g.possession?'off':'def');
  return true;
}
function dealHand(b,side,role){
  const old=b.hands[side];
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
  b.hands[side]={role,...script,wrinkles:drawFrom(b,p.wrinkle,D.RULES.wrinkleRow),tactics:drawFrom(b,p.tactic,D.RULES.tacticHand),command:D.RULES.seriesCommand+bonus+staffBonus,onceUsed:[]};
}
function halftime(b){
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
  const lean=leanFor(b);
  return{
    box:{value:call.box,confirmed:true},
    shell:{value:shownShell,confirmed:qbSees&&!disguised},
    pressure:{value:call.look.pressureShown,confirmed:false},
    coverage:{value:null,confirmed:false},
    lean:{value:lean,confirmed:!!off.coach.film},
    heat:heatFor(b)
  };
}
function blindLook(b){
  return{box:{value:'normal',confirmed:false},shell:{value:1,confirmed:false},pressure:{value:heatFor(b),confirmed:false},coverage:{value:null,confirmed:false},lean:{value:leanFor(b),confirmed:true},heat:heatFor(b)};
}
// What the offense believes the call is: a pseudo-call built only from the Look.
function presumedCall(look,confirmedLeanOnly=false){
  const shell=look.shell.value===0?0:look.shell.value;
  const coverage=look.coverage.confirmed?look.coverage.value:(shell===2?'zone':'man');
  const pressure=look.pressure.confirmed?look.pressure.realLevel:(look.pressure.value?1:0);
  return{id:'presumed',box:look.box.value,shell,coverage,pressure,counters:look.lean.value&&(!confirmedLeanOnly||look.lean.confirmed)?[look.lean.value]:[],look:{}};
}
// What the defense knows of the offense: family if Film Tell confirmed it, else its tendency.
function offFamilyWeights(b,revealedFamily){
  if(revealedFamily)return Object.fromEntries(OFF_FAMILIES.map(f=>[f,f===revealedFamily?1:0]));
  const g=b.game,t=b.tend[offSide(b)],w={run:1.1,quick:1,deep:.7,constraint:.45};
  if(g.distance<=2){w.run*=2.2;w.deep*=.5}else if(g.distance>=8&&g.down>=2){w.run*=.45;w.deep*=1.5;w.quick*=1.3}
  for(const f of OFF_FAMILIES)w[f]*=1+t[f]*.18;
  const s=Object.values(w).reduce((a,v)=>a+v,0);for(const f of OFF_FAMILIES)w[f]/=s;return w;
}
const REP_PLAYS={run:['inside_zone','outside_zone','power'],quick:['quick_slant','stick'],deep:['deep_cross','vertical_shot'],constraint:['pa_boot','screen']};

// ---------------------------------------------------------------- special teams and situations (rules v0.9)
// Timeout cards spend one of the engine's real timeouts (three per half).
const TIMEOUT_CARDS=['timeout_settle','timeout_ice'];
const timeoutsLeft=(b,side)=>Number(b.game.timeouts?.[side]??3);
// Personnel grouping: 11 (balanced), 12 and 21 (heavy), 10 (spread). Auto picks by situation.
const GROUPINGS={auto:'Auto',11:'11 · balanced','12':'12 · two tight ends','21':'21 · fullback','10':'10 · four wide'};
function groupingFor(b,side){
  const m=b.grouping?.[side]||'auto';if(m!=='auto')return m;
  const g=b.game;if(g.distance<=2)return'21';if(g.down>=3&&g.distance>=7)return'10';if((g.fieldPosition||0)>=80)return'12';return'11';
}
function setGrouping(b,side,mode){if(!Object.hasOwn(GROUPINGS,mode))throw new Error('Unknown personnel grouping.');(b.grouping??={home:'auto',away:'auto'})[side]=mode;return b.pending}
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
function drillOn(b){const g=b.game;return(g.period===2||g.period===4)&&Number(g.clock)<=120&&!g.ot}
const freeCard=(b,side,role,id)=>b.decks[side][role].base.includes(id)||(role==='off'&&(D.DRILL_CARDS||[]).includes(id)&&drillOn(b));
function offOptions(b,side){
  const hand=b.hands[side],team=b.teams[side],lineup=team.lineup.off;
  const plays=[...b.decks[side].off.base.map(id=>({id,base:true})),...(drillOn(b)?(D.DRILL_CARDS||[]).map(id=>({id,base:true,drill:true})):[]),...hand.wrinkles.map((id,i)=>({id,base:false,slot:i}))]
    .map(o=>({...o,card:D.PLAYS[o.id],cost:costOf(b,side,D.PLAYS[o.id]),blocked:R.playBlocked(D.PLAYS[o.id],lineup,situation(b))}));
  const tactics=hand.tactics.map((id,i)=>({id,slot:i,card:D.TACTICS[id],cost:costOf(b,side,D.TACTICS[id])})).filter(t=>!TIMEOUT_CARDS.includes(t.id)||timeoutsLeft(b,side)>0);
  return{plays,tactics,command:hand.command,...(hand.openingScript?{openingScript:hand.openingScript}:{}),...(hand.openingScriptMiss?{openingScriptMiss:hand.openingScriptMiss}:{})};
}
function defOptions(b,side){
  const hand=b.hands[side];
  const plays=[...b.decks[side].def.base.map(id=>({id,base:true})),...hand.wrinkles.map((id,i)=>({id,base:false,slot:i}))]
    .map(o=>({...o,card:D.CALLS[o.id],cost:costOf(b,side,D.CALLS[o.id]),blocked:R.signatureBlocked(D.CALLS[o.id],b.teams[side].lineup.def)}));
  const tactics=hand.tactics.map((id,i)=>({id,slot:i,card:D.TACTICS[id],cost:costOf(b,side,D.TACTICS[id])})).filter(t=>!TIMEOUT_CARDS.includes(t.id)||timeoutsLeft(b,side)>0);
  return{plays,tactics,command:hand.command};
}
function subsets(arr,max){const out=[[]];for(const x of arr){const n=out.length;for(let i=0;i<n;i++)if(out[i].length<max)out.push([...out[i],x])}return out}
function uniqTactics(list){const seen=new Set();return list.filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true})}

// ---------------------------------------------------------------- AI
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

function aiOffense(b,side,look,opts={}){
  const o=offOptions(b,side),team=b.teams[side],sit=situation(b),def=b.teams[other(side)].lineup.def;
  const call=presumedCall(look),cap=opts.cap??budget(b,side);
  const tacs=uniqTactics(o.tactics.filter(t=>!t.card.info&&!R.signatureBlocked(t.card,team.lineup[b.hands[side].role])));
  // Coordinators keep to their scheme's run/pass mix: the further off it, the stronger the pull back.
  const bx=b.box[side],calls=bx.rushAtt+bx.passAtt+bx.sacks,runShare=calls?bx.rushAtt/calls:1-(team.coach.passRate??.5);
  const balance=sit.down>=3&&sit.distance>4?0:6*((1-(team.coach.passRate??.5))-runShare)+1.1;
  const lines=[];
  for(const p of o.plays){
    if(p.blocked||p.cost>cap)continue;
    for(const ts of subsets(tacs,2)){
      const cost=p.cost+ts.reduce((s,t)=>s+t.cost,0);if(cost>cap)continue;
      if(ts.some(t=>R.tacticBlocked(t.card,p.card,team.lineup.off)))continue;
      const snap=R.buildSnap({weather:b.weather,...edgesFor(b,side),off:team.lineup.off,def,play:p.card,...knownEffects(b,p.card,call),call,offTactics:ts.map(t=>t.id),situation:sit,lean:look.lean.confirmed?look.lean.value:null,heat:look.heat,motionConfirmed:!!b.snap?.motionConfirmed});
      const ev=R.evaluate(snap,sit);
      const isRun=!p.card.pass;
      lines.push({play:p.id,tactics:ts.map(t=>t.id),u:utility(ev,sit)-cost*(sit.down>=3?.2:.55)-(p.base?0:.15)+(isRun?balance:-balance)});
    }
  }
  if(!lines.length)return{play:b.decks[side].off.base[0],tactics:[]};
  const pick=withRng(b,rng=>softPick(rng,lines,sit.down>=3?.8:1.2));
  return{play:pick.play,tactics:pick.tactics};
}
function aiDefense(b,side,opts={}){
  const o=defOptions(b,side),team=b.teams[side],offTeam=b.teams[other(side)],sit=situation(b),cap=opts.cap??budget(b,side);
  const weights=offFamilyWeights(b,opts.revealedFamily),lean=leanFor(b),heat=heatFor(b);
  const tacs=uniqTactics(o.tactics.filter(t=>!t.card.info&&!R.signatureBlocked(t.card,team.lineup[b.hands[side].role])));
  const lines=[];
  for(const p of o.plays){
    if(p.blocked||p.cost>cap)continue;
    for(const ts of subsets(tacs,2)){
      const cost=p.cost+ts.reduce((s,t)=>s+t.cost,0);if(cost>cap)continue;
      let u=0;
      for(const f of OFF_FAMILIES){
        if(weights[f]<.02)continue;const reps=REP_PLAYS[f].filter(id=>!R.playBlocked(D.PLAYS[id],offTeam.lineup.off));let best=-99;
        for(const id of reps){
          const snap=R.buildSnap({weather:b.weather,...edgesFor(b,other(side)),off:offTeam.lineup.off,def:team.lineup.def,play:D.PLAYS[id],...knownEffects(b,D.PLAYS[id],p.card),call:p.card,defTactics:ts.map(t=>t.id),situation:sit,lean,heat});
          best=Math.max(best,utility(R.evaluate(snap,sit),sit));
        }
        u+=weights[f]*(best===-99?0:best);
      }
      lines.push({play:p.id,tactics:ts.map(t=>t.id),u:-u-cost*(sit.down>=3?.2:.55)-(p.base?0:.15)});
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
  if(kind==='tactic'||!b.decks[side][hand.role].base.includes(id))b.box[side].cardsPlayed++;
}
// Info tactics resolve at once and change what the side knows this snap.
function applyInfo(b,side,id){
  const s=b.snap,hand=b.hands[side];
  payAndRemove(b,side,'tactic',id);
  const call=D.CALLS[s.def.play];
  if(hand.role==='off'){
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
  const card=role==='off'?D.PLAYS[choice.play]:D.CALLS[choice.play];
  if(!card)throw new Error(`Unknown play ${choice.play}.`);
  const sig=R.signatureBlocked(card,b.teams[side].lineup[role]);if(sig)throw new Error(sig);
  if(role==='off'){const why=R.playBlocked(card,b.teams[side].lineup.off,situation(b));if(why)throw new Error(why)}
  const tactics=[...new Set(choice.tactics||[])];
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
  payAndRemove(b,side,'play',choice.play);for(const id of tactics)payAndRemove(b,side,'tactic',id);
  if(outs.length&&b.game.timeouts)b.game.timeouts[side]=Math.max(0,b.game.timeouts[side]-outs.length);
  return{play:choice.play,tactics,...(role==='off'&&choice.read==='primary'?{read:'primary'}:{})};
}

// ---------------------------------------------------------------- the loop
function startSnap(b){
  const off=offSide(b),def=defSide(b);
  chooseBack(b,off);
  b.snap={off:null,def:null,offInfo:[],defInfo:[],look:null,offLook:{family:{value:null,confirmed:false},protection:{value:null,confirmed:false}},motionConfirmed:false,falseStart:false};
  // Whoever is not the person commits first; with no person, the defense commits first.
  if(isUser(b,def)){b.snap.off=decideAI(b,off,'off')}
  else{b.snap.def=decideAI(b,def,'def')}
  if(b.snap.def)b.snap.look=lookFor(b,b.snap.def);
}
function decideAI(b,side,role){
  if(role==='def'){
    const info=aiInfoDefense(b,side);
    for(const id of info)applyInfoEarly(b,side,id);
    return commit(b,side,aiDefense(b,side,{revealedFamily:null}));
  }
  // An offense that commits before the defense has lined up (the person is on defense) sees only a blind look.
  if(!b.snap.def)return commit(b,side,aiOffense(b,side,blindLook(b)));
  const look=b.snap.look||lookFor(b,b.snap.def);b.snap.look=look;
  for(const id of aiInfoOffense(b,side,look))applyInfo(b,side,id);
  return commit(b,side,aiOffense(b,side,b.snap.look));
}
// A defensive info card played before the offense has committed only works later (film tell needs a play).
function applyInfoEarly(b,side,id){payAndRemove(b,side,'tactic',id);b.snap.defInfo.push(id)}

// Mode rules: does the person decide this snap live?
function liveFor(b,side){
  if(!isUser(b,side))return false;
  if(b.mode==='snap')return true;if(b.mode==='sim')return false;
  return keyMoment(b);
}
function needsPlan(b,side){return isUser(b,side)&&b.mode==='series'&&!b.plan&&!keyMoment(b)}

// Run until a person must decide or the game ends. Returns the pending request or null.
function advance(b){
  let guard=0;
  while(++guard<5000){
    const g=b.game;
    if(b.pending)return b.pending;
    if(g.status==='pregame')Engine.startGame(g);
    if(g.status==='final'){finalize(b);return null}
    if(g.period>4&&g.ot&&g.ot.period>=3){Engine.step(g);continue}
    ensureSeries(b);
    const off=offSide(b),def=defSide(b);
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
        if(liveFor(b,userSide)&&!scripted){b.pending=snapRequest(b,userSide);b.telemetry.decisions.snap++;return b.pending}
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
  return{kind:'snap',side,role,situation:situation(b),look:role==='off'?b.snap.look:null,offLook:role==='def'?b.snap.offLook:null,
    options:role==='off'?offOptions(b,side):defOptions(b,side),lean:leanFor(b),heat:heatFor(b),
    offTendency:{...b.tend[offSide(b)]},info:role==='off'?b.snap.offInfo:b.snap.defInfo};
}
function planRequest(b,side){
  const role=b.hands[side].role;
  return{kind:'plan',side,role,situation:situation(b),options:role==='off'?offOptions(b,side):defOptions(b,side),lean:leanFor(b),offTendency:{...b.tend[offSide(b)]}};
}
function fourthChoice(b){
  const g=b.game,off=offSide(b);
  if(g.period>4){if(g.fieldPosition>=55&&Engine.fieldGoalInRange(g))return'ot_fg';return'go'}
  if(isUser(b,off)&&b.mode!=='sim')return'ask';
  const d=Engine.defaultFourthDown(g);return d==='play'?'go':d;
}
function fourthRequest(b){
  const g=b.game,opts=['go','punt'];if(Engine.fieldGoalInRange(g,Engine.FG_OFFER_CHANCE))opts.push('field_goal');
  const ke=kickerEdge(b,offSide(b));
  return{kind:'fourth',side:offSide(b),situation:situation(b),options:opts,recommended:Engine.defaultFourthDown(g)==='play'?'go':Engine.defaultFourthDown(g),fgChance:Math.max(.02,Math.min(.99,Engine.fieldGoalChance(g,Engine.fieldGoalDistance(g))+ke.adjust)),kicker:ke};
}
function kick(b,choice){
  const g=b.game,off=offSide(b),before=g.fieldPosition;
  if(choice==='ot_fg'){Engine.step(g);b.log.push({type:'kick',text:'Overtime field goal attempt.'});return}
  const sit=situation(b);
  if(choice==='punt'){const pe=punterEdge(b,off);Engine.punt(g,{netAdjust:pe.netAdjust});b.box[off].punts++;b.log.push({type:'kick',kick:'punt',side:off,sit,after:situation(b),score:{...g.score},text:`${b.teams[off].short} punts from the ${yardLine(before)}${pe.name&&pe.netAdjust?` (${pe.name}: ${pe.netAdjust>0?'+':''}${pe.netAdjust} yards)`:''}.`})}
  else{const ke=kickerEdge(b,off),evStart=g.events.length;armSpecials(b,off);const made=Engine.attemptFieldGoal(g,{adjust:ke.adjust});const notes=settleSpecials(b,off,evStart);
    b.log.push({type:'kick',kick:'field_goal',made,side:off,sit,after:situation(b),score:{...g.score},text:`${b.teams[off].short} ${made?'makes':'misses'} a ${100-before+17}-yard field goal${ke.adjust?` (${ke.name?ke.name+': ':''}${ke.adjust>0?'+':''}${Math.round(ke.adjust*100)}%)`:''}.${notes.length?' '+notes.join('. ')+'.':''}`})}
}

// ---------------------------------------------------------------- submit
function submit(b,action){
  const req=b.pending;if(!req)throw new Error('Nothing is waiting for a decision.');
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
    if(action.type==='info'){
      if(!D.TACTICS[action.tactic]?.info)throw new Error('That is not an information card.');
      applyInfo(b,side,action.tactic);b.telemetry.decisions.info++;
      if(b.snap.falseStart){b.pending=null;falseStart(b,side);return advance(b)}
      b.pending=snapRequest(b,side);return b.pending;
    }
    if(action.type==='auto'){b.pending=null;fillAI(b,side);resolveSnap(b);return advance(b)}
    if(action.type==='call'){
      const res=commit(b,side,action);
      if(role==='off')b.snap.off=res;else{b.snap.def=res;b.snap.look=lookFor(b,res)}
      b.pending=null;b.telemetry.userSnaps++;b.snap.userCalled=true;
      if(role==='def'&&!b.snap.off)b.snap.off=decideAI(b,offSide(b),'off');
      resolveSnap(b);return advance(b);
    }
  }
  throw new Error(`Unknown action for ${req.kind}.`);
}
function falseStart(b,side){
  const g=b.game;
  // The defense's committed cards return to its hand: no snap happened.
  if(b.snap.def){const d=b.hands[defSide(b)];const call=D.CALLS[b.snap.def.play];if(!b.decks[defSide(b)].def.base.includes(call.id)){d.wrinkles.push(b.snap.def.play);b.piles[defSide(b)].def.wrinkle.discard.pop()}for(const t of b.snap.def.tactics){d.tactics.push(t);b.piles[defSide(b)].def.tactic.discard.splice(b.piles[defSide(b)].def.tactic.discard.lastIndexOf(t),1)}d.command+=costOf(b,defSide(b),call)+b.snap.def.tactics.reduce((s,t)=>s+costOf(b,defSide(b),D.TACTICS[t]),0)}
  Engine.applyScrimmage(g,{penalty:{kind:'false_start'}});
  b.box[side].penalties++;b.box[side].penaltyYds+=5;
  b.log.push({type:'penalty',side,text:`False start on the hard count, ${b.teams[side].short}. Five yards.`});
  b.snap=null;b.fourthGo=false;
}

// The first combo (rules v0.8, data.COMBOS) this play/call would complete, from this drive's memory. Offense combos
// need only the play; defense combos also need the call (null when only the offense is known).
function comboFor(b,play,call=null){
  if(!play)return null;
  const mine=b.drive?.key===`${b.game.drive}:${offSide(b)}`,dr=mine?b.drive:{};
  const c={play,call,root:play.evolvedFrom||play.upgradeOf||play.id,fams:dr.fams||[],plays:dr.plays||[],calls:dr.calls||[],results:dr.results||[]};
  // Each team completes each combo at most once per half (overtime is its own half).
  const half=b.game.period<=2?1:b.game.period<=4?2:3,usedBy=side=>b.comboLog?.[side]?.[half]||[];
  const hit=(D.COMBOS||[]).find(x=>!usedBy(x.side==='def'?defSide(b):offSide(b)).includes(x.id)&&(x.side==='off'||call)&&x.test(c));
  return hit?{id:hit.id,name:hit.name,duel:hit.duel,v:hit.v,side:hit.side,reward:hit.reward}:null;
}
function knownEffects(b,play,call=null){return{fire:b.fire,workload:b.workload||{},combo:comboFor(b,play,call),grouping:groupingFor(b,offSide(b))}}

// ---------------------------------------------------------------- resolution
function rollPenalty(b,play){
  return withRng(b,rng=>{
    let r=rng.next();
    for(const [kind,p] of Object.entries(Engine.PENALTY_TYPES)){if(p.pass&&!play.pass)continue;r-=p.weight;if(r<0)return{kind,spec:p}}
    return null;
  });
}
function resolveSnap(b){
  const g=b.game,off=offSide(b),def=defSide(b),s=b.snap;
  if(!s.def)s.def=decideAI(b,def,'def');
  if(!s.look)s.look=lookFor(b,s.def);
  if(!s.off)s.off=decideAI(b,off,'off');
  const play=D.PLAYS[s.off.play],call=D.CALLS[s.def.play],sit=situation(b);
  const lean=leanFor(b),heat=heatFor(b);
  // Drive memory for combos.
  const dkey=`${g.drive}:${off}`;if(b.drive.key!==dkey)b.drive={key:dkey,fams:[],plays:[],calls:[],results:[],combos:[],firsts:0};
  b.drive.plays??=[];b.drive.calls??=[];b.drive.results??=[];b.drive.combos??=[];
  const fams=b.drive.fams,combo=comboFor(b,play,call);
  const hurried=s.off.tactics.includes('hurry_up')&&s.def.tactics.length>0;
  // Coordinators skip the checkdown on long 3rd and 4th downs; the person chooses (Auto or Primary only).
  const read=s.off.read||(s.userCalled&&isUser(b,off)?'auto':sit.down>=3&&sit.distance>=8?'primary':'auto');
  const momentum=b.momentum?.side===off&&b.momentum.left>0;
  const snap=R.buildSnap({weather:b.weather,...edgesFor(b,off),off:b.teams[off].lineup.off,def:b.teams[def].lineup.def,play,call,offTactics:s.off.tactics,defTactics:hurried?[]:s.def.tactics,situation:sit,lean,heat,motionConfirmed:s.motionConfirmed,read,momentum,...knownEffects(b,play,call)});
  b.telemetry.snaps++;b.seriesSnap++;
  const lineKey=`${play.id}${s.off.tactics.length?'+'+[...s.off.tactics].sort().join('+'):''}`;b.telemetry.lineCounts[lineKey]=(b.telemetry.lineCounts[lineKey]||0)+1;
  // Tendencies move whether or not a flag flies.
  b.tend[off][play.family]++;b.tend[def][call.family==='pressure'?'pressure':call.coverage]++;
  const pen=g.period>4?null:rollPenalty(b,play);
  const lineups={off:Object.fromEntries(Object.entries(b.teams[off].lineup.off).map(([r,p])=>[r,p.id])),def:Object.fromEntries(Object.entries(b.teams[def].lineup.def).map(([r,p])=>[r,p.id]))};
  const result={lineups,userCalled:!!s.userCalled,sit,offSide:off,defSide:def,play:play.id,call:call.id,offTactics:[...s.off.tactics],defTactics:[...s.def.tactics],offInfo:[...s.offInfo],defInfo:[...s.defInfo],lean,heat,duels:snap.duels,look:s.look};
  if(pen){
    const against=pen.spec.against==='offense'?off:def;
    Engine.applyScrimmage(g,{penalty:{kind:pen.kind},clock:pen.spec.dead?4:8});
    b.box[against].penalties++;b.box[against].penaltyYds+=pen.spec.yards||5;
    result.penalty={kind:pen.kind,label:pen.spec.label,against};result.text=`Flag: ${pen.spec.label} on ${b.teams[against].short}.`;
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
    Object.assign(result,{category:out.category,kind:out.kind,yards:out.yards,turnover:out.turnover||null,completed:out.completed,duelResults:out.duels,participants:out.participants});
    const before={down:g.down,distance:g.distance,field:g.fieldPosition,score:{...g.score}};
    const evStart=g.events.length;armSpecials(b,off);
    // Two-minute drill: a trailing or tied offense (or a trailing defense) burns a timeout to stop a running clock.
    let timeoutNote='';
    if(drillOn(b)&&!out.turnover&&out.kind!=='inc'&&out.clock>10&&g.timeouts){
      const offBehind=g.score[off]<=g.score[def],defBehind=g.period===4&&g.score[def]<g.score[off],who=offBehind&&g.timeouts[off]>0?off:defBehind&&g.timeouts[def]>0?def:null;
      if(who){g.timeouts[who]--;out.clock=Math.min(out.clock,6);timeoutNote=` ${b.teams[who].short} calls timeout (${g.timeouts[who]} left).`}
    }
    Engine.applyScrimmage(g,{yards:out.yards,clock:out.clock,kind:out.engineKind,completed:out.completed,turnover:out.turnover});
    const specialNotes=settleSpecials(b,off,evStart);
    // Tag the play the way Dynasty Lab's attribution expects (run/pass, completion, sack), plus who actually played it.
    for(let i=g.events.length-1;i>=evStart;i--){const ev=g.events[i];if(!['scrimmage','interception','fumble'].includes(ev.type))continue;
      ev.kind=out.engineKind;if(typeof out.completed==='boolean')ev.completed=out.completed;if(out.kind==='sack')ev.sack=true;
      const P=out.participants,O=b.teams[off].lineup.off,Df=b.teams[def].lineup.def,id=(lu,r)=>r&&lu[r]?String(lu[r].id):null;
      ev.card={play:play.id,call:call.id,category:out.category,actors:{qb:play.pass?id(O,'QB'):null,carrier:id(O,P.carrier),target:id(O,P.target),
        sacker:id(Df,P.sacker),...(out.kind==='sack'?{blockers:play.duels.G.protect?[...new Set(snap.duels[0].offRoles.map(r=>id(O,r)).filter(Boolean))]:[]}:{}),tackler:out.kind==='sack'||out.turnover==='interception'?null:id(Df,P.defender),interceptor:out.turnover==='interception'?id(Df,P.defender):null}};break}
    b.workload??={};for(const p of [...Object.values(b.teams[off].lineup.off),...Object.values(b.teams[def].lineup.def)])b.workload[p.id]=(b.workload[p.id]||0)+1;
    recordStats(b,off,def,out,before,play);
    result.text=storyLine(b,off,def,play,out,before)+(specialNotes.length?` ${specialNotes.join('. ')}.`:'')+timeoutNote;
    if(specialNotes.length)result.special=specialNotes;
    result.events=[];
    if(hurried)result.events.push({type:'hurry',side:off,name:'Hurry-up',reward:'their adjustments never got in'});
    fams.push(play.family);b.drive.plays.push(play.evolvedFrom||play.upgradeOf||play.id);
    b.drive.calls.push({pressure:call.pressure,shell:call.shell,shown:!!call.look?.pressureShown});b.drive.results.push({family:play.family,yards:out.yards|0});
    for(const k of ['plays','calls','results'])if(b.drive[k].length>6)b.drive[k].splice(0,b.drive[k].length-6);
    if(combo){b.drive.combos.push(combo.id);const earner=combo.side==='def'?def:off,half=g.period<=2?1:g.period<=4?2:3;((b.comboLog??={})[earner]??={})[half]=[...(b.comboLog[earner][half]||[]),combo.id];result.events.push({type:'combo',...combo,side:earner});if(b.hands[earner])b.hands[earner].command=Math.min(D.RULES.seriesCommand,b.hands[earner].command+1)}
    if(g.possession===off&&g.down===1&&g.score[off]===before.score[off]&&!out.turnover){
      b.drive.firsts++;
      if(b.drive.firsts===3){b.bonusCommand[off]=1;result.events.push({type:'combo',id:'chain_gang',name:'Chain Gang',reward:'+1 Command next series',side:off})}
    }
    updateFire(b,off,def,snap,out.wins,result.events);
    // A constraint play that works resets the tendency it punished.
    if(['success','explosive'].includes(out.category)){
      if(play.punishes==='run'&&lean==='run'){b.tend[off].run=0;result.reset='run'}
      if(play.id==='vertical_shot'&&lean==='quick'){b.tend[off].quick=0;result.reset='quick'}
      if(play.id==='screen'&&heat){b.tend[def].pressure=0;result.reset='pressure'}
    }
  }
  result.after=situation(b);result.score={...g.score};
  b.lastResult=result;b.log.push({type:'snap',...result});
  b.snap=null;b.fourthGo=false;
  return result;
}
// On Fire: a playmaker who wins every duel he's in for three straight snaps gets +1 until he loses one.
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
function yardLine(f){return f>50?`opp ${100-f}`:f===50?'50':`own ${f}`}
function storyLine(b,off,def,play,out,before){
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
  return`${play.name}: ${what}. ${why}`;
}
function pstat(b,side,role,lineupKey){
  const p=b.teams[side].lineup[lineupKey][role];if(!p)return null;
  return b.players[p.id]??=(b.players[p.id]={id:p.id,name:p.name,side,role,archetype:p.archetype,rushAtt:0,rushYds:0,rushTD:0,passAtt:0,comp:0,passYds:0,passTD:0,ints:0,targets:0,rec:0,recYds:0,recTD:0,sacks:0,tackles:0,intDef:0,sacksTaken:0});
}
function recordStats(b,off,def,out,before,play){
  const bo=b.box[off],P=out.participants,g=b.game;
  const td=g.score[off]-before.score[off]>=6&&!out.turnover;
  // Gains stop at the goal line (and losses at your own end line), the way the engine and the box score count them.
  out={...out,yards:out.turnover?out.yards:Math.max(-before.field,Math.min(out.yards,100-before.field))};
  bo.plays++;
  if(before.down===3){bo.thirdAtt++}if(before.down===4){bo.fourthAtt++}
  const gained=!out.turnover&&out.yards>=before.distance;
  if(gained){bo.firstDowns++;if(before.down===3)bo.thirdConv++;if(before.down===4)bo.fourthConv++}
  if(out.yards>=20&&!out.turnover)bo.explosives++;
  if(out.kind==='sack'){bo.sacks++;bo.passAtt+=0;bo.yards+=out.yards;const q=pstat(b,off,'QB','off');q.sacksTaken++;const s=pstat(b,def,P.sacker,'def');if(s)s.sacks++;}
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
  try{Engine.validateGame(b.game)}catch(e){b.final.engineError=e.message}
}

// Projection for the sandbox: what the person's current choice is expected to do against the Look.
function preview(b,side,choice){
  const req=b.pending;if(!req||req.side!==side)return null;
  const role=b.hands[side].role,sit=situation(b);
  if(role==='off'){
    const play=D.PLAYS[choice.play];if(!play)return null;
    const call=presumedCall(b.snap.look,true);
    const snap=R.buildSnap({weather:b.weather,...edgesFor(b,side),off:b.teams[side].lineup.off,def:b.teams[other(side)].lineup.def,play,...knownEffects(b,play,call),call,offTactics:choice.tactics||[],situation:sit,lean:req.look?.lean?.confirmed?req.look.lean.value:null,heat:!!req.look?.heat,motionConfirmed:b.snap.motionConfirmed});
    return{snap,ev:R.evaluate(snap,sit),against:call};
  }
  const call=D.CALLS[choice.play];if(!call)return null;
  const fam=b.snap.offLook.family.confirmed?b.snap.offLook.family.value:null,w=offFamilyWeights(b,fam),out=[];
  for(const f of OFF_FAMILIES){if(w[f]<.02)continue;const id=REP_PLAYS[f].find(x=>!R.playBlocked(D.PLAYS[x],b.teams[other(side)].lineup.off));if(!id)continue;
    const snap=R.buildSnap({weather:b.weather,...edgesFor(b,other(side)),off:b.teams[other(side)].lineup.off,def:b.teams[side].lineup.def,play:D.PLAYS[id],...knownEffects(b,D.PLAYS[id],call),call,defTactics:choice.tactics||[],situation:sit,lean:leanFor(b),heat:heatFor(b)});
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
  const box=known('box'),shell=known('shell'),rush=known('pressure'),coverage=known('coverage'),lean=known('lean');
  const origin=c.evolvedFrom||c.upgradeOf||c.id;
  if(lean&&c.punishes===lean)return `The ${lean} lean helps this counter at the Key.`;
  const match=(c.matchups||[]).find(m=>({pressure:rush===true,shell1:shell===1,shell2:shell===2,man:coverage==='man',zone:coverage==='zone',loaded:box==='loaded',light:box==='light'})[m.when]);
  if(match){
    const tell={pressure:'rush',shell1:'single-high shell',shell2:'two-high shell',man:'man coverage',zone:'zone coverage',loaded:'loaded box',light:'light box'}[match.when];
    return `The confirmed ${tell} gives this design ${match.v>0?'help':'trouble'} on ${c.duels[match.duel].label.toLowerCase()}.`;
  }
  if(c.family==='run'&&box==='light')return 'The light box helps your blockers at the Gate.';
  if(c.family==='run'&&box==='loaded')return 'The loaded box gives your blockers a tougher Gate.';
  if(c.family==='deep'&&shell===2)return 'Two deep safeties make the Key matchup harder.';
  if(c.family==='deep'&&shell===0)return 'No deep safety helps your receiver at the Key.';
  if(origin==='pa_boot'&&box==='loaded')return 'Crowded linebackers give the run fake help at the Key.';
  if(origin==='screen'&&rush===true)return 'The confirmed rush helps the screen at the Gate.';
  if(c.family==='quick'&&coverage==='man')return 'Tight man coverage makes the release harder at the Gate.';
  if(rush===true&&Object.values(c.duels||{}).some(d=>d.protect))return 'Confirmed pressure gives your blockers less time to protect the passer.';
  if(c.family==='deep'&&req.situation?.field>=80)return 'Inside the 20, there is less room to get open deep.';
  return '';
}
// Suggest at most one affordable, useful card. A selected card is explained even if a later play change made it a bad fit.
function tacticRead(req,playId,lineup={},selected=[]){
  const o=req?.options,p=o?.plays?.find(x=>x.id===playId);
  if(req?.kind!=='snap'||!p||p.blocked)return null;
  const off=req.role==='off',play=p.card||(off?D.PLAYS:D.CALLS)[p.id];
  if(!play)return null;
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
      case 'timeout_settle':case 'timeout_ice':return req.situation?.down>=3?'Spend a timeout for help on the Key duel this down.':'';
      default:return '';
    }
  }
  const hand=o.tactics||[],isSelected=selected.length>0;
  for(const t of (isSelected?selected.map(i=>hand.find(t=>t.slot===i)).filter(Boolean):hand)){
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
    if(l.lean.confirmed&&l.lean.value)cues.push(`They are leaning on ${l.lean.value}. Look for a play that punishes that lean.`);
    if(l.box.confirmed&&l.box.value==='loaded')cues.push(play?.family==='run'?'Loaded box: your run has a tougher Gate. Consider changing the picture.':'Loaded box: fewer defenders are available behind the front.');
    if(l.box.confirmed&&l.box.value==='light')cues.push('Light box: a run gets help at the Gate.');
    if(l.heat&&l.pressure.confirmed&&!l.pressure.value)cues.push('They rushed often on film, but the current read confirms no extra rush.');
    else if(l.pressure.value||l.heat)cues.push(`${l.pressure.confirmed?'Confirmed pressure':l.heat?'Repeated pressure on film':'Pressure shown, not confirmed'}: protection or a screen may help.`);
    if(l.shell.confirmed&&l.shell.value===2)cues.push('Two deep safeties: deep routes face a tougher Key duel.');
    if(l.shell.confirmed&&l.shell.value===0)cues.push('No deep safety: a deep shot has help at the Key, if protection holds.');
    if(cues.length===(play?1:0))cues.push('No clear tell yet. Motion can confirm coverage; an unconfirmed shell may be a disguise.');
  }else{
    const f=req.offLook?.family;
    if(f?.confirmed)cues.push(`Film confirms ${f.value}. Match your call to that family.`);
    const counts=Object.entries(req.offTendency||{}).filter(([f])=>OFF_FAMILIES.includes(f)).sort((a,c)=>c[1]-a[1]);
    if(counts[0]?.[1]>=3)cues.push(`They have called ${counts[0][0]} ${counts[0][1]} times. That is a tendency, not a promise.`);
    if(req.lean)cues.push(`You are leaning on ${req.lean}. Watch for a counter.`);
    if(!cues.length)cues.push('Little film yet. Use down and distance, or Film Tell to identify the play family.');
  }
  return cues.slice(0,2);
}
function explainSnap(e){
  if(!e)return null;
  if(e.penalty)return{summary:e.text,detail:'Flag on the play; no duel credit awarded.'};
  if(!e.duelResults?.length)return null;
  const reached=e.duelResults[0].won?e.duelResults.slice(0,3):e.duelResults.slice(0,1);
  const i=reached.findIndex(d=>!d.won),at=i<0?reached.length-1:i,d=e.duels[at],won=reached[at].won;
  const names=won?d.offNames:d.defNames,opponents=won?d.defNames:d.offNames;
  const edge=d.mods.filter(m=>m.src!=='Play design'&&(m.v>0)===won).sort((a,c)=>Math.abs(c.v)-Math.abs(a.v))[0];
  return{summary:`${d.label}: ${names.join(' & ')} beat ${opponents.join(' & ')}.`,
    detail:`${reached.map(d=>`${d.key} ${d.won?'won':'lost'}`).join(' · ')}${reached.length===1?' · Key and Finish not reached':''}${edge?` · Edge: ${edge.src.replace(/ \(health \d+\)/g,'')}`:''}`};
}

// Presentation-only evidence: these helpers never draw RNG or change the battle.
function matchupStory(e){
  if(!e||e.penalty||e.category==='kick'||!e.duelResults?.length)return null;
  const reached=e.duelResults[0].won?e.duelResults.slice(0,3):e.duelResults.slice(0,1);
  const failed=reached.findIndex(r=>!r.won),i=failed<0?reached.length-1:failed,d=e.duels?.[i];
  if(!d)return null;
  const offWon=!!reached[i].won,winnerSide=offWon?e.offSide:e.defSide;
  const names=(offWon?d.offNames:d.defNames)||[],losers=(offWon?d.defNames:d.offNames)||[];
  const ratingEdge=Number.isFinite(d.offGrade)&&Number.isFinite(d.defGrade)?d.offGrade-d.defGrade:null;
  const setupEdge=(d.mods||[]).reduce((n,m)=>n+(Number(m.v)||0),0),sign=offWon?1:-1;
  let detail='A favorable matchup improves the odds; it never guarantees the duel.';
  if(ratingEdge!==null){
    if(sign*ratingEdge>0&&sign*setupEdge<0)detail='The winner’s player-rating advantage overcame an unfavorable setup and situational edges.';
    else if(sign*(ratingEdge+setupEdge)<0)detail='The matchup favored the other side, but winning it was not guaranteed.';
    else if(sign*ratingEdge<0&&sign*setupEdge>0)detail='Setup and situational edges helped the lower-rated matchup win.';
    else if(sign*ratingEdge>0)detail='The winner had the player-rating edge in the traits this duel tested.';
  }
  // A duel is not the same as a catch: outcome tables can still produce an incompletion.
  if(e.kind==='inc'&&reached.every(r=>r.won))detail+=' All reached duels went the offense’s way, but the pass still fell incomplete.';
  return{summary:`${d.label}: ${names.filter(Boolean).join(' & ')||'The winner'} beat ${losers.filter(Boolean).join(' & ')||'the matchup'}.`,detail,key:d.key,winnerSide,winnerRoles:offWon?d.offRoles:d.defRoles,loserRoles:offWon?d.defRoles:d.offRoles,offWon,ratingEdge,setupEdge};
}
// The call that set up this 4th down, if the coach made it. Only the immediately preceding snap counts: a staff
// call, penalty or kick in between means the coach's own call is not what led here. Reads the log; never mutates.
function lastCallRecap(b,side=b?.user){
  const e=[...(b?.log||[])].reverse().find(x=>x.type==='snap'||x.type==='kick');
  if(!e||e.type!=='snap'||!e.userCalled||e.offSide!==side||e.penalty||!D.PLAYS[e.play])return null;
  const y=Number(e.yards)||0,story=matchupStory(e);
  const result=e.turnover?(e.turnover==='interception'?'intercepted':'fumble'):e.kind==='inc'?'incomplete':e.kind==='sack'?`sacked, ${y} yd`:`${y>0?'+':''}${y} yd`;
  return{play:e.play,name:D.PLAYS[e.play].name,down:e.sit?.down??null,result,summary:story?.summary||null,offWon:story?story.offWon:null};
}
// The coach's most recent own call on either side of the ball, and how many snaps have run since. The call board
// pins it once staff snaps have pushed it out of the ticker. Reads the log; never mutates.
function lastUserCall(b,side=b?.user){
  const log=b?.log||[];let since=0;
  for(let i=log.length-1;i>=0;i--){
    const e=log[i];if(e.type!=='snap')continue;
    if(!e.userCalled||e.penalty){since++;continue}
    const off=e.offSide===side,def=off?null:D.CALLS[e.call];if(off?!D.PLAYS[e.play]:!def)return null;
    const y=Number(e.yards)||0,story=matchupStory(e);
    const result=e.turnover?(e.turnover==='interception'?'intercepted':'fumble'):e.kind==='inc'?'incomplete':e.kind==='sack'?`sack, ${y} yd`:`${y>0?'+':''}${y} yd`;
    return{role:off?'off':'def',id:off?e.play:e.call,name:off?D.PLAYS[e.play].name:def.name,result,summary:story?.summary||null,won:story?(off?story.offWon:!story.offWon):null,since};
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
// A duel as two vertical sums: each side's ability, plus the labeled modifiers that help that side, and a total.
// Resolver mods are signed for the offense (raw = offGrade - defGrade + sum of mods), so a negative mod is listed as a
// plus on the defense's column. Ability is rounded to 0.1 first and totals are added from the shown numbers, so the
// arithmetic on screen always checks out; the edge is the difference of the two shown totals. Display only.
function duelSum(d){
  if(!d||!Number.isFinite(d.offGrade)||!Number.isFinite(d.defGrade))return null;
  const r=x=>Math.round(x*10)/10,off={grade:r(d.offGrade),adds:[]},def={grade:r(d.defGrade),adds:[]};
  for(const m of d.mods||[]){const v=Number(m.v)||0;if(!v)continue;(v>0?off:def).adds.push({v:r(Math.abs(v)),src:String(m.src||'Effect')})}
  for(const c of [off,def])c.total=r(c.grade+c.adds.reduce((n,a)=>n+a.v,0));
  return{off,def,edge:r(off.total-def.total)};
}
// Film on the opponent from one battle: their defensive call families and their offense's run/pass mix, counted from
// the log. Stored by the dynasty so a later meeting can say what they actually did against you.
function callFilm(b,side=b?.user){
  if(!b?.log||!side)return null;const opp=side==='home'?'away':'home',film={def:{pressure:0,man:0,zone:0,total:0},off:{run:0,pass:0,total:0},own:{plays:{},snaps:0,mine:0}};
  for(const e of b.log){
    if(e.type!=='snap'||e.penalty||e.category==='kick')continue;
    if(e.defSide===opp){const c=D.CALLS[e.call];if(c&&film.def[c.family]!==undefined){film.def[c.family]++;film.def.total++}}
    if(e.offSide===opp){const p=D.PLAYS[e.play];if(p){film.off[p.family==='run'?'run':'pass']++;film.off.total++}}
    // Your own offensive calls, for the season recap: calls, yards, stops, and how many you called yourself.
    if(e.offSide===side&&D.PLAYS[e.play]&&Number.isFinite(e.yards)){const t=film.own.plays[e.play]??={n:0,yards:0,stops:0,mine:0};
      t.n++;t.yards+=e.yards;t.stops+=e.turnover||e.yards<=0?1:0;t.mine+=e.userCalled?1:0;film.own.snaps++;film.own.mine+=e.userCalled?1:0}
  }
  return film.def.total||film.off.total||film.own.snaps?film:null;
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
function adaptationRead(b,req=b?.pending){
  if(req?.kind!=='snap'||!['off','def'].includes(req.role))return null;
  const offense=req.role==='off'?req.side:other(req.side);
  const recent=(b.log||[]).filter(e=>e.type==='snap'&&e.offSide===offense&&D.PLAYS[e.play]&&e.category!=='kick').slice(-5);
  const last=recent[recent.length-1],family=last&&D.PLAYS[last.play].family;
  let count=0;for(let i=recent.length-1;i>=0&&D.PLAYS[recent[i].play].family===family;i--)count++;
  const lean=req.role==='off'?(req.look?.lean?.confirmed?req.look.lean.value:null):req.lean;
  if(!lean&&count<3)return null;
  const named=lean||family,label={run:'the run',quick:'quick passes',deep:'deep passes',constraint:'constraint plays'}[named]||named;
  const counter=req.role==='off'?(req.options?.plays||[]).find(p=>!p.blocked&&p.cost<=req.options.command&&D.PLAYS[p.id]?.punishes===named):null;
  return{summary:lean?`${req.role==='off'?'They are':'You are'} leaning on ${label}.`:`${req.role==='off'?'You have':'They have'} called ${count} straight ${family} plays.`,
    detail:lean?`${count>=3&&family===lean?`The last ${count} calls repeated that family. `:''}${req.role==='off'?'A counter can punish the lean, but it still has to win its player matchups.':'A counter may punish your lean. The next call is still unknown.'}`:`That pattern may invite an adjustment. It is film, not confirmation of the next call.`,family:named,confirmed:!!lean,count,counterPlay:counter?.id||null};
}

// A compact, public-information call sheet. Never evaluate hidden opponent ability or committed cards.
// The shortlist is a contrast of available approaches, not a ranked prediction of snap outcomes.
function snapDecisions(b,req=b?.pending){
  if(req?.kind!=='snap'||!['off','def'].includes(req.role))return null;
  const offense=req.role==='off',catalog=offense?D.PLAYS:D.CALLS,look=req.look||{};
  const lean=offense?(look.lean?.confirmed?look.lean.value:null):req.lean;
  const heat=offense&&!!look.heat,adapt=adaptationRead(b||{},req);
  const leanLabel={run:'the run',quick:'quick passes',deep:'deep passes'}[lean]||lean;
  let clue;
  if(!offense&&req.offLook?.family?.confirmed)clue=`Film confirms ${req.offLook.family.value}. Choose how to defend it.`;
  else if(lean)clue=offense?`They are leaning on ${leanLabel}. Stay with it or make them play the counter.`:`You are leaning on ${leanLabel}. Watch for a counter; their next call is unknown.`;
  else if(heat)clue=look.pressure?.confirmed?(look.pressure.value?'Repeated pressure on film, and the rush is confirmed this time.':'They rushed often on film, but this read confirms no extra rush.'):'Repeated pressure on film. The next rush is not confirmed.';
  else if(adapt)clue=adapt.summary+' '+adapt.detail;
  else if(offense&&look.box?.confirmed&&look.box.value==='loaded')clue='They’ve loaded the box. Running inside is tougher; a fake can draw the linebackers in.';
  else if(offense&&look.box?.confirmed&&look.box.value==='light')clue='Light box. There’s room up front if your blockers can clear it.';
  else if(offense&&look.pressure?.value)clue=look.pressure.confirmed?'Pressure confirmed: protect the quarterback or invite the rush with a screen.':'Pressure shown, not confirmed. A screen risks calling into a bluff.';
  else if(offense&&look.shell?.confirmed&&look.shell.value===2)clue='Two safeties back. It’s harder to get a receiver behind them.';
  else if(offense&&look.shell?.confirmed&&look.shell.value===0)clue='No deep safety. A receiver can get behind them if protection holds.';
  else clue=offense?'No clear tell. An unconfirmed shell may be a disguise.':'No confirmed play family. Use down and distance; their next call is unknown.';
  const seen=new Set(),legal=(req.options?.plays||[]).filter(o=>{
    if(!Object.hasOwn(catalog,o.id)||seen.has(o.id)||o.blocked||!Number.isFinite(o.cost)||o.cost>(req.options?.command??0))return false;
    seen.add(o.id);return true;
  });
  const origin=c=>c.evolvedFrom||c.upgradeOf||c.id;
  const counters=c=>offense&&((lean&&c.punishes===lean)||(lean==='quick'&&c.id==='vertical_shot')||(heat&&origin(c)==='screen'));
  const chosen=[],families=new Set(),pick=o=>{if(o&&!chosen.includes(o)){chosen.push(o);families.add(catalog[o.id].family)}};
  const setup=c=>offense&&b?.game?comboFor(b,c):null;
  pick(legal.find(o=>counters(catalog[o.id]))||legal.find(o=>setup(catalog[o.id])));
  pick(legal.find(o=>o.id===req.options?.openingScript));
  // Prefer one call per family; do not turn a hand full of one family into nonexistent alternatives.
  for(const o of legal)if(chosen.length<3&&!families.has(catalog[o.id].family))pick(o);
  for(const o of legal)if(chosen.length<2)pick(o);
  const lineup=b?.teams?.[req.side]?.lineup?.[req.role]||{};
  const names=(roles,fallback)=>[...new Set((roles||[]).map(r=>lineup[r]?.name).filter(Boolean))].join(' & ')||fallback;
  const choices=chosen.map(o=>{
    const c=catalog[o.id],combo=setup(c);let detail;
    if(offense){
      const actor=names([c.target||c.carrier],c.pass?'Your receiver':'Your runner');
      if(c.quickKick)detail=`${b?.teams?.[req.side]?.specialists?.P?.name||'Your punter'} punts; give up possession for field position.`;
      else if(c.id==='spike')detail=`${names(['QB'],'Your QB')} spikes it to stop the clock. It costs a down.`;
      else if(c.family==='run')detail=`${actor} carries it. Repeating the run can make them lean in and open up play action.`;
      else if(c.family==='quick')detail=`Find ${actor} quickly; tight man coverage makes the release harder.`;
      else if(c.family==='deep')detail=`Look deep for ${actor}; protection must hold, and two safeties limit the shot.`;
      else if(origin(c)==='screen')detail=`Screen to ${actor}; invite the rush, but risk calling into a bluff.`;
      else detail=`Use ${actor} off the fake; the setup still needs winning player matchups.`;
      const fit=callReason(req,c);if(fit)detail=`${actor}: ${fit}`;
      if(!c.quickKick&&lean&&c.punishes===lean)detail=`Use ${actor} to punish the ${lean} lean; player matchups still decide it.`;
      else if(lean==='quick'&&c.id==='vertical_shot')detail=`Take a shot to ${actor} against the quick lean; protection must hold.`;
      else if(heat&&origin(c)==='screen')detail=`Screen to ${actor}: repeated pressure helps at the Key${look.pressure?.confirmed?(look.pressure.value?' and this rush helps at the Gate.':', even with no extra rush now.'):'; the next rush is unknown.'}`;
      else if(combo)detail=`${combo.name} ready: ${names(c.duels?.[combo.duel]?.off?.slice(0,1),actor)} gets help on ${String(c.duels?.[combo.duel]?.label||'the matchup').toLowerCase()}.`;
    }else if(c.pressure>0)detail=`Send ${names(['RUSH'],'your edge rusher')}; if they pass, rush the pocket. A screen can slip behind it.`;
    else if(c.shell===2)detail=`Keep ${names(['FS'],'your safety')} deep; limit deep throws, ${c.box==='light'?'but leave fewer bodies against the run':'but give the passer time'}.`;
    else detail=`Trust ${names(c.coverage==='man'?['FCB']:['MIKE'],'your coverage unit')} in ${c.coverage}; ${c.coverage==='man'?'if they throw quick, contest the release':'keep coverage numbers'}, but give the passer time.`;
    if(!offense){const fit=callReason(req,c);if(fit)detail=`${names([c.pressure?'RUSH':c.shell===2?'FS':'MIKE'],'Your defense')}: ${fit}`}
    return{id:o.id,label:c.name,detail};
  });
  return{clue,choices};
}

// Save/resume: the whole battle is plain data except nothing — it serializes as-is.
// Duel moments for the box score: the duel that decided the game (the snap where the winner took the lead for good) and
// up to two more swings (takeaways and the longest plays). Plain sentences, named players, no hidden numbers.
function decidingMoments(b){
  const snaps=b.log.filter(e=>e.type==='snap'&&e.duels&&e.duelResults&&e.score),fs=b.game.score;if(!snaps.length||fs.home===fs.away)return[];
  const winner=fs.home>fs.away?'home':'away',lead=sc=>Math.sign((sc?.home||0)-(sc?.away||0))*(winner==='home'?1:-1);
  const q=p=>p>4?'OT':`Q${p}`,dd=s=>s.sit?.down?`${s.sit.down}${['th','st','nd','rd'][s.sit.down]||'th'} & ${s.sit.distance}`:'';
  // A takeaway credits the defender who won his duel; anything else credits the offense's winning duel.
  const line=(s,why)=>{
    let best=null;
    s.duels.forEach((d,i)=>{const r=s.duelResults[i];if(!r)return;if((s.turnover?!r.won:r.won)&&(!best||Math.abs(d.margin||0)>Math.abs(best.d.margin||0)))best={d,r}});
    if(!best)return null;const w=best.r.won?best.d.offNames?.[0]:best.d.defNames?.[0],l=best.r.won?best.d.defNames?.[0]:best.d.offNames?.[0];
    if(!w||!l)return null;
    return`${why}: ${w} beat ${l} on ${best.d.label.toLowerCase()} (${q(s.sit.period)}${dd(s)?`, ${dd(s)}`:''}, ${D.PLAYS[s.play]?.name||s.play}).`;
  };
  let decider=null;for(let i=0;i<snaps.length;i++){const before=i?snaps[i-1].score:{home:0,away:0};if(lead(snaps[i].score)>0&&lead(before)<=0)decider=snaps[i]}
  const out=[],used=new Set();
  if(decider){const t=line(decider,'Deciding duel');if(t){out.push(t);used.add(decider)}}
  // The lead can change on a field goal or a return, which is not a snap: then the winner's biggest play turned it.
  if(!out.length){const big=snaps.filter(x=>x.offSide===winner&&!x.turnover).sort((a,c)=>(c.yards||0)-(a.yards||0))[0];const t=big&&line(big,'Turning point');if(t){out.push(t);used.add(big)}}
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
  if(req?.kind==='snap')for(const [pile,catalog] of [['plays',req.role==='off'?D.PLAYS:D.CALLS],['tactics',D.TACTICS]])
    for(const o of req.options?.[pile]||[])if(Object.hasOwn(catalog,o.id)&&catalog[o.id].signature)o.card=catalog[o.id];
  b.workload??={};b.personnel??={};b.backfieldMode??={home:'auto',away:'auto'};
  for(const t of Object.values(b.teams))for(const p of [...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.backfield||[])])b.personnel[p.id]??=p;
  return b;
}

function simulate(opts){const b=create({...opts,user:null,mode:'sim'});advance(b);return b}

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
return{VERSION,seasonRecap,callFilm,duelSum,filmFog,lastCallRecap,lastUserCall,GROUPINGS,setGrouping,groupingFor,kickerEdge,punterEdge,decidingMoments,comboFor,create,advance,submit,preview,save,load,simulate,offOptions,defOptions,leanFor,presumedCall,lookFor,duelTally,BACKFIELD_MODES,setBackfield,snapLineup,callReason,tacticRead,coachingRead,explainSnap,matchupStory,postgameTakeaway,adaptationRead,snapDecisions};
});
