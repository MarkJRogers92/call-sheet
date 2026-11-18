'use strict';
// V22: hold the look for Quick Out / Out-and-Up, honest double-move film, live personnel in the 3rd-and-7 comparison,
// tactic suggestions ranked by projection, named defensive calls in the film, and an opt-in Read Option prompt.
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),D=core('data.js'),Ro=core('roster.js'),P=core('packs.js'),E=require('../game-engine-v2');
const play=(b,id)=>{const start=b.log.length;B.submit(b,{type:'call',play:id,read:'primary',tactics:[]});return b.log.slice(start).find(e=>e.type==='snap'&&e.play===id)};
function routeGame(){
  const book=P.newPlaybook();P.setOpeningScript(book,'out_and_up');
  const b=B.create({home:{...Ro.preset('aerial'),decks:P.decksOf(book)},away:Ro.preset('tempo'),user:'home',control:'both',mode:'snap',seed:'route-57'});
  B.advance(b);B.setGrouping(b,'home','11');return b;
}

test('quick calls keep the quick out in reach until the corner has seen two, then lead with the double move',()=>{
  const b=routeGame();
  let view=B.snapDecisions(b);assert.ok(view.choices.some(c=>c.id==='quick_out'),'setup offered');
  assert.match(view.choices.find(c=>c.id==='quick_out').detail,/0\/2/);
  for(let i=0;i<2;i++)assert.ok(play(b,'quick_out').completed);
  view=B.snapDecisions(b);assert.equal(view.choices[0].id,'out_and_up');assert.match(view.choices[0].detail,/may jump the break/);
});
test('a personnel change is named as the reset, and holding the look keeps the corner’s read',()=>{
  const b=routeGame();for(let i=0;i<2;i++)assert.ok(play(b,'quick_out').completed);
  // Third and long: Auto goes four wide.
  Object.assign(b.game,{down:3,distance:8});B.setGrouping(b,'home','auto');
  assert.equal(b.snap.grouping,'10');
  const pair=B.sameLookPair(b,b.pending,'out_and_up');
  assert.match(pair.setup,/starts over/);assert.deepEqual(pair.hold&&{g:pair.hold.grouping,n:pair.hold.outs},{g:'11',n:2});
  assert.equal(B.setupLook(b,'home').outs,0);
  const away=B.snapDecisions(b).choices.find(c=>c.id==='out_and_up');if(away)assert.match(away.detail,/starts over/);
  B.setGrouping(b,'home',pair.hold.grouping);
  assert.equal(B.setupLook(b,'home').outs,2);assert.ok(!B.sameLookPair(b,b.pending,'out_and_up').hold);
  assert.equal(play(b,'out_and_up').cornerStep.outs,2);
});
test('double-move film describes the route only when the pocket held',()=>{
  let lost=0;
  for(let i=0;i<40&&lost<5;i++){
    const home=Ro.preset('tempo'),deck=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));deck.off.wrinkles=Array(12).fill('out_and_up');home.decks=deck;
    const b=B.create({home,away:Ro.preset('ground'),seed:'v22-film-'+i,user:'home',control:'offense',mode:'snap'});
    let req=B.advance(b);
    for(let n=0;n<160&&req;n++){
      if(req.kind==='snap'&&req.role==='off'&&req.options.plays.some(p=>p.id==='out_and_up'&&!p.blocked&&p.cost<=req.options.command))req=B.submit(b,{type:'call',play:'out_and_up',tactics:[]});
      else req=B.submit(b,req.kind==='fourth'?{choice:req.recommended}:{type:'auto'});
    }
    for(const e of b.log)if(e.type==='snap'&&e.cornerStep){
      assert.equal(e.cornerStep.reached,!!e.duelResults[0].won);
      if(!e.duelResults[0].won){lost++;assert.doesNotMatch(e.text,/got behind him|won separation|drove on the out|stayed over the top|no clean separation/,e.text)}
    }
  }
  assert.ok(lost>0,'saw lost pockets');
});
test('the third-and-seven comparison uses the personnel the game dresses on that down',()=>{
  global.window=global;global.DynastyRng=require('../rng');
  global.CallSheet={data:D,resolver:core('resolver.js'),battle:B,packs:P};
  global.document={getElementById(){return null},createElement(){return{style:{}}},head:{appendChild(){}}};
  require('../forks/call-sheet/core/playbook-ui.js');const U=global.CallSheet.playbookUI;
  const team=Ro.preset('ground'),pb=P.newPlaybook();pb.off.wrinkles=['pa_boot','pa_boot','power','power','deep_cross','screen'];
  const live=U.thirdDownHands(pb,pb,team.lineup,team),bare=U.thirdDownHands(pb,pb,team.lineup);
  assert.equal(live.grouping,'10');assert.equal(bare.grouping,'11');
  assert.ok(bare.some(h=>h.saved.calls.some(c=>['pa_boot','power'].includes(c.id))),'without depth the old view lists them');
  assert.ok(live.every(h=>!h.saved.calls.some(c=>['pa_boot','power'].includes(c.id))),'blocked in four wide, as in a game');
});
test('the tactic suggestion is the one that moves the projection most, not the first card in hand',()=>{
  const home=Ro.preset('ground');home.decks={...D.DEFAULT_DECKS,off:{base:['outside_zone','stick'],wrinkles:[],tactics:['hard_count','seal_block','hard_count','seal_block']}};
  const b=B.create({home,away:Ro.preset('control'),seed:'v22-tactic',user:'home',control:'offense',mode:'snap'});
  E.startGame(b.game);Object.assign(b.game,{possession:'home',down:3,distance:1,fieldPosition:66});
  const req=B.advance(b);assert.ok(req.options.tactics.some(t=>t.id==='seal_block'));
  const note=B.tacticRead(req,'outside_zone',b.teams.home.lineup.off,[],undefined,b);
  assert.equal(note.id,'seal_block');assert.match(note.reason,/Projected first down \d+% → \d+%/);
  const [a,c]=[...note.reason.matchAll(/(\d+)%/g)].map(m=>Number(m[1]));assert.ok(c>a);
  const fogged=B.tacticRead(req,'outside_zone',b.teams.home.lineup.off,[],undefined,b,true);
  assert.ok(!fogged||!/Projected/.test(fogged.reason),'no projection under scouting fog');
});
test('film names the favored player in plain words and the defense’s call after the snap',()=>{
  const b=B.simulate({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'v22-story'});
  let checked=0;
  for(const e of b.log){if(e.type!=='snap')continue;const s=B.matchupStory(e);if(!s)continue;checked++;
    assert.doesNotMatch(s.detail,/favored the other side/);
    assert.match(s.defense,new RegExp('^Defense: '+D.CALLS[e.call].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));}
  assert.ok(checked>20);
});
test('the Read Option prompt is opt-in',()=>{
  const setup=headset=>{const home=Ro.preset('ground');home.decks={...D.DEFAULT_DECKS,off:{base:['read_option'],wrinkles:[],tactics:[]}};
    const b=B.create({home,away:Ro.preset('tempo'),user:'home',mode:'snap',control:'offense',seed:'v22-mesh',headset});
    E.startGame(b.game);Object.assign(b.game,{possession:'home',down:3,distance:2,fieldPosition:45});B.advance(b);
    return B.submit(b,{type:'call',play:'read_option',tactics:[]})};
  assert.equal(B.headsetSettings({}).readOption,false);
  assert.notEqual(setup({})?.kind,'mesh');
  assert.equal(setup({readOption:true}).kind,'mesh');
});
test('deciding moments credit only duels that happened, on the side that won the snap',()=>{
  const P2=['aerial','tempo','ground'];let checked=0;
  for(let i=0;i<30;i++){
    const b=B.simulate({home:Ro.preset(P2[i%3]),away:Ro.preset(P2[(i+1)%3]),seed:'v22-decide-'+i});
    const fs=b.game.score,winner=fs.home>fs.away?'home':'away',lines=B.decidingMoments(b);
    const deciding=lines.find(l=>l.startsWith('Deciding duel'));if(!deciding)continue;
    const name=deciding.match(/^Deciding duel: (.+?) beat /)[1];
    assert.ok(JSON.stringify(b.teams[winner].lineup).includes(name)||JSON.stringify(b.teams[winner]).includes(name),`${deciding} credits the winner (${winner})`);
    checked++;
  }
  assert.ok(checked>10);
});
