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
