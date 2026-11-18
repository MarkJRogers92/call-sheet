'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const B=require('../forks/call-sheet/core/battle');
const Ro=require('../forks/call-sheet/core/roster');
const modulePath='../forks/call-sheet/core/onboarding';
const O=fs.existsSync(require('node:path').join(__dirname,modulePath+'.js'))?require(modulePath):{};
const battle=(extra={})=>B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'guided-first-drive',user:'home',mode:'key',control:'both',...extra});
test('guided drive is offered only to a new player who has not dismissed it',()=>{
  assert.equal(typeof O.eligible,'function');
  assert.equal(O.eligible({games:0,settings:{}}),true);
  for(const save of [{games:1},{seenHelp:true},{settings:{guidedDriveDone:true}}])assert.equal(O.eligible(save),false);
});
test('guide temporarily takes offense only, survives serialization and restores selected mode',()=>{
  assert.equal(typeof O.start,'function');
  let b=battle(),rng=JSON.stringify(b.rng);
  assert.equal(O.start(b),true);assert.equal(b.mode,'snap');assert.equal(b.control,'offense');
  assert.equal(JSON.stringify(b.rng),rng);assert.equal(O.start(b),false);
  B.advance(b);O.update(b);assert.equal(b.pending.role,'off');
  b=B.load(B.save(b));
  for(let i=0;i<100&&!b.guidedDrive.done;i++){
    if(b.pending.kind==='fourth')B.submit(b,{choice:b.pending.options.includes('punt')?'punt':'go'});
    else B.submit(b,{type:'auto'});
    O.update(b);
  }
  assert.equal(b.guidedDrive.done,true);assert.equal(b.mode,'key');assert.equal(b.control,'both');
  assert.equal(O.update(b),false);
});
test('skip is idempotent, restores preferences, and never changes game or RNG',()=>{
  assert.equal(typeof O.skip,'function');
  const b=battle({mode:'series',control:'offense'});O.start(b);B.advance(b);O.update(b);
  const game=JSON.stringify(b.game),rng=JSON.stringify(b.rng);
  assert.equal(O.skip(b),true);assert.equal(O.skip(b),false);
  assert.equal(b.mode,'series');assert.equal(b.control,'offense');
  assert.equal(JSON.stringify(b.game),game);assert.equal(JSON.stringify(b.rng),rng);
});
test('guidance uses only visible request and is optional for nonoffensive decisions',()=>{
  assert.equal(typeof O.hint,'function');
  assert.equal(O.hint({kind:'fourth'}),'');
  assert.match(O.hint({kind:'snap',role:'off',look:{box:'heavy'}},null),/play/i);
  assert.match(O.hint({kind:'snap',role:'off',look:{box:'heavy'}},'inside_zone'),/tactic|Command/i);
});
test('guide waits for the first user offense and does not end at a new set of downs',()=>{
  const b=battle({user:'away',control:'both',mode:'snap'});O.start(b);B.advance(b);O.update(b);
  assert.equal(b.pending.side,'away');assert.equal(b.pending.role,'off');
  const drive=b.guidedDrive.drive;
  // A first down changes the series, not the engine's drive identity.
  b.game.down=1;b.game.distance=10;b.seriesKey='new-series';
  assert.equal(O.update(b),false);assert.equal(b.guidedDrive.drive,drive);assert.equal(b.guidedDrive.active,true);
  const before=B.save(b);assert.equal(O.start(b),false);assert.equal(B.save(b),before);
});
test('old battles without guide state are untouched and hidden looks yield no advice',()=>{
  const b=battle(),before=B.save(b);
  assert.equal(O.update(b),false);assert.equal(O.skip(b),false);assert.equal(B.save(b),before);
  const a=O.hint({kind:'snap',role:'off',look:{box:{confirmed:false,value:'loaded'}}});
  const c=O.hint({kind:'snap',role:'off',look:{box:{confirmed:false,value:'light'}}});
  assert.equal(a,c);
});
test('selected play guidance explains its actual design and confirmed matchup fit',()=>{
  const D=require('../forks/call-sheet/core/data');
  const req=(id,look)=>({kind:'snap',role:'off',options:{plays:[{id,card:D.PLAYS[id]}]},look});
  const run=O.hint(req('inside_zone',{box:{confirmed:true,value:'light'}}),'inside_zone');
  assert.match(run,/Inside Zone/);assert.match(run,/interior blocks/);assert.match(run,/light box.*Gate/i);
  assert.match(O.hint(req('outside_zone',{box:{confirmed:true,value:'loaded'}}),'outside_zone'),/loaded box.*Gate/i);
  assert.match(O.hint(req('vertical_shot',{shell:{confirmed:true,value:2}}),'vertical_shot'),/two.*deep.*harder/i);
  assert.match(O.hint(req('pa_boot',{box:{confirmed:true,value:'loaded'}}),'pa_boot'),/fake.*help/i);
  assert.match(O.hint(req('screen',{pressure:{confirmed:true,value:true,realLevel:2}}),'screen'),/rush.*Gate/i);
});
test('selected play advice never treats unconfirmed tells as facts',()=>{
  const D=require('../forks/call-sheet/core/data');
  for(const id of ['inside_zone','vertical_shot','screen','quick_slant']){
    const req={kind:'snap',role:'off',options:{plays:[{id,card:D.PLAYS[id]}]}};
    const look=value=>Object.fromEntries(['box','shell','pressure','coverage'].map(k=>[k,{confirmed:false,value}]));
    assert.equal(O.hint({...req,look:look('loaded')},id),O.hint({...req,look:look(2)},id));
    assert.match(O.hint(req,id),new RegExp(D.PLAYS[id].name));
  }
});
