'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const D=require('../forks/call-sheet/core/data');
const R=require('../forks/call-sheet/core/resolver');
const Ro=require('../forks/call-sheet/core/roster');
const A=require('../forks/call-sheet/core/adapter');

function opening(home=Ro.preset('ground')){
  const b=B.create({home,away:Ro.preset('tempo'),user:'home',mode:'snap',control:'offense',seed:'personnel-final'});
  assert.equal(B.advance(b).role,'off');
  return b;
}

test('two ends, four wide and two backs put eleven different real players on the field',()=>{
  const b=opening(),off=b.teams.home.lineup.off,base=Object.fromEntries(Object.entries(off).map(([r,p])=>[r,p.id]));
  for(const [mode,position,count] of [['12','TE',2],['10','WR',4],['21','RB',2]]){
    B.setGrouping(b,'home',mode);
    assert.equal(Object.values(off).filter(p=>p.pos===position).length,count);
    assert.equal(new Set(Object.values(off).map(p=>p.id)).size,11);
    if(mode==='12')assert.ok(B.preview(b,'home',{play:'inside_zone'}).snap.duels[0].offNames.includes(off.SLOT.name));
    if(mode==='10')assert.match(R.playBlocked(D.PLAYS.power,off),/tight end/);
  }
  B.setGrouping(b,'home','11');
  assert.deepEqual(Object.fromEntries(Object.entries(off).map(([r,p])=>[r,p.id])),base);
});

test('a substituted player gets the snap, replay and fatigue credit across a save',()=>{
  const b=opening();B.setGrouping(b,'home','12');
  const team=b.teams.home,benchId=team.packageStarters.SLOT.id,activeId=team.lineup.off.SLOT.id;
  const previous=b.log.length,benchWear=b.workload[benchId]||0,activeWear=b.workload[activeId]||0;
  const action={type:'call',play:'inside_zone',tactics:[]},resumed=B.load(B.save(b));
  B.submit(b,action);B.submit(resumed,action);
  const e=b.log[previous];
  assert.equal(e.lineups.off.SLOT,activeId);
  assert.equal(B.snapLineup(resumed,resumed.log[previous],'off').SLOT.id,activeId);
  assert.equal(b.workload[activeId],activeWear+1);
  assert.equal(b.workload[benchId]||0,benchWear);
  assert.deepEqual(e,resumed.log[previous]);
});

test('Dynasty depth charts and eligibility control the extra tight end; unavailable packages are atomic',()=>{
  const base=Ro.preset('ground').lineup,roster=[],roleDepth={};
  for(const [role,p] of Object.entries({...base.off,...base.def})){
    roster.push({id:p.id,name:p.name,pos:p.pos,style:p.archetype,...p.traits});
    roleDepth[A.ROLE_MAP[role]]=[p.id];
  }
  for(const [id,injuryWeeks] of [['injured',3],['rested',0],['backup',0],['lower',0]]){
    roster.push({id,name:id,pos:'TE',style:'Inline Mauler',injuryWeeks,trueNow:id==='lower'?99:70});
  }
  roleDepth.MOVETE=['injured','rested','backup','lower'];
  const team=A.battleTeam({name:'Test',roster,roleDepth},null,{unavailableIds:['rested']});
  const b=opening(team),options=B.groupingOptions(b,'home');
  assert.equal(options.find(x=>x.id==='10').available,false);
  assert.equal(options.find(x=>x.id==='12').available,true);
  const before=B.save(b);
  assert.throws(()=>B.setGrouping(b,'home','10'),/eligible/);
  assert.equal(B.save(b),before);
  B.setGrouping(b,'home','12');assert.equal(b.teams.home.lineup.off.SLOT.id,'backup');
});

test('primary and bracket choices change the named matchup without modifying the printed card',()=>{
  const b=opening(),off=b.teams.home.lineup.off,def=b.teams.away.lineup.def;
  const original=D.PLAYS.deep_cross,printed=JSON.stringify(original);
  const play=R.targetedPlay(original,'TE',off);
  const s=R.buildSnap({off,def,play,call:D.CALLS.cover3,defTactics:['bracket'],bracketRole:'TE'});
  assert.deepEqual(s.duels[1].offNames,[off.TE.name]);assert.deepEqual(s.duels[1].defNames,[def.WILL.name]);
  assert.ok(s.duels[1].mods.some(x=>x.src==='Bracketed'));
  assert.equal(JSON.stringify(original),printed);
  assert.throws(()=>R.targetedPlay(original,'QB',off));
  assert.throws(()=>R.validateBracketRole('LT',off));
});

test('preview, committed result and play-by-play use the selected slant receiver',()=>{
  const b=opening(),off=b.teams.home.lineup.off,choice={type:'call',play:'quick_slant',target:'X',tactics:[],read:'primary'};
  const snap=B.preview(b,'home',choice).snap;
  assert.equal(snap.play.target,'X');assert.equal(snap.duels[0].defRoles[0],'BCB');
  const before=b.log.length;
  B.submit(b,choice);
  const entry=b.log[before];
  assert.equal(entry.primaryTarget,'X');
  assert.ok(entry.duels[0].offNames.includes(off.X.name));
  assert.ok(entry.duels[0].defRoles.includes('BCB'));
  if(entry.participants?.target)assert.equal(entry.participants.target,'X');
});

test('the submitted bracket assignment survives into the actual snap; invalid assignments leave it untouched',()=>{
  const home=Ro.preset('ground');home.decks=structuredClone(D.DEFAULT_DECKS);
  home.decks.def.tactics=Array(6).fill('bracket');
  const b=B.create({home,away:Ro.preset('tempo'),user:'home',mode:'snap',control:'defense',seed:'bracket-owner'});
  const req=B.advance(b);assert.equal(req.role,'def');
  const call={type:'call',play:req.options.plays.find(p=>!p.blocked&&!p.cost).id,tactics:['bracket']};
  const before=B.save(b);
  assert.throws(()=>B.submit(b,{...call,bracketRole:'NT'}));
  assert.equal(B.save(b),before);
  const selected={...call,bracketRole:'X'},pv=B.preview(b,req.side,selected);
  assert.ok(pv.vs.length);assert.ok(pv.vs.every(row=>row.snap.bracketRole==='X'));
  const index=b.log.length;
  B.submit(b,selected);
  assert.equal(b.log[index].bracketRole,'X');
});

test('against Read Option the end takes one threat and the linebacker must fit the other',()=>{
  const away=Ro.preset('tempo');
  away.decks=structuredClone(D.DEFAULT_DECKS);
  away.decks.off.base=['read_option'];away.decks.off.wrinkles=[];away.decks.off.tactics=[];
  const b=B.create({home:Ro.preset('ground'),away,user:'home',mode:'snap',control:'defense',seed:'bracket-owner'});
  assert.equal(B.advance(b).role,'def');
  const saved=B.save(b),choice={type:'call',play:'cover3',tactics:[]};
  assert.throws(()=>B.submit(b,{...choice,edgeAssignment:'blitz'}),/edge assignment/);
  assert.equal(B.save(b),saved);
  for(const [assignment,role,trait] of [['crash','QB','speed'],['contain','RB','power']]){
    const copy=B.load(saved),index=copy.log.length;
    const off=copy.teams.away.lineup.off,def=copy.teams.home.lineup.def;
    const attempts=copy.players[off[role].id]?.rushAtt||0;
    B.submit(copy,{...choice,edgeAssignment:assignment});
    const snap=copy.log[index];
    assert.equal(snap.edgeAssignment,assignment);assert.equal(snap.participants.carrier,role);
    assert.deepEqual(snap.duels[1].offNames,[off[role].name]);
    assert.deepEqual(snap.duels[1].defNames,[def.WILL.name]);assert.ok(snap.duels[1].offTraits.includes(trait));
    for(const name of [def.SET.name,def.WILL.name,off[role].name])assert.ok(snap.text.includes(name));
    assert.equal(copy.players[off[role].id].rushAtt,attempts+1);
  }
});

test('the coordinator takes away the stronger option matchup and leaves ordinary runs alone',()=>{
  const {off,def}=Ro.preset('ground').lineup;
  const ctx={off,def,call:D.CALLS.cover3,play:D.PLAYS.read_option};
  for(const [keep,give,assignment] of [[95,40,'contain'],[40,95,'crash']]){
    Object.assign(off.QB.traits,{speed:keep,versatility:keep});
    Object.assign(off.RB.traits,{power:give,technique:give});
    assert.equal(R.buildSnap(ctx).edgeAssignment,assignment);
  }
  assert.equal(D.PLAYS.read_option.carrier,'QB');
  const ordinary={...ctx,play:D.PLAYS.inside_zone};
  assert.deepEqual(R.buildSnap({...ordinary,edgeAssignment:'crash'}),R.buildSnap({...ordinary,edgeAssignment:'contain'}));
});
