'use strict';
// V29 "own the drive": the coach takes the first offensive possession of a fresh Quick Battle from its first snap,
// chooses whether to coach the next one, sees one setup cue from real drive history and one post-snap verdict that
// credits a tactic only where the log shows it acted. Also: the Max Protect regression matchup and the
// Four-Minute Offense alternate look.
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),D=core('data.js'),R=core('resolver.js'),W=core('world.js'),Ro=core('roster.js'),Rng=require('../rng');

const PROGRAMS=['sunbelt','tempo','lakeshore','prairie','control','aerial','ground','granite'];
function quickBattle(id,extra={}){
  const w=W.newWorld(id,'own-drive'),opp=W.opponentOf(w);
  return B.create({home:W.teamFor(id,null,w.userLineup),away:W.teamFor(opp,w.programs[opp].playbook,w.programs[opp].lineup),
    user:'home',mode:'key',control:'offense',seed:`slice:${id}:0`,...extra});
}
// Accept every staff recommendation; answer drive_end with `coachNext`.
function run(b,{coachNext=false,onRequest}={}){
  let req=B.advance(b),ends=0;
  for(let n=0;n<600&&req;n++){
    if(onRequest){const r=onRequest(req,b);if(r){req=r;continue}}
    if(req.kind==='drive_end'){ends++;req=B.submit(b,{type:'drive_end',coachNext});continue}
    req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:{type:'auto'});
  }
  assert.equal(b.game.status,'final');
  return ends;
}
// Records the first offensive decision and how many snap decisions the coach was offered on each possession.
const firstOffense=b=>{let first=null;b._asked={};return(req)=>{
  if(req.kind==='snap'&&req.role==='off'){const k=`${b.game.drive}:${b.game.possession}`;b._asked[k]=(b._asked[k]||0)+1}
  if(!first&&req.kind==='snap'&&req.role==='off'){first={down:req.situation.down,command:req.options.command};b._first=first}return null}};
// Every snap on a coached possession was the coach's decision (they may still hand one to the staff).
const askedEverySnap=(b,key)=>b._asked[key]>=b.log.filter(e=>e.type==='snap'&&e.drive===key).length;

test('the first offensive decision comes on first down with the full opening Command in all eight programs',()=>{
  for(const id of PROGRAMS){
    const b=quickBattle(id,{openingDrive:true});run(b,{onRequest:firstOffense(b)});
    assert.deepEqual(b._first,{down:1,command:D.RULES.seriesCommand},id);
    const log=B.driveLog(b);
    assert.equal(log[0].coached,'opening',id);
    assert.ok(askedEverySnap(b,log[0].key),`${id}: the coach was asked on every snap of the opening drive`);
    assert.deepEqual(log[0].firstDecision&&log[0].firstDecision.down,1);
  }
});
test('without the opening drive the old Key Moments handoff is unchanged (baseline: third down)',()=>{
  for(const id of PROGRAMS){
    const b=quickBattle(id);const ends=run(b,{onRequest:firstOffense(b)});
    assert.equal(ends,0);assert.equal(b.driveCoach,undefined);
    assert.equal(b._first.down,3,id);
  }
});
test('accepting the staff calls gives the identical game whether or not the coach owned the drive',()=>{
  for(const id of PROGRAMS.slice(0,4)){
    const watched=quickBattle(id,{openingDrive:true}),condensed=quickBattle(id);
    run(watched,{coachNext:true});run(condensed);
    assert.deepEqual(watched.game.score,condensed.game.score,id);
    assert.equal(watched.game.clock,condensed.game.clock,id);
    assert.deepEqual(watched.log.map(e=>e.text),condensed.log.map(e=>e.text),id);
  }
});
test('Back to Key Moments pauses once; Coach next drive claims every later possession from its first snap',()=>{
  const once=quickBattle('sunbelt',{openingDrive:true});
  assert.equal(run(once,{coachNext:false}),1);
  const log=B.driveLog(once);
  assert.deepEqual(log.filter(d=>d.coached).map(d=>d.coached),['opening']);
  assert.equal(log[0].coachNext,false);
  const all=quickBattle('sunbelt',{openingDrive:true}),ends=run(all,{coachNext:true,onRequest:firstOffense(all)});
  const drives=B.driveLog(all);
  assert.ok(drives.length>=8);
  assert.ok(drives.every(d=>d.coached),'every possession of the coach was claimed');
  assert.ok(drives.every(d=>askedEverySnap(all,d.key)),'the coach was asked on every snap of every coached drive');
  assert.ok(drives.slice(1).every(d=>d.coached==='next'));
  assert.ok(ends>=drives.length-2&&ends<=drives.length,'a pause after each coached drive except the last at the half or the end');
});
test('the opening drive waits for the coach when the team kicks off first',()=>{
  let checked=0;
  for(const id of PROGRAMS){
    const b=quickBattle(id,{openingDrive:true});
    let opponentDecision=false;
    run(b,{onRequest:(req)=>{if(b.game.possession!=='home'&&req.kind!=='drive_end'&&B.driveLog(b).length===0)opponentDecision=true;return null}});
    const firstPossession=b.log.find(e=>e.drive)?.offSide;
    if(firstPossession!=='away')continue;
    checked++;
    assert.equal(opponentDecision,false,`${id}: no decision on the opponent's opening possession`);
    assert.equal(B.driveLog(b)[0].coached,'opening');
  }
  assert.ok(checked>0,'sampled at least one game where the coach kicked off');
});
test('a save in the middle of the opening drive resumes on that snap and plays out identically',()=>{
  const b=quickBattle('lakeshore',{openingDrive:true}),twin=quickBattle('lakeshore',{openingDrive:true});
  let req=B.advance(b);B.advance(twin);
  req=B.submit(b,{type:'auto'});B.submit(twin,{type:'auto'});
  assert.equal(req.kind,'snap');
  const resumed=B.load(B.save(b));
  assert.equal(resumed.pending.kind,'snap');assert.deepEqual(resumed.pending.situation,b.pending.situation);
  assert.equal(B.sidelineOptions(resumed).coachDrive,true,'still coaching this drive after reload');
  run(resumed);run(twin);
  assert.deepEqual(resumed.game.score,twin.game.score);
  assert.deepEqual(resumed.log.map(e=>e.text),twin.log.map(e=>e.text));
});
test('a coach who chooses simulation mid-drive gets it immediately, with no drive-end pause',()=>{
  const b=quickBattle('control',{openingDrive:true});
  const req=B.advance(b);assert.equal(req.kind,'snap');
  b.mode='sim';b.pending=null;
  assert.equal(B.advance(b),null);assert.equal(b.game.status,'final');
});
test('drive summaries read the log: punt after a third-down sack, touchdown, turnover, field goal, downs',()=>{
  const base={type:'snap',offSide:'home',defSide:'away'},key='7:home';
  const sit=(down,distance,field)=>({down,distance,field,period:1,clock:500,possession:'home',score:{home:0,away:0}});
  const after=(down,distance,field,possession='home',score={home:0,away:0})=>({down,distance,field,possession,period:1,clock:470,score});
  const b={user:'home',teams:{home:{short:'HOM'},away:{short:'AWY'}},game:{status:'live',possession:'away',drive:8,score:{home:0,away:0}},log:[
    {...base,drive:key,play:'inside_zone',kind:'run',yards:6,sit:sit(1,10,30),after:after(2,4,36),score:{home:0,away:0}},
    {...base,drive:key,play:'power',kind:'run',yards:1,sit:sit(2,4,36),after:after(3,3,37),score:{home:0,away:0}},
    {...base,drive:key,play:'deep_cross',kind:'sack',yards:-7,sit:sit(3,3,37),after:after(4,10,30),score:{home:0,away:0}},
    {type:'kick',kick:'punt',drive:key,side:'home',sit:sit(4,10,30),after:after(1,10,20,'away'),score:{home:0,away:0}}
  ]};
  const punt=B.driveSummary(b,key);
  assert.equal(punt.text,'3 plays, 0 yards. A third-down sack forced a punt.');assert.equal(punt.result,'punt');
  b.log=[{...base,drive:key,play:'deep_cross',kind:'catch',yards:70,sit:sit(1,10,30),after:after(1,10,25,'away',{home:7,away:0}),score:{home:7,away:0}}];
  assert.equal(B.driveSummary(b,key).text,'1 play, 70 yards. Touchdown. The big play was a 70-yard Deep Cross.');
  b.log=[{...base,drive:key,play:'deep_cross',kind:'inc',yards:12,turnover:'interception',sit:sit(1,10,30),after:after(1,10,58,'away'),score:{home:0,away:0}}];
  assert.equal(B.driveSummary(b,key).text,'1 play, 0 yards. An interception ended it.');
  b.log=[{...base,drive:key,play:'power',kind:'run',yards:8,sit:sit(3,9,60),after:after(4,1,68),score:{home:0,away:0}},
    {type:'kick',kick:'field_goal',made:true,drive:key,side:'home',sit:sit(4,1,68),after:after(1,10,25,'away',{home:3,away:0}),score:{home:3,away:0}}];
  assert.equal(B.driveSummary(b,key).text,'1 play, 8 yards. An 8-yard third-down run set up a field goal try. It was good.');
  b.log=[{...base,drive:key,play:'power',kind:'run',yards:0,sit:sit(4,1,50),after:after(1,10,50,'away'),score:{home:0,away:0}}];
  assert.equal(B.driveSummary(b,key).result,'downs');
  assert.deepEqual(B.delegatedRecap(b,0).map(r=>r.team),['HOM']);
});

// A snap-mode game with only PA Boot and Inside Zone on the sheet, so run-run-boot is reachable.
function bootGame(seed){
  const home=Ro.preset('ground'),deck=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));deck.off.wrinkles=Array(12).fill('pa_boot');home.decks=deck;
  const b=B.create({home,away:Ro.preset('tempo'),user:'home',control:'offense',mode:'snap',seed,openingDrive:true});
  return b;
}
test('the setup cue appears only when two runs have set up an affordable PA Boot, and stops after it pays out',()=>{
  let saw=0,used=0;
  for(let i=0;i<12&&!(saw&&used);i++){
    const b=bootGame('cue-'+i);let req=B.advance(b),runs=0;
    for(let n=0;n<200&&req;n++){
      if(req.kind==='snap'&&req.role==='off'){
        const cue=req.setupCue,fams=b.drive?.key?.endsWith(':home')?b.drive.fams:[];
        if(cue){
          saw++;assert.equal(cue.id,'establish');assert.equal(cue.play,'pa_boot');
          assert.deepEqual(fams.slice(-2),['run','run'],'cue only after two runs on this drive');
          if(req.situation.down>=3&&req.situation.distance>=7)assert.match(cue.caution,/bonus helps one matchup/);else assert.equal(cue.caution,null);
          const before=b.log.length;req=B.submit(b,{type:'call',play:'pa_boot',tactics:[]});used++;
          const e=b.log.slice(before).find(x=>x.type==='snap'&&x.play==='pa_boot');
          if(e&&!e.penalty){
            assert.ok(e.duels.some(d=>d.mods.some(m=>m.src==='COMBO: Establish the Run')),'the cue named a combo that really applied');
            if(b.game.period<=2&&b.pending?.kind==='snap'&&b.pending.role==='off')assert.equal(b.pending.setupCue,undefined,'paid out this half');
          }
          continue;
        }
        const ok=req.options.plays.find(p=>p.id==='inside_zone'&&!p.blocked);
        req=B.submit(b,ok?{type:'call',play:'inside_zone',tactics:[]}:{type:'auto'});runs++;continue;
      }
      req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:req.kind==='drive_end'?{type:'drive_end',coachNext:true}:{type:'auto'});
    }
    if(used){const log=B.driveLog(b);assert.ok(log.some(d=>d.cuesShown.includes('establish')&&d.cuesUsed.includes('establish')))}
  }
  assert.ok(saw>0&&used>0,'the cue was offered and used');
});

// Synthetic snaps: duel order is Gate, Key, Finish.
const duel=(key,label,mods,offNames=['Off '+key],defNames=['Def '+key])=>({key,label,mods,offNames,defNames,offGrade:6,defGrade:6,p:.5});
const entry=(over)=>({type:'snap',offSide:'home',defSide:'away',offTactics:['max_protect'],defTactics:[],kind:'catch',yards:4,...over});
test('the verdict credits a tactic only on a duel the play reached',()=>{
  const G=duel('G','Protection',[{v:2,src:'Max protect'}],['Line']),K=duel('K','Separation',[],['Z']),F=duel('F','Read the safety',[{v:-1,src:'One fewer route'}],['Z'],['FS']);
  // Pocket held, receiver separated, safety won the catch point.
  let v=B.snapVerdict(entry({duels:[G,K,F],duelResults:[{won:true},{won:true},{won:false}]}),'home');
  assert.equal(v.text,'+4 yards. Protection: won with help from Max Protect. Read the safety: their FS beat your Z.');
  assert.equal(v.tactics[0].credit,'helped');assert.equal(v.won,false);
  // The rush won anyway.
  v=B.snapVerdict(entry({kind:'sack',duels:[G,K,F],duelResults:[{won:false},{won:true},{won:true}]}),'home');
  assert.equal(v.detail,'Protection: Max Protect helped, but their Def G still beat your Line.');
  // A tactic that targets an unreached duel gets no credit.
  const Kmo=duel('K','Separation',[{v:1,src:'Route adjustment'}],['Z']);
  v=B.snapVerdict(entry({offTactics:['route_adjust'],duels:[duel('G','Protection',[]),Kmo,F],duelResults:[{won:false},{won:true},{won:true}]}),'home');
  assert.match(v.detail,/^Route Adjustment would have helped at Separation, but the play ended first\. Protection: their Def G beat your Off G\.$/);
  assert.equal(v.tactics[0].credit,'unreached');
  // No tactic: just the deciding duel. From the defense's side the same snap is a win.
  v=B.snapVerdict(entry({offTactics:[],duels:[G,K,F],duelResults:[{won:true},{won:true},{won:true}]}),'away');
  assert.equal(v.detail,'Read the safety: their Z beat your FS.');assert.equal(v.won,false);
  assert.equal(B.snapVerdict(entry({penalty:{label:'Holding'}})),null);
});
test('the verdict on real recorded snaps names only tactics that were played',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('tempo'),user:'home',mode:'snap',control:'offense',seed:'verdict-3'});
  let req=B.advance(b),checked=0;
  for(let n=0;n<300&&req;n++){
    if(req.kind==='snap'&&req.role==='off'){
      const o=req.options,pick=o.plays.find(p=>p.card.protection&&!p.blocked&&p.cost<=o.command);
      const mp=pick&&o.tactics.find(t=>t.id==='max_protect'&&t.cost+pick.cost<=o.command);
      if(pick&&mp){
        const before=b.log.length;req=B.submit(b,{type:'call',play:pick.id,tactics:['max_protect']});
        const e=b.log.slice(before).find(x=>x.type==='snap'&&x.userCalled);
        if(e&&!e.penalty){
          checked++;const v=B.snapVerdict(e,'home');
          assert.ok(v.text.length<220);
          if(e.duelResults[0].won)assert.equal(v.tactics[0].credit,'helped');else assert.equal(v.tactics[0].credit,'outweighed');
        }
        continue;
      }
    }
    req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:{type:'auto'});
  }
  assert.ok(checked>=2);
});
test('regression: Sunbelt Deep Cross into Lakeshore Cover 0, Max Protect wins the pocket but the safety can still decide it',()=>{
  const off=W.teamFor('sunbelt').lineup.off,def=W.teamFor('lakeshore').lineup.def;
  const sit={down:1,distance:10,field:35,period:1,clock:600,score:{home:0,away:0}};
  const snap=t=>R.buildSnap({off,def,play:D.PLAYS.deep_cross,call:D.CALLS.cover0,offTactics:t,situation:sit,weather:'clear',read:'auto'});
  const plain=snap([]),protect=snap(['max_protect']);
  assert.equal(plain.duels[0].label,'Protection');
  assert.ok(protect.duels[0].p-plain.duels[0].p>=.1,'Max Protect raises the protection duel');
  assert.ok(protect.duels[2].p<plain.duels[2].p,'one fewer route costs the finish');
  const N=2000,c={pa:0,pm:0,fa:0,fm:0,same:0};
  for(let i=0;i<N;i++){
    const x=R.resolve(plain,Rng.create('mp:'+i),sit),y=R.resolve(protect,Rng.create('mp:'+i),sit);
    c.pa+=x.wins[0];c.pm+=y.wins[0];
    const first=o=>!o.turnover&&o.yards>=10;c.fa+=first(x);c.fm+=first(y);
    if(x.kind===y.kind&&x.yards===y.yards&&!!x.turnover===!!y.turnover)c.same++;
  }
  // Measured on this build: protection 33.7% -> 48.5%, first downs 17.7% -> 22.6%, 80% same visible outcome.
  assert.ok(c.pm/N-c.pa/N>=.1,`protection ${c.pa}/${N} -> ${c.pm}/${N}`);
  assert.ok(c.fm>c.fa,`first downs ${c.fa} -> ${c.fm}`);
  assert.ok(c.same/N>=.6&&c.same/N<=.95,`same outcome ${c.same}/${N}`);
});
test('Face another look keeps the Four-Minute situation and changes only the coordinator’s documented behavior',()=>{
  const c=B.DRIVE_CHALLENGES.find(x=>x.id==='four_minute_offense');
  assert.equal(c.alternate.id,'stacked_box');assert.match(c.alternate.change,/loaded box/);
  const a=B.createChallenge('four_minute_offense'),alt=B.createChallenge('four_minute_offense',{look:'stacked_box'});
  assert.deepEqual(alt.pending.situation,a.pending.situation);
  assert.equal(alt.challengeLook,'stacked_box');assert.equal(a.challengeLook,undefined);
  assert.throws(()=>B.createChallenge('need_six',{look:'stacked_box'}),/no such alternate/);
  const boxes=new Set();
  for(let i=0;i<6;i++){
    const b=B.createChallenge('four_minute_offense',{look:'stacked_box'});let req=b.pending;
    for(let n=0;n<40&&req&&!B.challengeResult(b);n++)req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:req.kind==='snap'&&i%2?{type:'call',play:req.options.plays.find(p=>!p.blocked&&p.cost<=req.options.command).id,tactics:[]}:{type:'auto'});
    for(const e of b.log)if(e.type==='snap'&&!e.penalty&&e.defSide==='away')boxes.add(D.CALLS[e.call].box);
  }
  assert.deepEqual([...boxes],['loaded']);
});
