// Call Sheet signature player cards (rules v0.5).
// A player who has a breakout game earns a card of his own, built from his position and archetype: a receiver's
// route, a back's run, a rusher's pressure package, a lineman's wall. A signature card belongs to that person and
// plays only while he's on the field. Programs hold at most 3, so earning a fourth means choosing.
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const deps=node?[require('./data.js'),require('./battle.js')]:[root.CallSheet.data,root.CallSheet.battle];
  const api=factory(...deps);
  if(node)module.exports=api;else root.CallSheet.signatures=api;
})(typeof window==='object'?window:globalThis,function(D,B){
'use strict';
const SLOTS=3;
const R=(w,kind,yards,extra={})=>({w,kind,yards,...extra});
const lastName=n=>String(n).split(' ').slice(-1)[0];
const COVER={X:'BCB',Z:'FCB',SLOT:'NICKEL',TE:'WILL',RB:'WILL'};
const PASS_QB=['Rhythm Distributor','Field Architect','Vertical Hunter','Toolsy Project'];

// Which template a player gets.
function templateFor(p){
  const r=p.role;
  if(r==='QB')return PASS_QB.includes(p.archetype)?'qb_audible':'qb_keeper';
  if(r==='RB')return p.archetype==='Third-Down Weapon'?'rb_wheel':'rb_express';
  if(['X','Z','SLOT'].includes(r))return'wr_special';
  if(r==='TE')return'te_seam';
  if(['LT','LG','C','RG','RT'].includes(r))return'ol_wall';
  if(['RUSH','SET','NT','DT3'].includes(r))return'dl_unleashed';
  if(['MIKE','WILL'].includes(r))return'lb_hunt';
  if(['FCB','BCB','NICKEL'].includes(r))return'cb_island';
  return's_robber';
}
// Earned cards (not passive archetype abilities): exactly one small situational adjustment.
// The labels and selectors live together; projections use only a public role and style.
const vs=(label,when)=>({label,when});
const openZone=vs('zone without pressure',{coverage:'zone',pressure:false}),rush=vs('pressure',{pressure:true});
const man=vs('man coverage',{coverage:'man'}),oneMan=vs('single-high man',{coverage:'man',shell:1}),oneZone=vs('single-high zone',{coverage:'zone',shell:1}),twoHigh=vs('two deep safeties',{shell:2});
const light=vs('a light box',{box:'light'}),loaded=vs('a loaded box',{box:'loaded'}),runs=vs('runs',{family:'run'}),deep=vs('deep passes',{family:'deep'});
const fit=(duel,label,edge,counter,scope={})=>({duel,label,edge,counter,scope});
const MATCHUPS={
  qb_audible:fit('K','QB read on Key',openZone,rush,{qbRead:true}),
  qb_keeper:fit('F','Keeper finish',vs('man without a spy',{coverage:'man',spy:false}),vs('a QB spy',{spy:true})),
  rb_express:fit('K','Cutback',light,loaded),
  rb_cut:fit('K','Cutback',vs('pressure from a normal box',{pressure:true,box:'normal'}),loaded),
  rb_wheel:fit('K','Wheel route',rush,vs('two high without pressure',{shell:2,pressure:false})),
  wr_special:fit('K','Getting open',oneMan,twoHigh),
  wr_space:fit('K','Finding space',oneZone,oneMan),
  wr_catch:fit('F','Catch point',oneMan,twoHigh),
  te_seam:fit('K','Seam route',oneZone,man),
  ol_wall:fit('G','Run blocking',vs('Power',{origin:'power'}),vs('Outside Zone',{origin:'outside_zone'})),
  dl_unleashed:fit('G','Rush at the snap',deep,vs('Screen',{origin:'screen'})),
  lb_hunt:fit('K','Downhill read',runs,vs('PA Boot',{origin:'pa_boot'})),
  cb_island:fit('F','Defensive finish',deep,runs),
  s_robber:fit('K','Jumping the route',vs('quick passes',{family:'quick'}),deep)
};
function matchupFor(spec){
  let key=spec.template;
  if(key==='wr_special'){
    if(['Space Hunter','YAC Creator','Motion Weapon'].includes(spec.archetype))key='wr_space';
    else if(['Boundary Bully','Catch-Point Ace'].includes(spec.archetype))key='wr_catch';
  }else if(key==='rb_express'&&['Space Cutter','One-Cut Burner','Patient Slasher'].includes(spec.archetype))key='rb_cut';
  return MATCHUPS[key];
}
// Build the card definition for a spec. Kinds: play (offense wrinkle), call (defense wrinkle), tactic.
function build(spec){
  const L=spec.last,who=spec.name,r=spec.role,base={id:spec.id,cost:1,signature:spec};
  switch(spec.template){
    case'qb_audible':return{kind:'tactic',side:'off',def:{...base,side:'off',name:`${L} Audible`,icon:'📣',effects:[{flag:'qbRead',v:2}],text:`${who} changes the play at the line. Every QB read duel +2.`}};
    case'qb_keeper':return{kind:'play',side:'off',def:{...base,side:'off',name:`${L} Keeper`,family:'run',carrier:'QB',
      text:`${who} keeps it and goes. Built around one player's legs.`,
      duels:{G:{label:'Pull it',off:['QB'],ot:['iq','speed'],def:['SET'],dt:['iq','speed'],bias:2,qbRun:true},K:{label:'Get outside',off:['QB'],ot:['speed','versatility'],def:['WILL'],dt:['speed','iq'],bias:1,qbRun:true},F:{label:'Take it to the house',off:['QB'],ot:['speed','power'],def:['FS'],dt:['speed','technique'],bias:1,qbRun:true}},
      results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[3,1.5])],success:[R(1,'run',[9,2])],explosive:[R(1,'run',[20,8],{tail:.3})]}}};
    case'rb_express':return{kind:'play',side:'off',def:{...base,side:'off',name:`${L} Express`,family:'run',carrier:'RB',
      text:`Give it to ${who} and get out of the way.`,
      duels:{G:{label:'Hit the hole',off:['RB','C'],ot:['power','technique'],def:['NT','MIKE'],dt:['power','iq'],bias:2},K:{label:'One cut',off:['RB'],ot:['iq','speed'],def:['WILL'],dt:['speed','iq'],bias:1},F:{label:'Run through it',off:['RB'],ot:['power','speed'],def:['BOXS'],dt:['power','technique'],bias:1}},
      results:{fail:[R(1,'run',[0,1.5])],short:[R(1,'run',[3,1.2])],success:[R(1,'run',[7,2])],explosive:[R(1,'run',[17,7],{tail:.25})]}}};
    case'rb_wheel':case'wr_special':case'te_seam':{
      const tgt=spec.template==='rb_wheel'?'RB':spec.template==='te_seam'?'TE':r,cov=COVER[tgt];
      const name=spec.template==='rb_wheel'?`${L} Wheel`:spec.template==='te_seam'?`${L} Seam`:`${L} Special`;
      return{kind:'play',side:'off',def:{...base,side:'off',name,family:'deep',target:tgt,pass:true,protection:true,
        text:`A route drawn up for ${who} and nobody else.`,
        duels:{G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:2,protect:true},
          K:{label:`${L} gets open`,off:[tgt],ot:['speed','technique'],def:[cov],dt:['speed','technique'],bias:1,separation:true},
          F:{label:`${L} makes the catch`,off:[tgt],ot:['technique','composure'],def:['FS'],dt:['iq','speed'],bias:1}},
        results:{fail:[R(.3,'sack',[-6,2]),R(.5,'inc',[0,0],{int:.04}),R(.2,'catch',[4,2])],short:[R(.5,'inc',[0,0],{int:.03}),R(.5,'catch',[7,2])],success:[R(.8,'catch',[17,4]),R(.2,'inc',[0,0])],explosive:[R(1,'catch',[30,10],{tail:.3})]}}};
    }
    case'ol_wall':return{kind:'tactic',side:'off',def:{...base,side:'off',name:`${L} Wall`,icon:'🧱',effects:[{flag:'protect',v:2},{flag:'run',duel:'G',v:1}],text:`${who} anchors the line: Protection +2, run Gate +1.`}};
    case'dl_unleashed':return{kind:'call',side:'def',def:{...base,side:'def',name:`${L} Unleashed`,family:'pressure',box:'normal',shell:1,coverage:'zone',pressure:1,counters:['deep','quick'],look:{pressureShown:false},
      effects:[{flag:'protect',v:2,src:`${who} unleashed`}],text:`Free ${who} on a twist nobody has seen. Pressure +2.`}};
    case'lb_hunt':return{kind:'call',side:'def',def:{...base,side:'def',name:`${L} Hunt`,family:'man',box:'loaded',shell:1,coverage:'man',pressure:0,counters:['run','constraint'],look:{pressureShown:false},
      effects:[{flag:'run',duel:'K',v:2,src:`${who} reads it first`}],text:`${who} triggers downhill before the handoff. Run Key duels +2 for you.`}};
    case'cb_island':return{kind:'tactic',side:'def',def:{...base,side:'def',name:`${L} Island`,icon:'🏝',effects:[{flag:'separation',v:2},{flag:'release',v:1}],text:`Put ${who} on their best and leave him alone. +2 against separation, +1 against release.`}};
    default:return{kind:'tactic',side:'def',def:{...base,side:'def',name:`${L} Robber`,icon:'🦅',effects:[{flag:'qbRead',v:2}],text:`${who} sits in the throwing lane. Their QB read duels −2.`}};
  }
}
// Legacy signatures: a retired number's fainter echo on the current starter. Every edge one step smaller (floor 0).
function buildAny(spec){
  const b=build(spec);if(!spec.legacy)return b;
  const def=JSON.parse(JSON.stringify(b.def,(k,v)=>typeof v==='function'?undefined:v));
  for(const e of def.effects||[])e.v=Math.max(0,(e.v||0)-1);def.effects=(def.effects||[]).filter(e=>e.v>0);
  for(const d of Object.values(def.duels||{}))d.bias=Math.max(0,(d.bias||0)-1);
  def.name=`${spec.last} · ${spec.legacy.last} Legacy`;def.legacy=spec.legacy;
  def.text=`LEGACY of #${spec.legacy.number??''} ${spec.legacy.name} · ${def.text} (A fainter edge than the original.)`;
  return{...b,def};
}
// Award tiers (the Heisman chase): 1 = a Player of the Week, 2 = three honors, 3 = a national award or five honors.
// Tiers 1-2 add stars to the name; tier 3 adds +1 to the card's Key duel or its first effect.
function withTier(spec,b){
  const tier=Math.max(0,Math.min(3,spec.tier|0));if(!tier)return b;
  const def=JSON.parse(JSON.stringify(b.def,(k,v)=>typeof v==='function'?undefined:v));def.name=`${def.name} ${'★'.repeat(tier)}`;
  if(tier>=3){if(def.duels?.K)def.duels.K.bias=(def.duels.K.bias||0)+1;else if(def.effects?.length)def.effects[0].v=(def.effects[0].v||0)+1}
  def.text=`${tier>=3?'AWARD WINNER':'HONORED'} · ${def.text}`;def.tier=tier;return{...b,def};
}
function describe(spec){
  const b=withTier(spec,buildAny(spec)),rule=matchupFor(spec);
  if(!rule)return b;
  const gain=spec.legacy ? .5 : 1;
  const prep=spec.template==='ol_wall'?'on':'vs';
  const matchupText=`${rule.label}: +${gain} ${prep} ${rule.edge.label}; −1 ${prep} ${rule.counter.label}.`;
  b.def.signatureMatchup={...rule,gain};b.def.matchupText=matchupText;
  // Effects may have changed for a legacy/award card; never advertise the original numeric bonus.
  const phases={G:'Gate',K:'Key',F:'Finish'},labels={qbRead:'QB reads',protect:'pass protection',run:'runs',separation:'separation',release:'release'};
  const base=b.kind==='play'?b.def.text:(b.def.effects||[]).map(e=>`+${e.v} ${b.side==='def'?'against':'on'} ${labels[e.flag]||e.flag}${e.duel?' ('+phases[e.duel]+')':''}`).join('; ')+'.';
  b.def.text=base+' '+matchupText;
  return b;
}
// How a signature card's matchup lines up with the offense the coach runs. Only offensive cards whose edge or counter
// names a play or play family depend on the deck; defensive cards and cards keyed to the defense's look depend on the
// opponent, and say so instead of inventing a fit. Uses only public role/style and the coach's own deck.
function deckFit(spec,offDeck){
  const rule=matchupFor(spec);if(!rule)return null;
  const deckDriven=w=>w&&(w.origin||w.family);
  if(spec.side==='def'||(!deckDriven(rule.edge.when)&&!deckDriven(rule.counter.when)))
    return{fit:spec.side==='def'?'opponent':'look',edge:{label:rule.edge.label},counter:{label:rule.counter.label},
      text:spec.side==='def'?`Depends on what the offense calls, not your deck: better vs ${rule.edge.label}, worse vs ${rule.counter.label}.`:`Depends on the defense's look, not your deck: better vs ${rule.edge.label}, worse vs ${rule.counter.label}.`};
  const ids=[...(offDeck?.base||[]),...(offDeck?.wrinkles||[])].filter(id=>D.PLAYS[id]);
  const count=w=>!deckDriven(w)?null:ids.filter(id=>w.origin?id===w.origin||D.PLAYS[id].evolvedFrom===w.origin:D.PLAYS[id].family===w.family).length;
  const e=count(rule.edge.when),c=count(rule.counter.when);
  const fit=e===null?(c?'mixed':'neutral'):e>0&&!c?'strong':e>0?'mixed':'weak';
  const n=(k,label)=>k===null?null:k?`${label} ×${k}`:`no ${label}`;
  const parts=[n(e,rule.edge.label)&&`${n(e,rule.edge.label)} (its edge)`,n(c,rule.counter.label)&&`${n(c,rule.counter.label)} (its counter)`].filter(Boolean);
  const lead={strong:'Strong fit with your deck',mixed:'Mixed fit with your deck',weak:'Weak fit with your deck',neutral:'Neutral fit with your deck'}[fit];
  return{fit,edge:{label:rule.edge.label,count:e},counter:{label:rule.counter.label,count:c},text:`${lead}: ${parts.join(', ')}.`};
}
function register(spec){
  const b=describe(spec),table=b.kind==='play'?D.PLAYS:b.kind==='call'?D.CALLS:D.TACTICS;
  table[spec.id]=b.def;D.RARITY[spec.id]='signature';return b;
}
function registerAll(pb){for(const s of [...(pb?.signatures||[]),...(pb?.reserveSignatures||[])])register(s)}
// Keep the grant itself and the latest milestones even after its owner leaves the roster.
function cardHistory(entries){
  const rows=Array.isArray(entries)?entries.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.slice(0,260)):[];
  return rows.length>14?[rows[0],...rows.slice(-13)]:rows;
}
function remember(spec,event){
  const rows=cardHistory(spec.provenance);
  if(event&&rows.at(-1)!==event)spec.provenance=cardHistory([...rows,event]);
}
function breakoutCard(b,side,c,info={}){
  const opp=side==='home'?'away':'home',name=b.teams[opp].name||b.teams[opp].short;
  const score=b.game.score,season=info.season,performance=`${c.wins} of ${c.duels} duels won${c.fire?`, caught fire ${c.fire}×`:''}`;
  const spec=specFor(c.p,{...info,earned:`${performance} vs ${name}`});
  remember(spec,`${season?season+' · ':''}${b.teams[side].name||b.teams[side].short} ${score[side]}–${score[opp]} ${name}. ${performance}.`);
  const recap=B.decidingMoments(b)[0];if(recap)remember(spec,'Game recap · '+recap);
  return spec;
}
function specFor(player,info={}){
  const template=templateFor(player),b=build({template,role:player.role,last:lastName(player.name),name:player.name,id:'x'});
  const legacy=info.legacy&&typeof info.legacy==='object'?{playerId:String(info.legacy.playerId),name:String(info.legacy.name||'').slice(0,60),last:String(info.legacy.last||'').slice(0,40),number:info.legacy.number??null}:null;
  const tier=Math.max(0,Math.min(3,Number(info.tier)||0));
  return{id:`${legacy?'leg':'sig'}_${player.id}`,...(legacy?{legacy}:{}),...(tier?{tier}:{}),template,playerId:player.id,name:player.name,last:lastName(player.name),role:player.role,pos:player.pos,archetype:player.archetype,number:player.number,portraitSeed:player.portraitSeed,
    ...(info.provenance?{provenance:cardHistory(info.provenance)}:{}),side:b.side,pile:b.kind==='tactic'?'tactics':'wrinkles',earned:info.earned||'',season:info.season||1,colors:info.colors||null};
}
// Who broke out in this game? A dominant share of his duels, or catching fire again and again.
// Plus a cooldown: at most one breakout every COOLDOWN games, so a signature card stays an event.
// The breakout bar, in one place: in a single game, win BREAKOUT.wins+ duels at BREAKOUT.rate or better, or catch fire
// BREAKOUT.fire times. A program earns at most one new signature every COOLDOWN games.
const BREAKOUT={wins:15,rate:.8,fire:5};
function breakoutGoal(){return`Earn it with a breakout game: win ${BREAKOUT.wins}+ duels at ${Math.round(BREAKOUT.rate*100)}% or better, or catch fire ${BREAKOUT.fire} times. A program earns at most one new signature every ${COOLDOWN} games.`}
function breakouts(b,side){
  const tally=new Map();
  const touch=(p,won)=>{if(!p)return;const t=tally.get(p.id)||{p,wins:0,duels:0,fire:0};t.duels++;if(won)t.wins++;tally.set(p.id,t)};
  for(const e of b.log){
    if(e.type!=='snap'||!e.duelResults)continue;
    const lu={off:B.snapLineup(b,e,'off'),def:B.snapLineup(b,e,'def')};
    e.duels.forEach((d,i)=>{if(!e.duelResults[i]||(i>0&&!e.duelResults[0].won))return;const won=e.duelResults[i].won;
      if(e.offSide===side)for(const r of d.offRoles)touch(lu.off[r],won);
      if(e.defSide===side)for(const r of d.defRoles)touch(lu.def[r],!won);});
    for(const ev of e.events||[])if(ev.type==='fire'&&ev.side===side){const t=tally.get(ev.id);if(t)t.fire++}
  }
  return[...tally.values()].filter(t=>t.fire>=BREAKOUT.fire||(t.wins>=BREAKOUT.wins&&t.wins/t.duels>=BREAKOUT.rate)).map(t=>({...t,score:t.wins+t.fire*4})).sort((a,c)=>c.score-a.score);
}
// The best breakout who doesn't already have a card.
const COOLDOWN=3;
function candidate(b,side,pb){
  const games=pb.gamesPlayed??((pb.record?.w||0)+(pb.record?.l||0));
  if(pb.lastSignatureGame!=null&&games-pb.lastSignatureGame<COOLDOWN)return null;
  const have=new Set([...(pb.signatures||[]),...(pb.reserveSignatures||[])].map(s=>s.playerId));
  return breakouts(b,side).find(t=>!have.has(t.p.id))||null;
}
function slotsFor(pb){return Math.max(SLOTS,Number(pb?.signatureSlots)||SLOTS)}
function add(pb,spec,replaceIndex){
  pb.signatures??=[];
  if(pb.signatures.length>=slotsFor(pb)){if(replaceIndex==null)return{full:true};pb.signatures.splice(replaceIndex,1)}
  pb.signatures.push(spec);register(spec);pb.lastSignatureGame=pb.gamesPlayed??((pb.record?.w||0)+(pb.record?.l||0));(pb.history??=[]).push({id:spec.id,kind:'signature',side:spec.side});
  return{full:false};
}

return{BREAKOUT,breakoutGoal,deckFit,SLOTS,slotsFor,COOLDOWN,templateFor,build,buildAny,describe,register,registerAll,specFor,cardHistory,remember,breakoutCard,breakouts,candidate,add,lastName};
});
