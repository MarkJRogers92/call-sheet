// Call Sheet fork: card battles inside Dynasty Lab.
// Engine extension (runs inside the app closure). Three parts:
//   1. The save format for the card program (universe.callSheet), repaired and validated on every load.
//   2. The integration framework: small named integrations that hook into game day, finished games and the
//      weekly cycle. Each can be switched off in settings (callSheet.settings.integrations[id] = false).
//   3. "Coach with Cards" game day and card-simulated games, both recorded through recordV2GameLabResult.

// ================================================================ 1. save format
const CALL_SHEET_SAVE_VERSION=1;
function normalizeCardPlaybook(pb,maxSignatures=3){
  if(!pb||typeof pb!=='object')return null;
  const ids=(a,max)=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.length>0&&x.length<80).slice(0,max):[];
  const int=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Math.round(Number(v)))):d;
  const intMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,v])=>Number.isFinite(Number(v))).map(([k,v])=>[k,int(v,0,100000,0)]));
  const strMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,v])=>typeof v==='string'));
  const objs=(a,max)=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').slice(-max):[];
  const deck=d=>({base:ids(d?.base,4),wrinkles:ids(d?.wrinkles,40),tactics:ids(d?.tactics,40)});
  pb.off=deck(pb.off);pb.def=deck(pb.def);
  if(pb.off.base.length!==4||pb.def.base.length!==4)return null; // a call sheet must hold four base calls
  pb.capacity={wrinkles:int(pb.capacity?.wrinkles,10,30,14),tactics:int(pb.capacity?.tactics,10,30,14)};
  pb.legendaries=ids(pb.legendaries,20);pb.record={w:int(pb.record?.w,0,9999,0),l:int(pb.record?.l,0,9999,0)};
  pb.packsOpened=int(pb.packsOpened,0,99999,0);pb.gamesPlayed=int(pb.gamesPlayed,0,99999,0);
  if(pb.lastSignatureGame!==undefined)pb.lastSignatureGame=int(pb.lastSignatureGame,0,99999,0);
  pb.mastery=intMap(pb.mastery);pb.evolved=strMap(pb.evolved);pb.history=objs(pb.history,300);
  pb.signatures=objs(pb.signatures,maxSignatures).filter(x=>typeof x.playerId==='string'||typeof x.playerId==='number');pb.ringOfHonor=objs(pb.ringOfHonor,200);
  return pb;
}
function normalizeCallSheet(u){
  const cs=u?.callSheet;if(cs===undefined)return;
  if(!cs||typeof cs!=='object'||Array.isArray(cs)){delete u.callSheet;return}
  if(Number(cs.version)>CALL_SHEET_SAVE_VERSION)throw new Error('This dynasty’s card playbook needs a newer version of Call Sheet.');
  cs.version=CALL_SHEET_SAVE_VERSION;
  cs.playbook=normalizeCardPlaybook(cs.playbook);
  cs.combos=Array.isArray(cs.combos)?cs.combos.filter(x=>typeof x==='string').slice(0,20):[];
  const st=cs.settings&&typeof cs.settings==='object'?cs.settings:{};
  const integrations=Object.fromEntries(Object.entries(st.integrations&&typeof st.integrations==='object'?st.integrations:{}).filter(([k,v])=>typeof k==='string'&&typeof v==='boolean'));
  cs.settings={mode:['key','snap','sim'].includes(st.mode)?st.mode:'key',control:['offense','both','defense'].includes(st.control)?st.control:'offense',fast:!!st.fast,sound:st.sound!==false,integrations};
  cs.games=Number.isFinite(Number(cs.games))?Math.max(0,Math.min(99999,Math.round(Number(cs.games)))):0;cs.seenHelp=!!cs.seenHelp;
  // AI programs' playbooks, keyed by team id. Kept small: only programs you play, plus your rival.
  const ai={};for(const [id,pb] of Object.entries(cs.ai&&typeof cs.ai==='object'?cs.ai:{}).slice(0,40)){const n=normalizeCardPlaybook(pb,2);if(n)ai[id]=n}
  cs.ai=ai;
}

(function(){
  const CS=globalThis.CallSheet||{};
  const DEFAULT_SETTINGS={mode:'key',control:'offense',fast:false,sound:true,integrations:{}};
  function cardMeta(){
    universe.callSheet??={version:CALL_SHEET_SAVE_VERSION,playbook:null,combos:[],settings:{...DEFAULT_SETTINGS},games:0,seenHelp:false,ai:{}};
    universe.callSheet.ai??={};universe.callSheet.settings??={...DEFAULT_SETTINGS};universe.callSheet.settings.integrations??={};
    return universe.callSheet;
  }
  function userPlaybook(){const m=cardMeta();if(!m.playbook&&CS.packs)m.playbook=CS.packs.newPlaybook();return m.playbook}

  // ============================================================== 2. integration framework
  // An integration: {id, label, about, default:true, hooks:{launch, afterGame, weekTick}}.
  //   launch(ctx)    ctx = {cfg, g, home, away, me, opp, userSide}. Adjust the battle's launch config.
  //   afterGame(ctx) ctx = {b (the finished battle), userSide, me, opp, coached}. Feed results back.
  //   weekTick(ctx)  ctx = {week, year}. Runs after each simulated week.
  const INTEGRATIONS=[];
  function registerCardIntegration(x){if(!x?.id||INTEGRATIONS.some(i=>i.id===x.id))throw new Error(`Bad or duplicate card integration ${x?.id}`);INTEGRATIONS.push(x);return x}
  function integrationOn(x){const s=universe?.callSheet?.settings?.integrations?.[x.id];return s===undefined?x.default!==false:!!s}
  function runHook(name,ctx){
    for(const x of INTEGRATIONS){if(!x.hooks?.[name]||!integrationOn(x))continue;
      try{x.hooks[name](ctx)}catch(err){console.error(`Call Sheet integration "${x.id}" (${name}) failed:`,err)}}
    return ctx;
  }

  // Program edges: scheme fit (per side), this week's prep, home crowd, coordinator play-calling.
  registerCardIntegration({id:'program-edges',label:'Program edges',about:'Your schemes, weekly prep, home crowd and play-callers give labeled bonuses in the duels.',
    hooks:{launch(ctx){
      const info=(team,opp,home)=>{
        const fam=side=>{try{const f=schemeFamiliarity(team,side);return Number.isFinite(Number(f))?Number(f):100}catch(err){return 100}};
        const wp=team.weeklyPrep,prep=wp&&wp.opponent===opp.name&&wp.year===universe.year&&wp.week===universe.week?[...(wp.focuses||[])]:[];
        return{familiarity:{off:fam('off'),def:fam('def')},prep,home};
      };
      ctx.cfg.program={home:info(ctx.home,ctx.away,true),away:info(ctx.away,ctx.home,false)};
    }}});

  // Signature cards follow their players: graduates retire to the Ring of Honor, transfers take theirs along.
  function careerLine(c={}){
    const out=[];if(c.passYds)out.push(`${c.passYds} pass yds`);if(c.rushYds>99)out.push(`${c.rushYds} rush yds`);if(c.recYds>99)out.push(`${c.recYds} rec yds`);
    if(c.sacks)out.push(`${c.sacks} sacks`);if(c.intDef||c.int)out.push(`${c.intDef||c.int} INT`);if(!out.length&&c.tackles)out.push(`${c.tackles} tackles`);
    return out.slice(0,2).join(' · ');
  }
  function syncSignatures(meta,me){
    const pb=meta.playbook;if(!pb||!pb.signatures?.length)return[];
    const here=new Set((me.roster||[]).map(p=>String(p.id))),moves=[];
    pb.signatures=pb.signatures.filter(sg=>{
      const id=String(sg.playerId);if(here.has(id))return true;
      const arch=(universe.playerArchive||[]).find(x=>String(x.id)===id);
      if(arch){(pb.ringOfHonor??=[]).push({...sg,career:careerLine(arch.career),exit:arch.exitReason||'',year:arch.retiredYear||universe.year});moves.push({name:sg.name,how:'ring',exit:arch.exitReason||''})}
      else{const to=universe.teams.find(t=>t!==me&&(t.roster||[]).some(p=>String(p.id)===id));(pb.history??=[]).push({id:sg.id,kind:'departed',side:sg.side,to:to?.name||null});moves.push({name:sg.name,how:to?'transfer':'left',to:to?.name||null})}
      return false;
    });
    return moves;
  }
  registerCardIntegration({id:'signature-graduation',label:'Signature cards follow players',about:'Graduates’ signature cards retire to the Ring of Honor; transfers take theirs with them.',
    hooks:{launch(ctx){ctx.cfg.moves=syncSignatures(cardMeta(),ctx.me)}}});

  // Scouting fog: until your staff knows the opponent well, their players' ratings show as ranges.
  registerCardIntegration({id:'scouting-fog',label:'Scouting fog',about:'Opponent ratings show as ranges until your film confidence is high. Scouting sharpens them.',
    hooks:{launch(ctx){
      let confidence=70;try{const r=v0102WeeklyOpponentReport(ctx.me,ctx.opp);if(Number.isFinite(Number(r?.confidence)))confidence=Number(r.confidence)}catch(err){}
      ctx.cfg.scouting={confidence};
    }}});

  // Practice reps: this week's prep focus trains the matching cards toward evolution.
  const PRACTICE={pass_protection:['deep_cross','pa_boot'],run_blocking:['inside_zone','outside_zone','power'],explosive_pass:['deep_cross','pa_boot'],
    run_fits:['run_fit','cover3'],coverage:['two_high','cover1'],pressure:['zone_pressure','cover1']};
  const PRACTICE_REPS=5;
  function practiceReps(team,opp){
    const wp=team.weeklyPrep;if(!wp||wp.opponent!==opp.name||wp.year!==universe.year)return{};
    const out={};for(const f of wp.focuses||[])for(const root of PRACTICE[f]||[])out[root]=(out[root]||0)+PRACTICE_REPS;
    return out;
  }
  registerCardIntegration({id:'practice-reps',label:'Practice builds mastery',about:'Each week’s prep focus adds mastery reps to the matching cards.',
    hooks:{
      launch(ctx){ctx.cfg.practiceReps=practiceReps(ctx.me,ctx.opp)}, // a coached game: the battle adds them
      afterGame(ctx){if(ctx.coached)return;const pb=userPlaybook();for(const [root,n] of Object.entries(practiceReps(ctx.me,ctx.opp)))CS.evolution?.addReps(pb,root,n)}
    }});

  // AI playbooks: every program on your schedule (and your rival) builds a playbook through the season.
  function aiSpec(team){const c=CS.adapter.coachFromTeam(team);return{passRate:c.passRate,discipline:c.discipline}}
  function aiPlaybookFor(team){const m=cardMeta();return m.ai[team.id]??=CS.packs.newPlaybook()}
  function trackedPrograms(){
    const me=selected();if(!me)return[];
    const names=new Set((me.schedule||[]).map(g=>g.home===me.name?g.away:g.home));
    const rival=(me.protectedRivalIds||[])[0];
    return universe.teams.filter(t=>t!==me&&(names.has(t.name)||t.id===rival));
  }
  function takenLegendaries(exceptId){
    const m=cardMeta(),out=[...(m.playbook?.legendaries||[])];
    for(const [id,pb] of Object.entries(m.ai))if(String(id)!==String(exceptId))out.push(...(pb.legendaries||[]));
    return out;
  }
  function aiWeek(team){
    const pb=aiPlaybookFor(team),spec=aiSpec(team),games=(team.w||0)+(team.l||0),before=(pb.record.w||0)+(pb.record.l||0);
    if(games<=before)return null; // no new game this week
    const won=(team.w||0)>(pb.record.w||0);pb.record={w:team.w||0,l:team.l||0};
    const pack=CS.packs.openPack(pb,{won,seed:`ai:${universe.year}:${universe.week}:${team.id}`,worldTaken:takenLegendaries(team.id)});
    const news=[];
    if(pack.cards.length){
      const rng=DynastyRng.create(`aipick:${universe.year}:${universe.week}:${team.id}`);
      const pick=CS.world.aiPick(spec,pack,pb,rng);let over=CS.packs.applyPick(pb,pick).over,guard=0;
      while(over&&guard++<4){CS.world.aiCut(spec,pb,over);over=CS.packs.overCapacity(pb)}
      news.push({team:team.name,card:pick.id,rarity:pick.rarity});
    }
    for(const id of pb.off.base.concat(pb.def.base))CS.evolution.addReps(pb,CS.evolution.rootOf(id),4);
    const ready=CS.evolution.ready(pb)[0];
    if(ready){const [a,b]=ready.options,pick=CS.world.fit(spec,a)>=CS.world.fit(spec,b)?a:b;CS.evolution.evolve(pb,ready.rootId,pick);news.push({team:team.name,evolved:pick})}
    return news;
  }
  registerCardIntegration({id:'ai-playbooks',label:'Opponents build playbooks',about:'Programs on your schedule open packs, pick by identity and evolve cards every week, and play you with them.',
    hooks:{
      weekTick(ctx){ctx.news=(ctx.news||[]).concat(...trackedPrograms().map(aiWeek).filter(Boolean))},
      launch(ctx){const pb=cardMeta().ai[ctx.opp.id];if(pb)ctx.cfg.oppPlaybook=JSON.parse(JSON.stringify(pb))}
    }});

  // ============================================================== 3. game day and simulated games
  function cardGameBlocker(){
    if(!universe||!selected())return'Start or load a dynasty first.';
    if(universe.phase!=='regular')return'Card battles cover regular-season games for now. Bowls and playoffs use Classic Game Day.';
    const g=findUserGame();if(!g)return'There is no game for your program this week.';
    if(g.played)return'This week\'s game is already complete.';
    if(hasPendingCareerChoice())return'Choose your next job before playing this week.';
    if(hasPendingWeeklyDecisions())return'Resolve the Coach’s Desk decisions before playing this week.';
    if(universe.liveGameDay)return'A Classic Game Day is in progress. Finish it first.';
    return null;
  }
  function battleWeather(c){
    if(!c||c.roof==='dome')return'clear';
    if(Number(c.precip)>0)return Number(c.temp)<=34?'snow':'rain';
    if(Number(c.wind)>=16)return'wind';
    return'clear';
  }
  // Everything a battle needs for this week's game, from the dynasty, after every integration has had its say.
  function buildLaunch(){
    const g=findUserGame(),home=T(g.home),away=T(g.away),me=selected(),meta=cardMeta();
    const opp=home.name===me.name?away:home,conditions=globalThis.DynastyGameConditions?.forGame({home,year:universe.year,week:g.week})||null;
    const cfg={home,away,userSide:home.name===me.name?'home':'away',week:g.week,season:universe.year,
      label:`Week ${g.week} · ${g.conf?'Conference':'Non-conference'}`,record:{w:me.w||0,l:me.l||0},
      weather:battleWeather(conditions),conditions,rivalry:(me.protectedRivalIds||[]).includes(opp.id),
      playbook:meta.playbook,combos:meta.combos,settings:meta.settings,games:meta.games,seenHelp:meta.seenHelp,
      seed:`card:${universe.year}:${g.week}:${me.id}`,moves:[],practiceReps:{}};
    runHook('launch',{cfg,g,home,away,me,opp,userSide:cfg.userSide});
    if(cfg.moves.length)try{autosaveAfter('game')}catch(err){}
    return cfg;
  }
  // A simulated week: your coordinators play the card battle with your playbook, then it records like any game.
  function simulateCardGame(){
    const cfg=buildLaunch(),pb=userPlaybook(),AD=CS.adapter;
    CS.signatures.registerAll(pb);for(const p of Object.values(cardMeta().ai))CS.signatures.registerAll(p);
    const mine=CS.packs.decksOf(pb),theirs=cfg.oppPlaybook?CS.packs.decksOf(cfg.oppPlaybook):null;
    const team=(t,side)=>AD.battleTeam(t,side===cfg.userSide?mine:theirs,cfg.program?.[side]);
    const b=CS.battle.simulate({home:team(cfg.home,'home'),away:team(cfg.away,'away'),seed:`${cfg.seed}:sim`,weather:cfg.weather,conditions:cfg.conditions,rivalry:cfg.rivalry});
    return{cfg,b};
  }
  function simWithCardsOn(){return!!universe?.callSheet&&integrationOn(SIM_WITH_CARDS)&&!!globalThis.CallSheet?.battle}
  const SIM_WITH_CARDS=registerCardIntegration({id:'sim-with-cards',label:'Simulated games use your playbook',about:'When you sim your game, your coordinators play the card battle with your deck, evolutions and signature cards.',hooks:{}});
  const recordGameBase=recordV2GameLabResult;
  recordV2GameLabResult=function recordV2GameLabResultWithCards(options={}){
    let sim=null;
    if(!options.externalState&&simWithCardsOn()&&universe.phase==='regular'){
      const g=findUserGame();if(g&&!g.played){try{sim=simulateCardGame();options={...options,externalState:sim.b.game}}catch(err){console.error('Card simulation failed; using the standard simulation.',err);sim=null}}
    }
    const out=recordGameBase(options);
    if(sim&&out?.ok){
      const pb=userPlaybook(),me=selected(),opp=sim.cfg.userSide==='home'?sim.cfg.away:sim.cfg.home;
      CS.evolution.recordReps(pb,sim.b.log,sim.cfg.userSide);pb.gamesPlayed=(pb.gamesPlayed||0)+1;cardMeta().games++;
      runHook('afterGame',{b:sim.b,userSide:sim.cfg.userSide,me,opp,coached:false});
    }
    return out;
  };
  const simWeekBase=simWeek;
  simWeek=function simWeekWithCards(...args){
    // Your game first, as a card battle, under the same gate the week itself uses; the week then skips it.
    let cardResult=null;
    if(simWithCardsOn()&&universe.phase==='regular'){
      const gate=guidanceActionEligibility(args[0]===true?'simulate-season':'advance-week'),g=findUserGame();
      if(gate.allowed&&g&&!g.played&&!hasPendingCareerChoice()&&!universe.liveGameDay){
        try{cardResult=recordV2GameLabResult({advancingWeek:true}).result}catch(err){console.error('Card-simulated game was not recorded; the standard simulation will play it.',err)}
      }
    }
    const out=simWeekBase.apply(this,args);
    if(cardResult&&Array.isArray(universe.latest)&&!universe.latest.some(r=>r?.gameId===cardResult.gameId))universe.latest.unshift(cardResult);
    if(universe?.callSheet&&CS.packs)try{const ctx=runHook('weekTick',{week:universe.week,year:universe.year});universe.callSheet.lastWeekNews=ctx.news||[]}catch(err){console.error(err)}
    return out;
  };

  // The offseason: integrations can graduate, award and reset here (ctx = {year}).
  const runOffseasonBase=runOffseason;
  runOffseason=function runOffseasonWithCards(...args){
    const out=runOffseasonBase.apply(this,args);
    if(universe?.callSheet)try{runHook('offseason',{year:universe.year})}catch(err){console.error(err)}
    return out;
  };

  let host=null;
  globalThis.__callSheetDynasty={
    launch:buildLaunch,
    record(state){
      try{const out=recordGameBase({externalState:state});return{ok:true,result:out.result}}
      catch(err){console.error(err);return{ok:false,error:err.message||String(err)}}
    },
    save(data){
      Object.assign(cardMeta(),JSON.parse(JSON.stringify(data)));
      try{autosaveAfter('game')}catch(err){console.error(err)}
    },
    close(){
      host?.remove();host=null;document.body.classList.remove('cs-open');
      try{render()}catch(err){console.error(err)}
    }
  };
  function openCardGameDay(){
    const why=cardGameBlocker();if(why){setStatus(why);return}
    if(!globalThis.CallSheetBundle){setStatus('The card battle is unavailable in this build.');return}
    host=document.createElement('div');host.id='cardGameDay';host.setAttribute('role','dialog');host.setAttribute('aria-label','Call Sheet card battle');
    host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#07090f';
    const frame=document.createElement('iframe');frame.title='Call Sheet card battle';frame.style.cssText='width:100%;height:100%;border:0;display:block';
    frame.srcdoc=globalThis.CallSheetBundle;host.appendChild(frame);
    document.body.appendChild(host);document.body.classList.add('cs-open');frame.focus();
  }
  globalThis.DynastyCardGameDay={open:openCardGameDay,blocker:cardGameBlocker,weather:battleWeather,
    syncSignatures:()=>syncSignatures(cardMeta(),selected()),
    meta:()=>universe?.callSheet?JSON.parse(JSON.stringify(universe.callSheet)):null,
    integrations:()=>INTEGRATIONS.map(x=>({id:x.id,label:x.label,about:x.about,on:integrationOn(x)})),
    setIntegration(id,on){cardMeta().settings.integrations[id]=!!on},
    register:registerCardIntegration,launch:()=>buildLaunch(),enable:()=>{cardMeta();userPlaybook()}};
  document.addEventListener('click',e=>{if(e.target.closest('[data-coach-cards]'))openCardGameDay()});
})();
