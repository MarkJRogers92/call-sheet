'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const D=require('../forks/call-sheet/core/data');
const R=require('../forks/call-sheet/core/resolver');
const Ro=require('../forks/call-sheet/core/roster');
const A=require('../forks/call-sheet/core/adapter');
const SG=require('../forks/call-sheet/core/signatures');

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

function lineupSnap(player,role){
  return{type:'snap',offSide:'home',defSide:'away',lineups:{off:{[role]:player.id},def:{}},
    duels:[{offRoles:[role],defRoles:[]}],duelResults:[{won:true}]};
}

test('package reserves earn offensive Signatures for their on-field roles',()=>{
  for(const [mode,role,reserveLabel,pos,template] of [
    ['10','TE','WR4','WR','te_seam'],['12','SLOT','TE2','TE','wr_special'],['21','SLOT','RB2','RB','wr_special']
  ]){
    const b=opening();B.setGrouping(b,'home',mode);
    const reserve=b.teams.home.lineup.off[role];
    assert.equal(reserve.role,reserveLabel);
    b.log=Array.from({length:15},()=>lineupSnap(reserve,role));
    const breakout=SG.candidate(b,'home',{});
    assert.equal(breakout?.p.id,reserve.id);
    const spec=SG.breakoutCard(b,'home',breakout),{def}=SG.describe(spec);
    assert.equal(spec.role,role);assert.equal(spec.pos,pos);assert.equal(spec.template,template);assert.equal(spec.side,'off');
    assert.equal(spec.number,reserve.number);
    assert.equal(R.signatureBlocked(def,b.teams.home.lineup.off),null);
    assert.equal(reserve.role,reserveLabel);
  }
});

test('reserve Signatures use the most-played alignment, favoring the first on a tie',()=>{
  const b=opening(),reserve=b.teams.home.packageDepth.find(p=>p.role==='WR4');
  b.log=['TE','Z'].flatMap(role=>Array.from({length:8},()=>lineupSnap(reserve,role)));
  const award=()=>SG.breakoutCard(b,'home',SG.candidate(b,'home',{}));
  assert.equal(award().role,'TE');
  b.log.push(lineupSnap(reserve,'Z'));
  assert.equal(award().role,'Z');
  assert.match(award().earned,/17 of 17 duels won/);
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

test('the key-down mesh saves the committed call and credits the chosen runner exactly once',()=>{
  const home=Ro.preset('ground');
  home.decks={...D.DEFAULT_DECKS,off:{base:['read_option'],wrinkles:[],tactics:[]}};
  const b=B.create({home,away:Ro.preset('tempo'),user:'home',mode:'snap',control:'offense',seed:'personnel-final',headset:{readOption:true}}); // the read prompt is opt-in from V22
  const engine=require('../game-engine-v2');
  engine.startGame(b.game);
  Object.assign(b.game,{possession:'home',down:3,distance:2,fieldPosition:45});
  const q=B.advance(b);
  assert.equal(q.options.plays[0].blocked,null);
  const old=JSON.parse(B.save(b)),oldOption=old.pending.options.plays[0];
  oldOption.card.needs={role:'QB',trait:'speed',grade:7};oldOption.blocked='Needs a QB with speed 7+';
  const upgraded=B.load(JSON.stringify(old));
  assert.deepEqual(upgraded.pending,q);assert.deepEqual(upgraded.hands,b.hands);
  b.snap.def.edgeAssignment='crash';
  const before=b.log.length,command=b.hands.home.command;
  const mesh=B.submit(b,{type:'call',play:'read_option',tactics:[]});
  assert.equal(mesh.kind,'mesh');assert.match(mesh.cue,/steps inside/);
  assert.equal(b.log.length,before);assert.equal(b.hands.home.command,command-q.options.plays[0].cost);
  const saved=B.save(b);
  assert.throws(()=>B.submit(b,{type:'mesh',choice:'pitch'}),/Give or Keep/);assert.equal(B.save(b),saved);
  for(const [choice,carrier] of [['give','RB'],['keep','QB'],['auto','QB']]){
    const game=B.load(saved),off=game.teams.home.lineup.off;
    assert.deepEqual(B.advance(game),mesh);
    B.submit(game,choice==='auto'?{type:'auto'}:{type:'mesh',choice});
    const e=game.log[before];
    assert.equal(e.sit.down,3);assert.equal(e.sit.distance,2);
    assert.equal(e.participants.carrier,carrier);
    assert.equal(game.players[off[carrier].id].rushAtt,1);
    assert.equal(e.duels[0].mods.some(m=>m.src==='End stayed with the runner'),choice==='give');
    assert.ok(e.text.includes(off[carrier].name));
    assert.equal(game.telemetry.userSnaps,1);
  }
});

test('on the same third-and-two read a mobile QB has a better keeper and neither QB has a guaranteed conversion',()=>{
  const {off,def}=Ro.preset('ground').lineup,play=D.PLAYS.read_option;
  const situation={down:3,distance:2,field:45,period:2,clock:300};
  // The end crashes but the defense has also assigned a QB spy.
  Object.assign(def.WILL.traits,{power:85,technique:85,speed:65,iq:65});
  Object.assign(off.RB.traits,{power:72,technique:72});
  const odds=(mobile,choice)=>{
    Object.assign(off.QB.traits,mobile?{speed:92,versatility:85}:{speed:42,versatility:48});
    assert.equal(R.playBlocked(play,off),null);
    const snap=R.buildSnap({off,def,play,call:D.CALLS.cover3,defTactics:['spy'],situation,edgeAssignment:'crash',meshChoice:choice});
    return R.evaluate(snap,situation).first;
  };
  const pocket=odds(false,'keep'),mobile=odds(true,'keep'),give=odds(false,'give');
  assert.ok(pocket>0&&pocket<give&&give<mobile&&mobile<1);
  assert.equal(odds(true,'give'),give);
});

test('a repeatable Quick Out can set up the drawn double move on the actual call sheet',()=>{
  const P=require('../forks/call-sheet/core/packs'),book=P.newPlaybook();
  P.setOpeningScript(book,'out_and_up');
  const b=B.create({home:{...Ro.preset('aerial'),decks:P.decksOf(book)},away:Ro.preset('tempo'),user:'home',control:'both',mode:'snap',seed:'route-57'});
  B.advance(b);B.setGrouping(b,'home','11');
  const play=(battle,id)=>{
    const start=battle.log.length;
    B.submit(battle,{type:'call',play:id,read:'primary',tactics:[]});
    return battle.log.slice(start).find(e=>e.type==='snap'&&e.play===id);
  };
  const q=b.pending,cmd=q.options.command;
  assert.equal(B.sameLookPair(b,q,'out_and_up').mate.id,'quick_out');
  for(let count=0;count<2;count++){
    assert.match(B.sameLookPair(b,b.pending,'quick_out').setup,new RegExp(count+'/2'));
    const entry=play(b,'quick_out');
    assert.ok(entry.completed&&entry.participants.target==='X'&&entry.yards>0);
    assert.ok(b.hands.home.wrinkles.includes('out_and_up'));
    assert.equal(b.hands.home.command,cmd);
  }
  const resumed=B.load(B.save(b));
  const step=play(b,'out_and_up');
  assert.deepEqual(step,play(resumed,'out_and_up'));
  assert.deepEqual(step.cornerStep,{jumped:true,outs:2,reached:true});
  assert.ok(step.text.includes(b.teams.away.lineup.def.BCB.name+' drove on the out'));
  assert.ok(step.duels[1].mods.some(m=>m.src==='Corner jumped the out'));
  assert.ok(!b.hands.home?.wrinkles.includes('out_and_up'));
  const saved=B.save(b),tryout=B.tryRewardCard({battle:b},'out_and_up');
  assert.match(tryout,/Game film/);assert.match(tryout,/In the game: Out-and-Up/);
  assert.equal(B.save(b),saved);
});

test('only positive catches by the same receiver against this corner in the same look set up the route',()=>{
  const b=opening(),q=b.pending;
  const entry={type:'snap',offSide:'home',defSide:'away',play:'quick_out',sit:{period:1},grouping:b.snap.grouping,
    completed:true,yards:5,participants:{target:'X'},lineups:{off:{X:b.teams.home.lineup.off.X.id},def:{BCB:b.teams.away.lineup.def.BCB.id}}};
  const count=()=>B.sameLookPair(b,q,'quick_out').setup.match(/(\d)\/2/)[1];
  b.log=[entry,{...entry,grouping:'other'},{...entry,penalty:{}},{...entry,participants:{target:'RB'}},
    {...entry,lineups:{...entry.lineups,def:{BCB:'substitute'}}},{...entry,yards:0},{...entry,turnover:'fumble'}];
  assert.equal(count(),'1');
  b.log.push(entry);assert.equal(count(),'2');
  b.log.push({...entry,play:'out_and_up'});assert.equal(count(),'0');
  b.log.push(entry,{type:'halftime'});assert.equal(count(),'0');
});

test('the corner can stay deep after two completions and coverage and discipline change the odds',()=>{
  const off=Ro.preset('aerial').lineup.off,def=Ro.preset('tempo').lineup.def;
  const build=(outs,cornerRoll,call='cover1')=>R.buildSnap({off,def,play:D.PLAYS.out_and_up,call:D.CALLS[call],cornerRoll,boundaryOuts:outs});
  const jumps=(outs,call)=>Array.from({length:100},(_,i)=>build(outs,(i+.5)/100,call).flags.cornerStep.jumped).filter(Boolean).length;
  assert.ok(jumps(0,'cover1')<jumps(2,'cover1'));
  assert.ok(jumps(2,'cover3')<jumps(2,'cover2_trap'));
  const normal=jumps(2,'cover1');def.BCB.traits.iq=99;def.BCB.traits.composure=99;
  assert.ok(jumps(2,'cover1')<normal);
  const stay=build(2,.99),bite=build(2,0),preview=build(2);
  assert.equal(stay.flags.cornerStep.jumped,false);assert.equal(bite.flags.cornerStep.jumped,true);
  assert.equal(preview.flags.cornerStep,undefined);
  assert.equal(R.winChance(preview.duels[1].margin),preview.duels[1].p);
  assert.ok(stay.duels[1].p<preview.duels[1].p&&preview.duels[1].p<bite.duels[1].p);
  assert.equal(stay.duels[0].p,bite.duels[0].p);
});

test('earlier books receive one stored Out-and-Up without changing a customized deck',()=>{
  const P=require('../forks/call-sheet/core/packs'),pb=P.newPlaybook();
  pb.version=1;pb.off.wrinkles=pb.off.wrinkles.map(id=>id==='out_and_up'?'screen':id);
  const before=JSON.stringify(pb.off);
  P.updateStarterBook(pb,0);assert.equal(pb.version,1);
  P.updateStarterBook(pb);P.updateStarterBook(pb);
  assert.deepEqual(pb.reserve.off.wrinkles,['out_and_up']);
  assert.equal(JSON.stringify(pb.off),before);
  assert.ok(P.POOL.some(c=>c.id==='out_and_up'));
});

test('Quick Calls retain a prepared double move in two-down territory and show each grouping’s own count',()=>{
  const P=require('../forks/call-sheet/core/packs'),book=P.newPlaybook();
  P.setOpeningScript(book,'out_and_up');
  const b=B.create({home:{...Ro.preset('aerial'),decks:P.decksOf(book)},away:Ro.preset('tempo'),user:'home',control:'both',mode:'snap',seed:'route-57'});
  B.advance(b);B.setGrouping(b,'home','11');
  for(let i=0;i<2;i++)B.submit(b,{type:'call',play:'quick_out',read:'primary',tactics:[]});
  const catches=b.log.filter(e=>e.play==='quick_out'&&e.completed);
  assert.equal(catches.length,2);
  // One completion registered in the spread as well. The two looks have independent counts.
  b.log.push({...catches[1],grouping:'10'});
  Object.assign(b.game,{down:3,distance:8});B.setGrouping(b,'home','auto');
  B.submit(b,{type:'two_down',active:true});
  assert.ok(B.snapDecisions(b).choices.some(c=>c.id==='out_and_up'));
  const pair=B.sameLookPair(b,b.pending,'out_and_up');
  assert.equal(pair.hold.grouping,'11');assert.match(pair.setup,/1\/2 from your current 10/);
  B.setGrouping(b,'home',pair.hold.grouping);
  B.submit(b,{type:'call',play:'out_and_up',read:'primary',tactics:[]});
  assert.equal(b.log.find(e=>e.play==='out_and_up').cornerStep.outs,2);
});

test('Quick Calls never recommend holding a grouping that cannot be fielded',()=>{
  const b=opening(),side='home',line=b.teams.home.lineup.off;
  const catchInTwelve={type:'snap',offSide:side,grouping:'12',play:'quick_out',sit:{period:1},
    lineups:{off:{X:line.X.id},def:{BCB:b.teams.away.lineup.def.BCB.id}},completed:true,yards:5,participants:{target:'X'}};
  b.log.push(catchInTwelve,catchInTwelve);
  b.teams.home.packageDepth=[];
  assert.equal(B.packageLineup(b,side,'12'),null);
  assert.equal(B.setupLook(b,side).elsewhere,null);
});
