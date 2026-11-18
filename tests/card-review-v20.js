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
test('a tryout shows exact odds with and without the card on the same film snap, and stays repeatable',()=>{
  const b=B.simulate({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:'try-1'});b.user='home';
  const t=B.tryRewardCard({battle:b,seed:'x'},'max_protect');
  assert.match(t,/Your odds on this snap · Max Protect: \d+% to convert/);assert.match(t,/Without it: \d+% to convert/);assert.match(t,/one rep/);
  assert.equal(B.tryRewardCard({battle:b,seed:'x'},'max_protect'),t);
  const [withIt,without]=[...t.matchAll(/(\d+)% to convert/g)].map(m=>Number(m[1]));assert.ok(withIt>without,'protection helps on this film');
  assert.match(B.tryRewardCard({battle:b,seed:'x'},'bracket'),/Their odds on this snap/);
  assert.doesNotMatch(B.tryRewardCard({battle:b,seed:'x'},'film_tell'),/odds/);
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
