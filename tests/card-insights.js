'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const Ro=require('../forks/call-sheet/core/roster');
const clone=x=>JSON.parse(JSON.stringify(x));
function duel(extra={}){return{key:'G',label:'Protection',offRoles:['LT'],defRoles:['RUSH'],offNames:['Alex Tackle'],defNames:['Sam Rusher'],offGrade:9,defGrade:6,mods:[{v:-1,src:'Pressure'}],...extra}}
function snap(extra={}){return{type:'snap',offSide:'home',defSide:'away',play:'deep_cross',sit:{down:1,distance:10,period:1},duels:[duel()],duelResults:[{won:true}],yards:12,...extra}}
test('matchup story separates player ratings from setup and uses the real winner',()=>{
  const e=snap(),before=clone(e),s=B.matchupStory(e);
  assert.equal(s.ratingEdge,3);assert.equal(s.setupEdge,-1);assert.equal(s.winnerSide,'home');
  assert.match(s.summary,/Alex Tackle/);assert.match(s.detail,/rating advantage.*unfavorable setup/i);assert.deepEqual(e,before);
  const upset=B.matchupStory(snap({duelResults:[{won:false}]}));assert.equal(upset.winnerSide,'away');assert.match(upset.detail,/favored.*not guaranteed/i);
});
test('stories never credit unreached duels or invent a dropped pass',()=>{
  const e=snap({duels:[duel(),duel({key:'K',offNames:['Hidden Receiver']})],duelResults:[{won:false},{won:true}],kind:'inc'});
  const s=B.matchupStory(e);assert.equal(s.key,'G');assert.doesNotMatch(JSON.stringify(s),/Hidden Receiver|dropped/);
  assert.equal(B.matchupStory(snap({penalty:{label:'Holding'}})),null);
  assert.equal(B.matchupStory(snap({category:'kick'})),null);
});
test('postgame takeaway needs repeated recorded evidence and offers only owned optional plays',()=>{
  const b={user:'home',decks:{home:{off:{base:['inside_zone'],wrinkles:['outside_zone']}}},log:[0,1,2].map(()=>snap({play:'outside_zone',yards:1,duels:[duel({label:'Edge block'})],duelResults:[{won:false}]}))};
  const before=clone(b),t=B.postgameTakeaway(b);assert.equal(t.samples,3);assert.match(t.summary,/Outside Zone/);assert.match(t.evidence,/3.*1\.0/);assert.equal(t.playId,'inside_zone');assert.match(t.recommendation,/Consider/);assert.deepEqual(b,before);
  b.log=b.log.slice(0,2);assert.equal(B.postgameTakeaway(b),null);
  b.log.push(snap({play:'outside_zone',yards:1,penalty:{}}));assert.equal(B.postgameTakeaway(b),null);
});
test('adaptation clue uses confirmed public lean and actual previous snaps, never hidden state',()=>{
  const b={log:[1,2,3].map(()=>snap({play:'inside_zone'})),tend:{home:{run:99}},snap:{def:{play:'secret'}}};
  const req={kind:'snap',role:'off',side:'home',look:{lean:{value:'run',confirmed:false}},options:{plays:[]}};
  const before=clone(b),uncertain=B.adaptationRead(b,req);assert.equal(uncertain.confirmed,false);assert.match(uncertain.summary,/3 straight run/);assert.match(uncertain.detail,/may|could/);assert.doesNotMatch(uncertain.summary,/leaning|safety/);
  req.look.lean.confirmed=true;const known=B.adaptationRead(b,req);assert.equal(known.confirmed,true);assert.match(known.summary,/leaning on the run/);
  b.snap.def.play='another secret';assert.deepEqual(B.adaptationRead(b,req),known);b.snap.def.play='secret';assert.deepEqual(b,before);
});
test('insight helpers survive older saves and reveal no unconfirmed coverage',()=>{
  assert.equal(B.matchupStory(null),null);assert.equal(B.postgameTakeaway({log:[]}),null);assert.equal(B.adaptationRead({},null),null);
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'insight-check',user:'home',control:'offense',mode:'snap'});B.advance(b);
  const before=B.save(b);B.adaptationRead(b);B.postgameTakeaway(b);assert.equal(B.save(b),before);
});
test('adaptation recommendations never suggest an unaffordable or blocked counter',()=>{
  const req={kind:'snap',role:'off',side:'home',look:{lean:{value:'run',confirmed:true}},options:{command:0,plays:[{id:'pa_boot',cost:1,blocked:null}]}};
  assert.equal(B.adaptationRead({log:[]},req).counterPlay,null);
  req.options.command=2;req.options.plays[0].blocked='Owner resting';assert.equal(B.adaptationRead({log:[]},req).counterPlay,null);
  req.options.plays[0].blocked=null;assert.equal(B.adaptationRead({log:[]},req).counterPlay,'pa_boot');
});
test('postgame takeaway leads with the coach\'s own calls and names who called a staff play',()=>{
  const weakSnap=(play,userCalled)=>snap({play,yards:1,userCalled,duels:[duel()],duelResults:[{won:false}]});
  const b={user:'home',decks:{home:{off:{base:['inside_zone'],wrinkles:['outside_zone','pa_boot']}}},
    log:[...Array(6)].map(()=>weakSnap('pa_boot',false)).concat([0,1,2].map(()=>weakSnap('outside_zone',true)))};
  let t=B.postgameTakeaway(b);
  assert.match(t.summary,/^Outside Zone struggled/,'a smaller sample of the coach\'s own calls beats a larger staff one');
  assert.equal(t.caller,'you');assert.match(t.evidence,/3 recorded calls \(your calls\)/);assert.doesNotMatch(t.summary,/PA Boot/);
  b.log=b.log.slice(0,6);t=B.postgameTakeaway(b);
  assert.match(t.summary,/^Your staff’s PA Boot calls struggled/);assert.equal(t.caller,'staff');
  assert.match(t.evidence,/all called by your staff/);assert.match(t.recommendation,/^Staff calls come from your deck\./);
  b.log.push(weakSnap('pa_boot',true));t=B.postgameTakeaway(b);
  assert.equal(t.caller,'mixed');assert.match(t.summary,/^PA Boot struggled/);assert.match(t.evidence,/you called 1, your staff 6/);
});
test('film fog thresholds are shared: exact at 82, one-point ranges from 64, wider below; unknown is exact',()=>{
  assert.deepEqual(B.filmFog(90),{spread:0,exact:true,confidence:90,nextAt:null});
  assert.deepEqual(B.filmFog(82),{spread:0,exact:true,confidence:82,nextAt:null});
  assert.deepEqual(B.filmFog(70),{spread:1,exact:false,confidence:70,nextAt:82});
  assert.deepEqual(B.filmFog(50),{spread:2,exact:false,confidence:50,nextAt:64});
  assert.equal(B.filmFog(undefined).spread,0);assert.equal(B.filmFog('x').spread,0);
});
test('duel sum: each side adds its ability and its helping modifiers; the totals differ by the edge',()=>{
  const d={offGrade:7.24,defGrade:6.51,mods:[{v:1,src:'Play design'},{v:-.5,src:'Loaded box'},{v:.5,src:'On fire'},{v:0,src:'Nothing'}],raw:7.24-6.51+1};
  const s=B.duelSum(d);
  assert.deepEqual(s.off,{grade:7.2,adds:[{v:1,src:'Play design'},{v:.5,src:'On fire'}],total:8.7});
  assert.deepEqual(s.def,{grade:6.5,adds:[{v:.5,src:'Loaded box'}],total:7});
  assert.equal(s.edge,1.7);assert.ok(Math.abs(s.edge-d.raw)<.1,'shown edge matches the resolver within rounding');
  assert.equal(B.duelSum(null),null);assert.equal(B.duelSum({offGrade:NaN,defGrade:5}),null);
  // Real resolver duels: the shown sums always add up, and the edge stays within rounding of the true edge.
  const b=B.simulate({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'sum'});
  const duels=(b.log||[]).filter(e=>e.type==='snap'&&e.duels).flatMap(e=>e.duels);assert.ok(duels.length>20);
  for(const x of duels){const t=B.duelSum(x),add=c=>Math.round((c.grade+c.adds.reduce((n,a)=>n+a.v,0))*10)/10;
    assert.equal(t.off.total,add(t.off));assert.equal(t.def.total,add(t.def));assert.ok(Math.abs(t.edge-x.raw)<=.11,`edge ${t.edge} vs raw ${x.raw}`)}
});
test('call film counts the opponent\'s defensive families and offensive run/pass mix, and ignores penalties and kicks',()=>{
  const snap=(o)=>({type:'snap',offSide:'away',defSide:'home',play:'inside_zone',call:'cover3',...o});
  const b={user:'home',log:[snap({}),snap({play:'deep_cross'}),snap({penalty:{label:'Hold'}}),snap({category:'kick'}),
    snap({offSide:'home',defSide:'away',call:'cover0'}),snap({offSide:'home',defSide:'away',call:'cover1'}),snap({offSide:'home',defSide:'away',call:'cover3'})]};
  const f0=B.callFilm(b);assert.deepEqual({def:f0.def,off:f0.off},{def:{pressure:1,man:1,zone:1,total:3},off:{run:1,pass:1,total:2}});
  assert.equal(f0.own.snaps,0,'no yards recorded on these fixture snaps');
  assert.equal(B.callFilm({user:'home',log:[]}),null);assert.equal(B.callFilm(null),null);
  const real=B.simulate({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'film'});real.user='home';const f=B.callFilm(real);
  assert.ok(f.def.total>20&&f.off.total>20);assert.equal(f.def.pressure+f.def.man+f.def.zone,f.def.total);assert.equal(f.off.run+f.off.pass,f.off.total);
});
test('season recap names the best call, the worst habit and the top duel winner, and counts your own calls',()=>{
  assert.equal(B.seasonRecap({games:2,plays:{}}),null,'needs three games');
  const L={games:4,snaps:200,mine:31,plays:{power:{n:14,yards:95,stops:2,mine:6},deep_cross:{n:11,yards:23,stops:6,mine:4},inside_zone:{n:20,yards:90,stops:5,mine:0},screen:{n:3,yards:40,stops:0,mine:3}},
    players:{a:{name:'Ann Lee',w:40,l:12},b:{name:'Bo Kim',w:12,l:11},c:{name:'Cy Fox',w:6,l:0}}};
  const r=B.seasonRecap(L);
  assert.equal(r.best.id,'power','screen has too few calls to count');assert.equal(r.worst.id,'deep_cross');assert.equal(r.star.name,'Ann Lee');
  assert.match(r.lines[0],/^Best call · Power: 6\.8 yards per call on 14 calls \(6 yours\)\.$/);
  assert.match(r.lines[1],/^Worst habit · Deep Cross: 2\.1 yards per call on 11 calls \(4 yours\), stopped 6 times\.$/);
  assert.match(r.lines[2],/^Top duel winner · Ann Lee: won 40 of 52 duels\.$/);assert.match(r.lines[3],/You called 31 of 200 offensive snaps across 4 games/);
  const b2=B.simulate({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'own'});b2.user='home';const own=B.callFilm(b2).own;
  assert.ok(own.snaps>20);assert.equal(Object.values(own.plays).reduce((n,t)=>n+t.n,0),own.snaps);
});
