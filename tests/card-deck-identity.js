'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data'),P=require('../forks/call-sheet/core/packs'),R=require('../forks/call-sheet/core/resolver'),Ro=require('../forks/call-sheet/core/roster');
global.CallSheet={data:D,packs:P,resolver:R};require('../forks/call-sheet/core/playbook-ui');
const U=global.CallSheet.playbookUI,copy=x=>JSON.parse(JSON.stringify(x));
const owned=pb=>['off','def'].flatMap(s=>[...pb[s].base,...pb[s].wrinkles,...pb[s].tactics,...pb.reserve[s].wrinkles,...pb.reserve[s].tactics]).sort();
test('named preset restores both decks without losing new cards or signatures',()=>{
 const pb=P.newPlaybook(),signature={id:'example'};pb.signatures=[signature];
 U.savePreset(pb,' Power run ');const expected=copy(pb.off);P.setBase(pb,'off',0,'pa_boot');P.grantCard(pb,'draw');const before=owned(pb);
 U.loadPreset(pb,0);assert.deepEqual(pb.off,expected);assert.deepEqual(owned(pb),before);assert.deepEqual(pb.signatures,[signature]);assert.equal(pb.deckPresets[0].name,'Power run');
});
test('stale or overcapacity presets reject atomically and cannot mint cards',()=>{
 const pb=P.newPlaybook();U.savePreset(pb,'Balanced');pb.deckPresets[0].off.wrinkles.push('not_owned');const before=copy(pb);
 assert.throws(()=>U.loadPreset(pb,0),/available/);assert.deepEqual(pb,before);
 pb.deckPresets[0].off.wrinkles=Array(99).fill('pa_boot');assert.throws(()=>U.loadPreset(pb,0));
});
test('deck advice is read-only and offers only owned alternatives',()=>{
 const pb=P.newPlaybook();pb.off.base=['inside_zone','outside_zone','power','read_option'];pb.off.wrinkles=[];pb.off.tactics=['max_protect'];pb.reserve.off.wrinkles=['quick_slant'];const before=copy(pb);
 const advice=U.deckAdvice(pb,Ro.preset('ground').lineup);
 assert.ok(advice.warnings.some(x=>x.includes('passing answer')));assert.ok(advice.warnings.some(x=>x.includes('Max Protect')));assert.ok(advice.suggestions.some(x=>x.includes('Quick Slant')));assert.deepEqual(pb,before);
});
test('preset names are bounded and duplicate names replace instead of growing',()=>{
 const pb=P.newPlaybook();assert.throws(()=>U.savePreset(pb,'  '),/name/);U.savePreset(pb,'Balanced');U.savePreset(pb,'balanced');assert.equal(pb.deckPresets.length,1);
 U.savePreset(pb,'x'.repeat(100));assert.equal(pb.deckPresets[1].name.length,40);
});
test('presets reject invalid bases and keep signatures outside their selections',()=>{
 const pb=P.newPlaybook();U.savePreset(pb,'Two-minute');pb.deckPresets[0].off.base.fill('inside_zone');const before=copy(pb);
 assert.throws(()=>U.loadPreset(pb,0),/four valid/);assert.deepEqual(pb,before);
});
test('old playbooks need no preset migration and advice leaves them unchanged',()=>{
 const pb=P.newPlaybook();delete pb.reserve;const before=copy(pb);assert.ok(U.deckAdvice(pb).identity);assert.deepEqual(pb,before);
 U.savePreset(pb,'Balanced');U.loadPreset(pb,0);assert.deepEqual(pb.off,before.off);
});
test('malformed imported preset collections are safely filtered without changing saved data',()=>{
 const pb=P.newPlaybook();U.savePreset(pb,'Keep me');const valid=copy(pb.deckPresets[0]);
 for(const bad of [{},null,[null,{}, {name:42}, {name:' ',off:valid.off,def:valid.def},{name:'Missing decks'},valid]]){
  pb.deckPresets=copy(bad);const before=copy(pb);const list=U.presetList(pb);assert.equal(list.length,Array.isArray(bad)?1:0);assert.deepEqual(pb,before);
  U.savePreset(pb,'New');assert.ok(pb.deckPresets.every(p=>typeof p.name==='string'));assert.ok(pb.deckPresets.some(p=>p.name==='New'));
 }
});
test('malformed preset load rejects with a clear error and no mutation',()=>{
 const pb=P.newPlaybook();pb.deckPresets=[null,{}, {name:'Bad',off:{base:null},def:{}}];
 for(let i=0;i<3;i++){const before=copy(pb);assert.throws(()=>U.loadPreset(pb,i),/saved preset/);assert.deepEqual(pb,before)}
});
