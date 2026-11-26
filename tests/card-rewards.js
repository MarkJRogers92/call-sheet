'use strict';
// More ways to earn cards: coaching-tree cards, booster and signing-day packs, upset and milestone trick cards,
// and Legacy signatures for retired numbers. Each is once-only, saved, and switchable.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet};
}
const stored=pb=>[...pb.reserve.off.wrinkles,...pb.reserve.off.tactics,...pb.reserve.def.wrinkles,...pb.reserve.def.tactics];

test('coordinators teach their background card once, and the switch turns it off',async()=>{
  const {cg,u,me}=await setup(921),pb=u.callSheet.playbook;
  me.staff.OC.preferredScheme='Ground Pressure';me.staff.DC.preferredScheme='Pressure Multiple';
  cg.rewards.scheme();cg.rewards.scheme();
  assert.equal(stored(pb).filter(id=>id==='counter_trey').length,1);assert.equal(stored(pb).filter(id=>id==='fire_zone').length,1);
  assert.ok(u.callSheet.moments.some(m=>/Counter Trey/.test(m.text)));
  cg.setIntegration('program-cards',false);me.staff.OC.preferredScheme='Option Motion';cg.rewards.scheme();
  assert.equal(stored(pb).includes('midline_option'),false);
});

test('booster and signing-day packs are drawn once, saved, and opened into the collection',async()=>{
  const {e,cg,u,me}=await setup(922);
  me.fan_support=88;cg.rewards.booster(u.year,6);cg.rewards.booster(u.year,7);
  assert.equal(u.callSheet.rewardPacks.length,1);const booster=u.callSheet.rewardPacks[0];
  assert.equal(booster.type,'booster');assert.equal(booster.cards.length,4);assert.match(booster.subtitle,/Fan support 88/);
  const signees=me.roster.slice(0,6);for(const p of signees)p.recruitment={...(p.recruitment||{}),schoolId:me.id,season:u.year};
  cg.rewards.signing();cg.rewards.signing();
  assert.equal(u.callSheet.rewardPacks.length,2);assert.match(u.callSheet.rewardPacks[1].subtitle,/6 signees/);
  // Packs survive a save round trip and invalid cards are dropped.
  const copy=JSON.parse(JSON.stringify({callSheet:u.callSheet}));copy.callSheet.rewardPacks[0].cards.push('not_a_card');e.normalizeCallSheet(copy);
  assert.deepEqual(copy.callSheet.rewardPacks[0].cards,booster.cards);
  const pick=booster.cards[0],before=stored(u.callSheet.playbook).filter(id=>id===pick).length;
  assert.equal(cg.takeRewardCard(booster.key,pick).ok,true);
  assert.equal(stored(u.callSheet.playbook).filter(id=>id===pick).length,before+1);
  assert.equal(cg.takeRewardCard(booster.key,pick).ok,false,'a pack opens once');
  cg.rewards.booster(u.year,8);assert.equal(u.callSheet.rewardPacks.length,1,'the booster pack never returns once opened');
});

test('upsets, streaks, low-scoring wins and postseason wins unlock their cards once',async()=>{
  const {cg,u}=await setup(923),pb=u.callSheet.playbook;
  assert.deepEqual(cg.programAwards({won:true,us:21,them:17,ranks:{opp:4,me:40},oppName:'Big State'}),['giant_killer']);
  assert.deepEqual(cg.programAwards({won:true,us:21,them:17,ranks:{opp:4,me:40}}),[],'once only');
  assert.deepEqual(cg.programAwards({won:true,us:10,them:7,ranks:{opp:50,me:30}}),['flea_flicker','bluff_zero'],'third straight win and a winner held to 7');
  cg.programAwards({won:false,us:3,them:10});assert.equal(u.callSheet.cardStreak,0);
  assert.deepEqual(cg.programAwards({won:true,us:30,them:20,postseason:true}),['jet_reverse']);
  for(const id of ['giant_killer','flea_flicker','bluff_zero','jet_reverse'])assert.ok(stored(pb).includes(id),id);
  assert.deepEqual(pb.programCards.sort(),['bluff_zero','flea_flicker','giant_killer','jet_reverse']);
});

test('a retired number gives the starter a fainter Legacy signature that survives roster syncs',async()=>{
  const {cg,u,me,CS}=await setup(924),pb=u.callSheet.playbook;
  me.retiredNumbers=[{number:7,playerId:'legend-1',name:'Old Legend',pos:'QB',year:u.year-10}];
  cg.rewards.legacy();cg.rewards.legacy();
  const leg=[...pb.signatures,...pb.reserveSignatures].filter(x=>x.legacy);assert.equal(leg.length,1);
  const spec=leg[0],heir=me.roster.find(p=>String(p.id)===String(spec.playerId));
  assert.equal(heir.pos,'QB');assert.equal(spec.id,`leg_${heir.id}`);assert.equal(spec.legacy.name,'Old Legend');
  const card=CS.packs.cardDef(spec.id),full=CS.signatures.build({...spec,legacy:undefined}).def;
  assert.match(card.name,/Legacy/);
  const total=d=>(d.effects||[]).reduce((n,x)=>n+x.v,0)+Object.values(d.duels||{}).reduce((n,x)=>n+(x.bias||0),0);
  assert.ok(total(card)<total(full),'the legacy edge is smaller than an earned signature');
  cg.syncSignatures();const after=[...pb.signatures,...pb.reserveSignatures].find(x=>x.legacy);
  assert.equal(after.id,spec.id,'roster sync keeps the legacy identity');
});

test('program cards work in a full simulated battle',async()=>{
  const {CS}=await setup(925),D=CS.data,Ro=CS.roster;
  const deck={off:{base:D.DEFAULT_DECKS.off.base,wrinkles:['counter_trey','buck_sweep','choice_route','dagger','smash','flea_flicker','jet_reverse','midline_option'],tactics:['giant_killer','motion','max_protect','route_adjust']},
    def:{base:D.DEFAULT_DECKS.def.base,wrinkles:['cover4_match','double_eagle','fire_zone','wide_nine','man_free','bluff_zero'],tactics:D.DEFAULT_DECKS.def.tactics}};
  const b=CS.battle.simulate({home:{...Ro.preset('ground'),decks:deck},away:Ro.preset('aerial'),seed:'program-cards'});
  assert.equal(b.game.status,'final');assert.ok(!b.final.engineError);
  const used=new Set(b.log.filter(x=>x.type==='snap').flatMap(x=>[x.play,x.call]));
  assert.ok(['counter_trey','buck_sweep','choice_route','dagger','smash'].some(id=>used.has(id)));
});

test('an acquired branch is shown and delivered for new, banked and program rewards',async()=>{
  const {e,cg,u,CS}=await setup(934),pb=u.callSheet.playbook,P=CS.packs;
  const frozen=P.freezeGamePack(pb,{cards:[P.POOL.find(c=>c.id==='power')]},{key:'card:old-offer'});
  CS.evolution.evolve(pb,'power','counter');pb.gamePacks=[frozen];
  assert.deepEqual(P.gamePackChoices(pb,frozen).map(c=>c.id),['counter']);
  assert.ok(P.claimGamePack(pb,'card:old-offer','counter',[],500,'collection').ok);
  assert.equal(pb.reserve.off.wrinkles.at(-1),'counter');
  u.callSheet.rewardPacks=[{key:'booster:old',cards:['power'],title:'Booster pack'}];
  assert.ok(cg.takeRewardCard('booster:old','counter').ok);
  const themed=P.openPack(pb,{seed:'after-branch',won:true,favor:['power']});
  assert.ok(themed.cards.some(c=>c.id==='counter'));
  const saved=P.freezeGamePack(pb,themed,{key:'card:post-branch'});
  assert.ok(P.cleanGamePack(saved).cards.some(c=>c.id==='power'));
  assert.ok(P.gamePackChoices(pb,saved).some(c=>c.id==='counter'));
  pb.reserve.off.wrinkles.push('power');e.normalizeCallSheet(u);
  assert.ok(!u.callSheet.playbook.reserve.off.wrinkles.includes('power'));
});

test('even a nearly complete collection receives an eligible discovery option',async()=>{
  const {CS}=await setup(935),P=CS.packs,pb=P.newPlaybook(),missing='two_way_star';
  for(const c of P.POOL)if(c.kind!=='upgrade'&&c.rarity!=='legendary'&&c.id!==missing)P.grantCard(pb,c.id,{finish:false});
  for(let seed=0;seed<10;seed++){
    assert.ok(P.openPack(pb,{won:false,seed,oppTendency:{run:2}}).cards.some(c=>c.id===missing));
    assert.ok(P.rewardPack(pb,{seed}).cards.includes(missing));
  }
});

function stickerSession(storage) {
  const fs = require('node:fs'), vm = require('node:vm');
  const battle = require('../forks/call-sheet/core/battle');
  const context = vm.createContext({localStorage: storage, CallSheet: {battle}});
  vm.runInContext(fs.readFileSync(require.resolve('../forks/call-sheet/slice/challenge-awards.js'), 'utf8'), context);
  return context.ChallengeAwards;
}

test('Drive Challenges award distinct helmet stickers once across sessions without touching career saves', () => {
  const db = new Map([['callsheet.slice.v1', 'career']]);
  const storage = {getItem: key => db.get(key), setItem: (key, value) => db.set(key, value)};
  const quick = stickerSession(storage), dynasty = stickerSession(storage);
  assert.equal(quick.get('need_six'), null);
  assert.equal(quick.earn('unknown'), false);
  assert.equal(quick.earn('four_minute_offense'), true);
  assert.equal(quick.earn('need_six'), true);
  assert.equal(dynasty.get('need_six').name, 'Two-Minute Drill');
  assert.equal(dynasty.earn('need_six'), false);
  assert.equal(dynasty.earn('goal_line_stand'), true);
  assert.deepEqual(Array.from(quick.list(), item => item.name), ['Two-Minute Drill','Brick Wall','Clock Killer']);
  assert.deepEqual(Array.from(stickerSession(storage).list(), item => item.symbol), ['6','W','00']);
  assert.equal(db.get('callsheet.slice.v1'), 'career');
  assert.equal(db.size, 4);
});

test('a challenge sticker can be awarded once per session when browser storage is blocked', () => {
  const denied = () => { throw Error('Storage unavailable'); };
  for (const storage of [undefined, {getItem: denied, setItem: denied}, {getItem: () => null, setItem: denied}]) {
    const awards = stickerSession(storage);
    assert.equal(awards.earn('goal_line_stand'), true);
    assert.equal(awards.earn('goal_line_stand'), false);
    assert.equal(awards.list().length, 1);
    assert.equal(awards.get('goal_line_stand').symbol, 'W');
  }
});

test('challenge records persist best and last drives separately for each look', () => {
  const career = [['callsheet.slice.v1', 'career'], ['dynasty.active', 'season']];
  const db = new Map(career);
  const storage = {getItem: key => db.get(key), setItem: (key, value) => db.set(key, value)};
  const quick = stickerSession(storage), dynasty = stickerSession(storage);
  const complete = (awards, look, won, snaps) => awards.finish('need_six', look, {won, snaps});
  assert.equal(complete(quick, 'stacked_box', true, 1), null, 'unrelated alternate is not tracked');
  assert.equal(complete(quick, null, false, 4).improved, false);
  assert.equal(dynasty.progress('need_six').best, null, 'an unsuccessful drive has no best clear');
  assert.equal(complete(dynasty, null, true, 5).improved, true);
  assert.equal(complete(quick, null, true, 3).improved, true);
  assert.equal(complete(dynasty, null, true, 3).improved, false, 'a tie is not an improvement');
  assert.equal(complete(quick, 'prevent_umbrella', true, 2).improved, true);
  assert.equal(complete(dynasty, null, false, 2).improved, false);
  const reload = stickerSession(storage);
  assert.deepEqual(JSON.parse(JSON.stringify(reload.progress('need_six'))), {
    attempts: 5, clears: 3, best: 3, last: {won: false, snaps: 2},
  });
  assert.deepEqual(JSON.parse(JSON.stringify(reload.progress('need_six', 'prevent_umbrella'))), {
    attempts: 1, clears: 1, best: 2, last: {won: true, snaps: 2},
  });
  assert.equal(reload.get('need_six'), null, 'recording an alternate does not earn an original sticker');
  assert.deepEqual(career.map(([key]) => db.get(key)), ['career','season']);
  const blocked = stickerSession({getItem: () => null, setItem() { throw Error('Storage unavailable'); }});
  complete(blocked, null, true, 2);
  complete(blocked, null, false, 4);
  assert.equal(blocked.progress('need_six').attempts, 2);
  assert.equal(blocked.progress('need_six').best, 2);
});

test('three-drive challenge starts the real combo setup and lends an opening tactic without enlarging the deck', () => {
  const B = require('../forks/call-sheet/core/battle');
  const D = require('../forks/call-sheet/core/data');
  const originalDecks = structuredClone(D.DEFAULT_DECKS);
  const {stages} = B.THREE_DRIVE_CHALLENGE;
  const opening = B.createChallenge(stages[0].id, {runStage: 0});
  assert.deepEqual(opening.decks.home.off.comboPlan, {id: 'establish', play: 'pa_boot'});
  assert.ok(!opening.pending.options.plays.some(play => play.id === 'pa_boot'));
  assert.ok(opening.piles.home.off.wrinkle.draw.includes('pa_boot'));
  assert.equal(B.createChallenge(stages[0].id).decks.home.off.comboPlan, undefined);
  for (let run = 0; run < 2; run++) B.submit(opening, {type: 'call', play: 'inside_zone', tactics: []});
  const command = opening.pending.options.command;
  assert.equal(opening.pending.comboPayoff?.play, 'pa_boot');
  B.submit(opening, {type: 'combo_payoff'});
  assert.equal(opening.pending.options.command, command - 1);
  assert.ok(opening.pending.options.plays.some(play => play.id === 'pa_boot' && !play.blocked));
  assert.equal(opening.pending.comboPayoff, undefined);

  for (const [runStage, stage] of stages.entries()) {
    for (const loan of stage.loans || []) {
      const battle = B.createChallenge(stage.id, {runStage, loan});
      const {role, options} = battle.pending;
      assert.equal(options.tactics[0].id, loan, `${loan} starts in hand`);
      assert.equal(options.tactics.length, D.RULES.tacticHand);
      assert.equal(battle.decks.home[role].tactics.length, D.DEFAULT_DECKS[role].tactics.length);
    }
  }
  assert.deepEqual(D.DEFAULT_DECKS, originalDecks);
  assert.throws(() => B.createChallenge('need_six', {runStage: 1}), /not part of this run/);
  assert.throws(() => B.createChallenge('goal_line_stand', {runStage: 1, loan: 'max_protect'}), /not offered/);
});

test('the three-drive record and sticker are separate from the individual drives', () => {
  const db = new Map([['callsheet.slice.v1', 'career']]);
  const storage = {getItem: key => db.get(key), setItem: (key, value) => db.set(key, value)};
  const awards = stickerSession(storage);
  awards.finish('three_drive', null, {won: false, snaps: 10});
  awards.finish('three_drive', null, {won: true, snaps: 8});
  assert.equal(awards.earn('three_drive'), true);
  const reload = stickerSession(storage);
  assert.equal(reload.get('three_drive').name, 'Complete Game');
  assert.equal(reload.progress('three_drive').best, 8);
  assert.equal(reload.progress('three_drive').attempts, 2);
  for (const id of ['need_six','goal_line_stand','four_minute_offense']) {
    assert.equal(reload.get(id), null);
    assert.equal(reload.progress(id), null);
  }
  assert.equal(db.get('callsheet.slice.v1'), 'career');
});

test('draft Power and Tempo face the same opening look and earn different payoffs', () => {
  const B = require('../forks/call-sheet/core/battle');
  const D = require('../forks/call-sheet/core/data');
  const week = playbook => B.createChallenge('need_six', {runStage: 0, route: 'opener', playbook, loans: []});
  const power = week('power'), tempo = week('tempo');
  assert.deepEqual(tempo.pending.situation, power.pending.situation);
  assert.deepEqual(tempo.teams.home.lineup, power.teams.home.lineup);
  assert.deepEqual(tempo.snap.def, power.snap.def);
  assert.ok(power.pending.options.plays.some(play => play.id === 'power' && play.base));
  assert.ok(tempo.pending.options.plays.some(play => play.id === 'quick_out' && play.base));
  assert.ok(!tempo.decks.home.off.wrinkles.includes('vertical_shot'));
  for (const b of [power,tempo]) assert.ok(D.validComboPlan(b.decks.home.off,'off',b.decks.home.off.comboPlan));

  B.submit(tempo, {type: 'call', play: 'quick_slant', tactics: []});
  assert.equal(tempo.lastResult.yards, 10);
  assert.equal(tempo.hands.home.wrinkles.length, D.RULES.wrinkleRow + 1);
  assert.equal(tempo.hands.home.tempoExtra, true);
  assert.equal(tempo.challengeDraft.tempoUsed, true);
  assert.deepEqual(B.load(B.save(tempo)).challengeDraft, tempo.challengeDraft);
  B.submit(power, {type: 'call', play: 'quick_slant', tactics: []});
  assert.equal(power.lastResult.yards, 10);
  assert.equal(power.hands.home.wrinkles.length, D.RULES.wrinkleRow);
});

test('draft routes give the advertised spot and carry both loans in the correct final hand', () => {
  const B = require('../forks/call-sheet/core/battle');
  const D = require('../forks/call-sheet/core/data');
  const create = (challenge, runStage, route, loans) => B.createChallenge(challenge, {runStage,route,playbook:'tempo',loans});
  const soft = create('four_minute_offense',1,'protect_lead',['seal_block']);
  assert.deepEqual([soft.game.clock,soft.game.down,soft.game.distance,soft.game.timeouts.away],[80,2,4,1]);
  const attack = create('four_minute_offense',2,'close_it_out',['seal_block','hurry_up']);
  const defense = create('goal_line_stand',2,'last_stop',['stunt','spy']);
  const mixed = create('four_minute_offense',2,'close_it_out',['stunt','route_adjust']);
  for (const b of [attack,defense]) {
    const {loans} = b.challengeDraft, {role,options} = b.pending;
    assert.ok(loans.every(id => options.tactics.some(tactic => tactic.id === id)));
    assert.equal(options.tactics.length, D.RULES.tacticHand);
    assert.equal(b.decks.home[role].tactics.length, D.DEFAULT_DECKS[role].tactics.length);
  }
  assert.deepEqual([defense.game.down,defense.game.fieldPosition],[3,94]);
  assert.ok(mixed.decks.home.def.tactics.includes('stunt'));
  assert.ok(!mixed.pending.options.tactics.some(tactic => tactic.id === 'stunt'));
  assert.throws(() => create('goal_line_stand',2,'last_stop',['stunt','stunt']), /offered tactic/);
  assert.throws(() => create('goal_line_stand',2,'last_stop',['stunt','hurry_up']), /not offered for this matchup/);
});

test('the risky middle route can be cleared through a deliberate run fit', () => {
  const B = require('../forks/call-sheet/core/battle');
  for (const loan of ['stunt','lock']) {
    const setup = () => B.createChallenge('goal_line_stand', {runStage:1, route:'goal_line', playbook:'power', loans:[loan]});
    const staffed = setup(), coached = setup();
    for (let i=0; i<4&&!B.challengeResult(staffed); i++) B.submit(staffed, {type:'auto'});
    for (let i=0; i<4&&!B.challengeResult(coached); i++) {
      B.submit(coached, {type:'call',play:'run_fit',tactics:i===0?[loan]:[],edgeAssignment:'contain'});
    }
    assert.equal(B.challengeResult(staffed)?.won, false);
    assert.equal(B.challengeResult(coached)?.won, true);
  }
});
