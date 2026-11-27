const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');

async function setup(seed,options={}){
 const e=loadEngine({seed,...options});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
 e.universe.weeklyDecisions=[];return {e,u:e.universe,t:e.T('Chicago Metropolitan')};
}

test('the coach desk creates at most three persistent decisions from real state',async()=>{
 const {e,u,t}=await setup(1401),starters=e.importantStarters(t);
 Object.assign(starters[0],{health:72,wear:74,injuryWeeks:0,redshirtActive:false});
 const rs=t.roster.find(p=>p.id!==starters[0].id);Object.assign(rs,{redshirtUsed:false,redshirtActive:false,eligibilityUsed:0});rs.stats.games=3;
 const concern=t.roster.find(p=>p.id!==starters[0].id&&p.id!==rs.id);Object.assign(concern,{role:'Development',morale:18,redshirtActive:false});
 u.recruits.slice(0,2).forEach((r,i)=>Object.assign(r,{targeted:true,committed:null,visitWeek:null,stars:5-i}));
 const made=e.ensureWeeklyDecisions(t);
 assert.equal(made.length,3);assert.equal(new Set(made.map(d=>d.type)).size,3);
 assert.deepEqual(e.ensureWeeklyDecisions(t).map(d=>d.id),made.map(d=>d.id),'rendering again must not duplicate choices');
});

test('injury choices alter availability and resolve into the event ledger',async()=>{
 const {e,u,t}=await setup(1402),p=e.importantStarters(t)[0];Object.assign(p,{health:70,wear:76,injuryWeeks:0,redshirtActive:false});
 const d=e.ensureWeeklyDecisions(t).find(x=>x.type==='INJURED_STARTER');assert.ok(d);
 assert.equal(e.resolveWeeklyDecision(d.id,'sit'),true);assert.equal(e.weeklyPlayerPlan(p).role,'sit');
 assert.ok(u.events.some(x=>x.type==='WEEKLY_DECISION_RESOLVED'&&x.metadata.decisionId===d.id));
});

test('redshirt choices disclose and respect an existing no-redshirt promise',async()=>{
 const {e,u,t}=await setup(1403),p=t.roster.find(x=>!e.importantStarters(t).includes(x));
 Object.assign(p,{redshirtUsed:false,redshirtActive:false,eligibilityUsed:0,promises:[{id:'PR_test',type:'NO_REDSHIRT',status:'ACTIVE',schoolId:t.id,firstSeason:u.year}]});p.stats.games=4;
 const d=e.ensureWeeklyDecisions(t).find(x=>x.type==='REDSHIRT_DECISION');assert.ok(d.summary.includes('No Redshirt'));
 assert.equal(d.options.find(x=>x.id==='continue').recommended,true);e.resolveWeeklyDecision(d.id,'preserve');assert.equal(p.redshirtActive,true);
});

test('playing-time and recruiting resolutions reuse rotation, promises and visits',async()=>{
 const a=await setup(1404),p=a.t.roster.find(x=>!a.e.importantStarters(a.t).includes(x));Object.assign(p,{role:'Development',morale:15,redshirtActive:false});
 let d=a.e.ensureWeeklyDecisions(a.t).find(x=>x.type==='PLAYING_TIME_CONCERN');assert.ok(d);a.e.resolveWeeklyDecision(d.id,'promise');assert.ok(p.promises.some(q=>q.type==='EARLY_ROLE'&&q.status==='ACTIVE'));
 const b=await setup(1405),pair=b.u.recruits.slice(0,2);pair.forEach(r=>Object.assign(r,{targeted:true,committed:null,visitWeek:null}));
 d=b.e.ensureWeeklyDecisions(b.t).find(x=>x.type==='RECRUITING_PRIORITY');assert.ok(d);const chosen=pair[0];b.e.resolveWeeklyDecision(d.id,`prioritize_${chosen.id}`);assert.ok(chosen.visitWeek);
});

test('simulating the whole season delegates cards instead of stopping the calendar',async()=>{
 const {e,u,t}=await setup(1406),p=e.importantStarters(t)[0];Object.assign(p,{health:70,wear:75,injuryWeeks:0,redshirtActive:false});
 assert.ok(e.ensureWeeklyDecisions(t).length);e.simSeason();assert.equal(u.phase,'confReady');
 assert.ok(u.weeklyDecisions.some(d=>d.selectedBy==='staff'));
 assert.ok(u.weeklyDecisions.every(d=>d.options.some(o=>o.id===d.resolvedOptionId)));
});

test('the next week follows up on saved medical and redshirt choices for this program',async()=>{
 const {e,u,t}=await setup(1422,{fullRuntime:true});
 u.week=2;
 const starter=e.importantStarters(t)[0],reserve=t.roster.find(p=>p.id!==starter.id);
 Object.assign(starter,{health:70,wear:76,injuryWeeks:0,redshirtActive:false});
 starter.stats.games=2;
 Object.assign(reserve,{redshirtUsed:false,redshirtActive:false,eligibilityUsed:0});
 reserve.stats.games=4;t.weeklyStaffInstructions={medical:'sit'};
 const choices=e.ensureWeeklyDecisions(t),medical=choices.find(d=>d.type==='INJURED_STARTER');
 const redshirt=choices.find(d=>d.type==='REDSHIRT_DECISION');
 u.weeklyDecisions=[medical,redshirt];
 assert.ok(e.resolveWeeklyDecision(redshirt.id,'continue'));
 assert.ok(e.delegateWeeklyDecisions(t));
 assert.equal(medical.resolvedOptionId,'sit');
 assert.equal(medical.appearancesAtDecision,2);
 assert.deepEqual(globalThis.__DL_TEST__.weeklyDecisionFollowUp(),[],'same-week choices are already on the desk');
 u.week++;reserve.stats.games=5;
 u.weeklyDecisions.push({...medical,id:'other-team',teamId:u.teams.find(x=>x.id!==t.id).id,priority:999});
 e.universe=JSON.parse(JSON.stringify(e.packUniverse(u)));e.normalizeUniverse();
 const before=JSON.stringify(e.universe),rows=globalThis.__DL_TEST__.weeklyDecisionFollowUp();
 assert.deepEqual(rows.map(({id,by,choice})=>({id,by,choice})),[
  {id:medical.id,by:'Staff',choice:'Sit'},{id:redshirt.id,by:'You',choice:'Continue playing'}
 ]);
 assert.equal(rows[0].outcome,'Season appearances held at 2.');
 assert.match(rows[1].outcome,/Past the four-game redshirt limit.*5 appearances/);
 assert.equal(JSON.stringify(e.universe),before,'rendering observations preserves the saved dynasty');
 e.universe.week++;
 assert.deepEqual(globalThis.__DL_TEST__.weeklyDecisionFollowUp(),[]);
});

test('a recruiting follow-up uses the actual chosen recruit and saved visit',async()=>{
 const {e,u,t}=await setup(1405,{fullRuntime:true}),pair=u.recruits.slice(0,2);
 pair.forEach(r=>Object.assign(r,{targeted:true,committed:null,visitWeek:null}));
 const decision=e.ensureWeeklyDecisions(t).find(d=>d.type==='RECRUITING_PRIORITY');
 const chosen=u.recruits.find(r=>r.id===decision.recruitIds[1]);
 assert.ok(e.resolveWeeklyDecision(decision.id,`prioritize_${chosen.id}`));
 const booked=chosen.visitWeek;
 assert.equal(decision.scheduledVisitWeek,booked);
 u.week++;
 chosen.visit=false;chosen.visitWeek=null;
 const row=()=>globalThis.__DL_TEST__.weeklyDecisionFollowUp().find(x=>x.id===decision.id);
 assert.equal(row().choice,`Prioritize ${chosen.name}`);
 assert.equal(row().outcome,`Visit booked for Week ${booked}.`);
 chosen.committed='Rival Program';
 assert.equal(row().outcome,'Now committed to Rival Program.');
});
