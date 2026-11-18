'use strict';
// Card upgrades: evolution branches gated by player development, install weeks, film wear on overused plays, and
// seasonal eras. Every edge is labeled and small.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet};
}

test('evolution branches unlock with the player who runs them',async()=>{
  const {CS}=await setup(941),EV=CS.evolution,pb=CS.packs.newPlaybook();
  pb.off.wrinkles.push('pa_boot');pb.mastery.pa_boot=99;
  const lineup={off:{QB:{name:'Young QB',traits:{composure:55}},Z:{name:'Wideout',traits:{technique:80}}},def:{}};
  const r=EV.ready(pb,{lineup}).find(x=>x.rootId==='pa_boot');
  assert.match(r.locks.pa_shot,/quarterback poise 7\+ \(Young QB is 5\)/);assert.equal(r.locks.pa_throwback,null);
  assert.throws(()=>EV.evolve(pb,'pa_boot','pa_shot',{lineup}),/poise/);
  lineup.off.QB.traits.composure=74;assert.equal(EV.ready(pb,{lineup}).find(x=>x.rootId==='pa_boot').locks.pa_shot,null);
  assert.equal(EV.ready(pb).find(x=>x.rootId==='pa_boot').locks.pa_shot,null,'the sandbox has no gates');
  EV.evolve(pb,'pa_boot','pa_shot',{lineup});assert.equal(pb.evolved.pa_boot,'pa_shot');
});

test('edges can target one play or a situation, and stay labeled',async()=>{
  const {CS}=await setup(942),Ro=CS.roster;
  const home=Ro.preset('ground');home.edges={off:[],def:[]};
  const away=Ro.preset('aerial');away.edges={off:[],def:[{play:'inside_zone',duel:'K',v:1,src:'Film test'},{when:'late',duel:'F',v:1,src:'Late test'}]};
  const b=CS.battle.simulate({home,away,seed:'edge-test'});
  const snaps=b.log.filter(x=>x.type==='snap'&&x.offSide==='home'&&x.duels);
  const mods=s=>s.duels.flatMap(d=>(d.mods||[]).map(m=>m.src));
  const iz=snaps.filter(s=>s.play==='inside_zone'),other=snaps.filter(s=>s.play!=='inside_zone');
  assert.ok(iz.length,'inside zone was called');
  assert.ok(iz.some(s=>mods(s).includes('Film test')),'film edge lands on inside zone');
  assert.ok(other.every(s=>!mods(s).includes('Film test')),'and nowhere else');
  const late=snaps.filter(s=>mods(s).includes('Late test'));
  assert.ok(late.length&&late.every(s=>s.sit.period>=4),'situational edges only in the 4th quarter');
});

test('install weeks add reps and clear film; overused plays draw a film edge at launch',async()=>{
  const {cg,u,CS}=await setup(943),pb=u.callSheet.playbook;
  const state=n=>({events:Array.from({length:n},()=>({team:'home',card:{play:'inside_zone'}}))});
  for(let i=0;i<3;i++)cg.noteUsage(state(12),'home');
  assert.deepEqual(cg.wornPlays().map(w=>w.id),['inside_zone']);
  const cfg=cg.launch(),opp=cfg.userSide==='home'?'away':'home';
  assert.ok(cfg.program[opp].extra.def.some(e=>e.play==='inside_zone'&&/Film on your Inside Zone/.test(e.src)));
  const team=CS.adapter.battleTeam(cfg[opp],null,cfg.program[opp]);
  assert.ok(team.edges.def.some(e=>/Film on your/.test(e.src)),'the film edge reaches the opponent');
  assert.equal(cg.setInstallFocus('inside_zone'),'inside_zone');const before=pb.mastery.inside_zone||0;
  cg.installWeek();assert.equal(pb.mastery.inside_zone,before+6);assert.deepEqual(cg.wornPlays(),[]);
  assert.equal(cg.setInstallFocus('not_a_card'),null);
});

test('each season has one era that applies to both teams',async()=>{
  const {cg,u}=await setup(944);
  const era=cg.eraFor(u.year);assert.deepEqual(cg.eraFor(u.year),era);
  const cfg=cg.launch();
  for(const side of ['home','away'])assert.ok([...cfg.program[side].era.off,...cfg.program[side].era.def].every(e=>e.src===era.name&&e.v===.5));
  const names=new Set(Array.from({length:20},(_,i)=>cg.eraFor(2000+i).name));assert.ok(names.size>=3,'eras rotate');
});

test('program card ids never collide with evolution branches',async()=>{
  const {CS}=await setup(945),ids=new Set(Object.entries(CS.evolution.TREE).flatMap(([root,b])=>[root,...b.map(x=>x[0])]));
  assert.deepEqual(CS.data.PROGRAM_CARDS.filter(id=>ids.has(id)),[]);
  for(const id of CS.data.PROGRAM_CARDS)assert.ok(!CS.packs.cardDef(id).evolvedFrom,id);
});

test('install suggestion: finish an evolution first, then reset film, then the furthest play; never sets the focus',async()=>{
  const EV=require('../forks/call-sheet/core/evolution');
  const row=(root,reps,need)=>({root,name:root.toUpperCase(),reps,need});
  assert.equal(EV.installSuggestion([]),null);assert.equal(EV.installSuggestion([row('a',60,60)]),null,'a ready play needs a choice, not reps');
  let t=EV.installSuggestion([row('far',50,100),row('near',56,60)],{perInstall:6});assert.equal(t.root,'near');assert.equal(t.reason,'finish');assert.match(t.text,/4 reps from evolving/);
  t=EV.installSuggestion([row('far',70,100),row('filmed',10,100)],{worn:[{id:'filmed'}],perInstall:6});assert.equal(t.root,'filmed');assert.equal(t.reason,'film');
  t=EV.installSuggestion([row('a',30,100),row('b',50,100)],{perInstall:6});assert.equal(t.root,'b');assert.equal(t.reason,'progress');
  const {cg,u}=await setup(951);const pb=u.callSheet.playbook;
  const root=Object.keys(EV.TREE).find(r=>[...pb.off.base,...pb.off.wrinkles].includes(r));assert.ok(root,'the default deck has an evolvable play');
  pb.mastery={...(pb.mastery||{}),[root]:EV.progress(pb,root).need-3};
  const tip=cg.installTip();assert.equal(tip.root,root);assert.equal(tip.reason,'finish');
  assert.match(cg.cardProgramHTML(),/Suggested install:/);assert.equal(u.callSheet.installFocus??null,null,'advice does not choose the install');
  cg.setInstallFocus(root);assert.doesNotMatch(cg.cardProgramHTML(),/Suggested install:/,'no suggestion once that play is chosen');
});
