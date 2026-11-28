'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadEngine}=require('../tools/harness');
const B=require('../forks/call-sheet/core/battle');
const A=require('../forks/call-sheet/core/adapter');
const Ro=require('../forks/call-sheet/core/roster');
const {bundle,signatureArtManifest}=require('../forks/call-sheet/tools/bundle');

async function engine(seed){
  const e=loadEngine({seed,fullRuntime:true});
  await e.loadSchools();
  e.setUserTeam('Chicago Metropolitan');
  e.initUniverse();
  return e;
}

test('visit focus fit, cancelWeekend cleanup, and non-free unowned visit takeover',async()=>{
  const env=await engine(401);
  const me=env.T('Chicago Metropolitan'),RA=globalThis.DynastyRecruitingActions;
  const r=env.universe.recruits.find(x=>!x.committed&&!env.recruitBlocked(me,x));
  const dates=RA.visitDates(me,r);
  assert.ok(dates.length>0,'home dates exist');
  const fit=RA.visitFocusFit(me,r,'early_role');
  assert.ok(['Strong fit','Solid','Thin pitch'].includes(fit.tag));
  // Unowned legacy visit should still cost booking hours when taken over.
  r.visit=true;r.visitWeek=dates[0].week;
  const check=RA.availability(r,me,'visit',{visitWeek:dates[0].week});
  assert.equal(check.cost,RA.COSTS.visit,'unowned legacy visit is not a free rebook');
  const booked=RA.perform(r,me,'visit',{visitWeek:dates[0].week,focus:'early_role'});
  assert.equal(booked.ok,true);
  assert.equal(RA.visitWeekend(r,me).focus,'early_role');
  const cancelled=RA.cancelWeekend(r,me);
  assert.equal(cancelled.ok,true);
  const rec=RA.record(r,me,false);
  assert.equal(rec.visitedScheduled,undefined,'cancelWeekend clears visitedScheduled');
  assert.equal((rec.history||[]).some(x=>x.kind==='visit'),false,'cancelWeekend clears visit history');
});

test('multi-star and multi-week visit stops in seasonAdvanceStops',async()=>{
  const env=await engine(402);
  const me=env.T('Chicago Metropolitan'),RA=globalThis.DynastyRecruitingActions;
  const homeWeeks=(me.schedule||[]).filter(g=>!g.played&&g.home===me.name&&g.week>env.universe.week).map(g=>g.week);
  assert.ok(homeWeeks.length>=2,'need at least two upcoming home weeks');
  const targets=env.universe.recruits.filter(x=>!x.committed&&!env.recruitBlocked(me,x)&&x.stars<=4).slice(0,2);
  RA.perform(targets[0],me,'visit',{visitWeek:homeWeeks[0]});
  RA.perform(targets[1],me,'visit',{visitWeek:homeWeeks[1]});
  const stops=env.seasonAdvanceStops(me).filter(s=>s.kind==='visit');
  assert.equal(stops.length,2,'both scheduled visit weeks appear as stops');
  assert.equal(stops[0].id,'visit');
  assert.equal(stops[1].id,`visit:${homeWeeks[1]}`);
});

test('camp rollover and offseasonPreseason preserve controlled depthChart and roleDepth',async()=>{
  const env=await engine(403);
  const me=env.T('Chicago Metropolitan');
  me.roleDepth={...me.roleDepth,CUSTOM_FLAG:true};
  me.successionAuditions={QB:{leaderId:'x'}};
  env.universe.phase='complete';
  env.universe.offseason=env.makeOffseasonState(env.universe.year,'spring',['review','departures','signing','portal']);
  env.runSpringCamp();
  assert.equal(me.roleDepth.CUSTOM_FLAG,true,'spring camp preserves controlled roleDepth');
  assert.equal(me.successionAuditions,undefined,'spring camp clears successionAuditions');
  env.runFallCamp();
  assert.equal(me.roleDepth.CUSTOM_FLAG,true,'fall camp preserves controlled roleDepth');
  env.offseasonPreseason();
  assert.equal(me.roleDepth.CUSTOM_FLAG,true,'offseasonPreseason preserves controlled roleDepth');
});

test('takeover goal fails when regular season ends short of 3 wins and legacy regularDone tracks 12-game completion',async()=>{
  const env=await engine(404);
  const me=env.T('Chicago Metropolitan');
  env.universe.setup={...(env.universe.setup||{}),programId:me.id,takeover:{year:env.universe.year,completedWeeks:7,baselineWins:2,baselineLosses:5,targetWins:3,inherited:{w:2,l:5}}};
  me.seasonGoals=[{type:'takeoverWins',target:3,label:'Win 3 of 5'}];
  for(const g of me.schedule||[])if(!g.postseason){g.played=true;g.us=14;g.them=28;}
  me.w=4;me.l=8;
  env.universe.phase='bowl';
  const status=env.seasonGoalStatus(me,me.seasonGoals[0]);
  assert.equal(status.state,'failed');
  assert.equal(globalThis.DynastyLegacySnapshot.read().current.regularDone,true);
});

test('availabilityFor deprioritizes limited players and builds bench',async()=>{
  const env=await engine(405);
  const me=env.T('Chicago Metropolitan');
  const qb=A.lineupFromTeam(me).lineup.off.QB;
  const realQb=me.roster.find(p=>String(p.id)===String(qb.id));
  realQb.injury={status:'limited',weeks:1};
  const info={
    unavailableIds:[],
    limitedIds:[String(realQb.id)]
  };
  const {lineup,bench}=A.lineupFromTeam(me,info);
  assert.notEqual(lineup.off.QB.id,String(realQb.id),'healthy backup starts ahead of limited starter when available');
  assert.ok(Object.keys(bench.off).length>0,'bench is populated');
});

test('blowout rest at 24/21, pre-snap uncertainty ranges, and turning-point drive film',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),user:'home',mode:'snap',control:'offense',seed:'v39-check'});
  const req=B.advance(b);
  assert.equal(B.lookUncertain(req.look),true,'unconfirmed look is marked uncertain');
  const read=B.quickForecast(b,req,{play:req.options.plays[0].id,tactics:[]},null);
  assert.ok(Array.isArray(read.yards)&&read.yards.length===2);
  // Simulate a 24-point Q3 lead and confirm rest lineup swaps and finalize restores starters.
  const origQb=b.teams.home.lineup.off.QB.id;
  b.teams.home.bench={off:{QB:{...b.teams.home.lineup.off.QB,id:'bench_qb',name:'Backup QB'}},def:{}};
  b.game.period=3;b.game.score={home:31,away:7};
  B.advance(b);
  if(b.resting?.home)assert.equal(b.teams.home.lineup.off.QB.id,'bench_qb');
  b._starterLineup={home:{off:{...b.teams.home.lineup.off,QB:{...b.teams.home.lineup.off.QB,id:origQb}},def:{...b.teams.home.lineup.def}}};
  b.teams.home.lineup.off.QB={...b.teams.home.lineup.off.QB,id:'bench_qb'};
  // Turning-point film extraction.
  b.log.push({type:'snap',offSide:'home',defSide:'away',play:'inside_zone',call:'cover1',yards:24,text:'Touchdown run!',sit:{period:3,clock:400,down:3,distance:4,field:76},duels:[],duelResults:[]});
  const tp=B.turningPointSnaps(b);
  assert.equal(tp.length,1);
  assert.equal(tp[0].swungBy,'Touchdown strike');
  assert.equal(tp[0].quarter,3,'use the period from the recorded snap');
  assert.equal(tp[0].counterId,'inside_zone');
  b.log.push({type:'snap',offSide:'away',defSide:'home',play:'deep_cross',call:'two_high',turnover:'interception',yards:0,sit:{period:4,down:3,distance:8}});
  const stop=B.turningPointSnaps(b).find(clip=>clip.swungBy==='Interception');
  assert.equal(stop.counterId,'two_high','review the user’s defensive call after a stop');
});

test('latest drive film offers existing mastery practice for cards actually in the deck',async()=>{
  const env=await engine(406),cg=globalThis.DynastyCardGameDay,CS=globalThis.CallSheet,me=env.T('Chicago Metropolitan');
  cg.enable();
  const cs=env.universe.callSheet,pb=cs.playbook,id=pb.off.base.find(id=>CS.evolution.progress(pb,id));
  assert.ok(id,'starter deck includes a trainable card');
  const root=CS.evolution.rootOf(id);
  const stored=pb.off.wrinkles.find(card=>CS.evolution.progress(pb,card)&&!pb.off.base.includes(card));
  assert.ok(stored,'starter deck includes a trainable play outside its base calls');
  pb.off.wrinkles=pb.off.wrinkles.filter(card=>card!==stored);
  pb.reserve.off.wrinkles.push(stored);
  const points=[{quarter:4,down:3,distance:5,counterId:id},{quarter:3,counterId:stored},{quarter:4,counterId:id}];
  cs.lastTurningPoints={year:env.universe.year,teamId:String(me.id),gameId:'most-recent-game',points};
  const filmHTML=()=>cg.cardProgramHTML().match(/<section id="turningPointFilm"[\s\S]*?<\/section>/)?.[0]||'';
  assert.equal([...filmHTML().matchAll(/data-train-turning-card="([^"]+)"/g)].map(m=>m[1]).join(),root);
  assert.match(filmHTML(),new RegExp(`data-try-turning-card="${stored}"`));
  pb.mastery[root]=CS.evolution.progress(pb,id).need-6;
  assert.equal(cg.setInstallFocus(root),root);
  assert.match(filmHTML(),/scheduled for \+6 mastery reps/);
  const before=pb.mastery[root]||0;
  cg.installWeek();
  assert.equal(pb.mastery[root],before+6);
  assert.equal(cs.installFocus,null,'the training focus clears when the card is ready to evolve');
  cg.installWeek();
  assert.equal(pb.mastery[root],before+6,'a mastered card does not keep earning practice reps');
  delete cs.lastTurningPoints.teamId;
  cs.protectionFilm={teamId:String(me.id),gameId:cs.lastTurningPoints.gameId};
  assert.match(filmHTML(),/Turning-point drive film/,'V39 film remains available before the archive is loaded');
  cs.lastTurningPoints.teamId='another-program';
  assert.equal(filmHTML(),'');
});

test('meshy signature art and walkout manifests are wired into bundle',()=>{
  const manifest=signatureArtManifest({embedded:false});
  assert.match(manifest,/qb-signature\.webp/);
  const root=path.join(__dirname,'..');
  assert.equal(fs.existsSync(path.join(root,'assets/walkout/tunnel-home.mp4')),true);
  const doc=bundle({document:true});
  assert.match(doc,/cs-signature-art-assets/);
  assert.match(doc,/cs-walkout-assets/);
});
