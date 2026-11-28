'use strict';
// V20 review changes: Quick Calls follow the confirmed Look, tryouts show odds, close-out and rested starters,
// score-aware fourth downs, featured players, the lean meter and goal-line yardage.
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),D=core('data.js'),Ro=core('roster.js'),E=require('../game-engine-v2');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(ids,look={}){
  const b={teams:{home:Ro.preset('ground')},log:[],snap:{def:{play:'secret'}}};
  const req={kind:'snap',side:'home',role:'off',situation:{down:1,distance:10,field:40,period:1},
    look:{lean:{value:null,confirmed:false},box:{value:'normal',confirmed:true},shell:{value:1,confirmed:false},pressure:{value:false,confirmed:false},...look},
    options:{command:3,plays:ids.map(id=>({id,cost:D.PLAYS[id].cost}))}};
  return {b,req};
}
function shifted(preset,d){const t=Ro.preset(preset);const s=new Set([...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.packageDepth||[]),...(t.backfield||[])]);for(const p of s)for(const k of Object.keys(p.traits))p.traits[k]=Math.max(25,Math.min(99,p.traits[k]+d));return t}

test('a confirmed rush outranks the lean: the clue says so and a fake that needs time is not the counter',()=>{
  const {b,req}=fixture(['inside_zone','quick_slant','pa_boot','screen'],{lean:{value:'run',confirmed:true},pressure:{value:true,confirmed:true,realLevel:2}});
  const view=B.snapDecisions(b,req);
  assert.match(view.clue,/Pressure confirmed/);assert.match(view.clue,/playing the run/i);
  assert.equal(view.choices[0].id,'screen');
  const boot=view.choices.find(c=>c.id==='pa_boot');if(boot)assert.match(boot.detail,/rush can get home/);
  req.look.pressure={value:true,confirmed:false};
  assert.equal(B.snapDecisions(b,req).choices[0].id,'pa_boot','an unconfirmed rush leaves the counter in front');
});
test('a run combo set-up does not lead the shortlist on third and long',()=>{
  const {b,req}=fixture(['inside_zone','quick_slant','vertical_shot','pa_boot']);
  b.game={drive:1,possession:'home',period:1};b.drive={key:'1:home',fams:['run','run']};
  req.situation={down:3,distance:12,field:40,period:1};
  assert.notEqual(D.PLAYS[B.snapDecisions(b,req).choices[0].id].family,'run');
});
test('generic quick-call text does not claim a shell or coverage the Look has not confirmed',()=>{
  const {b,req}=fixture(['quick_slant','vertical_shot']);
  const text=JSON.stringify(B.snapDecisions(b,req));
  assert.doesNotMatch(text,/two safeties limit/);assert.doesNotMatch(text,/; tight man coverage makes/);
  req.look.shell={value:2,confirmed:true};assert.match(JSON.stringify(B.snapDecisions(b,req)),/two/i);
});
test('live quick calls name the first duel for each call and never read the hidden defensive call or change state',()=>{
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v20-quick',user:'home',control:'offense',mode:'snap'});B.advance(b);
  const saved=B.save(b),view=B.snapDecisions(b);
  assert.ok(view.choices.length>=2);
  for(const c of view.choices){assert.ok(c.matchup,c.id);assert.ok(c.matchup.offense&&c.matchup.defense&&c.matchup.chip)}
  assert.equal(B.save(b),saved);
  const other=B.load(saved);other.snap.def={...other.snap.def,play:other.snap.def.play==='cover0'?'two_high':'cover0'};
  assert.deepEqual(B.snapDecisions(other),view);
});
test('narration and film count gains only to the goal line',()=>{
  for(let i=0;i<12;i++){
    const b=B.simulate({home:Ro.preset(['aerial','tempo','ground'][i%3]),away:Ro.preset(['ground','aerial','tempo'][i%3]),seed:'v20-goal-'+i});
    for(const e of b.log)if(e.type==='snap'&&typeof e.yards==='number'&&!e.turnover)assert.ok(e.sit.field+e.yards<=100,e.text);
  }
});
test('a big second-half lead closes out: starters rest, backups play, and the switch is logged',()=>{
  const b=B.simulate({home:shifted('tempo',-10),away:shifted('aerial',10),seed:'blow-20-3'});
  const rest=b.log.find(e=>e.type==='rest'&&e.resting);assert.ok(rest,'rest logged');assert.ok(rest.sit.period>=3);
  const team=b.teams[rest.side],rb2=team.packageDepth.find(p=>p.pos==='RB').id,i=b.log.indexOf(rest);
  const base=e=>e.type==='snap'&&e.offSide===rest.side&&e.grouping==='11';
  assert.ok(b.log.slice(0,i).filter(base).every(e=>e.lineups.off.RB!==rb2),'the starting back carries the load before the rest');
  const after=b.log.slice(i).filter(base);
  assert.ok(after.length&&after.every(e=>e.lineups.off.RB===rb2),'the backup back plays every base snap after it');
  assert.ok(b.game.score.away-b.game.score.home<93,'the old 93-point margin on this seed is not reproduced');
});
test('the person can keep starters in with the headset setting',()=>{
  const b=B.create({home:shifted('aerial',10),away:shifted('tempo',-10),seed:'v20-keep',user:'home',control:'offense',mode:'sim',headset:{restStarters:false}});
  B.advance(b);assert.ok(!b.log.some(e=>e.type==='rest'&&e.side==='home'));
  assert.equal(B.headsetSettings({}).restStarters,true);
});
test('a team three scores down in the second half goes for a makeable fourth down',()=>{
  const setup=score=>{const b=B.create({seed:'v20-fourth',home:Ro.preset('ground'),away:Ro.preset('aerial'),mode:'snap',control:'both',user:'home'});
    E.startGame(b.game);Object.assign(b.game,{possession:'home',fieldPosition:40,down:4,distance:3,period:3,clock:600,score});return B.advance(b)};
  assert.equal(setup({home:0,away:21}).recommended,'go');
  assert.equal(setup({home:0,away:0}).recommended,'punt');
});
test('a tryout shows repeatable pre-penalty estimates with and without the card on the same film snap',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'try-1',user:'home'});
  b.log=[{type:'snap',offSide:'home',defSide:'away',play:'vertical_shot',call:'sim_pressure',yards:6,
    sit:{period:1,clock:630,down:3,distance:10,field:40,score:{home:0,away:0}}}];
  const t=B.tryRewardCard({battle:b,seed:'x'},'max_protect');
  assert.match(t,/Your odds on this snap · Max Protect: \d+% to convert/);assert.match(t,/Without it: \d+% to convert/);assert.match(t,/one rep/);
  assert.equal(B.tryRewardCard({battle:b,seed:'x'},'max_protect'),t);
  const [withIt,without]=[...t.matchAll(/(\d+)% to convert/g)].map(m=>Number(m[1]));assert.ok(withIt>without,'protection helps on this film');
  assert.match(B.tryRewardCard({battle:b,seed:'x'},'bracket'),/Their odds on this snap/);
  assert.doesNotMatch(B.tryRewardCard({battle:b,seed:'x'},'film_tell'),/odds/);
});
test('tryout odds evaluate the actual practice rep, with its alternate target, tactics and two-down read',t=>{
  const R=core('resolver'),evaluated=[],rolled=[];
  const evaluate=R.evaluate,resolve=R.resolve;
  t.mock.method(R,'evaluate',(snap,sit)=>{evaluated.push(snap);return evaluate(snap,sit)});
  t.mock.method(R,'resolve',(snap,rng,sit)=>{rolled.push(snap);return resolve(snap,rng,sit)});
  const battle=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),user:'home',seed:'tryout-effects'});
  battle.log=[{type:'snap',offSide:'home',defSide:'away',play:'deep_cross',call:'cover1',primaryTarget:'TE',
    offTactics:[],defTactics:['bracket'],bracketRole:'TE',twoDown:true,
    sit:{possession:'home',field:52,down:3,distance:11,period:2,clock:390,score:{home:0,away:7}}}];
  const before=B.save(battle);
  const report=B.tryRewardCard({battle},'hurry_up');
  assert.match(report,/Estimates exclude penalties/);
  assert.equal(evaluated.length,2);assert.equal(rolled.length,1);
  const [withCard,base]=evaluated;
  assert.deepEqual(withCard,rolled[0],'the displayed estimate and the game roll evaluate identical duel inputs');
  assert.equal(withCard.play.target,'TE');assert.ok(withCard.checkdown,'two-down intent keeps the checkdown on');
  assert.deepEqual(withCard.defTactics,[]);assert.deepEqual(base.defTactics,['bracket']);
  assert.equal(base.bracketRole,'TE');assert.deepEqual(withCard.offTactics,['hurry_up']);assert.deepEqual(base.offTactics,[]);
  assert.equal(B.save(battle),before);
  evaluated.length=0;B.tryRewardCard({battle},'inside_zone_plus');
  assert.equal(evaluated[1].play.target,'TE','original play keeps the target from film when the trial replaces it');
  evaluated.length=0;
  assert.doesNotMatch(B.tryRewardCard({battle},'quick_kick'),/odds on this snap/);
  assert.equal(evaluated.length,0,'a punt never gets scrimmage conversion odds');
  assert.match(B.tryRewardCard({battle},'timeout_settle'),/Your odds on this snap/);
});
test('the offense sees how close it is to drawing a lean, and the meter clears once the lean is on',()=>{
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v20-meter',user:'home',control:'offense',mode:'snap'});
  let req=B.advance(b);while(req&&!(req.kind==='snap'&&req.role==='off'))req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:{type:'auto'});
  const disc=b.teams.away.coach.discipline;
  for(let i=0;i<disc-1&&b.pending;i++){
    while(b.pending&&!(b.pending.kind==='snap'&&b.pending.role==='off'&&b.game.possession==='home'))B.submit(b,b.pending.kind==='fourth'?{choice:b.pending.recommended}:{type:'auto'});
    if(b.pending)B.submit(b,{type:'call',play:'inside_zone',tactics:[]});
  }
  if(!B.leanFor(b)&&b.tend.home.run>0){const m=b.pending?.leanMeter;if(b.pending?.role==='off')assert.deepEqual(m&&{f:m.family,t:m.threshold},{f:'run',t:disc})}
  b.tend.home.run=disc;b.tend.home.quick=0;b.tend.home.deep=0;
  assert.ok(B.leanFor(b));
});
test('a featured player gets a labeled edge on his first two touches, once per half, and shows on film sooner',()=>{
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v20-feature',user:'home',control:'offense',mode:'snap'});
  let req=B.advance(b);while(req&&!(req.kind==='snap'&&req.role==='off'))req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:{type:'auto'});
  const rb=b.teams.home.lineup.off.RB;
  B.setSideline(b,{feature:rb.id});
  assert.throws(()=>B.setSideline(b,{feature:b.teams.home.lineup.off.X.id}),/already featured/);
  const pv=B.preview(b,'home',{play:'inside_zone',tactics:[]});
  assert.ok(pv.snap.duels.some(d=>d.mods.some(m=>m.src===`Featured: ${rb.name}`)));
  let touches=0,guard=0;
  while(touches<3&&guard++<60&&b.pending){
    const r=b.pending;
    if(r.kind!=='snap'||r.role!=='off'){B.submit(b,r.kind==='fourth'?{choice:r.recommended}:{type:'auto'});continue}
    const ok=r.options.plays.find(p=>p.id==='inside_zone'&&!p.blocked);if(!ok){B.submit(b,{type:'auto'});continue}
    B.submit(b,{type:'call',play:'inside_zone',tactics:[]});
    const e=b.log.filter(x=>x.type==='snap'&&x.play==='inside_zone'&&x.userCalled).at(-1);
    if(e&&e.participants?.carrier==='RB'&&e.lineups.off.RB===rb.id){
      touches++;const boosted=e.duels.some(d=>d.mods.some(m=>m.src===`Featured: ${rb.name}`));
      assert.equal(boosted,touches<=2,`touch ${touches}`);
    }
  }
  assert.ok(touches>=3);
});

test('rested personnel stay out of every alignment until the lead falls to twenty',()=>{
  const home=Ro.preset('aerial');
  home.packageDepth.push(...home.packageDepth.map(p=>({...p,id:p.id+'-extra'})));
  home.backfield=[home.lineup.off.RB,...home.packageDepth.filter(p=>p.pos==='RB')];
  const b=B.create({home,away:Ro.preset('ground'),user:'home',control:'offense',mode:'snap',seed:'v20-rest-alignments'});
  E.startGame(b.game);
  Object.assign(b.game,{possession:'home',period:3,clock:600,fieldPosition:40,down:1,distance:10,score:{home:28,away:0}});
  const starterIds=['RB','Z','TE'].map(role=>home.lineup.off[role].id);
  assert.equal(B.advance(b).kind,'snap');
  for(const mode of ['11','12','21','10']){
    B.setGrouping(b,'home',mode);
    for(const backs of ['auto','starter','power','receiving']){
      B.setBackfield(b,'home',backs);
      const ids=Object.values(b.teams.home.lineup.off).map(p=>p.id);
      assert.equal(new Set(ids).size,11);
      assert.ok(starterIds.every(id=>!ids.includes(id)),mode+' / '+backs);
    }
  }
  const resumed=B.load(B.save(b));
  function nextSnap(lead){
    resumed.pending=null;resumed.snap=null;resumed.game.score.home=lead;
    B.advance(resumed);
    B.setBackfield(resumed,'home','starter');B.setGrouping(resumed,'home','11');
    return ['RB','Z','TE'].map(role=>resumed.teams.home.lineup.off[role].id);
  }
  assert.ok(nextSnap(17).every(id=>!starterIds.includes(id)));
  assert.deepEqual(nextSnap(16),starterIds);
  assert.deepEqual(nextSnap(23),starterIds);
  assert.ok(nextSnap(24).every(id=>!starterIds.includes(id)));
  assert.deepEqual(resumed.log.filter(e=>e.type==='rest').map(e=>e.resting),[true,false,true]);
});

test('field goal exceptions and late fourth downs use regulation quarter and score boundaries',()=>{
  function call(period,clock,deficit,distance=5,fieldPosition=40){
    const b=B.create({seed:'v20-clock',home:Ro.preset('ground'),away:Ro.preset('aerial'),mode:'snap',user:'away',control:'offense'});
    E.startGame(b.game);
    Object.assign(b.game,{possession:'away',period,clock,fieldPosition,down:4,distance,score:{away:0,home:deficit}});
    return B.advance(b).recommended;
  }
  assert.equal(call(2,115,17),'punt');
  assert.equal(call(3,119,16),'punt');
  assert.equal(call(3,600,17),'go');
  assert.equal(call(4,361,11),'punt');
  assert.equal(call(4,360,9),'go');
  assert.equal(call(4,121,8,10),'punt');
  assert.equal(call(4,120,8,10),'go');
  for(const deficit of [1,2,3,9,10,11])assert.equal(call(4,100,deficit,1,85),'field_goal');
  for(const deficit of [4,8,12,17])assert.equal(call(4,100,deficit,1,85),'go');
});

test('goal-line film, player totals and Dynasty events agree on the credited play',t=>{
  const rng=require('../rng'),resolver=core('resolver.js'),resolve=resolver.resolve;
  let outcome;
  t.mock.method(resolver,'resolve',(snap,random,sit)=>{
    const out=resolve(snap,random,sit);
    return {...out,...outcome,participants:{...out.participants,...outcome.participants}};
  });
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('tempo'),seed:'v20-quick',user:'home',mode:'snap',control:'both'});
  const req=B.advance(b);assert.equal(req.role,'off');
  const saved=B.save(b);
  const run=(field,play,forced,seed='g0')=>{
    const game=B.load(saved),first=game.game.events.length;game.game.fieldPosition=field;game.game.distance=Math.min(10,100-field);
    game.rng=rng.create(seed).snapshot();outcome=forced;
    B.submit(game,{type:'call',play,tactics:[]});
    const snap=game.log.find(e=>e.type==='snap'&&e.play===play),event=game.game.events.slice(first).find(e=>['scrimmage','interception','fumble','penalty'].includes(e.type));
    return {game,snap,event};
  };
  const rush=(yards,turnover)=>({kind:'run',engineKind:'rush',completed:false,yards,turnover,participants:{carrier:'RB',defender:'WILL'}});
  for(const [field,raw,turnover,yards] of [[97,12,null,3],[2,-8,null,-2],[97,12,'fumble',2],[2,-8,'fumble',-1]]){
    const {game,snap,event}=run(field,'inside_zone',rush(raw,turnover));
    assert.equal(event.yards,yards);assert.equal(snap.yards,yards);assert.match(snap.text,new RegExp('runs for '+yards+'\\b'));
    assert.equal(game.box.home.rushYds,yards);assert.equal(game.players[snap.lineups.off.RB].rushYds,yards);
    assert.equal(game.players[snap.lineups.off.RB].rushTD,field===97&&!turnover?1:0);
    if(!turnover&&field===97){assert.match(snap.text,/touchdown/);assert.equal(event.card.actors.tackler,null)}
    if(!turnover&&field===2)assert.match(snap.text,/safety/);
    assert.equal(B.callFilm(game,'home').own.plays.inside_zone.yards,yards);
  }
  const pick=run(97,'quick_slant',{kind:'inc',engineKind:'pass',completed:false,turnover:'interception',yards:12,participants:{passer:'QB',target:'X',defender:'FCB'}});
  assert.equal(pick.event.yards,2);assert.equal(pick.snap.yards,0);assert.equal(pick.game.box.home.passYds,0);
  assert.equal(pick.event.card.actors.interceptor,pick.snap.lineups.def.FCB);
  assert.equal(B.callFilm(pick.game,'home').own.plays.quick_slant.yards,0);
  const sack=run(2,'quick_slant',{kind:'sack',engineKind:'pass',completed:false,turnover:'fumble',yards:-8,participants:{sacker:'RUSH',carrier:null}});
  assert.equal(sack.event.yards,-1);assert.equal(sack.game.box.home.rushYds,-1);
  assert.equal(sack.game.players[sack.snap.lineups.off.QB].rushYds,-1);assert.equal(sack.event.card.actors.sacker,sack.snap.lineups.def.RUSH);
  assert.match(sack.snap.text,/sacked by .*, -1/);
  for(const [field,yards] of [[6,3],[1,0]]){
    const {game,snap,event}=run(field,'inside_zone',null,'g22');
    assert.equal(event.type,'penalty');assert.equal(event.kind,'holding_off');
    assert.equal(event.yards,yards);assert.equal(snap.penalty.yards,yards);assert.equal(game.box.home.penaltyYds,yards);
    assert.equal(snap.after.field,field-yards);assert.equal(game.box.home.plays,0);
    assert.equal(B.callFilm(game,'home'),null);
  }
});

test('fogged Quick Calls cannot change rank or disclose a chip when hidden defender grades change',()=>{
 const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v20-quick',user:'home',control:'offense',mode:'snap'});B.advance(b);
 const read=()=>B.snapDecisions(b,b.pending,{},35),before=read();
 assert.ok(before.choices.every(c=>c.matchup?.chip==='?'));
 for(const player of Object.values(b.teams.away.lineup.def)){
   for(const trait of Object.keys(player.traits))player.traits[trait]=1;
   player.cond=[{when:'any',v:8,src:'hidden'}];
 }
 assert.deepEqual(read(),before);
 assert.ok(B.snapDecisions(b,b.pending,{},100).choices.some(c=>c.matchup?.chip!=='?'));
});
test('two-down screen uses this confirmed rush without claiming opponents have repeatedly blitzed',()=>{
 const {b,req}=fixture(['inside_zone','quick_slant','vertical_shot','screen'],{pressure:{value:true,confirmed:true,realLevel:1}});
 b.snap.twoDown=true;req.situation.down=3;req.situation.distance=7;
 const view=B.snapDecisions(b,req,{},25),screen=view.choices.find(c=>c.id==='screen');
 assert.ok(screen);assert.match(screen.detail,/Set up fourth down.*confirmed rush/i);assert.doesNotMatch(screen.detail,/repeated/i);
 assert.equal(view.choices.length,3);assert.match(view.clue,/Gain 5/);
});
test('halftime attributes the actual catch and prepares a legal named bracket assignment',()=>{
 const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v20-halftime',user:'home',control:'both',mode:'snap',coachingWindows:true});
 E.startGame(b.game);Object.assign(b.game,{period:3,clock:900,possession:'away',down:1,distance:10,fieldPosition:30});b.period=2;
 const line=b.teams.away.lineup.off,ids=Object.fromEntries(Object.entries(line).map(([r,p])=>[r,p.id]));
 for(const target of ['RB','RB','RB','Z','Z']){
   b.log.push({type:'snap',sit:{period:2},defSide:'home',offSide:'away',play:'quick_slant',primaryTarget:'SLOT',completed:true,yards:12,
     duelResults:[{won:true}],participants:{target},lineups:{off:ids}});
 }
 const req=B.advance(b);assert.equal(req.kind,'halftime');assert.equal(req.threat.id,ids.RB);assert.equal(req.threat.count,3);
 assert.equal(req.suggestion,'bracket');assert.equal(req.bracketTarget.id,ids.Z);
 const next=B.submit(b,{type:'halftime',adjustment:'bracket'});
 assert.equal(next.options.bracketPlan.name,line.Z.name);assert.ok(next.options.tactics.some(t=>t.id==='bracket'));
 B.submit(b,{type:'call',play:next.options.plays[0].id,tactics:['bracket']});
 assert.equal(b.lastResult.bracketRole,'Z');
});
test('unscouted tendencies share only the coach’s own count on either side of the hidden threshold',()=>{
 function request(film,count){
   const home=Ro.preset('ground'),away=Ro.preset('aerial');
   home.coach.film=film;away.coach.discipline=4;
   const b=B.create({home,away,seed:'v20-meter-fog',mode:'snap',user:'home',control:'both'});E.startGame(b.game);
   Object.assign(b.game,{possession:'home',fieldPosition:30,down:1,distance:10});b.tend.home.run=count;
   return B.advance(b);
 }
 assert.deepEqual(request(false,3).leanMeter,{family:'run',count:3});
 assert.deepEqual(request(false,4).leanMeter,{family:'run',count:4});
 assert.deepEqual(request(true,3).leanMeter,{family:'run',count:3,threshold:4});
 assert.equal(request(true,4).leanMeter,null);
});
