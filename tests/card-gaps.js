'use strict';
// Closing round-2 gaps: quick kicks on 3rd down, drill timeouts that stop the clock, walk-on breakouts, the spring
// game's standout recommendation, and the trophy case.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),R=core('resolver.js'),Ro=core('roster.js'),D=core('data.js');

test('the quick kick is a 3rd-down punt that changes possession',()=>{
  assert.equal(R.playBlocked(D.PLAYS.quick_kick,Ro.preset('ground').lineup.off,{down:2,distance:6}),'3rd down only');
  let kicked=null;
  for(let n=0;n<12&&!kicked;n++){
    const t=Ro.preset('ground'),d=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));d.off.wrinkles=Array(10).fill('quick_kick').concat(d.off.wrinkles);t.decks=d;
    const b=B.create({home:t,away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:`qk-${n}`});
    let req=B.advance(b);
    for(let i=0;i<300&&req;i++){
      if(req.kind==='snap'&&req.role==='off'&&b.game.down===3&&req.options.plays.some(p=>p.id==='quick_kick'&&!p.blocked)){
        const from=b.game.possession;B.submit(b,{type:'call',play:'quick_kick',tactics:[]});kicked={b,from};break}
      req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:req.kind==='plan'?{type:'plan',calls:[]}:req.kind==='snap'&&req.role==='off'?{type:'call',play:req.options.plays.find(p=>!p.blocked&&p.id!=='quick_kick'&&p.cost<=req.options.command).id,tactics:[]}:{type:'auto'});
    }
  }
  assert.ok(kicked,'reached a 3rd down with the quick kick in hand');
  // The battle plays on to the person's next decision, so find the quick-kick snap itself.
  const qk=kicked.b.log.find(e=>e.type==='snap'&&e.play==='quick_kick');
  assert.ok(qk);assert.match(qk.text,/quick-kicks/);assert.equal(qk.sit.down,3);assert.notEqual(qk.after.possession,qk.sit.possession,'the other team has the ball');
});

test('in the drill, a trailing team burns timeouts to stop the clock, never below zero',()=>{
  let notes=0;
  for(let i=0;i<40;i++){
    const b=B.simulate({home:Ro.preset(['aerial','tempo','ground'][i%3]),away:Ro.preset('aerial'),seed:`drill-to-${i}`});
    for(const e of b.log)if(e.type==='snap'&&/calls timeout/.test(e.text||'')){notes++;assert.ok((e.sit.period===2||e.sit.period===4)&&e.sit.clock<=120)}
    for(const s of ['home','away'])assert.ok(b.game.timeouts[s]>=0);
  }
  assert.ok(notes>0,'timeouts are used in the drill');
});

test('walk-ons break out once, the spring game can recommend a backup, and the trophy case shows a held trophy',async()=>{
  const {loadEngine}=require('../tools/harness');globalThis.__DL_TEST__={};
  const e=loadEngine({seed:995,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay,CS=globalThis.CallSheet;cg.enable();const u=e.universe,me=e.T('Chicago Metropolitan'),pb=u.callSheet.playbook;
  const starter=me.roster.find(p=>p.id===CS.adapter.lineupFromTeam(me).lineup.off.RB.id||String(p.id)===String(CS.adapter.lineupFromTeam(me).lineup.off.RB.id));
  starter.origin='Walk-on / late addition';
  for(let w=1;w<=40;w++)cg.walkOnBreakouts({week:w});
  const cards=[...pb.signatures,...pb.reserveSignatures].filter(x=>String(x.playerId)===String(starter.id));
  assert.equal(cards.length,1,'a walk-on starter breaks out exactly once');
  u.offseason={...(u.offseason||{}),phase:'spring'};cg.springGame();
  const ss=u.callSheet.springStandout;
  if(ss){assert.equal(ss.year,u.year);assert.ok(ss.roleId&&ss.id&&ss.starterId&&ss.id!==ss.starterId)}
  assert.ok(u.callSheet.moments.some(m=>/Spring game/.test(m.text)));
  const rival=u.teams.find(t=>t.id!==me.id);me.rivalry={rivalId:rival.id,trophy:'Iron Skillet',series:{holderId:me.id,w:5,l:3}};
  assert.match(cg.trophyCaseHTML(),/Iron Skillet[\s\S]*Series 5–3/);me.rivalry.series.holderId=rival.id;assert.equal(cg.trophyCaseHTML(),'');
});
