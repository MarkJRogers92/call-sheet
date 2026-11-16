// Call Sheet fork: a card battle between the user's real team and its real scheduled opponent is recorded as a
// genuine Dynasty Lab game: schedule, records, player stats, archive and validation all go through the same
// transactional path as any coached Game Engine 2 game (game-engine-v2-record-run.js).
const assert=require('assert');
const {loadEngine}=require('../tools/harness');
const A=require('../forks/call-sheet/core/adapter.js');
const B=require('../forks/call-sheet/core/battle.js');

(async()=>{
  const e=loadEngine({seed:2026,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  assert.equal(typeof e.recordV2GameLabResult,'function','the recorder is reachable');
  const u=e.universe,g=e.findUserGame();assert.ok(g&&!g.played,'the user has an unplayed scheduled game');
  const home=u.teams.find(t=>t.name===g.home),away=u.teams.find(t=>t.name===g.away);
  const userSide=home.name==='Chicago Metropolitan'?'home':'away';
  const before={hw:home.w,hl:home.l,aw:away.w,al:away.l,archive:(u.gameArchive||[]).length};
  // The battle uses the real rosters and depth charts, with the coordinators playing it out (sim mode).
  const b=B.simulate({home:A.battleTeam(home),away:A.battleTeam(away),seed:`card:${g.week}`});
  assert.equal(b.game.status,'final');
  const tagged=b.game.events.filter(ev=>ev.type==='scrimmage'&&ev.kind);assert.ok(tagged.length>50,'plays are tagged for attribution');
  const out=e.recordV2GameLabResult({externalState:b.game});
  assert.ok(out.ok&&out.validation.ok,`recorded and validated: ${out.validation?.errors?.join('; ')}`);
  assert.equal(out.candidate.hp,b.game.score.home);assert.equal(out.candidate.ap,b.game.score.away);
  assert.ok(g.played,'the scheduled game is complete');
  const homeWon=b.game.score.home>b.game.score.away;
  assert.equal(home.w,before.hw+(homeWon?1:0));assert.equal(away.l,before.al+(homeWon?1:0));
  assert.equal((u.gameArchive||[]).length,before.archive+1,'the game is in the permanent archive');
  const qb=home.roster.find(p=>p.id===home.roleDepth.QB1[0]);
  assert.ok((qb.stats?.passAtt||0)>0||(qb.stats?.rushAtt||0)>0,'the real starting QB has stats from the card battle');
  // A wrong matchup is refused, and nothing is written.
  const g2=e.findUserGame();
  if(g2&&!g2.played){const wrong=B.simulate({home:A.battleTeam(away),away:A.battleTeam(home),seed:'wrong'});
    assert.throws(()=>e.recordV2GameLabResult({externalState:wrong.game}),/do not match/);assert.equal(g2.played,false)}
  console.log(`ok  card battle recorded as a real Dynasty Lab game (${g.away} ${b.game.score.away} at ${g.home} ${b.game.score.home}, you are ${userSide})`);
})().catch(err=>{console.error('not ok',err.stack);process.exit(1)});
