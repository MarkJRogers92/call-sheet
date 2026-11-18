'use strict';
// Special teams and situational depth: engine hooks that change nothing unless asked, kicker and punter ratings,
// 4th-down fakes, onside kicks, Swinging Gate two-point tries, personnel groupings, Kill Kill, real timeouts,
// red-zone rules and halftime weather.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),R=core('resolver.js'),Ro=core('roster.js'),D=core('data.js'),Engine=require('../game-engine-v2.js');
const deckWith=(off={},def={})=>{const d=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));for(const [k,v] of Object.entries(off))d.off[k]=d.off[k].concat(v);for(const [k,v] of Object.entries(def))d.def[k]=d.def[k].concat(v);return d};
const lineups=()=>({off:Ro.preset('aerial').lineup.off,def:Ro.preset('ground').lineup.def});
const snapFor=(play,call,extra={})=>{const {off,def}=lineups();return R.buildSnap({off,def,play:D.PLAYS[play],call:D.CALLS[call],situation:{down:1,distance:10,field:30,period:1},...extra})};
const mods=(snap,key)=>snap.duels.find(d=>d.key===key).mods.map(m=>m.src);

test('engine hooks change nothing unless asked',()=>{
  const run=hook=>{const g=Engine.createGame({home:{id:'home',name:'H',rating:70},away:{id:'away',name:'A',rating:70},seed:'hooks',rules:{penalties:true,returns:true}});Engine.startGame(g);g.fieldPosition=70;g.down=4;hook(g);return JSON.stringify(Engine.snapshot?Engine.snapshot(g):g)};
  assert.equal(run(g=>Engine.attemptFieldGoal(g)),run(g=>Engine.attemptFieldGoal(g,{adjust:0})));
  assert.equal(run(g=>Engine.punt(g)),run(g=>Engine.punt(g,{netAdjust:0})));
  const g=Engine.createGame({home:{id:'home',name:'H',rating:70},away:{id:'away',name:'A',rating:70},seed:'onside',rules:{penalties:true,returns:true}});Engine.startGame(g);
  g.onside={kicker:'home',chance:.5};Engine.kickoffTo(g,'away');
  const ev=g.events.at(-1);assert.equal(ev.type,'kickoff');assert.equal(ev.onside,true);assert.equal(g.possession,ev.recovered?'home':'away');assert.equal(g.onside,null);
});

test('kickers and punters move the kick by their real ratings, labeled',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'kick'});
  b.teams.home.specialists={K:{name:'Big Leg',traits:{power:95,technique:90}},P:{name:'Boomer',traits:{power:92}}};
  b.teams.away.specialists={K:{name:'Shaky',traits:{power:45,technique:40}},P:null};
  assert.ok(B.kickerEdge(b,'home').adjust>0);assert.ok(B.kickerEdge(b,'away').adjust<0);
  assert.ok(B.punterEdge(b,'home').netAdjust>0);assert.equal(B.punterEdge(b,'away').netAdjust,0,'no punter on file is average');
  assert.ok(Math.abs(B.kickerEdge(b,'home').adjust)<=.12,'a kick is never decided by the kicker alone');
});

test('fakes appear only on 4th down, and special cards never enter a hand',()=>{
  assert.equal(R.playBlocked(D.PLAYS.fake_punt,Ro.preset('aerial').lineup.off,{down:3,distance:5}),'4th down only');
  assert.equal(R.playBlocked(D.PLAYS.fake_punt,Ro.preset('aerial').lineup.off,{down:4,distance:5}),null);
  let fakes=0;
  for(let i=0;i<30;i++){
    const t=Ro.preset('aerial');t.decks=deckWith({wrinkles:['fake_punt','fake_field_goal','fake_punt'],tactics:['onside_kick','swinging_gate']});
    const b=B.simulate({home:t,away:Ro.preset('ground'),seed:`fakes-${i}`});assert.ok(!b.final.engineError,b.final.engineError);
    for(const e of b.log)if(e.type==='snap'){if(D.PLAYS[e.play]?.fourthOnly){fakes++;assert.equal(e.sit.down,4)}assert.ok(!(e.offTactics||[]).some(id=>D.TACTICS[id]?.special),'special cards are not played as tactics')}
  }
  assert.ok(fakes>0,'teams do run fakes when they go for it');
});

test('onside kicks come late when trailing; the Swinging Gate in the second half; each once per game',()=>{
  let onside=0,gate=0;
  for(let i=0;i<80&&!(onside&&gate);i++){
    const t=Ro.preset(['aerial','tempo','ground'][i%3]);t.decks=deckWith({tactics:['onside_kick','swinging_gate']});
    const b=B.simulate({home:t,away:Ro.preset('aerial'),seed:`specials-${i}`});
    let o=0,s=0;for(const e of b.log){if(/onside kick/.test(e.text||'')){o++;assert.equal(e.sit.period,4)}if(/Swinging Gate/.test(e.text||'')){s++;assert.ok(e.sit.period>=3)}}
    assert.ok(o<=1&&s<=1,'once per game');onside+=o;gate+=s;
  }
  assert.ok(onside>0,'an onside try happens');assert.ok(gate>0,'a Swinging Gate try happens');
});

test('personnel groupings, Kill Kill, red zone and the two-minute timeouts',()=>{
  assert.ok(mods(snapFor('inside_zone','cover3',{grouping:'12'}),'G').some(s=>/Personnel 12/.test(s)));
  assert.ok(!mods(snapFor('inside_zone','run_fit',{grouping:'12'}),'G').some(s=>/Personnel 12/.test(s)),'a loaded box answers heavy personnel');
  assert.ok(snapFor('deep_cross','cover3',{grouping:'10'}).duels.some(d=>d.mods.some(m=>/Personnel 10/.test(m.src))));
  assert.ok(mods(snapFor('inside_zone','bear',{offTactics:['kill_kill']}),'K').some(s=>/Kill, Kill/.test(s)),'bear counters the run, so the QB checks out');
  assert.ok(!mods(snapFor('quick_slant','bear',{offTactics:['kill_kill']}),'K').some(s=>/Kill, Kill/.test(s)));
  const rz={down:1,distance:10,field:86,period:2};
  assert.ok(mods(snapFor('vertical_shot','cover3',{situation:rz}),'K').includes('Red zone: no room deep'));
  assert.ok(mods(snapFor('fade_route','cover3',{situation:rz}),'F').some(s=>/Red zone/.test(s)));
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'grp'});b.game.down=3;b.game.distance=9;assert.equal(B.groupingFor(b,'home'),'10');
  b.game.distance=1;assert.equal(B.groupingFor(b,'home'),'21');assert.throws(()=>B.setGrouping(b,'home','99'));
  // Timeouts are real: with none left, the cards drop out of the options.
  const t=Ro.preset('aerial');t.decks=deckWith({tactics:['timeout_settle','timeout_settle','timeout_settle','timeout_settle']});
  const c=B.create({home:t,away:Ro.preset('ground'),user:'home',mode:'snap',control:'offense',seed:'timeouts'});
  let req=B.advance(c);for(let i=0;i<60&&req&&!(req.kind==='snap'&&req.role==='off'&&req.options.tactics.some(x=>x.id==='timeout_settle'));i++)req=B.submit(c,req.kind==='fourth'?{choice:req.recommended}:req.kind==='plan'?{type:'plan',calls:[]}:{type:'auto'});
  if(req?.kind==='snap'){c.game.timeouts.home=0;assert.equal(B.offOptions(c,'home').tactics.some(x=>x.id==='timeout_settle'),false)}
});

test('weather can turn at halftime, labeled, and only outdoors',()=>{
  let turned=0;
  for(let i=0;i<60;i++){
    const b=B.simulate({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:`wx-${i}`,weather:'clear',conditions:{roof:'open',temp:50,wind:18,precip:0}});
    const w=b.log.find(e=>e.type==='weather');if(w){turned++;assert.equal(w.to,'rain');assert.equal(b.weather,'rain')}
    const dome=B.simulate({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:`wx-${i}`,weather:'clear',conditions:{roof:'dome',temp:72,wind:0,precip:0}});
    assert.equal(dome.log.some(e=>e.type==='weather'),false);
  }
  assert.ok(turned>0&&turned<30,`rain moved in ${turned} of 60 windy games`);
});
