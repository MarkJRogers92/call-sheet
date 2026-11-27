const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');

function setup(seed=961){
 const e=loadEngine({seed});e.setUserTeam('Chicago Metropolitan');return e.loadSchools().then(()=>{e.initUniverse();return e});
}

test('a controlled-team firing opens a search instead of auto-filling, while AI teams still auto-fill',async()=>{
 const e=await setup(961),u=e.universe,t=u.teams[0],ai=u.teams[1],oldHC=t.staff.HC.id;
 e.createOpening(t,'HC','Fired after a bad season','FIRED');
 assert.equal(u.openings.length,1);
 const o=u.openings[0];
 assert.equal(o.status,'OPEN');assert.equal(o.schoolId,t.id);assert.equal(o.slot,'HC');
 assert.ok(t.staff.HC.interim,'an interim coach fills the slot while the search runs');
 assert.notEqual(t.staff.HC.id,oldHC);
 const pool=u.candidateMarket[o.id];
 assert.ok(pool.length>=4,'the pool mixes fresh, internal and external candidates');
 assert.ok(pool.some(c=>c.source==='internal'));
 assert.ok(pool.every(c=>c.candidateId&&c.askSalary>0&&c.fitScore!=null));
 // AI teams are untouched by the controlled-team-only gating in carousel().
 assert.equal(ai.staff.HC.interim,undefined);
});

test('an offer cannot be made before an interview, and cannot exceed the athletic department budget',async()=>{
 const e=await setup(962),u=e.universe,t=u.teams.find(x=>x.resources<50)||u.teams[u.teams.length-1];
 e.setUserTeam(t.name);
 const o=e.createOpening(t,'OC','Retired after the season','RETIRED'),cand=u.candidateMarket[o.id][0];
 const blocked=e.extendOffer(o.id,cand.candidateId,{salary:cand.askSalary,years:cand.askYears,authority:'shared'});
 assert.equal(blocked.ok,false);assert.match(blocked.reason,/[Ii]nterview/);
 e.interviewCandidate(o.id,cand.candidateId);
 const budget=e.teamStaffBudget(t),overBudget=e.extendOffer(o.id,cand.candidateId,{salary:budget+5,years:3,authority:'shared'});
 assert.equal(overBudget.ok,false);assert.match(overBudget.reason,/budget/i);
 assert.equal(cand.status,'AVAILABLE','a rejected-for-budget offer never touches candidate state');
});

test('a declined offer marks the candidate and leaves the opening searchable',async()=>{
 const e=await setup(964),u=e.universe,t=u.teams[0];
 const o=e.createOpening(t,'RC','Retired after the season','RETIRED'),cand=u.candidateMarket[o.id][0];
 e.interviewCandidate(o.id,cand.candidateId);
 // The acceptance roll uses the seeded gameplay RNG (overriding Math.random never reached it): pick a gameplay seed
 // whose next draw is above any acceptance chance (capped at .95), so the offer is certainly declined.
 let s=1;for(;s<5000;s++){e.setGameplayRng(s);if(e.gameplayRandom()>.96)break}e.setGameplayRng(s);
 const res=e.extendOffer(o.id,cand.candidateId,{salary:cand.askSalary*0.5,years:1,authority:'shared'});
 assert.equal(res.ok,true);assert.equal(res.accepted,false);
 assert.equal(cand.status,'DECLINED');assert.ok(cand.declineReason);
 assert.equal(u.openings.find(x=>x.id===o.id).status,'OPEN');
});

test('candidateAcceptChance stays within its clamped bounds and rewards fit, salary and interviews',async()=>{
 const e=await setup(963),u=e.universe,t=u.teams[0];
 const o=e.createOpening(t,'DC','Left for another opportunity','DEPARTED'),cand=u.candidateMarket[o.id].find(c=>c.source==='fresh');
 const cold=e.candidateAcceptChance(cand,{salary:cand.askSalary*0.5,years:1,authority:'shared'});
 e.interviewCandidate(o.id,cand.candidateId);
 const warmed=e.candidateAcceptChance(cand,{salary:cand.askSalary*1.3,years:cand.askYears,authority:cand.wantsAuthority});
 assert.ok(cold>=0.05&&cold<=0.95);assert.ok(warmed>=0.05&&warmed<=0.95);
 assert.ok(warmed>cold,'a good offer to an interviewed candidate should never look worse than a lowball to a cold one');
});

// The next three tests drive hireCandidate() directly rather than through the
// probabilistic extendOffer() gate: they verify what a hire actually does to
// the universe (identity, stints, opening/candidate bookkeeping), which does
// not depend on chance. extendOffer's own accept/decline branching is covered
// above.

test('an accepted offer hires the candidate, closes the interim tenure, and fills the slot',async()=>{
 const e=await setup(963),u=e.universe,t=u.teams[0];
 const o=e.createOpening(t,'DC','Left for another opportunity','DEPARTED'),cand=u.candidateMarket[o.id].find(c=>c.source==='fresh'),interimId=t.staff.DC.id;
 e.hireCandidate(o,cand,{salary:cand.askSalary,years:cand.askYears,authority:cand.wantsAuthority});
 assert.equal(t.staff.DC.name,cand.name);assert.notEqual(t.staff.DC.id,interimId);
 assert.equal(t.staff.DC.interim,undefined);
 assert.equal(t.staff.DC.salary,cand.askSalary);assert.equal(t.staff.DC.playCallAuthority,cand.wantsAuthority);
 const openingAfter=u.openings.find(x=>x.id===o.id);
 assert.equal(openingAfter.status,'FILLED');assert.equal(openingAfter.hiredCoachId,t.staff.DC.id);
 const interimArchived=u.coachArchive.find(c=>c.id===interimId);
 assert.ok(interimArchived,'the interim is archived, not silently discarded');
 assert.equal(t.staff.DC.careerHistory.filter(s=>s.endSeason==null).length,1,'exactly one open stint after the hire');
 const otherCandidates=u.candidateMarket[o.id].filter(c=>c!==cand);
 assert.ok(otherCandidates.every(c=>c.status==='WITHDRAWN'),'the rest of the pool is withdrawn once the slot is filled');
});

test('hiring away an existing coordinator closes their old stint once and does not duplicate identity',async()=>{
 const e=await setup(965),u=e.universe,t=u.teams[0],rival=u.teams.find(x=>x.id!==t.id);
 const targetCoach=rival.staff.OC;targetCoach.ambition=95;
 const o=e.createOpening(t,'OC','Left for another opportunity','DEPARTED'),cand=u.candidateMarket[o.id].find(c=>c.source==='external');
 if(!cand){assert.ok(true,'no eligible external candidate this seed; nothing to verify');return}
 const originalId=cand.coachId;
 e.hireCandidate(o,cand,{salary:cand.askSalary,years:cand.askYears,authority:cand.wantsAuthority});
 assert.equal(t.staff.OC.id,originalId,'the same coach identity moves, it is not recreated');
 assert.equal(t.staff.OC.careerHistory.filter(s=>s.endSeason==null).length,1);
 const originSlot=Object.entries(rival.staff).find(([,c])=>c.id===originalId);
 assert.equal(originSlot,undefined,'the coach no longer occupies their old slot');
 assert.notEqual(rival.staff.OC.id,originalId,'the rival auto-fills its own vacancy immediately, same as any AI departure');
});

test('promoting an internal candidate to HC opens a new search for the slot they vacated',async()=>{
 const e=await setup(966),u=e.universe,t=u.teams[0],ocId=t.staff.OC.id;
 const o=e.createOpening(t,'HC','Fired after the season','FIRED'),cand=u.candidateMarket[o.id].find(c=>c.source==='internal'&&c.fromSlot==='OC');
 assert.ok(cand,'internal OC candidate should be offered for an HC vacancy');
 e.hireCandidate(o,cand,{salary:cand.askSalary,years:cand.askYears,authority:'full'});
 assert.equal(t.staff.HC.id,ocId,'the promoted coach keeps their identity in the new role');
 assert.equal(t.staff.HC.role,'Head Coach');
 assert.equal(t.staff.HC.careerHistory.filter(s=>s.endSeason==null).length,1);
 const ocOpening=u.openings.find(x=>x.schoolId===t.id&&x.slot==='OC'&&x.status==='OPEN');
 assert.ok(ocOpening,'the vacated OC slot becomes its own opening rather than silently disappearing');
 assert.ok(t.staff.OC.interim);
 assert.notEqual(t.staff.OC.id,ocId,'the OC slot is not still occupied by the coach who was just promoted');
});

test('openings and the candidate market survive a save/load round-trip',async()=>{
 const e=await setup(967),u=e.universe,t=u.teams[0];
 const o=e.createOpening(t,'SC','Retired after the season','RETIRED');
 e.interviewCandidate(o.id,u.candidateMarket[o.id][0].candidateId);
 const portable=JSON.parse(JSON.stringify(e.packUniverse(u)));
 e.installSave({version:'0.9.6',userTeam:t.name,universe:portable});
 const again=e.universe,openingAgain=again.openings.find(x=>x.id===o.id);
 assert.ok(openingAgain);assert.equal(openingAgain.status,'OPEN');
 assert.ok(again.candidateMarket[o.id][0].interviewed);
 assert.ok(again.teams.find(x=>x.id===t.id).staff.SC.interim);
});

test('the offseason carousel makes a funded outside offer that survives saving and can be countered once',async()=>{
 const e=await setup(976),u=e.universe,t=e.T('Chicago Metropolitan'),coach=t.staff.OC;
 u.phase='complete';
 e.offseasonReview();
 const offer=e.coordinatorRetentionOffers(t).find(x=>x.slot==='OC');
 assert.ok(offer,'a destination is chosen by the real carousel');
 assert.equal(t.staff.OC.id,coach.id,'the coach stays in position during negotiations');
 assert.notEqual(offer.fromId,offer.toId);
 const destination=e.teamById(offer.toId);
 assert.ok(offer.outside.salary<=e.teamStaffBudget(destination)-e.teamStaffSpend(destination)+destination.staff.OC.salary+.05);
 assert.match(e.coordinatorRetentionHTML(t),/Send Counter/);

 const portable=JSON.parse(JSON.stringify(e.packUniverse(u)));
 e.installSave({userTeam:t.name,universe:portable});
 const restored=e.T(t.name);
 assert.equal(e.coordinatorRetentionOffers(restored)[0].id,offer.id);
 const terms={salary:offer.askSalary,years:offer.outside.years,authority:offer.outside.authority};
 const valid=e.resolveCoordinatorRetention(offer.id,{...terms,salary:100});
 assert.equal(valid.ok,false);
 assert.equal(e.coordinatorRetentionOffers(restored).length,1,'an invalid amount leaves the option open');
 const result=e.resolveCoordinatorRetention(offer.id,terms);
 assert.ok(result.ok);
 assert.match(result.reason,/stays at/);
 assert.equal(restored.staff.OC.id,coach.id);
 assert.equal(restored.staff.OC.salary,offer.askSalary);
 assert.equal(restored.staff.OC.contractYears,offer.outside.years);
 assert.equal(e.universe.events.some(x=>x.type==='COACH_RELATIONSHIP_FALLOUT'&&x.coachIds.includes(coach.id)),false);
 assert.equal(e.resolveCoordinatorRetention(offer.id,terms).ok,false);
});

test('processing departures settles an open outside offer and applies relationship fallout',async()=>{
 const e=await setup(968),u=e.universe,t=e.T('Chicago Metropolitan'),coach=t.staff.RC;
 u.phase='complete';
 u.offseason=e.makeOffseasonState(u.year,'departures',['review'],{});
 const destination=u.teams.find(x=>x.id!==t.id&&e.teamStaffBudget(x)-e.teamStaffSpend(x)+x.staff.RC.salary>=coach.salary);
 const offer=e.openCoordinatorRetention(t,'RC',destination);
 assert.ok(offer);
 const p=t.roster[0];p.primaryRecruiterCoachId=coach.id;p.coachRelationships={[coach.id]:95};
 e.offseasonDepartures();
 assert.equal(u.offseason.phase,'signing');
 assert.equal(offer.status,'departed');
 assert.equal(destination.staff.RC.id,coach.id);
 assert.equal(destination.staff.RC.contractYears,offer.outside.years);
 assert.equal(p.coachDeparturePressure?.toSchoolId,destination.id);
 assert.ok(t.staff.RC.interim);
 assert.ok(u.openings.some(x=>x.schoolId===t.id&&x.slot==='RC'&&x.status==='OPEN'));
 assert.equal(coach.careerHistory.filter(x=>x.endSeason==null).length,1);
 e.offseasonDepartures();
 assert.equal(u.events.filter(x=>x.type==='COACH_MOVED'&&x.coachIds.includes(coach.id)).length,1);
});
