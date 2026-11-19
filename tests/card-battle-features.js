'use strict';
// Battle features: progression reads (checkdowns), momentum after takeaways, the two-minute drill, weather cards,
// timeout tactics, and rivalry card borrowing. Every effect is labeled; talent still decides.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),R=core('resolver.js'),Ro=core('roster.js'),D=core('data.js'),Rng=require('../rng.js');
const lineups=()=>({off:Ro.preset('aerial').lineup.off,def:Ro.preset('ground').lineup.def});
const snapFor=(play,call,extra={})=>{const {off,def}=lineups();return R.buildSnap({off,def,play:D.PLAYS[play],call:D.CALLS[call],situation:{down:1,distance:10,field:30,period:1},...extra})};
const modsOf=(snap,key)=>snap.duels.find(d=>d.key===key).mods.map(m=>m.src);

test('the QB Sneak is a free short-yardage call on a fresh or resumed sheet',()=>{
  const E=require('../game-engine-v2');
  const game=distance=>{
    const b=B.create({seed:'sneak-1',home:Ro.preset('ground'),away:Ro.preset('aerial'),mode:'snap',control:'offense',user:'home'});
    E.startGame(b.game);Object.assign(b.game,{possession:'home',fieldPosition:48,down:3,distance});B.advance(b);return b;
  };
  const b=game(2),old=b.pending.options.plays;
  const sneak=old.find(o=>o.id==='qb_sneak');assert.equal(sneak.cost,0);assert.ok(sneak.base);
  b.pending.options.plays=old.filter(o=>o.id!=='qb_sneak');
  const resumed=B.load(B.save(b));
  assert.equal(resumed.pending.options.plays.filter(o=>o.id==='qb_sneak').length,1);
  assert.deepEqual(resumed.hands,b.hands);assert.deepEqual(resumed.rng,b.rng);
  B.submit(resumed,{type:'call',play:'qb_sneak',tactics:[]});
  assert.equal(resumed.log.find(e=>e.play==='qb_sneak').participants.carrier,'QB');
  assert.equal(resumed.box.home.cardsPlayed,0);
  assert.ok(game(1).pending.options.plays.some(o=>o.id==='qb_sneak'));
  const long=game(3),saved=B.save(long);
  assert.ok(!long.pending.options.plays.some(o=>o.id==='qb_sneak'));
  assert.throws(()=>B.submit(long,{type:'call',play:'qb_sneak',tactics:[]}),/2 yards or less/);
  assert.equal(B.save(long),saved);
});

test('a sneak favors one yard over two, and a loaded front can stonewall it',()=>{
  const open=snapFor('qb_sneak','two_high'),loaded=snapFor('qb_sneak','run_fit');
  const chance=(snap,distance)=>R.evaluate(snap,{distance}).first;
  assert.deepEqual(open.duels[0].offRoles,['C','LG','RG']);
  assert.ok(open.duels[2].offRoles.includes('QB')&&open.duels[2].offTraits.includes('power'));
  assert.ok(chance(open,1)>chance(open,2));
  assert.ok(chance(open,1)>chance(snapFor('inside_zone','two_high'),1));
  assert.ok(chance(open,1)>chance(loaded,1));
  assert.ok(R.evaluate(open).yards<R.evaluate(snapFor('inside_zone','two_high')).yards);
});

test('pass plays check down to the back or tight end when the first read is covered, unless told not to',()=>{
  const snap=snapFor('quick_slant','cover3');
  assert.ok(snap.checkdown&&['RB','TE'].includes(snap.checkdown.role)&&snap.checkdown.p>0&&snap.checkdown.p<.3);
  assert.equal(snapFor('quick_slant','cover3',{read:'primary'}).checkdown,null);
  assert.equal(snapFor('statue_left','cover3').checkdown,null,'run plays have no read');
  assert.equal(snapFor('hook_ladder','cover3').checkdown,null,'trick plays have no checkdown');
  const zone=snapFor('quick_slant','cover3').checkdown.margin,man=snapFor('quick_slant','cover1').checkdown.margin;
  assert.ok(zone>=man,'zone leaves the checkdown more open than man');
  let downs=0,incs=0;
  for(let i=0;i<400;i++){const out=R.resolve(snap,Rng.create(`cd-${i}`));if(out.checkdown){downs++;assert.equal(out.kind,'catch');assert.equal(out.participants.target,snap.checkdown.role)}if(out.kind==='inc')incs++}
  assert.ok(downs>=2&&incs>downs*5,`checkdowns happen but do not erase incompletions (${downs} checkdowns, ${incs} incompletions)`);
  assert.ok(R.evaluate(snap,{down:1,distance:10}).yards>R.evaluate(snapFor('quick_slant','cover3',{read:'primary'}),{down:1,distance:10}).yards);
});

test('weather cards, timeouts and momentum apply only in their moment',()=>{
  assert.ok(modsOf(snapFor('wishbone_dive','cover3',{weather:'snow'}),'G').some(s=>/Snow game/.test(s)));
  assert.ok(!modsOf(snapFor('wishbone_dive','cover3',{weather:'clear'}),'G').some(s=>/Snow|Wet/.test(s)));
  assert.ok(modsOf(snapFor('power_lead','cover3',{weather:'wind'}),'K').some(s=>/Wind game/.test(s)));
  const third={down:3,distance:6,field:40,period:2},first={down:1,distance:10,field:40,period:2};
  assert.ok(modsOf(snapFor('inside_zone','cover3',{situation:third,defTactics:['timeout_ice']}),'K').some(s=>/Ice Them/.test(s)));
  assert.ok(!modsOf(snapFor('inside_zone','cover3',{situation:first,defTactics:['timeout_ice']}),'K').some(s=>/Ice Them/.test(s)));
  assert.ok(modsOf(snapFor('inside_zone','cover3',{momentum:true}),'G').includes('Momentum: takeaway'));
  assert.ok(!modsOf(snapFor('inside_zone','cover3'),'G').includes('Momentum: takeaway'));
});

test('full battles: drill cards only in the last two minutes, momentum follows takeaways, checkdowns in the log',()=>{
  let drill=0,checkdowns=0,momentumOk=0,passes=0;
  for(let i=0;i<30;i++){
    const b=B.simulate({home:Ro.preset(['aerial','tempo','ground'][i%3]),away:Ro.preset('aerial'),seed:`features-${i}`});
    assert.equal(b.game.status,'final');assert.ok(!b.final.engineError,b.final.engineError);
    const snaps=b.log.filter(x=>x.type==='snap'&&x.duels);
    for(let j=0;j<snaps.length;j++){const s=snaps[j];
      if(D.PLAYS[s.play]?.drill){drill++;assert.ok((s.sit.period===2||s.sit.period===4)&&s.sit.clock<=120,`${s.play} outside the drill`)}
      if(D.PLAYS[s.play]?.pass)passes++;if(/checks down/.test(s.text))checkdowns++;
      if(s.turnover&&snaps[j+1]&&snaps[j+1].offSide===s.defSide){assert.ok(snaps[j+1].duels[0].mods.some(m=>m.src==='Momentum: takeaway'),'the next snap after a takeaway has momentum');momentumOk++}
    }
  }
  assert.ok(drill>0,'drill cards get used');assert.ok(momentumOk>0,'takeaways happen');
  assert.ok(checkdowns>passes*.004&&checkdowns<passes*.05,`checkdown rate ${checkdowns}/${passes}`);
});

test('the person can refuse the checkdown; drill cards are refused outside the drill',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),user:'home',mode:'snap',control:'offense',seed:'refuse'});
  let req=B.advance(b);for(let i=0;i<60&&req&&!(req.kind==='snap'&&req.role==='off');i++)req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:req.kind==='plan'?{type:'plan',calls:[]}:{type:'auto'});
  assert.ok(req&&req.kind==='snap');
  assert.throws(()=>B.submit(b,{type:'call',play:'spike',tactics:[]}),/not in hand/);
  const pass=req.options.plays.find(p=>p.card.pass&&!p.blocked&&p.cost<=req.options.command);
  B.submit(b,{type:'call',play:pass.id,tactics:[],read:'primary'});
  const snap=b.log.filter(x=>x.type==='snap').at(-1);assert.ok(!/checks down/.test(snap.text));
});

test('beating your protected rival lends you one of their cards until next season',async()=>{
  const {loadEngine}=require('../tools/harness');globalThis.__DL_TEST__={};
  const e=loadEngine({seed:951,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay,CS=globalThis.CallSheet;cg.enable();
  const u=e.universe,me=e.T('Chicago Metropolitan'),rival=u.teams.find(t=>t.id!==me.id);me.protectedRivalIds=[rival.id];
  const theirs=CS.packs.newPlaybook();theirs.def.wrinkles=['tampa2'];theirs.off.wrinkles=[];theirs.off.tactics=[];theirs.def.tactics=[];u.callSheet.ai[rival.id]=theirs;
  assert.ok(cg.programAwards({won:true,us:24,them:21,opp:rival}).includes('tampa2'));
  assert.equal(cg.programAwards({won:true,us:24,them:21,opp:rival}).includes('tampa2'),false,'once a season');
  const pb=u.callSheet.playbook;assert.ok(pb.reserve.def.wrinkles.includes('tampa2'));assert.equal(pb.borrowed[0].from,rival.name);
  cg.returnBorrowed();assert.ok(pb.reserve.def.wrinkles.includes('tampa2'),'kept through the season');
  u.year++;cg.returnBorrowed();assert.ok(!pb.reserve.def.wrinkles.includes('tampa2'));assert.equal(pb.borrowed.length,0);
});
