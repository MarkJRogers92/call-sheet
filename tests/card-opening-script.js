'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data'),P=require('../forks/call-sheet/core/packs'),B=require('../forks/call-sheet/core/battle'),Ro=require('../forks/call-sheet/core/roster'),E=require('../forks/call-sheet/core/evolution');
global.CallSheet={packs:P,data:D,resolver:require('../forks/call-sheet/core/resolver')};require('../forks/call-sheet/core/playbook-ui');
const U=global.CallSheet.playbookUI,clone=x=>JSON.parse(JSON.stringify(x));
function create(seed,openingScript,extra={}){
 const pb=P.newPlaybook();if(openingScript)pb.off.openingScript=openingScript;
 return B.create({home:{...Ro.preset('ground'),decks:P.decksOf(pb)},away:Ro.preset('aerial'),user:'home',control:'both',mode:'snap',seed,...extra});
}
test('an optional opener replaces one normal draw, not a new card, discount, or extra roll',()=>{
 const plain=create('script-0'),b=create('script-0','vertical_shot');
 B.advance(plain);const q=B.advance(b);assert.equal(q.role,'off');
 assert.ok(!plain.hands.home.wrinkles.includes('vertical_shot'),'fixture requires a miss');
 assert.ok(b.hands.home.wrinkles.includes('vertical_shot'),'selected opener must be in hand');
 assert.equal(q.options.openingScript,'vertical_shot');
 assert.equal(b.hands.home.wrinkles.length,D.RULES.wrinkleRow);
 assert.deepEqual(b.hands.home.tactics,plain.hands.home.tactics);
 assert.equal(q.options.command,plain.hands.home.command);assert.equal(q.options.plays.find(p=>p.id==='vertical_shot').cost,D.PLAYS.vertical_shot.cost);
 assert.deepEqual(b.rng,plain.rng);assert.deepEqual(b.piles.home.def,plain.piles.home.def);
 assert.deepEqual([...b.hands.home.wrinkles,...b.piles.home.off.wrinkle.draw].sort(),[...b.decks.home.off.wrinkles].sort());
});
test('a naturally drawn opener does not reshuffle the other draws',()=>{
 const plain=create('script-0'),b=create('script-0','screen');B.advance(plain);B.advance(b);
 assert.equal(b.pending.options.openingScript,'screen');
 assert.deepEqual(b.hands.home.wrinkles,plain.hands.home.wrinkles);assert.deepEqual(b.piles,plain.piles);
});
test('a team opening on defense keeps the script for offense; no later series or halftime re-deals it',()=>{
 const b=create('script-2','vertical_shot'),req=B.advance(b);assert.equal(req.role,'def');assert.equal(req.options.openingScript,undefined);
 const resume=B.load(B.save(b));let first=null,seenNext=false;
 const respond=r=>r.kind==='fourth'?{choice:'punt'}:{type:'auto'};
 for(let i=0;b.pending&&i<350;i++){
  if(b.pending.role==='off'&&b.pending.kind==='snap'){
   if(first===null){first=b.seriesKey;assert.equal(b.pending.options.openingScript,'vertical_shot');}
   else if(first!==b.seriesKey){seenNext=true;assert.equal(b.pending.options.openingScript,undefined)}
  }
  const action=respond(b.pending);B.submit(b,action);B.submit(resume,action);
 }
 assert.ok(first&&seenNext);assert.equal(b.game.status,'final');assert.deepEqual(resume,b);
});
test('stored, base, signature, trick, restricted-down and roster-blocked plays never force a draw',()=>{
 const pb=P.newPlaybook();pb.off.wrinkles.push('fake_punt','quick_kick','statue_left');pb.reserve.off.wrinkles.push('fade_route');
 assert.equal(typeof P.setOpeningScript,'function');
 for(const id of ['fake_punt','quick_kick','statue_left','fade_route','inside_zone','sig_42','bear','max_protect','__proto__'])assert.throws(()=>P.setOpeningScript(pb,id));
 const roster=Ro.preset('ground'),book=P.newPlaybook();book.off.wrinkles.push('triple_option');
 const plain=create('script-0',null,{home:{...roster,decks:P.decksOf(book)}});
 P.setOpeningScript(book,'triple_option');
 const blocked=create('script-0',null,{home:{...roster,decks:P.decksOf(book)}});
 B.advance(plain);B.advance(blocked);
 assert.deepEqual(plain.hands.home.wrinkles,blocked.hands.home.wrinkles);assert.deepEqual(plain.rng,blocked.rng);
 assert.equal(blocked.pending.options.openingScript,undefined);assert.match(blocked.pending.options.openingScriptMiss,/Triple Option.*QB/i);
});
test('presets carry the selected opener, while storing its final copy or moving it to base clears it',()=>{
 const pb=P.newPlaybook();assert.equal(typeof P.setOpeningScript,'function');
 P.setOpeningScript(pb,'screen');U.savePreset(pb,'Attack pressure');
 P.moveCard(pb,'off','wrinkles',pb.off.wrinkles.indexOf('screen'),false);assert.equal(pb.off.openingScript,'screen');
 P.cut(pb,'off','wrinkles',pb.off.wrinkles.indexOf('screen'));assert.equal(pb.off.openingScript,undefined);
 U.loadPreset(pb,0);assert.equal(pb.off.openingScript,'screen');P.setBase(pb,'off',0,'screen');assert.equal(pb.off.openingScript,undefined);
 U.loadPreset(pb,0);P.setOpeningScript(pb,'');assert.equal(pb.off.openingScript,undefined);
 pb.deckPresets[0].off.openingScript='not_owned';U.loadPreset(pb,0);assert.equal(pb.off.openingScript,undefined);
});
test('a play follows its earned evolution without creating a base or stored opener',()=>{
 const pb=P.newPlaybook();pb.off.openingScript='screen';E.evolve(pb,'screen','tunnel');
 assert.equal(pb.off.openingScript,'tunnel');assert.ok(pb.off.wrinkles.includes('tunnel'));
});
test('old in-progress saves keep their pending decision and unscripted draw sequence',()=>{
 const b=create('script-0');B.advance(b);assert.deepEqual(b.hands.home.wrinkles,['read_option','pa_boot','screen']);assert.equal(b.pending.options.openingScript,undefined);
 const saved=clone(b);saved.decks.home.off.openingScript='vertical_shot'; // even a late deck edit cannot arm the already-started battle
 const recovered=B.load(JSON.stringify(saved));assert.deepEqual(recovered.pending,b.pending);
});
test('the chooser shows the current roster assignment, not an invented opponent forecast',()=>{
 const pb=P.newPlaybook(),lineup=Ro.preset('ground').lineup;lineup.off.LG.name='Oliver <West>';
 const before=clone(lineup);assert.equal(typeof U.openingScriptHTML,'function');
 pb.off.openingScript='screen';const html=U.openingScriptHTML(pb.off,lineup);
 assert.match(html,/Lead block.*Oliver &lt;West&gt;.*speed.*versatility/i);assert.doesNotMatch(html,/win chance|opponent grade/i);
 pb.off.wrinkles.push('triple_option');pb.off.openingScript='triple_option';assert.match(U.openingScriptHTML(pb.off,lineup),/Needs a QB with speed 7\+/);
 const unscouted=U.openingScriptHTML(pb.off,null);assert.doesNotMatch(unscouted,/Oliver|Needs a QB/);
 assert.deepEqual(lineup,before);
});
test('damaged queued openers fall back to the existing hand without dereferencing a missing card',()=>{
 const b=create('script-0'),saved=clone(b);saved.pendingOpeners={home:'unknown'};
 const loaded=B.load(JSON.stringify(saved));assert.doesNotThrow(()=>B.advance(loaded));B.advance(b);
 assert.deepEqual(loaded.hands,b.hands);assert.deepEqual(loaded.rng,b.rng);
});
test('a single-copy pack upgrade keeps its slot in the opening plan',()=>{
 const pb=P.newPlaybook();pb.off.wrinkles=['pa_boot'];P.setOpeningScript(pb,'pa_boot');
 P.applyPick(pb,{...P.POOL.find(x=>x.id==='pa_boot_plus'),uid:'improve'});
 assert.equal(pb.off.openingScript,'pa_boot_plus');assert.deepEqual(pb.off.wrinkles,['pa_boot_plus']);
});
