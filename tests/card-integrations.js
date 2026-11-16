// Call Sheet fork: the integration framework and the first four integrations, on a real dynasty week.
//   sim-with-cards  · your simulated game is a card battle with your playbook
//   scouting-fog    · film confidence travels to the battle
//   practice-reps   · weekly prep trains the matching cards
//   ai-playbooks    · programs on your schedule build playbooks every week
const assert=require('assert');
const {loadEngine}=require('../tools/harness');
(async()=>{
  const e=loadEngine({seed:808,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const u=e.universe,me=u.teams.find(t=>t.name==='Chicago Metropolitan'),CG=globalThis.DynastyCardGameDay;
  assert.ok(CG&&globalThis.CallSheet?.battle,'the card engine is loaded in Dynasty Lab');
  const ids=CG.integrations().map(x=>x.id);
  for(const id of ['program-edges','signature-graduation','scouting-fog','practice-reps','ai-playbooks','sim-with-cards'])assert.ok(ids.includes(id),`integration ${id} is registered`);
  assert.equal(u.callSheet,undefined,'a dynasty that never used cards has no card data');

  // Opt in, and set this week's prep against the real opponent.
  CG.enable();
  const g=e.findUserGame(),opp=u.teams.find(t=>t.name===(g.home===me.name?g.away:g.home));
  me.weeklyPrep={version:2,year:u.year,week:u.week,opponent:opp.name,focuses:['run_blocking','coverage'],delegated:false,source:'manual'};
  const cfg=CG.launch();
  assert.ok(Number.isFinite(cfg.scouting.confidence),'film confidence travels to the battle');
  const mySide=cfg.userSide;assert.deepEqual(cfg.program[mySide].prep,['run_blocking','coverage']);
  assert.ok(typeof cfg.program[mySide].familiarity==='object','scheme familiarity is per side');
  assert.equal(cfg.practiceReps.inside_zone,5);assert.equal(cfg.practiceReps.two_high,5);

  // Simulate the week: the user's game is played as a card battle and recorded.
  const before=JSON.parse(JSON.stringify(u.callSheet.playbook.mastery||{}));
  e.simWeek();
  assert.ok(g.played,'the week was played');
  const pb=u.callSheet.playbook;
  assert.equal(pb.gamesPlayed,1,'the simulated game was a card battle');
  assert.ok((pb.mastery.inside_zone||0)>=(before.inside_zone||0)+5,'practice reps and game reps reached the cards');
  // Opponents built playbooks.
  const ai=u.callSheet.ai,tracked=Object.keys(ai);
  assert.ok(tracked.length>=5,`programs on the schedule have playbooks (${tracked.length})`);
  assert.ok(Object.values(ai).some(p=>p.packsOpened>=1),'AI programs opened packs after their games');
  assert.ok(Array.isArray(u.callSheet.lastWeekNews));
  // The opponent's playbook goes into the next game's launch.
  const g2=e.findUserGame();
  if(g2){const cfg2=CG.launch();const o2=g2.home===me.name?g2.away:g2.home,oppTeam=u.teams.find(t=>t.name===o2);
    if(ai[oppTeam.id])assert.ok(cfg2.oppPlaybook&&cfg2.oppPlaybook.packsOpened===ai[oppTeam.id].packsOpened,'next opponent brings its built playbook')}
  // Switching sim-with-cards off returns simulated games to the standard engine.
  CG.setIntegration('sim-with-cards',false);e.universe.weeklyDecisions=[];e.simWeek();
  assert.equal(u.callSheet.playbook.gamesPlayed,1,'with the integration off, the sim is the standard one');
  // A failing integration never breaks the game.
  CG.register({id:'test-broken',label:'Broken',about:'Throws',hooks:{launch(){throw new Error('boom')}}});
  const quiet=console.error;console.error=()=>{};try{if(e.findUserGame())CG.launch()}finally{console.error=quiet}
  console.log('ok  integrations: card sim, scouting fog, practice reps and AI playbooks run through the real weekly loop');
})().catch(err=>{console.error('not ok',err.stack);process.exit(1)});
