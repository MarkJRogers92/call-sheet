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
  // Duel-true stats: every receiver's catches and yards, and every back's rushing, match the card battle exactly.
  const lines=new Map([...out.candidate.playerStats.home,...out.candidate.playerStats.away].map(r=>[String(r.id),r.stats||{}]));
  let checked=0;const mismatches=[];
  for(const bp of Object.values(b.players)){
    const st=lines.get(String(bp.id))||{};
    if(bp.rec||bp.recYds){checked++;if((st.receptions||0)!==bp.rec||(st.recYds||0)!==bp.recYds)mismatches.push(`${bp.name} rec ${bp.rec}/${bp.recYds} vs ${st.receptions}/${st.recYds}`)}
    if(bp.role!=='QB'&&(bp.rushAtt||0)>0){checked++;if((st.rushAtt||0)!==bp.rushAtt||(st.rushYds||0)!==bp.rushYds)mismatches.push(`${bp.name} rush ${bp.rushAtt}/${bp.rushYds} vs ${st.rushAtt}/${st.rushYds}`)}
    if(bp.role==='QB'&&bp.passAtt){checked++;if((st.passAtt||0)!==bp.passAtt||(st.passYds||0)!==bp.passYds)mismatches.push(`${bp.name} pass ${bp.passAtt}/${bp.passYds} vs ${st.passAtt}/${st.passYds}`)}
  }
  assert.ok(checked>6,'checked the main ball handlers');
  if(mismatches.length)console.log(mismatches.slice(0,12).join('\n'));assert.deepEqual(mismatches,[],'recorded stats match who actually played each snap');
  const qb=home.roster.find(p=>p.id===home.roleDepth.QB1[0]);
  assert.ok((qb.stats?.passAtt||0)>0||(qb.stats?.rushAtt||0)>0,'the real starting QB has stats from the card battle');
  // A wrong matchup is refused, and nothing is written.
  const g2=e.findUserGame();
  if(g2&&!g2.played){const wrong=B.simulate({home:A.battleTeam(away),away:A.battleTeam(home),seed:'wrong'});
    assert.throws(()=>e.recordV2GameLabResult({externalState:wrong.game}),/do not match/);assert.equal(g2.played,false)}
  console.log(`ok  card battle recorded as a real Dynasty Lab game (${g.away} ${b.game.score.away} at ${g.home} ${b.game.score.home}, you are ${userSide})`);
})().catch(err=>{console.error('not ok',err.stack);process.exit(1)});
