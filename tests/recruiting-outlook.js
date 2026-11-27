const test=require('node:test');
const assert=require('node:assert/strict');
const {rosterOutlook}=require('../recruiting-needs');
const {loadEngine}=require('../tools/harness');

test('outlook keeps projected roster, commitments and future watches separate',()=>{
 const snap={players:[{pos:'QB',year:'SR'},{pos:'QB',year:'JR'},{pos:'WR',year:'FR'}],committed:{QB:1},targeted:{QB:4},watched:{QB:5},departuresDone:false};
 const before=JSON.stringify(snap),rows=rosterOutlook(snap,{QB:3,WR:5});
 assert.deepEqual(rows[0],{pos:'QB',target:3,current:2,departing:1,returning:1,committed:1,targeted:4,watched:5,projected:2,gap:1});
 assert.equal(rows[1].gap,4);
 assert.equal(JSON.stringify(snap),before);
});

test('processed departures and enrolled commitments are not counted twice',()=>{
 const rows=rosterOutlook({players:[{pos:'QB',year:'SR'},{pos:'QB',year:'FR'}],committed:{QB:1},departuresDone:true,enrolled:true},{QB:3});
 assert.equal(rows[0].departing,0,'promoted seniors are already part of the next roster');
 assert.equal(rows[0].returning,2);
 assert.equal(rows[0].committed,0,'enrolled freshmen are already in the roster');
 assert.equal(rows[0].projected,2);
});

test('read-only bridge distinguishes current commitments and rising watches',async()=>{
 const e=loadEngine({seed:6031});await e.loadSchools();e.setUserTeam('Chicago Metropolitan');e.initUniverse('dynasty',{seed:'outlook'});
 const t=e.T('Chicago Metropolitan'),current=e.universe.recruits[0],future=e.universe.risingClass[0];
 current.pos='QB';current.committed=t.name;future.pos='QB';future.watch=true;
 const rng=JSON.stringify(e.packUniverse(e.universe).rng),snap=globalThis.DynastyRecruitingNeeds.snapshot();
 assert.equal(snap.year,2027);assert.equal(snap.committed.QB,1);assert.equal(snap.watched.QB,1);
 assert.equal(JSON.stringify(e.packUniverse(e.universe).rng),rng);
 e.universe.phase='complete';e.universe.offseason=e.makeOffseasonState(2027,'portal',['review','departures','signing']);
 const enrolled=globalThis.DynastyRecruitingNeeds.snapshot();
 assert.equal(enrolled.departuresDone,true);assert.equal(enrolled.enrolled,true);
 e.universe.offseason.year=2026;
 assert.equal(globalThis.DynastyRecruitingNeeds.snapshot().enrolled,false,'a prior class checkpoint does not mark the current class enrolled');
});

test('starter succession follows eligibility, available recruits and actual spring development',async()=>{
 const e=loadEngine({seed:6032,fullRuntime:true});await e.loadSchools();e.setUserTeam('Chicago Metropolitan');e.initUniverse('dynasty',{seed:'succession'});
 const u=e.universe,t=e.T('Chicago Metropolitan'),api=globalThis.DynastyRecruitingNeeds;
 const [starter,understudy]=t.roleDepth.QB1.map(id=>t.roster.find(p=>p.id===id));
 const redshirt=t.roster.find(p=>p.id===t.roleDepth.RB1[0]);
 for(const p of t.roster)Object.assign(p,{eligibilityUsed:0,redshirtActive:false,morale:100});
 Object.assign(starter,{eligibilityUsed:3,year:'SR'});
 Object.assign(redshirt,{eligibilityUsed:3,year:'SR',redshirtActive:true,redshirtUsed:false});
 understudy.trainingFocus='Technique';
 const [available,cut,pulled]=u.recruits.filter(r=>r.pos==='QB');
 for(const r of u.recruits)if(r.pos==='QB')r.interest=0;
 Object.assign(available,{interest:64,scout:82});
 Object.assign(cut,{interest:95,scout:95,funnel:{season:u.year,top5:['Another school']}});
 Object.assign(pulled,{interest:92,scout:95,pulledBy:[t.name]});
 const rng=JSON.stringify(e.packUniverse(u).rng),rows=api.snapshot({includeSuccession:true}).succession;
 assert.equal(JSON.stringify(e.packUniverse(u).rng),rng);
 assert.equal(rows.length,1,'a redshirted senior retains eligibility');
 assert.equal(rows[0].outgoing.id,starter.id);
 assert.equal(rows[0].understudy.id,understudy.id);
 assert.equal(rows[0].understudy.training,'Technique');
 assert.equal(rows[0].fallback.id,available.id);
 assert.equal(rows[0].fallback.read,e.recruitStaffVerdict(available,t).label);
 assert.equal(api.snapshot().succession,undefined);

 u.phase='complete';u.teams=[t];
 const roster={start:t.roster.length,eligibility:0,earlyDraft:0,portalOut:0,losses:[]};
 u.offseason=e.makeOffseasonState(u.year,'departures',['review'],{roster:{[t.id]:roster}});
 assert.equal(e.offseasonDepartures(),true);
 assert.deepEqual(e.packUniverse(u).offseason.reports.roster[t.id].succession,roster.succession);
 await e.runSpringCamp();
 const spring=api.snapshot({includeSuccession:true}).succession.find(row=>row.roleId==='QB1');
 const observed=u.developmentState.springReport.find(row=>row.id===spring.understudy.id);
 assert.equal(spring.outgoing.reason,'Eligibility exhausted');
 assert.equal(spring.outgoing.id,starter.id);
 assert.equal(spring.understudy.springDelta,observed.perceivedDelta);
 assert.equal(spring.fallback,null);
 delete roster.succession;
 assert.deepEqual(api.snapshot({includeSuccession:true}).succession,[],'older offseason receipts remain usable');
});
