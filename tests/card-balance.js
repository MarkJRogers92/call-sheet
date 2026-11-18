'use strict';
// Balance guards for the card battle (tuned with forks/call-sheet/tools/balance-report.js and sim-report.js):
// talent decides but never guarantees, game-day form is labeled, trick plays are once per game, checkdowns are
// occasional, and scoring stays in a realistic range.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),Ro=core('roster.js'),D=core('data.js');
const P=['aerial','tempo','ground'];
function shifted(preset,d){const t=Ro.preset(preset);for(const side of ['off','def'])for(const p of Object.values(t.lineup[side]))for(const k of Object.keys(p.traits))p.traits[k]=Math.max(25,Math.min(99,p.traits[k]+d));for(const p of t.backfield||[])for(const k of Object.keys(p.traits))p.traits[k]=Math.max(25,Math.min(99,p.traits[k]+d));return t}
function winRate(gap,n){
  let w=0;
  for(let i=0;i<n;i++){const flip=i%2===1,s=shifted(P[i%3],gap/2),k=shifted(P[(i+1)%3],-gap/2),b=B.simulate({home:flip?k:s,away:flip?s:k,seed:`bal-${gap}-${i}`}),me=flip?'away':'home',them=flip?'home':'away';
    w+=b.game.score[me]>b.game.score[them]?1:b.game.score[me]===b.game.score[them]?.5:0}
  return w/n;
}

test('talent decides games but a big favorite can still lose',()=>{
  const small=winRate(4,80),big=winRate(12,80);
  assert.ok(small>.55&&small<.85,`4-point favorite wins ${small}`);
  assert.ok(big>.8&&big<.99,`12-point favorite wins ${big}: talent matters, upsets still happen`);
  assert.ok(big>small);
});

test('game-day form is seeded, small, and labeled on the duels when it matters',()=>{
  const a=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'form-1'}),b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'form-1'});
  assert.deepEqual(a.form,b.form);for(const v of Object.values(a.form))assert.ok(Math.abs(v)<=1);
  let labeled=0;
  for(let i=0;i<20&&!labeled;i++){const g=B.simulate({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:`form-label-${i}`});if(Object.values(g.form).some(v=>Math.abs(v)>=.15))labeled+=g.log.filter(e=>e.type==='snap'&&e.duels?.some(d=>(d.mods||[]).some(m=>/ (sharp|flat) today$/.test(m.src)))).length}
  assert.ok(labeled>0,'form shows up as a labeled edge');
});

test('trick plays are once per game per copy, across halftime',()=>{
  for(let i=0;i<20;i++){
    const t=Ro.preset('aerial'),deck=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));deck.off.wrinkles.push('jet_reverse','jet_reverse');t.decks=deck;
    const b=B.simulate({home:t,away:Ro.preset('ground'),seed:`trick-${i}`});
    assert.ok(b.log.filter(e=>e.type==='snap'&&e.offSide==='home'&&e.play==='jet_reverse').length<=2);
  }
});

test('checkdowns stay occasional and scoring stays realistic',()=>{
  let pass=0,cd=0,pts=0,teams=0,att=0,comp=0;
  for(let i=0;i<90;i++){
    const b=B.simulate({home:Ro.preset(P[i%3]),away:Ro.preset(P[(i+1)%3]),seed:`real-${i}`});
    for(const e of b.log)if(e.type==='snap'&&e.duels&&D.PLAYS[e.play]?.pass&&!D.PLAYS[e.play]?.drill){pass++;if(/checks down/.test(e.text))cd++}
    for(const s of ['home','away']){pts+=b.game.score[s];teams++;att+=b.box[s].passAtt;comp+=b.box[s].comp}
  }
  assert.ok(cd/pass>.003&&cd/pass<.04,`checkdowns ${(cd/pass*100).toFixed(1)}% of passes`);
  assert.ok(pts/teams>22&&pts/teams<36,`points per team ${(pts/teams).toFixed(1)}`);
  assert.ok(comp/att>.58&&comp/att<.71,`completion ${(comp/att).toFixed(3)}`);
});
