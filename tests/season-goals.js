const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed=951){const e=loadEngine({seed});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();return e}

test('season goals are contextual, persistent, and include a critical wins target',async()=>{
 const e=await setup(),t=e.T('Chicago Metropolitan'),g=e.ensureSeasonGoals(t);
 assert.equal(g.length,4);
 assert.equal(g[0].type,'wins');
 assert.equal(g[0].weight,'Critical');
 assert.equal(g[0].target,e.seasonExpectation(t));
 const same=e.ensureSeasonGoals(t);
 assert.equal(same,g,'goals are stable for the season');
 assert.ok(g.some(x=>x.type==='rivalry'));
 assert.ok(g.some(x=>['bluechips','classSize'].includes(x.type)));
});

test('season goals render into Program Lab HTML without throwing',async()=>{
 const e=await setup(953),t=e.T('Chicago Metropolitan');
 const html=e.seasonGoalsHTML(t);
 assert.match(html,/Critical/);
 assert.match(html,/Important/);
 assert.match(html,/Win at least/);
 assert.match(html,/Sign/);
 assert.match(html,/(On track|At risk|Complete|Failed)/);
});

test('completed important goals move the administration review',async()=>{
 const e=await setup(952),t=e.T('Chicago Metropolitan');
 const goals=e.ensureSeasonGoals(t),rival=goals.find(x=>x.type==='rivalry'),recruiting=goals.find(x=>x.id==='recruiting');
 t.w=e.seasonExpectation(t);t.l=12-t.w;t.adminConfidence=60;
 if(rival){t.rivalry.series.lastYear=e.universe.year;t.rivalry.series.lastResult='W'}
 for(let i=0;i<recruiting.target;i++){
  if(recruiting.type==='bluechips')e.universe.recruits[i].stars=4;
  e.universe.recruits[i].committed=t.name;
 }
 const evald=e.evaluateSeasonGoals(t,true);
 assert.ok(evald.adjustment>0);
 const review=e.adminSeasonReview(t);
 assert.equal(review.goalAdjustment,evald.adjustment);
 assert.ok(Array.isArray(review.goals));
});

async function takeoverReviewFixture(lateWins,bowlWin=false){
 const e=await setup(958),u=e.universe,t=e.T('Chicago Metropolitan'),goal=e.ensureSeasonGoals(t).find(g=>g.id==='wins'),coach=t.staff.HC;
 u.phase='complete';u.week=12;
 u.setup={programId:t.id,takeover:{year:u.year,completedWeeks:7,targetWins:3,inherited:{w:2,l:5},coachId:coach.id,appointment:'interim'}};
 Object.assign(goal,{type:'takeoverWins',target:3,label:'Win 3 of the final 5 regular-season games'});
 const wins=new Set([1,3,...lateWins]);
 for(const game of t.schedule){game.played=true;game.winner=wins.has(game.week)?t.name:(game.home===t.name?game.away:game.home)}
 t.w=wins.size+Number(bowlWin);t.l=12-wins.size;coach.interim=true;coach.contractYears=1;
 return {e,u,t,coach};
}

test('missing the takeover target ends the interim job even when a bowl win restores the overall record',async()=>{
 const {e,u,t,coach}=await takeoverReviewFixture([8,10],true);
 const review=e.reviewControlledProgram(t);
 assert.equal(review.takeover,true);
 assert.equal(review.expected,3);
 assert.deepEqual([review.w,review.l],[2,3]);
 assert.equal(review.goals.find(g=>g.id==='wins').state,'failed','postseason wins do not satisfy a regular-season mandate');
 assert.equal(review.appointment,'ended');
 assert.equal(u.setup.takeover.appointment,'ended');
 assert.equal(u.tenure.closed,true);
 assert.ok(u.jobOffers.length,'the normal job board opens');
 assert.deepEqual(u.tenure.seasons[0].boardRecord,{w:2,l:3});
 assert.deepEqual([e.careerTotals().w,e.careerTotals().l],[3,3]);
 e.recordCoachSeason(t);
 assert.deepEqual([coach.seasons[0].wins,coach.seasons[0].losses],[3,3]);
 assert.deepEqual([t.staff.OC.seasons[0].wins,t.staff.OC.seasons[0].losses],[5,8],'the retained coordinator worked the full season');
 e.carousel();
 assert.notEqual(t.staff.HC.id,coach.id,'the former interim coach leaves the program');
 const archived=u.coachArchive.find(c=>c.id===coach.id);
 assert.equal(archived.departureReason,'Interim contract ended');
 assert.deepEqual([archived.seasons[0].wins,archived.seasons[0].losses],[3,3]);
});

test('winning three of the last five offers a permanent job with three years remaining after the carousel',async()=>{
 const {e,u,t,coach}=await takeoverReviewFixture([8,10,12]);
 const review=e.reviewControlledProgram(t);
 assert.equal(review.appointment,'permanent');
 assert.equal(u.setup.takeover.appointment,'permanent');
 assert.equal(review.goals.find(g=>g.id==='wins').state,'complete');
 assert.equal(u.tenure.closed,false);
 assert.equal((u.jobOffers||[]).length,0);
 assert.equal(coach.interim,false);
 e.carousel();
 assert.equal(t.staff.HC.id,coach.id);
 assert.equal(coach.contractYears,3);
 assert.deepEqual([e.careerTotals().w,e.careerTotals().l],[3,2]);
});
