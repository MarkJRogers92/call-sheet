'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(){
 globalThis.__DL_TEST__={};const e=loadEngine({seed:944,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
 const cg=globalThis.DynastyCardGameDay;cg.enable();const u=e.universe,me=e.T('Chicago Metropolitan'),g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home);return{e,cg,u,me,opp};
}
test('dynasty bridge reports actual current practice reps without changing saves',async()=>{
 const {cg,u,me,opp}=await setup();me.weeklyPrep={year:u.year,week:u.week,opponent:opp.name,focuses:['run_blocking','coverage']};
 const before=JSON.stringify(u),html=cg.connectionsHTML();
 assert.match(html,/Inside Zone[^<]*\+5/);assert.match(html,/Quarters[^<]*\+5/);assert.match(html,/data-card-dynasty-tab="gamelab"/);assert.equal(JSON.stringify(u),before);
 me.weeklyPrep.week--;assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);
});
test('bridge honors integration toggles and does not promise practice in postseason',async()=>{
 const {cg,u,me,opp}=await setup();me.weeklyPrep={year:u.year,week:u.week,opponent:opp.name,focuses:['run_blocking']};
 cg.setIntegration('practice-reps',false);assert.match(cg.connectionsHTML(),/Practice mastery is off/);assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);
 cg.setIntegration('practice-reps',true);u.phase='complete';assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);assert.match(cg.connectionsHTML(),/Next regular-season opponent/);
});
test('bridge links existing dynasty screens and marks launch snapshot when battle is active',async()=>{
 const {cg,u}=await setup();let html=cg.connectionsHTML();for(const tab of ['depth','staff','development','recruiting'])assert.ok(html.includes(`data-card-dynasty-tab="${tab}"`));
 u.callSheet.activeBattle={seed:'test'};html=cg.connectionsHTML();assert.match(html,/already locked in/);assert.doesNotMatch(html,/data-card-dynasty-tab="gamelab"/);
});
test('bridge safely escapes names and renders absent legacy staff',async()=>{
 const {cg,me}=await setup();me.staff.OC.name='<OC>';assert.match(cg.connectionsHTML(),/&lt;OC&gt;/);assert.doesNotMatch(cg.connectionsHTML(),/<OC>/);
 delete me.staff.OC;assert.doesNotThrow(()=>cg.connectionsHTML());
});
test('Deck Room and Collection route to one saved playbook without moving cards or granting rewards',async()=>{
 const {cg,u}=await setup(),pb=u.callSheet.playbook,cs=globalThis.CallSheet;
 require('../forks/call-sheet/core/playbook-ui');
 pb.off.openingScript='screen';pb.reserve.off.wrinkles.push('screen','screen');pb.finishes={screen:'foil'};
 const doc=globalThis.document;doc.getElementById=id=>doc.querySelector('#'+id);
 const snapshot=JSON.stringify(u.callSheet);
 cg.openDynastyConnection('deckroom');
 const deck=doc.getElementById('deckroom').innerHTML;assert.match(deck,/In your deck/);assert.match(deck,/4\/4 base calls/);assert.match(deck,/12\/(14|16|18) plays/);assert.match(deck,/Opening script:<\/b> RB Screen/);assert.match(deck,/data-card-deck/);assert.match(deck,/data-card-dynasty-tab="depth"/);
 cg.openDynastyConnection('collection');
 const binder=doc.getElementById('collection').innerHTML;
 assert.match(binder,/Offense · \d+ owned/);assert.match(binder,/4 owned · 2 in deck/);assert.equal((binder.match(/data-face="screen"/g)||[]).length,1);assert.match(binder,/f-foil" data-face="screen"/);
 assert.match(binder,/data-face="inside_zone"/);assert.match(binder,/data-card-deck/);
 assert.equal((binder.match(/class="cpn-pile"/g)||[]).length,2);
 cg.openDynastyConnection('deckroom');assert.equal(JSON.stringify(u.callSheet),snapshot,'navigation is read-only');
 assert.ok(cs.packs.cardDef('screen'));
});
