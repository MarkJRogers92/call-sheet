'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data'),P=require('../forks/call-sheet/core/packs'),R=require('../forks/call-sheet/core/resolver'),Ro=require('../forks/call-sheet/core/roster');
global.CallSheet={data:D,packs:P,resolver:R,signatures:require('../forks/call-sheet/core/signatures')};require('../forks/call-sheet/core/playbook-ui');
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
test('deck counts use copies, actual group limits and three shared signature slots, without changing inventory',()=>{
 const pb=P.newPlaybook();pb.capacity={wrinkles:18,tactics:16};pb.reserve.off.wrinkles=['draw','draw'];
 P.moveCard(pb,'off','tactics',0,false);pb.signatures=[{side:'def'}];pb.reserveSignatures=[{side:'off'}];
 const before=copy(pb),s=U.deckCounts(pb,'off');
 assert.deepEqual(s.plays,{active:12,limit:18,stored:2});assert.deepEqual(s.tactics,{active:11,limit:16,stored:1});
 assert.equal(s.regular,27);assert.equal(s.sideLimit,38);assert.equal(s.teamActive,56);assert.equal(s.teamLimit,79);
 assert.equal(s.teamStored,4);assert.equal(s.teamOwned,60);assert.deepEqual(s.signatures,{active:1,limit:3,stored:1});
 assert.deepEqual(pb,before);assert.equal(U.deckCounts(pb,'def').regular,28);
});
test('starter game plans change what you can call, never the cards you own, on either side',()=>{
 const pb=P.newPlaybook(),before=copy(pb),all=owned(pb);
 for(const [side,key1,key2] of [['off','ground','air'],['def','shell','heat']]){
  const first=U.previewPlan(pb,side,key1),second=U.previewPlan(pb,side,key2);
  assert.notDeepEqual(first.deck.base,second.deck.base);assert.notDeepEqual(first.deck.tactics,second.deck.tactics);
  for(const plan of [first,second]){
   const changed=copy(pb);changed[side]=plan.deck;changed.reserve[side]=plan.reserve;
   assert.deepEqual(owned(changed),all);assert.equal(P.overCapacity(changed),null);assert.equal(new Set(plan.deck.base).size,4);
   assert.ok(!plan.deck.wrinkles.some(id=>plan.deck.base.includes(id)));assert.ok(plan.deck.base.some(id=>P.cardDef(id).cost===0&&!P.cardDef(id).needs));
   if(side==='off')assert.ok(D.canScriptOpener(plan.deck,plan.deck.openingScript));
  }
 }
 assert.deepEqual(pb,before);const changed=copy(pb);changed.off.base[0]='inside_zone_plus';
 changed.reserve.off.wrinkles.push('hook_ladder');const evolved=U.previewPlan(changed,'off','ground');
 assert.ok(evolved.deck.base.includes('inside_zone_plus'));assert.ok(evolved.reserve.wrinkles.includes('hook_ladder'));
});
test('a near-full save can preview a build but must not apply it and truncate owned cards',()=>{
 const pb=P.newPlaybook();pb.reserve.off.wrinkles=Array(500).fill('draw');const before=copy(pb);
 assert.equal(U.previewPlan(pb,'off','ground',500).storageBlock,'wrinkles');
 assert.equal(U.previewPlan(pb,'off','ground').storageBlock,null,'standalone storage has no Dynasty cap');
 assert.deepEqual(pb,before);
 pb.reserve.off.wrinkles.length=494;const safe=U.previewPlan(pb,'off','ground',500);
 assert.equal(safe.storageBlock,null);assert.equal(safe.reserve.wrinkles.length,500);
});

test('a preset follows the current branch and leaves departed optional copies out of the draft',()=>{
 const EV=require('../forks/call-sheet/core/evolution'),pb=P.newPlaybook();
 P.grantCard(pb,'counter_trey');P.setBase(pb,'off',0,'counter_trey');U.savePreset(pb,'Old staff');
 EV.evolve(pb,'power','counter');P.setBase(pb,'off',0,'inside_zone');pb.reserve.off.wrinkles.splice(pb.reserve.off.wrinkles.indexOf('counter_trey'),1);
 const original=copy(pb),draft=copy(pb),notes=U.loadPreset(draft,0);
 assert.ok(notes.some(x=>x.includes('Counter Trey')));assert.ok(notes.some(x=>x.includes('Counter')));
 assert.equal(new Set(draft.off.base).size,4);assert.ok(draft.off.wrinkles.includes('counter'));
 assert.deepEqual(owned(draft),owned(pb));assert.deepEqual(pb,original);
 draft.deckPresets[0].off.wrinkles.push('counter_trey');assert.ok(U.loadPreset(draft,0).some(x=>x.includes('open for an owned replacement')));
});
test('first hand odds match every permutation of a scripted pile, including duplicate openers',()=>{
 const pb=P.newPlaybook();pb.off.wrinkles=['power','screen','screen','pa_boot','deep_cross'];P.setOpeningScript(pb,'screen');
 let n=0,hits=0;
 function visit(acc,rest){
   if(!rest.length){const draw=[...acc],i=draw.lastIndexOf('screen'),last=draw.length-1;
     if(i<draw.length-D.RULES.wrinkleRow)[draw[i],draw[last]]=[draw[last],draw[i]];
     if(draw.slice(-D.RULES.wrinkleRow).includes('power'))hits++;n++;return}
   rest.forEach((x,i)=>visit([...acc,x],rest.filter((_,j)=>j!==i)));
 }
 visit([],pb.off.wrinkles);
 assert.ok(Math.abs(U.firstHandChance(pb,'off','power')-hits/n)<1e-10);
 assert.equal(U.firstHandChance(pb,'off','screen'),1);assert.equal(U.firstHandChance(pb,'off',pb.off.base[0]),1);
 pb.off.tactics=['motion','seal_block','hard_count','max_protect','route_adjust','onside_kick'];
 assert.equal(U.firstHandChance(pb,'off','onside_kick'),0);assert.equal(U.firstHandChance(pb,'off','motion'),.8);
});
