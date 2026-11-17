// Call Sheet fork: card battles inside Dynasty Lab.
// Engine extension (runs inside the app closure). Three parts:
//   1. The save format for the card program (universe.callSheet), repaired and validated on every load.
//   2. The integration framework: small named integrations that hook into game day, finished games and the
//      weekly cycle. Each can be switched off in settings (callSheet.settings.integrations[id] = false).
//   3. "Coach with Cards" game day and card-simulated games, both recorded through recordV2GameLabResult.
//   4. The Card Program panel on This Week (Around the League news) and the Card Settings dialog.

// ================================================================ 1. save format
const CALL_SHEET_SAVE_VERSION=1;
function normalizeCardPlaybook(pb,maxSignatures=3){
  if(!pb||typeof pb!=='object'||Array.isArray(pb))return null;
  const CS=globalThis.CallSheet,D=CS?.data;
  const ids=(a,max)=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.length>0&&x.length<80).slice(0,max):[];
  const int=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Math.round(Number(v)))):d;
  const intMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,v])=>Number.isFinite(Number(v))).map(([k,v])=>[k,int(v,0,100000,0)]));
  const strMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([,v])=>typeof v==='string'));
  const objs=(a,max)=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').slice(-max):[];
  const legal=(id,side,tactic)=>{const table=tactic?D?.TACTICS:side==='off'?D?.PLAYS:D?.CALLS;return table&&Object.hasOwn(table,id)&&table[id].side===side&&!table[id].signature};
  const deck=(d,side)=>({base:ids(d?.base,4).filter(id=>legal(id,side,false)),wrinkles:ids(d?.wrinkles,40).filter(id=>legal(id,side,false)),tactics:ids(d?.tactics,40).filter(id=>legal(id,side,true))});
  pb.off=deck(pb.off,'off');pb.def=deck(pb.def,'def');
  if([pb.off,pb.def].some(d=>new Set(d.base).size!==4))return null; // invalid base sheets reset rather than crash on the next draw
  pb.reserve=Object.fromEntries(['off','def'].map(side=>[side,{wrinkles:ids(pb.reserve?.[side]?.wrinkles,500).filter(id=>legal(id,side,false)),tactics:ids(pb.reserve?.[side]?.tactics,500).filter(id=>legal(id,side,true))}]));
  pb.achievements=[...new Set(ids(pb.achievements,30))].filter(id=>CS.packs.ACHIEVEMENTS.some(a=>a.id===id));
  pb.capacity={wrinkles:int(pb.capacity?.wrinkles,10,30,14),tactics:int(pb.capacity?.tactics,10,30,14)};
  pb.legendaries=ids(pb.legendaries,20);pb.record={w:int(pb.record?.w,0,9999,0),l:int(pb.record?.l,0,9999,0)};
  pb.packsOpened=int(pb.packsOpened,0,99999,0);pb.gamesPlayed=int(pb.gamesPlayed,0,99999,0);
  if(pb.lastSignatureGame!==undefined)pb.lastSignatureGame=int(pb.lastSignatureGame,0,99999,0);
  if(pb.recordYear!==undefined)pb.recordYear=int(pb.recordYear,0,99999,0);
  pb.programCards=[...new Set(ids(pb.programCards,60))].filter(id=>CS.data?.PROGRAM_CARDS?.includes(id));pb.legacies=[...new Set(ids(pb.legacies,60))];
  pb.mastery=intMap(pb.mastery);pb.evolved=strMap(pb.evolved);pb.history=objs(pb.history,300);
  const validSignature=x=>{
    if(!CS?.signatures||!['string','number'].includes(typeof x.playerId)||x.id!==`${x.legacy?'leg':'sig'}_${x.playerId}`||(x.legacy&&(typeof x.legacy!=='object'||typeof x.legacy.name!=='string'||typeof x.legacy.last!=='string'))||typeof x.name!=='string'||typeof x.last!=='string')return false;
    if(!Object.hasOwn(D.OFF_ROLES,x.role)&&!Object.hasOwn(D.DEF_ROLES,x.role))return false;
    if(CS.signatures.templateFor({role:x.role,archetype:x.archetype})!==x.template)return false;
    const built=CS.signatures.build(x);return x.side===built.side&&x.pile===(built.kind==='tactic'?'tactics':'wrinkles');
  };pb.signatures=objs(pb.signatures,maxSignatures).filter(validSignature);pb.reserveSignatures=objs(pb.reserveSignatures,100).filter(validSignature);pb.ringOfHonor=objs(pb.ringOfHonor,200);
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
  cs.settings={mode:['key','series','snap','sim'].includes(st.mode)?st.mode:'key',control:['offense','both','defense'].includes(st.control)?st.control:'offense',replays:st.replays==='moments'?'moments':'all',fast:!!st.fast,sound:st.sound!==false,integrations};
  if(cs.activeBattle&&(typeof cs.activeBattle.seed!=='string'||typeof cs.activeBattle.battle!=='string'||cs.activeBattle.battle.length>4000000))cs.activeBattle=null;
  cs.games=Number.isFinite(Number(cs.games))?Math.max(0,Math.min(99999,Math.round(Number(cs.games)))):0;cs.seenHelp=!!cs.seenHelp;
  // AI programs' playbooks, keyed by team id. Kept small: only programs you play, plus your rival.
  const ai={};for(const [id,pb] of Object.entries(cs.ai&&typeof cs.ai==='object'?cs.ai:{}).slice(0,40)){const n=normalizeCardPlaybook(pb,2);if(n)ai[id]=n}
  cs.ai=ai;
  // Around the League: what other programs pulled and evolved, newest last, kept short.
  const txt=v=>typeof v==='string'?v.slice(0,80):undefined,num=v=>Number.isFinite(Number(v))?Math.round(Number(v)):undefined;
  cs.newsLog=(Array.isArray(cs.newsLog)?cs.newsLog:[]).filter(x=>x&&typeof x==='object'&&typeof x.team==='string'&&(typeof x.card==='string'||typeof x.evolved==='string'))
    .slice(-40).map(x=>Object.fromEntries(Object.entries({team:txt(x.team),card:txt(x.card),rarity:txt(x.rarity),evolved:txt(x.evolved),year:num(x.year),week:num(x.week)}).filter(([,v])=>v!==undefined)));
  // Card careers of your players: duels won and lost, highlight plays, card games, keyed by Dynasty Lab player id.
  const ci=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(1e6,Math.round(Number(v)))):0;
  cs.players=Object.fromEntries(Object.entries(cs.players&&typeof cs.players==='object'&&!Array.isArray(cs.players)?cs.players:{})
    .filter(([k,v])=>k.length<64&&v&&typeof v==='object').slice(-800).map(([k,v])=>[k,{w:ci(v.w),l:ci(v.l),big:ci(v.big),games:ci(v.games)}]));
  cs.moments=(Array.isArray(cs.moments)?cs.moments:[]).filter(x=>x&&typeof x==='object'&&typeof x.text==='string').slice(-60)
    .map(x=>({year:ci(x.year),week:ci(x.week),kind:typeof x.kind==='string'?x.kind.slice(0,20):'moment',text:x.text.slice(0,200),...(x.playerId!=null?{playerId:String(x.playerId).slice(0,64)}:{})}));
  // Earned reward packs (cards drawn when earned, never rerolled) and the keys that make each one once-only.
  const D=globalThis.CallSheet?.data;
  const anyCard=id=>typeof id==='string'&&!!(D?.PLAYS?.[id]||D?.CALLS?.[id]||D?.TACTICS?.[id])&&!(D.PLAYS[id]||D.CALLS[id]||D.TACTICS[id]).signature;
  cs.rewardPacks=(Array.isArray(cs.rewardPacks)?cs.rewardPacks:[]).filter(x=>x&&typeof x==='object'&&typeof x.key==='string').slice(-8)
    .map(x=>({key:x.key.slice(0,60),year:ci(x.year),type:typeof x.type==='string'?x.type.slice(0,20):'reward',title:typeof x.title==='string'?x.title.slice(0,60):'Reward Pack',subtitle:typeof x.subtitle==='string'?x.subtitle.slice(0,160):'',cards:(Array.isArray(x.cards)?x.cards:[]).filter(anyCard).slice(0,6)}))
    .filter(x=>x.cards.length);
  cs.rewardKeys=(Array.isArray(cs.rewardKeys)?cs.rewardKeys:[]).filter(k=>typeof k==='string').map(k=>k.slice(0,60)).slice(-60);
  cs.cardStreak=ci(cs.cardStreak);
  cs.lastWeekNews=(Array.isArray(cs.lastWeekNews)?cs.lastWeekNews:[]).filter(x=>x&&typeof x==='object'&&typeof x.team==='string').slice(0,60);
}

(function(){
  const CS=globalThis.CallSheet||{};
  const DEFAULT_SETTINGS={mode:'key',control:'offense',fast:false,sound:true,integrations:{}};
  function cardMeta(){
    universe.callSheet??={version:CALL_SHEET_SAVE_VERSION,playbook:null,combos:[],settings:{...DEFAULT_SETTINGS,integrations:{}},games:0,seenHelp:false,ai:{}};
    universe.callSheet.ai??={};universe.callSheet.newsLog??=[];universe.callSheet.players??={};universe.callSheet.moments??=[];universe.callSheet.settings??={...DEFAULT_SETTINGS,integrations:{}};universe.callSheet.settings.integrations??={};
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
      ctx.cfg.program={home:info(ctx.home,ctx.away,!ctx.cfg.neutral),away:info(ctx.away,ctx.home,false)};
    }}});

  // Signature cards follow their players: graduates retire to the Ring of Honor, transfers take theirs along.
  function careerLine(c={}){
    const out=[];if(c.passYds)out.push(`${c.passYds} pass yds`);if(c.rushYds>99)out.push(`${c.rushYds} rush yds`);if(c.recYds>99)out.push(`${c.recYds} rec yds`);
    if(c.sacks)out.push(`${c.sacks} sacks`);if(c.intDef||c.int)out.push(`${c.intDef||c.int} INT`);if(!out.length&&c.tackles)out.push(`${c.tackles} tackles`);
    return out.slice(0,2).join(' · ');
  }
  function syncSignatures(meta,me){
    if(!meta.playbook||!me)return[];
    const owners=new Map();for(const team of universe.teams)for(const p of team.roster||[])owners.set(String(p.id),{team,p});
    const books=[{team:me,pb:meta.playbook},...Object.entries(meta.ai||{}).map(([id,pb])=>({team:universe.teams.find(t=>String(t.id)===id),pb})).filter(x=>x.team&&x.team.id!==me.id)];
    const moves=[],seen=new Set(),lineups=new Map();
    const roleFor=(p,team,old)=>{let lu=lineups.get(team.id);if(!lu){lu=CS.adapter.lineupFromTeam(team).lineup;lineups.set(team.id,lu)}
      return [...Object.entries(lu.off),...Object.entries(lu.def)].find(([,bp])=>bp.id===String(p.id))?.[0]||old||Object.keys(CS.adapter.POS_FALLBACK).find(r=>CS.adapter.POS_FALLBACK[r][0]===p.pos)};
    for(const {team,pb} of books)for(const pile of ['signatures','reserveSignatures']){
      pb[pile]=(pb[pile]||[]).filter(sg=>{
        const id=String(sg.playerId),owner=owners.get(id);
        if(owner?.team.id===team.id){
          if(seen.has(id))return false;seen.add(id);
          const role=roleFor(owner.p,team,sg.role);if(role&&sg.role)Object.assign(sg,CS.signatures.specFor(CS.adapter.toBattlePlayer(owner.p,role),sg));return true;
        }
        if(owner){
          const target=owner.team.id===me.id?meta.playbook:aiPlaybookFor(owner.team),role=roleFor(owner.p,owner.team,sg.role);
          const incoming=role?CS.signatures.specFor(CS.adapter.toBattlePlayer(owner.p,role),sg):sg;
          target.signatures??=[];target.reserveSignatures??=[];
          if(![...target.signatures,...target.reserveSignatures].some(x=>String(x.playerId)===id)){
            (target.signatures.length<(owner.team.id===me.id?CS.signatures.SLOTS:2)?target.signatures:target.reserveSignatures).push(incoming);CS.signatures.register(incoming);
            (target.history??=[]).push({id:incoming.id,kind:'transfer-in',side:incoming.side,from:team.name});
          }
          (pb.history??=[]).push({id:sg.id,kind:'departed',side:sg.side,to:owner.team.name});
          if(team.id===me.id)moves.push({name:sg.name,how:'transfer',to:owner.team.name});
          if(owner.team.id===me.id)moves.push({name:sg.name,how:'arrived',from:team.name});
        }else if((universe.transferPortal||[]).some(x=>String(x.p?.id)===id)){
          // A portal entrant temporarily has no roster owner. Keep the signature until placement.
          return true;
        }else{
          const arch=(universe.playerArchive||[]).find(x=>String(x.id)===id);
          if(arch){if(!(pb.ringOfHonor||[]).some(x=>String(x.playerId)===id))(pb.ringOfHonor??=[]).push({...sg,career:careerLine(arch.career),exit:arch.exitReason||'',year:arch.retiredYear||universe.year});
            if(team.id===me.id)moves.push({name:sg.name,how:'ring',exit:arch.exitReason||''});
          }else{(pb.history??=[]).push({id:sg.id,kind:'departed',side:sg.side});if(team.id===me.id)moves.push({name:sg.name,how:'left'})}
        }
        return false;
      });
    }
    return moves;
  }
  registerCardIntegration({id:'signature-graduation',label:'Signature cards follow players',about:'Transfers bring their signatures to their new program; graduates retire to the Ring of Honor. Extra signatures stay in your collection.',
    hooks:{launch(ctx){ctx.cfg.moves=syncSignatures(cardMeta(),ctx.me)},weekTick(){syncSignatures(cardMeta(),selected())},offseason(){syncSignatures(cardMeta(),selected())}}});

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
    const wp=team.weeklyPrep;if(universe.phase!=='regular'||!wp||wp.opponent!==opp.name||wp.year!==universe.year||wp.week!==universe.week)return{};
    const out={};for(const f of wp.focuses||[])for(const root of PRACTICE[f]||[])out[root]=(out[root]||0)+PRACTICE_REPS;
    return out;
  }
  registerCardIntegration({id:'practice-reps',label:'Practice builds mastery',about:'Each week’s prep focus adds mastery reps to the matching cards.',
    hooks:{
      launch(ctx){ctx.cfg.practiceReps=practiceReps(ctx.me,ctx.opp)}, // a coached game: the battle adds them
      afterGame(ctx){if(ctx.coached)return;const pb=userPlaybook();for(const [root,n] of Object.entries(practiceReps(ctx.me,ctx.opp)))CS.evolution?.addReps(pb,root,n)}
    }});

  // The facilities rating is already earned through Dynasty Lab's building projects.
  const FACILITY_LINK=registerCardIntegration({id:'facility-playbook',label:'Facilities support the playbook',about:'Facilities 75 unlock 16 play/tactic slots; 90 unlock 18. Earned capacity stays unlocked.',
    hooks:{launch(ctx){syncProgramCapacity(ctx.me,userPlaybook());ctx.cfg.playbook=userPlaybook()},weekTick(){syncProgramCapacity(selected(),userPlaybook())},offseason(){syncProgramCapacity(selected(),userPlaybook())}}});
  function syncProgramCapacity(team,pb){if(team&&pb&&integrationOn(FACILITY_LINK))CS.program.syncCapacity(pb,team);return pb}
  function trainingFor(team,pb){
    const support={},roster=new Map((team.roster||[]).map(p=>[String(p.id),p])),lineup=CS.adapter.lineupFromTeam(team).lineup;
    for(const side of ['off','def'])for(const [role,bp] of Object.entries(lineup[side])){const p=roster.get(bp.id);if(p)support[role]=resolveDevelopmentCoaching(team,p).modifier}
    return CS.program.trainingRates(team,pb,support);
  }
  const STAFF_LINK=registerCardIntegration({id:'staff-mastery',label:'Coaches teach the playbook',about:'Coordinator development, coaching specialties and player relationships add up to 30% mastery on plays actually used.',
    hooks:{launch(ctx){ctx.cfg.trainingRates=trainingFor(ctx.me,userPlaybook())}}});
  const RECRUIT_LINK=registerCardIntegration({id:'playbook-recruiting',label:'Recruit with your playbook',about:'A recruit’s archetype strengths matching your active playbook add a small, visible contribution to the existing recruiting pitch.',hooks:{}});
  function playbookForTeam(team){const cs=universe?.callSheet;if(!cs)return null;return team.id===selected()?.id?cs.playbook:cs.ai?.[team.id]||null}
  function recruitingFit(team,recruit){
    const fit=CS.program.prospectFit(playbookForTeam(team),recruit);
    return{...fit,bonus:integrationOn(RECRUIT_LINK)?Math.round(Math.min(3,fit.bonus*(recruit.priority==='Scheme Fit'?1.2:1))*10)/10:0};
  }
  const pitchBreakdownBase=recruitPitchBreakdown;
  recruitPitchBreakdown=function recruitPitchWithPlaybook(team,recruit){
    const items=pitchBreakdownBase(team,recruit);if(!universe?.callSheet||!integrationOn(RECRUIT_LINK))return items;
    const fit=recruitingFit(team,recruit);if(fit.bonus>0)items.push(['Active playbook fit',fit.bonus]);return items;
  };

  // AI playbooks: every program on your schedule (and your rival) builds a playbook through the season.
  function aiSpec(team){const c=CS.adapter.coachFromTeam(team);return{passRate:c.passRate,discipline:c.discipline}}
  function aiPlaybookFor(team){const m=cardMeta(),pb=m.ai[team.id]??=CS.packs.newPlaybook();return syncProgramCapacity(team,pb)}
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
    const pb=aiPlaybookFor(team),spec=aiSpec(team),games=(team.w||0)+(team.l||0);
    let before=(pb.record.w||0)+(pb.record.l||0);
    // Old saves have no year stamp; a reset team record identifies their first new season.
    if((pb.recordYear!=null&&pb.recordYear!==universe.year)||games<before){pb.record={w:0,l:0};before=0}
    pb.recordYear=universe.year;
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
  // Postseason: the user's conference championship, bowl or playoff round, worked out exactly as the stage pairs it.
  const POST_PHASES=['confReady','bowlReady','playoffReady'];
  function postStageOf(label){return/National Championship/.test(label)?'title':/^(Round of 16|Quarterfinal|Semifinal)$/.test(label)?'playoff':/ Bowl$/.test(label)?'bowl':/ Championship$/.test(label)?'conference':null}
  function postGameFor(home,away,label,week){
    const me=selected();
    return{postseason:true,stage:postStageOf(label),label,week,home:home.name,away:away.name,homeId:home.id,awayId:away.id,conf:false,neutral:true,
      played:false,seed:`card:post:${universe.year}:${label}:${me.id}`};
  }
  function postseasonCardGame(){
    const me=selected();if(!me||!universe||!POST_PHASES.includes(universe.phase))return null;
    const mine=([a,b])=>a&&b&&(a.id===me.id||b.id===me.id);
    if(universe.phase==='confReady'){
      if(!allConfs().includes(me.conference))return null;const st=confStand(me.conference);
      return st.length>=2&&mine(st)?postGameFor(st[0],st[1],`${me.conference} Championship`,13):null;
    }
    if(universe.phase==='bowlReady'){
      const f=bowlField();for(let i=0;i+1<f.length;i+=2)if(mine([f[i],f[i+1]]))return postGameFor(f[i],f[i+1],bowlNameFor(i/2),13);
      return null;
    }
    const up=globalThis.DynastyGameEngineV2LabBridge?.playoffUpcoming?.();const pair=up?.pairs.find(mine);
    return pair?postGameFor(pair[0],pair[1],up.label,up.week):null;
  }
  // A postseason battle in progress (or finished, with its pack still to open) stays the current game until it closes.
  function openPostseasonBattle(){
    const cs=universe?.callSheet,pb=cs?.postseasonBattle;
    return pb&&pb.year===universe.year&&cs.activeBattle?.seed===pb.seed?pb:null;
  }
  function battleSeed(g){return g?.seed||`card:${universe.year}:${g?.week}:${selected().id}`}
  function currentCardGame(){
    const open=openPostseasonBattle();
    if(open){const home=teamById(open.homeId),away=teamById(open.awayId);if(home&&away)return{...postGameFor(home,away,open.label,open.week),played:universe.callSheet.recordedBattleSeed===open.seed}}
    if(universe&&POST_PHASES.includes(universe.phase))return postseasonCardGame();
    const next=findUserGame();if(next)return next;
    const me=selected(),key=universe?.callSheet?.activeBattle?.seed;
    return me&&key?(universe.schedule?.[universe.week]||[]).find(g=>(g.home===me.name||g.away===me.name)&&key===`card:${universe.year}:${g.week}:${me.id}`)||null:null;
  }
  function cardGameBlocker(){
    if(!universe||!selected())return'Start or load a dynasty first.';
    if(POST_PHASES.includes(universe.phase)||openPostseasonBattle()){
      const g=currentCardGame();
      if(!g)return universe.phase==='bowlReady'&&seedField().some(t=>t.id===selected().id)?'Your program is in the playoff. Sim the bowls to reach your first-round game.':'Your program has no postseason game to coach in this round.';
      if(hasPendingCareerChoice())return'Choose your next job before playing this game.';
      if(universe.liveGameDay)return'A Classic Game Day is in progress. Finish it first.';
      return null;
    }
    if(universe.phase!=='regular')return'There is no card game to coach right now.';
    const g=currentCardGame();if(!g)return'There is no game for your program this week.';
    if(g.played&&universe.callSheet?.activeBattle?.seed!==battleSeed(g))return'This week\'s game is already complete.';
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
    const g=currentCardGame(),home=T(g.home),away=T(g.away),me=selected(),meta=cardMeta(),seed=battleSeed(g);
    if(meta.activeBattle&&meta.activeBattle.seed!==seed)meta.activeBattle=null;
    if(g.postseason&&meta.postseasonBattle?.seed!==seed)meta.postseasonBattle={seed,year:universe.year,stage:g.stage,label:g.label,week:g.week,homeId:g.homeId,awayId:g.awayId};
    const opp=home.name===me.name?away:home,conditions=globalThis.DynastyGameConditions?.forGame({home,year:universe.year,week:g.week,...(g.neutral?{neutral:true}:{})})||null;
    const cfg={home,away,userSide:home.name===me.name?'home':'away',week:g.week,season:universe.year,neutral:!!g.neutral,stage:g.stage||null,
      label:g.postseason?g.label:`Week ${g.week} · ${g.conf?'Conference':'Non-conference'}`,record:{w:me.w||0,l:me.l||0},
      weather:battleWeather(conditions),conditions,rivalry:(me.protectedRivalIds||[]).includes(opp.id),
      activeBattle:meta.activeBattle?.seed===seed?meta.activeBattle:null,playbook:meta.playbook,combos:meta.combos,settings:meta.settings,games:meta.games,seenHelp:meta.seenHelp,
      seed,moves:[],practiceReps:{},worldTaken:takenLegendaries(),program:{home:{enabled:false},away:{enabled:false}}};
    runHook('launch',{cfg,g,home,away,me,opp,userSide:cfg.userSide});
    if(cfg.moves.length)try{autosaveAfter('game')}catch(err){}
    return cfg;
  }
  // A simulated week: your coordinators play the card battle with your playbook, then it records like any game.
  function simulateCardGame(cfg=buildLaunch()){
    const pb=userPlaybook(),AD=CS.adapter;
    CS.signatures.registerAll(pb);for(const p of Object.values(cardMeta().ai))CS.signatures.registerAll(p);
    const mine=CS.packs.decksOf(pb),theirs=cfg.oppPlaybook?CS.packs.decksOf(cfg.oppPlaybook):null;
    const team=(t,side)=>AD.battleTeam(t,side===cfg.userSide?mine:theirs,cfg.program?.[side]);
    const b=CS.battle.simulate({home:team(cfg.home,'home'),away:team(cfg.away,'away'),seed:`${cfg.seed}:sim`,weather:cfg.weather,conditions:cfg.conditions,rivalry:cfg.rivalry});
    return{cfg,b};
  }
  function simWithCardsOn(){return!!universe?.callSheet&&integrationOn(SIM_WITH_CARDS)&&!!globalThis.CallSheet?.battle}
  const SIM_WITH_CARDS=registerCardIntegration({id:'sim-with-cards',label:'Simulated games use your playbook',about:'Coordinators use your deck, evolutions and signatures in regular-season and postseason games, with mastery and card rewards.',hooks:{}});
  // Card careers: every duel your players win or lose, and their highlight plays, from both coached and simulated games.
  function addCardCareer(tally,week){
    const me=selected();if(!me||!tally||typeof tally!=='object')return;
    const meta=cardMeta(),mine=new Set((me.roster||[]).map(p=>String(p.id))),book=meta.players,ours=[];
    for(const [id,t] of Object.entries(tally)){if(!mine.has(String(id)))continue;ours.push([id,t]);
      const r=book[id]??={w:0,l:0,big:0,games:0};r.w+=t.w|0;r.l+=t.l|0;r.big+=t.big|0;r.games++}
    // Moments for the newsletter: the card Player of the Game and anyone with two or more highlight plays.
    if(week==null)return;const year=universe.year,add=m=>meta.moments.push({year,week,...m});
    const pog=ours.filter(([,t])=>t.w>=6).sort((a,b)=>(b[1].w-b[1].l)-(a[1].w-a[1].l)||b[1].big-a[1].big)[0];
    if(pog)add({kind:'pog',playerId:pog[0],text:`Card Player of the Game: ${pog[1].name} won ${pog[1].w} of ${pog[1].w+pog[1].l} duels${pog[1].big?` and made ${pog[1].big} highlight play${pog[1].big>1?'s':''}`:''}.`});
    for(const [id,t] of ours)if(t.big>=2&&(!pog||pog[0]!==id))add({kind:'big',playerId:id,text:`${t.name} made ${t.big} highlight plays.`});
    meta.moments=meta.moments.slice(-60);
  }
  const recordGameBase=recordV2GameLabResult;
  recordV2GameLabResult=function recordV2GameLabResultWithCards(options={}){
    let sim=null;
    if(!options.externalState&&simWithCardsOn()&&universe.phase==='regular'){
      const g=findUserGame();if(g&&!g.played){try{sim=simulateCardGame();sim.week=g.week;sim.ranks=rankSnapshot(sim.cfg.userSide==='home'?sim.cfg.away:sim.cfg.home);options={...options,externalState:sim.b.game}}catch(err){console.error('Card simulation failed; using the standard simulation.',err);sim=null}}
    }
    const out=recordGameBase(options);
    if(sim&&out?.ok){completeSimCardGame(sim);if(!options.advancingWeek)try{autosaveAfter('game')}catch(err){console.error(err)}}
    return out;
  };
  function completeSimCardGame(sim){
      const pb=userPlaybook(),breakout=CS.signatures.candidate(sim.b,sim.cfg.userSide,pb),me=selected(),opp=sim.cfg.userSide==='home'?sim.cfg.away:sim.cfg.home;
      CS.evolution.recordReps(pb,sim.b.log,sim.cfg.userSide,sim.cfg.trainingRates||{});pb.gamesPlayed=(pb.gamesPlayed||0)+1;cardMeta().games++;
      const won=sim.b.game.score[sim.cfg.userSide]>sim.b.game.score[sim.cfg.userSide==='home'?'away':'home'];pb.record[won?'w':'l']++;
      CS.packs.awardAchievements(pb,sim.b,sim.cfg.userSide);
      // Sim delegates the pick to the same scheme-aware coordinator used by AI programs.
      const pack=CS.packs.openPack(pb,{won,rivalry:sim.cfg.rivalry,stage:sim.cfg.stage||null,seed:sim.cfg.seed,oppTendency:sim.b.tend[sim.cfg.userSide==='home'?'away':'home'],worldTaken:takenLegendaries()});
      let picked=null;if(pack.cards.length){const spec=aiSpec(me),pick=CS.world.aiPick(spec,pack,pb,DynastyRng.create(`${sim.cfg.seed}:pick`));picked=pick;CS.packs.applyPick(pb,pick);
        for(let over=CS.packs.overCapacity(pb);over;over=CS.packs.overCapacity(pb))CS.world.aiCut(spec,pb,over)}
      if(breakout){const sg=CS.signatures.specFor(breakout.p,{season:universe.year,earned:sim.cfg.label});if(pb.signatures.length<CS.signatures.SLOTS)CS.signatures.add(pb,sg);else{(pb.reserveSignatures??=[]).push(sg);pb.lastSignatureGame=pb.gamesPlayed;CS.signatures.register(sg)}}
      (cardMeta().moments??=[]).push({year:universe.year,week:sim.week,kind:'reward',text:`${sim.cfg.label}: ${pack.title}${picked?' — '+(CS.packs.cardDef(picked.id)?.name||picked.id)+' added to the collection':''}.`});
      try{addCardCareer(CS.battle.duelTally(sim.b),sim.week)}catch(err){console.error(err)}
      {const us=sim.b.game.score[sim.cfg.userSide],them=sim.b.game.score[sim.cfg.userSide==='home'?'away':'home'];programAwards({won,us,them,postseason:!!sim.postseason,ranks:sim.ranks,oppName:opp?.name})}
      runHook('afterGame',{b:sim.b,userSide:sim.cfg.userSide,me,opp,coached:false});
  }
  const simWeekBase=simWeek;
  simWeek=function simWeekWithCards(...args){
    const active=universe?.callSheet?.activeBattle,g=currentCardGame();
    if(active&&g&&active.seed===`card:${universe.year}:${g.week}:${selected().id}`){setStatus('Resume your card battle and finish its rewards before advancing the week.');return}
    // Your game first, as a card battle, under the same gate the week itself uses; the week then skips it.
    let cardResult=null;
    if(simWithCardsOn()&&universe.phase==='regular'){
      const gate=guidanceActionEligibility(args[0]===true?'simulate-season':'advance-week'),g=findUserGame();
      if(gate.allowed&&g&&!g.played&&!hasPendingCareerChoice()&&!universe.liveGameDay){
        try{cardResult=recordV2GameLabResult({advancingWeek:true}).result}catch(err){console.error('Card-simulated game was not recorded; the standard simulation will play it.',err)}
      }
    }
    const beforeWeek=universe.week,beforePhase=universe.phase,playedWeek=beforeWeek+1,playedYear=universe.year; // universe.week counts weeks completed; the schedule numbers from 1
    const out=simWeekBase.apply(this,args);
    if(cardResult&&Array.isArray(universe.latest)&&!universe.latest.some(r=>r?.gameId===cardResult.gameId))universe.latest.unshift(cardResult);
    const advanced=universe&&(universe.week!==beforeWeek||universe.year!==playedYear||universe.phase!==beforePhase);
    if(advanced&&universe.callSheet&&CS.packs)try{const ctx=runHook('weekTick',{week:playedWeek,year:playedYear});const cs=universe.callSheet;cs.lastWeekNews=ctx.news||[];cs.newsLog=(cs.newsLog||[]).concat(cs.lastWeekNews.map(n=>({...n,year:ctx.year,week:ctx.week}))).slice(-40);autosaveAfter('week')}catch(err){console.error(err)}
    try{paintCardProgram()}catch(err){console.error(err)}
    return out;
  };

  if(typeof v2PostseasonRecordMatch==='function'){
    const postseasonRecordBase=v2PostseasonRecordMatch;
    v2PostseasonRecordMatch=function postseasonWithCards(home,away,options={}){
      if(!simWithCardsOn()||!v2PostseasonUserMatch(home,away)||options.externalState)return postseasonRecordBase(home,away,options);
      const snapshot=v2PostseasonStageCapture();
      try{
      const me=selected(),userSide=home.id===me.id?'home':'away',opp=userSide==='home'?away:home,week=options.week??13;
      const conditions=globalThis.DynastyGameConditions?.forGame({home,year:universe.year,week,neutral:options.neutral!==false})||null;
      const cfg={home,away,userSide,week,season:universe.year,label:options.label||'Postseason',neutral:options.neutral!==false,stage:postStageOf(options.label||''),
        seed:`card:post:${universe.year}:${week}:${options.label||'post'}:${home.id}:${away.id}`,weather:battleWeather(conditions),conditions,
        playbook:userPlaybook(),practiceReps:{},moves:[],program:{home:{enabled:false},away:{enabled:false}},rivalry:(me.protectedRivalIds||[]).includes(opp.id)};
      runHook('launch',{cfg,g:{week},home,away,me,opp,userSide});
      const sim=simulateCardGame(cfg);sim.week=week;sim.postseason=true;sim.ranks=rankSnapshot(opp);
      const out=postseasonRecordBase(home,away,{...options,externalState:sim.b.game});
      if(out?.ok){completeSimCardGame(sim);out.record.cardBattle=true}return out;
      }catch(err){v2PostseasonStageRestore(snapshot);throw err}
    };
    if(globalThis.__DL_TEST__)globalThis.__DL_TEST__.v2PostseasonRecordMatch=v2PostseasonRecordMatch;
  }

  // Coached postseason games. The finished battle's final state waits in callSheet.pendingPostseason; the stage itself then
  // runs through Dynasty Lab's transactional postseason path and records that state for the user's game in place of a
  // simulation. Card careers and the recorded flag are written inside the same transaction, so a rollback undoes them too
  // and the in-battle rewards (granted only after a successful record) can never be paid twice.
  if(typeof v2PostseasonExternalFor!=='undefined'){
    v2PostseasonExternalFor=function coachedPostseasonGame(home,away,options){
      const p=universe?.callSheet?.pendingPostseason;
      if(!p||p.year!==universe.year||p.label!==options.label||String(p.homeId)!==String(home.id)||String(p.awayId)!==String(away.id))return null;
      if(options.peek)return{state:true};
      return{state:JSON.parse(JSON.stringify(p.state)),onRecorded(out){
        const meta=cardMeta();if(out?.record){out.record.cardBattle=true;out.record.cardCoached=true}
        try{addCardCareer(p.tally,options.week)}catch(err){console.error(err)}
        const side=String(home.id)===String(selected().id)?'home':'away',us=Number(p.state?.score?.[side])||0,them=Number(p.state?.score?.[side==='home'?'away':'home'])||0;
        programAwards({won:us>them,us,them,postseason:true,ranks:p.ranks,oppName:p.oppName});
        meta.recordedBattleSeed=p.seed;meta.lastPostseasonGameId=out?.result?.gameId||out?.record?.id||null;delete meta.pendingPostseason;
      }};
    };
    const STAGE_RUN={conference:()=>simConferenceChampionships(),bowl:()=>simBowls(),playoff:()=>simPlayoff(),title:()=>simPlayoff()};
    function recordPostseasonBattle(g,state,tally,key){
      const seed=key||g.seed;
      const oppTeam=teamById(String(g.homeId)===String(selected().id)?g.awayId:g.homeId);
      cardMeta().pendingPostseason={seed,year:universe.year,label:g.label,homeId:g.homeId,awayId:g.awayId,ranks:rankSnapshot(oppTeam),oppName:oppTeam?.name||'',state:JSON.parse(JSON.stringify(state)),tally:tally&&typeof tally==='object'?JSON.parse(JSON.stringify(tally)):{}};
      v2PostseasonLastError=null;v2PostseasonPauseForUser=true;
      try{STAGE_RUN[g.stage]?.()}catch(err){console.error(err);v2PostseasonLastError=err}finally{v2PostseasonPauseForUser=false}
      const meta=cardMeta(); // a rolled-back stage replaces the universe object
      if(meta.recordedBattleSeed===seed){try{paintCardProgram()}catch(err){}return{ok:true,result:{gameId:meta.lastPostseasonGameId||null}}}
      return{ok:false,error:v2PostseasonLastError?.message||`The ${g.label} could not be recorded.`};
    }
    // While a postseason card battle is open, the stage waits for it: the battle records the user's game itself.
    const guardStage=(base,what,empty)=>function(...args){
      if(!v2PostseasonPauseForUser&&openPostseasonBattle()){setStatus(`Resume your card battle and finish its rewards before simulating the ${what}.`);return empty}
      return base.apply(this,args);
    };
    simConferenceChampionships=guardStage(simConferenceChampionships,'conference championships',undefined);
    simBowls=guardStage(simBowls,'bowls',[]);
    simPlayoff=guardStage(simPlayoff,'playoff',undefined);
    globalThis.__callSheetPostseason={game:()=>currentCardGame(),record:recordPostseasonBattle};
  }

  // The offseason: integrations can graduate, award and reset here (ctx = {year}).
  const runOffseasonBase=runOffseason;
  runOffseason=function runOffseasonWithCards(...args){
    const out=runOffseasonBase.apply(this,args);
    if(universe?.callSheet)try{runHook('offseason',{year:universe.year})}catch(err){console.error(err)}
    return out;
  };

  // ============================================================== 5. more ways to earn cards
  // Signing day and booster packs, coaching-tree cards, upset and milestone trick cards, Legacy signatures.
  // Everything here reads Dynasty Lab's own records (commitments, staff, fan support, rankings, retired numbers).
  const PROGRAM_REWARDS=registerCardIntegration({id:'program-cards',label:'Earn cards from your program',
    about:'Signing day and booster packs, coaching-tree cards from your coordinators, upset and milestone trick cards, and Legacy signatures for retired numbers.',
    hooks:{weekTick(ctx){boosterPack(ctx.year,ctx.week);schemeCards()},offseason(){schemeCards();signingPack();legacyCards()}}});
  const programRewardsOn=()=>!!universe?.callSheet&&integrationOn(PROGRAM_REWARDS);
  function rewardMoment(text){const meta=cardMeta();meta.moments.push({year:universe.year,week:universe.week|0,kind:'reward',text:text.slice(0,200)});meta.moments=meta.moments.slice(-60)}
  // Once-only program cards (tracked in pb.programCards).
  function grantProgramCard(id,why){
    const pb=userPlaybook();pb.programCards??=[];if(pb.programCards.includes(id))return false;
    CS.packs.grantCard(pb,id,{kind:'program',why});pb.programCards.push(id);
    rewardMoment(`${CS.packs.cardDef(id).name} added to your collection: ${why}.`);return true;
  }
  // Packs to open from the Card Program panel. One per key, ever.
  function queueRewardPack(key,pack){
    const meta=cardMeta();meta.rewardPacks??=[];meta.rewardKeys??=[];
    if(meta.rewardKeys.includes(key)||!pack.cards.length)return false;
    meta.rewardKeys.push(key);meta.rewardKeys=meta.rewardKeys.slice(-60);
    meta.rewardPacks.push({key,year:universe.year,type:pack.type,title:pack.title,subtitle:pack.subtitle,cards:pack.cards});meta.rewardPacks=meta.rewardPacks.slice(-8);
    rewardMoment(`${pack.title} earned. Open it from the Card Program.`);return true;
  }
  function schemeWeights(team){
    const o=typeof OFF_SCHEMES!=='undefined'?OFF_SCHEMES[team.offScheme]:null,d=typeof DEF_SCHEMES!=='undefined'?DEF_SCHEMES[team.defScheme]:null,w={};
    if(o){if(o.pass>=.55){w.quick=1;w.deep=1}else{w.run=1.5;w.constraint=.5}}
    if(d){if(d.pressure>=80)w.pressure=1.5;if(d.coverage>=85){w.man=(w.man||0)+1;w.zone=(w.zone||0)+1}if(d.run>=85)w.pressure=(w.pressure||0)+.5}
    return w;
  }
  function boosterPack(year,week){
    const me=selected();if(!programRewardsOn()||!me||week<6||universe.phase!=='regular')return;
    const fan=Math.round(Number(me.fan_support)||60),n=fan>=70?4:3,bonusRare=fan>=85?.15:fan>=70?.06:0;
    const pack=CS.packs.rewardPack(userPlaybook(),{seed:`booster:${year}:${me.id}`,weights:schemeWeights(me),n,bonusRare,worldTaken:takenLegendaries(),type:'booster',title:'Booster Pack',
      subtitle:`Fan support ${fan}: ${fan>=85?'the boosters went big':fan>=70?'a solid booster drive':'a modest booster drive'} · pick 1 of ${n}`});
    queueRewardPack(`booster:${year}`,pack);
  }
  const POS_WEIGHTS={QB:{quick:1,deep:1,offTactic:.5},WR:{quick:1,deep:1},TE:{quick:.7,constraint:.7},RB:{run:1.2,constraint:.6},OT:{run:.8,offTactic:.6},OG:{run:1,offTactic:.4},C:{run:.8,offTactic:.6},
    EDGE:{pressure:1.2,defTactic:.3},DT:{pressure:1,defTactic:.3},LB:{pressure:.6,man:.6,defTactic:.3},CB:{man:1,zone:.6},S:{zone:1,man:.5}};
  function signingPack(){
    const me=selected();if(!programRewardsOn()||!me)return;
    const signees=(me.roster||[]).filter(p=>String(p.recruitment?.schoolId)===String(me.id)&&Number(p.recruitment?.season)>=universe.year-1);
    if(!signees.length)return;
    const season=Math.max(...signees.map(p=>Number(p.recruitment.season))),cls=signees.filter(p=>Number(p.recruitment.season)===season),w={},count={};
    for(const p of cls){count[p.pos]=(count[p.pos]||0)+1;for(const [k,v] of Object.entries(POS_WEIGHTS[p.pos]||{}))w[k]=(w[k]||0)+v}
    const top=Object.entries(count).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([pos,n])=>`${n} ${pos}`).join(', ');
    const pack=CS.packs.rewardPack(userPlaybook(),{seed:`signing:${season}:${me.id}`,weights:w,n:4,bonusRare:Math.min(.12,cls.length/150),worldTaken:takenLegendaries(),type:'signing',title:'Signing Day Pack',
      subtitle:`Built around your ${cls.length} signee${cls.length===1?'':'s'} (${top}) · pick 1 of 4`});
    queueRewardPack(`signing:${season}`,pack);
  }
  function schemeCards(){
    const me=selected();if(!programRewardsOn()||!me?.staff)return;
    for(const role of ['OC','DC']){const c=me.staff[role],id=CS.data.SCHEME_CARDS?.[c?.preferredScheme];
      if(id)grantProgramCard(id,`${c.name||'Your coordinator'} brought it from his ${c.preferredScheme} background`)}
  }
  // A retired number passes a fainter Legacy signature to the current starter at that position (public depth chart).
  function legacyCards(){
    const me=selected();if(!programRewardsOn()||!me)return;
    const pb=userPlaybook();pb.legacies??=[];
    const lu=CS.adapter.lineupFromTeam(me).lineup,carded=new Set([...(pb.signatures||[]),...(pb.reserveSignatures||[])].map(x=>String(x.playerId)));
    for(const entry of me.retiredNumbers||[]){
      const legendId=String(entry.playerId);if(pb.legacies.includes(legendId))continue;
      const slot=[...Object.entries(lu.off),...Object.entries(lu.def)].find(([,bp])=>bp.pos===entry.pos&&!carded.has(String(bp.id))&&String(bp.id)!==legendId);
      const heir=slot&&(me.roster||[]).find(p=>String(p.id)===String(slot[1].id));if(!heir)continue;
      const legacy={playerId:legendId,name:String(entry.name||'a legend').slice(0,60),last:CS.signatures.lastName(entry.name||'Legend'),number:entry.number??null};
      const spec=CS.signatures.specFor(CS.adapter.toBattlePlayer(heir,slot[0]),{legacy,earned:`Legacy of #${entry.number??''} ${legacy.last}`,season:universe.year});
      pb.signatures??=[];pb.reserveSignatures??=[];
      (pb.signatures.length<CS.signatures.SLOTS?pb.signatures:pb.reserveSignatures).push(spec);CS.signatures.register(spec);
      (pb.history??=[]).push({id:spec.id,kind:'legacy',side:spec.side});pb.legacies.push(legendId);carded.add(String(heir.id));
      rewardMoment(`${heir.name} inherits the legacy of #${entry.number??''} ${legacy.name}: a Legacy signature card.`);
    }
  }
  // After any recorded card game (coached or simulated, regular season or postseason).
  // ranks: {opp, me} read before the game was recorded.
  function programAwards({won,us,them,postseason,ranks,oppName}){
    if(!programRewardsOn())return[];
    const meta=cardMeta(),got=[];meta.cardStreak=won?(meta.cardStreak|0)+1:0;
    const upset=won&&ranks&&ranks.opp<=10&&(ranks.me>25||ranks.me-ranks.opp>=15);
    if(upset&&grantProgramCard('giant_killer',`upset No. ${ranks.opp} ${oppName||''}`.trim()))got.push('giant_killer');
    if(meta.cardStreak>=3&&grantProgramCard('flea_flicker','three straight wins'))got.push('flea_flicker');
    if(won&&them<=7&&grantProgramCard('bluff_zero',`held a winner to ${them} points`))got.push('bluff_zero');
    if(won&&postseason&&grantProgramCard('jet_reverse','a postseason win'))got.push('jet_reverse');
    return got;
  }
  const rankSnapshot=opp=>({opp:Number(opp?.rank)||99,me:Number(selected()?.rank)||99});
  // The Card Program's reward packs: pick one card for the collection.
  function openRewardPack(){
    const meta=cardMeta(),pack=(meta.rewardPacks||[])[0];if(!pack)return;
    const dialog=document.createElement('dialog');dialog.id='rewardPack';dialog.setAttribute('aria-label',pack.title);
    const card=id=>{const c=CS.packs.cardDef(id)||{},r=CS.data.rarityOf(id);return`<article class="rp-card rp-${escH(r)}"><b>${escH(c.name||id)}</b><small>${escH(r)} · ${c.cost??0} Command · ${escH(c.family||'Tactic')}${c.trick?' · Once per game':''}</small><p>${escH(c.text||'')}</p><button type="button" data-take="${escH(id)}">Add to collection</button></article>`};
    dialog.innerHTML=`<style>#rewardPack{width:min(900px,94vw);padding:22px;border:1px solid #66592e;border-radius:16px;background:#10151f;color:#f2efe5;font:15px system-ui}#rewardPack::backdrop{background:#03060bd9}#rewardPack h2{margin:0 0 4px;color:#ffd76a}.rp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:14px 0}.rp-card{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid #2c3448;border-radius:12px;background:#171e2c}.rp-card p{flex:1;margin:0;color:#c9cfdc;font-size:13px}.rp-card small{color:#aab6e8;text-transform:capitalize}.rp-rare{border-color:#4b8fe0}.rp-legendary{border-color:#ffcc33}.rp-card button,#rewardPack [data-later]{padding:8px;border-radius:8px;border:1px solid #66592e;background:#2a2412;color:#ffd76a;cursor:pointer}</style>
      <h2>${escH(pack.title)}</h2><p>${escH(pack.subtitle||'')}</p><div class="rp-cards">${pack.cards.map(card).join('')}</div><button type="button" data-later>Open later</button>`;
    document.body.appendChild(dialog);
    const close=()=>{dialog.close();dialog.remove();paintCardProgram()};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
    dialog.querySelector('[data-later]').onclick=close;
    dialog.querySelectorAll('[data-take]').forEach(el=>el.onclick=()=>{const r=takeRewardCard(pack.key,el.dataset.take);if(r.ok)close();else setStatus(r.error)});
    dialog.showModal();
  }
  function takeRewardCard(key,id){
    const meta=cardMeta(),i=(meta.rewardPacks||[]).findIndex(x=>x.key===key);if(i<0)return{ok:false,error:'That pack is already open.'};
    const pack=meta.rewardPacks[i];if(!pack.cards.includes(id))return{ok:false,error:'That card is not in this pack.'};
    const pb=userPlaybook();CS.packs.grantCard(pb,id,{kind:pack.type||'reward',why:pack.title});meta.rewardPacks.splice(i,1);
    rewardMoment(`${pack.title}: ${CS.packs.cardDef(id).name} added to the collection.`);
    try{autosaveAfter('game')}catch(err){console.error(err)}
    return{ok:true};
  }
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('click',e=>{if(e.target.closest?.('[data-reward-pack]'))openRewardPack()});

  // ============================================================== 4. the Card Program panel and settings
  // A panel on This Week, under the next-matchup card: your playbook at a glance, what other programs pulled and
  // evolved (Around the League), and Card Settings. Shown only once the dynasty uses cards.
  const escH=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cardName=id=>CS.packs?.cardDef?.(id)?.name||String(id||'').replace(/_/g,' ');
  const MODES=[['key','Key downs','You call 3rd downs, the red zone and the last two minutes. Coordinators run the rest with your cards.'],
    ['series','Series','Script 1st and 2nd down at each new set of downs, then call the key downs live.'],
    ['snap','Every snap','You call every play.'],['sim','Watch','Coordinators play the whole game with your cards.']];
  const CONTROLS=[['offense','Offense'],['both','Both sides'],['defense','Defense']];
  function newsHTML(n){
    const wk=n.week?`<small class="cpn-wk">Wk ${escH(n.week)}</small> `:'';
    if(n.evolved)return`<li class="cpn-news evolve">${wk}<b>${escH(n.team)}</b> evolved <span>${escH(cardName(n.evolved))}</span></li>`;
    return`<li class="cpn-news ${escH(n.rarity||'common')}">${wk}<b>${escH(n.team)}</b> pulled <span>${escH(cardName(n.card))}</span>${n.rarity&&n.rarity!=='common'?` <em>${escH(n.rarity)}</em>`:''}</li>`;
  }
  function postCoachHTML(){
    if(!POST_PHASES.includes(universe.phase))return'';const g=currentCardGame();
    return g&&!cardGameBlocker()?`<button type="button" class="cpn-btn" data-coach-cards data-coach-post>Coach the ${escH(g.label)} with Cards</button>`:'';
  }
  function cardProgramHTML(){
    const cs=universe.callSheet,pb=cs.playbook,on=INTEGRATIONS.filter(integrationOn).length;
    const stat=(k,v)=>`<div><span>${k}</span><b>${v}</b></div>`;
    const stats=pb?stat('Card record',`${pb.record?.w||0}–${pb.record?.l||0}`)+stat('Packs',pb.packsOpened||0)+stat('Evolved',Object.keys(pb.evolved||{}).length)
      +stat('Ready to evolve',CS.evolution.ready(pb).length)+stat('Signatures',`${(pb.signatures||[]).length}/3`)+stat('Ring of Honor',(pb.ringOfHonor||[]).length):'<p class="muted">Play a card game to start your playbook.</p>';
    const teaching=pb&&integrationOn(STAFF_LINK)?trainingFor(selected(),pb):{},maxTeach=Math.round(Math.max(0,...Object.values(teaching))*100);
    const log=(cs.newsLog||[]).slice().reverse().slice(0,8);
    const news=log.length?`<ul class="cpn-feed">${log.map(newsHTML).join('')}</ul>`:'<p class="muted cpn-empty">Sim a week and opponents on your schedule start opening packs.</p>';
    return`<section id="cardProgram" class="card cpn" data-dview="week" aria-labelledby="cpnTitle">
      <div class="cpn-head"><div><span class="eyebrow">CALL SHEET</span><h3 id="cpnTitle">Card Program</h3></div>
      <button type="button" class="cpn-btn" data-card-deck>Build Deck</button><button type="button" class="cpn-btn" data-card-settings>Card Settings</button></div>${(cs.rewardPacks||[]).length?`<button type="button" class="cpn-btn cpn-reward" data-reward-pack>Open ${escH(cs.rewardPacks[0].title)}${cs.rewardPacks.length>1?` (+${cs.rewardPacks.length-1} more)`:''}</button>`:''}
      <div class="cpn-stats">${stats}</div>${cs.activeBattle?'<button type="button" class="cpn-btn" data-coach-cards>Resume Battle</button>':postCoachHTML()}
      <p class="cpn-foot" data-card-connections>Facilities ${Math.round(selected().facilities||0)} · Deck limits ${pb?.capacity?.wrinkles||14} plays / ${pb?.capacity?.tactics||14} tactics${maxTeach?` · Coaching: up to +${maxTeach}% mastery on used cards`:""}<br>${escH(selected().offScheme)} / ${escH(selected().defScheme)} · Weekly preparation sharpens matching duels and mastery.</p>
      <div class="cpn-league"><span class="eyebrow">AROUND THE LEAGUE</span>${news}</div>
      <p class="cpn-foot muted">${escH(MODES.find(m=>m[0]===cs.settings.mode)?.[1]||'Key downs')} · ${escH(CONTROLS.find(c=>c[0]===cs.settings.control)?.[1]||'Offense')} · ${on}/${INTEGRATIONS.length} connections on</p>
    </section>`;
  }
  function paintCardProgram(){
    if(typeof document==='undefined'||typeof document.getElementById!=='function'||typeof document.createElement!=='function')return; // headless runs
    const dash=document.querySelector('#dashboard'),old=document.querySelector('#cardProgram');
    // A coachable postseason game shows the panel (and its Coach button) even before the first card game.
    if(dash&&universe&&!universe.callSheet&&selected()&&POST_PHASES.includes(universe.phase)&&postseasonCardGame()&&!cardGameBlocker())cardMeta();
    if(!dash||!universe?.callSheet||!selected()){old?.remove();return}
    const html=cardProgramHTML();
    if(old)old.outerHTML=html;else{const a=dash.querySelector('#broadcastFeature')||dash.querySelector('.command-center');a?a.insertAdjacentHTML('afterend',html):dash.insertAdjacentHTML('beforeend',html)}
    injectCardProgramStyles();
  }
  function injectCardProgramStyles(){
    if(document.getElementById('cardProgramStyles'))return;
    const st=document.createElement('style');st.id='cardProgramStyles';st.textContent=`
#cardProgram{margin:14px 0;padding:16px 18px;border-radius:14px;background:linear-gradient(135deg,#10172a,#1a1030);color:#eef2ff;border:1px solid #2f3a66}
#cardProgram .eyebrow{color:#9fb4ff;letter-spacing:.12em;font-size:11px}
#cardProgram h3{margin:2px 0 0;font-size:20px;color:#fff}
.cpn-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.cpn-btn{background:#ffd34d;color:#1a1300;border:0;border-radius:999px;padding:8px 14px;font-weight:800;cursor:pointer}
.cpn-btn:focus-visible,#cardSettings :focus-visible{outline:3px solid #9fe3ff;outline-offset:2px}
.cpn-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px;margin:12px 0}
.cpn-stats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 10px}
.cpn-stats span{display:block;font-size:11px;color:#aab6e8}.cpn-stats b{font-size:18px}
.cpn-feed{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px}
.cpn-news{padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.05);border-left:4px solid #6b7bb5;font-size:14px}
.cpn-news span{font-weight:700}.cpn-wk{color:#8c98c9;font-size:11px;margin-right:4px}.cpn-news em{font-style:normal;font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-left:4px}
.cpn-news.rare{border-color:#4da3ff}.cpn-news.rare em{color:#7cc0ff}
.cpn-news.legendary{border-color:#ffb81c;background:linear-gradient(90deg,rgba(255,184,28,.22),rgba(255,255,255,.04))}.cpn-news.legendary em{color:#ffd34d}
.cpn-news.evolve{border-color:#b26bff}
#cardProgram .muted{color:#aab6e8}.cpn-foot{margin:10px 0 0;font-size:12px}
#cardSettings{position:fixed;inset:0;z-index:2147482000;background:rgba(4,6,14,.72);display:flex;align-items:center;justify-content:center;padding:16px}
#cardSettings .cps{background:#10172a;color:#eef2ff;border:1px solid #2f3a66;border-radius:16px;max-width:560px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:20px}
#cardSettings h2{margin:0 0 4px;color:#fff}#cardSettings fieldset{border:0;margin:14px 0 0;padding:0}
#cardSettings legend{font-weight:800;margin-bottom:6px;color:#9fb4ff;font-size:12px;letter-spacing:.1em;text-transform:uppercase}
#cardSettings label.opt{display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);margin-bottom:6px;cursor:pointer}
#cardSettings label.opt small{display:block;color:#aab6e8}
#cardSettings .seg{display:flex;gap:6px;flex-wrap:wrap}#cardSettings .seg label.opt{flex:1;min-width:110px;margin:0}
#cardSettings .cps-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
#cardSettings .cps-actions button{border-radius:999px;padding:9px 16px;font-weight:800;cursor:pointer;border:1px solid #3a4677;background:transparent;color:#eef2ff}
#cardSettings .cps-actions button.go{background:#ffd34d;color:#1a1300;border-color:#ffd34d}
@media (prefers-reduced-motion:no-preference){.cpn-news.legendary{animation:cpnGlow 2.4s ease-in-out infinite alternate}@keyframes cpnGlow{to{box-shadow:0 0 14px rgba(255,184,28,.45)}}}`;
    document.head.appendChild(st);
  }
  let settingsReturn=null;
  function openCardSettings(){
    if(!universe||!selected())return;
    closeCardSettings(false);const s=cardMeta().settings;settingsReturn=document.activeElement;
    const radio=(name,val,label,sub,checked)=>`<label class="opt"><input type="radio" name="${name}" value="${val}"${checked?' checked':''}><span>${escH(label)}${sub?`<small>${escH(sub)}</small>`:''}</span></label>`;
    const box=(name,label,sub,checked)=>`<label class="opt"><input type="checkbox" name="${escH(name)}"${checked?' checked':''}><span>${escH(label)}${sub?`<small>${escH(sub)}</small>`:''}</span></label>`;
    const el=document.createElement('div');el.id='cardSettings';
    el.innerHTML=`<form class="cps" role="dialog" aria-modal="true" aria-labelledby="cpsTitle">
      <h2 id="cpsTitle">Card Settings</h2><p class="muted" style="margin:0;color:#aab6e8">Saved with this dynasty.</p>
      <fieldset><legend>How much you call</legend>${MODES.map(m=>radio('mode',m[0],m[1],m[2],s.mode===m[0])).join('')}</fieldset>
      <fieldset><legend>You coach</legend><div class="seg">${CONTROLS.map(c=>radio('control',c[0],c[1],'',s.control===c[0])).join('')}</div></fieldset>
      <fieldset><legend>Game feel</legend><div class="seg">${box('fast','Fast animations','',s.fast)}${box('sound','Sound','',s.sound!==false)}</div></fieldset>
      <fieldset><legend>Dynasty connections</legend>${INTEGRATIONS.map(x=>box('int:'+x.id,x.label,x.about,integrationOn(x))).join('')}</fieldset>
      <div class="cps-actions"><button type="button" data-cps-cancel>Cancel</button><button type="submit" class="go">Save</button></div></form>`;
    document.body.appendChild(el);injectCardProgramStyles();
    const form=el.querySelector('form');
    form.addEventListener('submit',e=>{e.preventDefault();
      const f=new FormData(form),meta=cardMeta();
      meta.settings.mode=f.get('mode')||meta.settings.mode;meta.settings.control=f.get('control')||meta.settings.control;
      meta.settings.fast=f.has('fast');meta.settings.sound=f.has('sound');
      for(const x of INTEGRATIONS)meta.settings.integrations[x.id]=f.has('int:'+x.id);
      try{autosaveAfter('game')}catch(err){console.error(err)}
      closeCardSettings(true);paintCardProgram();try{setStatus('Card settings saved.')}catch(err){}
    });
    el.querySelector('[data-cps-cancel]').addEventListener('click',()=>closeCardSettings(true));
    el.addEventListener('click',e=>{if(e.target===el)closeCardSettings(true)});
    el.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();closeCardSettings(true)}
      if(e.key==='Tab'){const f=[...form.querySelectorAll('input,button')],first=f[0],last=f[f.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
    });
    form.querySelector('input:checked,input')?.focus();
  }
  function closeCardSettings(restore){
    const el=document.getElementById('cardSettings');if(!el)return;el.remove();
    if(restore&&settingsReturn?.isConnected)settingsReturn.focus();settingsReturn=null;
  }

  // ---------------------------------------------------------------- every player has a card
  // The player page shows his battle card: the role he plays in the card game, his archetype ability, the seven
  // grades the duels use, his conditions, and his card career (duels won and lost, highlight plays).
  const ROLE_NAMES={QB:'Quarterback',RB:'Running back',X:'X receiver',Z:'Z receiver',SLOT:'Slot',TE:'Tight end',LT:'Left tackle',LG:'Left guard',C:'Center',RG:'Right guard',RT:'Right tackle',
    RUSH:'Rush end',SET:'Set end',NT:'Nose tackle',DT3:'3-technique',MIKE:'Mike linebacker',WILL:'Will linebacker',FCB:'Field corner',BCB:'Boundary corner',NICKEL:'Nickel',FS:'Free safety',BOXS:'Box safety'};
  function battleRoleOf(p,t){
    const AD=CS.adapter;if(!AD)return null;let best=null;
    for(const [role,slot] of Object.entries(AD.ROLE_MAP)){const i=(t?.roleDepth?.[slot]||[]).indexOf(p.id);if(i>=0&&(!best||i<best.depth))best={role,depth:i}}
    if(best)return best;
    const role=Object.keys(AD.ROLE_MAP).find(r=>(AD.POS_FALLBACK[r]||[])[0]===p.pos)||Object.keys(AD.ROLE_MAP).find(r=>(AD.POS_FALLBACK[r]||[]).includes(p.pos));
    return role?{role,depth:null}:null;
  }
  function duelsForRole(role){
    const D=CS.data,labels=new Map();if(!D)return[];
    for(const pl of Object.values(D.PLAYS).concat(Object.values(D.CALLS||{}))){if(pl.signature||pl.evolvedFrom)continue;
      for(const d of Object.values(pl.duels||{}))if((d.off||[]).includes(role)||(d.def||[]).includes(role))labels.set(d.label,(labels.get(d.label)||0)+1)}
    return[...labels.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
  }
  function playerCardHTML(p,t){
    const AD=CS.adapter,D=CS.data;if(!AD||!D)return'';
    const r=battleRoleOf(p,t);if(!r)return'';
    const bp=AD.toBattlePlayer(p,r.role),cs=universe.callSheet,career=cs?.players?.[String(p.id)];
    const sig=(cs?.playbook?.signatures||[]).find(x=>String(x.playerId)===String(p.id)),ring=(cs?.playbook?.ringOfHonor||[]).some(x=>String(x.playerId)===String(p.id));
    const strong=new Set(D.STYLE_TRAITS[bp.archetype]||[]),ability=D.SIGNATURES[bp.archetype]?.text||'';
    const depth=r.depth===0?'Starter':r.depth!=null?`No. ${r.depth+1} on the depth chart`:'Not on the depth chart';
    const development=t.id===selected()?.id?CS.program.developmentImpact(p,r.role,cs?.playbook):null;
    const duels=duelsForRole(r.role),pct=career&&career.w+career.l?Math.round(career.w*100/(career.w+career.l)):null;
    const when={late:'4th quarter',money:'3rd & 4th down',any:'every snap'};
    return`<section class="cs-pcard${sig?' sig':''}" id="playerBattleCard" aria-label="Battle card">
      <div class="cs-pcard-face" style="--tc:${escH(t?.primary||'#2a3550')};--tc2:${escH(t?.secondary||'#e8e2d0')}">
        <div class="cs-pcard-top"><span class="cs-pcard-ovr">${bp.ovr}</span><span class="cs-pcard-num">#${escH(bp.number)}</span></div>
        ${portraitTag(p,112,'card')}
        <strong>${escH(p.name)}</strong><span>${escH(ROLE_NAMES[r.role]||r.role)}</span><em>${escH(bp.archetype||'')}</em>
        ${sig?'<b class="cs-pcard-badge">SIGNATURE CARD</b>':ring?'<b class="cs-pcard-badge">RING OF HONOR</b>':''}
      </div>
      <div class="cs-pcard-body">
        <span class="eyebrow">BATTLE CARD</span>
        <h3>${escH(ROLE_NAMES[r.role]||r.role)} · ${escH(depth)}</h3>
        ${ability?`<p class="cs-pcard-ability"><b>${escH(bp.archetype)}:</b> ${escH(ability)}</p>`:''}
        ${development?`<p class="cs-pcard-note"><b>${escH(development.phase)} ${development.year}: ${escH(development.trait)} +${development.gain}</b>${development.plays.length?` · Helps ${escH(development.plays.join(', '))}`:' · Applied through his current battle traits'}. No extra bonus is stacked.</p>`:''}
        ${duels.length?`<p class="cs-pcard-duels">Fights in: ${duels.map(x=>`<span>${escH(x)}</span>`).join('')}</p>`:''}
        <div class="cs-pcard-traits">${D.TRAITS.map(k=>`<div class="${strong.has(k)?'key':''}"><span>${k==='iq'?'IQ':escH(k)}</span><i style="--v:${Math.max(0,Math.min(100,bp.traits[k]))}%"></i><b>${Math.round(bp.traits[k]/10)}</b></div>`).join('')}</div>
        ${bp.cond.length?`<div class="cs-pcard-cond">${bp.cond.map(c=>`<span class="${c.v>0?'up':'down'}">${c.v>0?'+1':'−1'} ${escH(c.src)} <small>${when[c.when]}</small></span>`).join('')}</div>`:''}
        <div class="cs-pcard-career">${career?`<div><span>Duels</span><b>${career.w}–${career.l}</b><small>${pct}% won</small></div><div><span>Highlight plays</span><b>${career.big}</b></div><div><span>Card games</span><b>${career.games}</b></div>`:'<p class="muted">No card games yet. His duels are counted once he plays one.</p>'}</div>
        <p class="cs-pcard-note muted">Duel grades are his ratings ÷ 10 (key traits in gold). Conditions come from his health, wear, composure, morale and position.</p>
      </div></section>`;
  }
  function injectPlayerCardStyles(){
    if(document.getElementById('cardPlayerStyles'))return;
    const st=document.createElement('style');st.id='cardPlayerStyles';st.textContent=`
.cs-pcard{display:grid;grid-template-columns:180px minmax(0,1fr);gap:16px;margin:0 0 16px;padding:14px;border-radius:14px;background:linear-gradient(135deg,#10172a,#1a1030);color:#eef2ff;border:1px solid #2f3a66}
.cs-pcard.sig{border-color:#ffd34d;box-shadow:0 0 0 1px #ffd34d,0 0 24px rgba(255,211,77,.2)}
.cs-pcard-face{position:relative;border-radius:12px;padding:10px;background:linear-gradient(170deg,var(--tc),#0b0f1c 82%);border:2px solid var(--tc2);display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px}
.cs-pcard.sig .cs-pcard-face{border-color:#ffd34d}
.cs-pcard-face canvas{width:112px;height:112px;border-radius:10px}
.cs-pcard-top{align-self:stretch;display:flex;justify-content:space-between;align-items:center}
.cs-pcard-ovr{font:800 28px 'Barlow Condensed',Impact,system-ui;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.5)}
.cs-pcard-num{font:800 16px 'Barlow Condensed',Impact,system-ui;background:rgba(0,0,0,.45);padding:2px 7px;border-radius:6px}
.cs-pcard-face strong{font:800 18px 'Barlow Condensed',Impact,system-ui;margin-top:4px;color:#fff}
.cs-pcard-face span{font-size:12px;color:#d7defa}.cs-pcard-face em{font-style:normal;font-size:12px;color:#ffe066;font-weight:700}
.cs-pcard-badge{margin-top:6px;font-size:10px;letter-spacing:.12em;background:#ffd34d;color:#1a1300;padding:3px 8px;border-radius:999px}
.cs-pcard-body h3{margin:2px 0 6px;color:#fff;font-size:18px}.cs-pcard-body .eyebrow{color:#9fb4ff;letter-spacing:.12em;font-size:11px}
.cs-pcard-ability{margin:0 0 8px;font-size:13.5px;color:#dfe5ff}.cs-pcard-ability b{color:#ffe066}
.cs-pcard-duels{margin:0 0 8px;font-size:12.5px;color:#aab6e8}.cs-pcard-duels span{display:inline-block;margin:2px 4px 0 0;padding:2px 8px;border-radius:999px;background:rgba(63,193,255,.14);color:#bfe9ff}
.cs-pcard-traits{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:4px 14px}
.cs-pcard-traits div{display:grid;grid-template-columns:86px 1fr 22px;gap:6px;align-items:center;font-size:12.5px;text-transform:capitalize;color:#c9d2f5}
.cs-pcard-traits div.key span{color:#ffe066;font-weight:700}
.cs-pcard-traits i{height:6px;border-radius:3px;background:rgba(255,255,255,.12);position:relative;overflow:hidden}
.cs-pcard-traits i::after{content:'';position:absolute;inset:0;width:var(--v);background:linear-gradient(90deg,#3fc1ff,#7dffb0)}
.cs-rcard .cs-pcard-traits i::before{content:'';position:absolute;top:0;bottom:0;left:var(--lo);width:calc(var(--v) - var(--lo));background:repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 3px,transparent 3px 6px);z-index:1}
.cs-rcard .cs-pcard-traits i::after{width:var(--lo)}
.cs-rcard .cs-pcard-traits div{grid-template-columns:86px 1fr 46px}.cs-rcard .cs-pcard-traits b{white-space:nowrap}
.cs-rcard .cs-pcard-face{background:linear-gradient(170deg,#3a2f6b,#0b0f1c 82%);border-style:dashed}
.cs-pcard-traits b{text-align:right;color:#fff}
.cs-pcard-cond{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px}
.cs-pcard-cond span{font-size:12px;padding:3px 8px;border-radius:6px;background:rgba(255,90,90,.15);color:#ffc4c4}.cs-pcard-cond span.up{background:rgba(61,255,134,.13);color:#b6ffd2}
.cs-pcard-cond small{opacity:.75}
.cs-pcard-career{margin-top:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cs-pcard-career div{background:rgba(255,255,255,.06);border-radius:10px;padding:7px 10px}.cs-pcard-career span{display:block;font-size:11px;color:#aab6e8}
.cs-pcard-career b{font-size:20px;color:#fff}.cs-pcard-career small{display:block;font-size:11px;color:#7dffb0}
.cs-pcard-career p{grid-column:1/-1;margin:0}.cs-pcard .muted{color:#aab6e8}.cs-pcard-note{font-size:11.5px;margin:8px 0 0}
@media (max-width:640px){.cs-pcard{grid-template-columns:minmax(0,1fr)}.cs-pcard-face{max-width:220px;justify-self:center;width:100%}}`;
    document.head.appendChild(st);
  }
  if(typeof showPlayerProfile==='function'){
    const showPlayerProfileBase=showPlayerProfile;
    showPlayerProfile=function showPlayerProfileWithCard(id){
      const add=()=>{try{
        if(typeof document==='undefined'||typeof document.getElementById!=='function')return;
        const hit=findPlayer(id),host=$('#playerDialogBody');if(!hit||!hit.active||!host||host.querySelector('#playerBattleCard'))return;
        const html=playerCardHTML(hit.p,hit.team);if(!html)return;
        injectPlayerCardStyles();host.insertAdjacentHTML('afterbegin',html);paintPortraits(host.querySelector('#playerBattleCard'));
      }catch(err){console.error(err)}};
      const out=showPlayerProfileBase(id);
      if(out&&typeof out.then==='function')return out.then(v=>{add();return v});
      add();return out;
    };
  }

  // ---------------------------------------------------------------- the weekly newsletter
  // Dynasty Lab's newsletter gets a Call Sheet section for the week: your card moments and the packs your
  // opponents opened. Read-only over the card save.
  if(typeof renderNewsletter==='function'){
    const renderNewsletterBase=renderNewsletter;
    renderNewsletter=function renderNewsletterWithCards(...args){
      const out=renderNewsletterBase.apply(this,args);
      try{
        const cs=universe?.callSheet,body=typeof document!=='undefined'&&typeof document.getElementById==='function'?$('#newsletterBody'):null;
        if(cs&&body&&!body.querySelector('#newsCallSheet')){
          const [season,week]=String($('#newsWeek')?.value||'').split('|').map(Number);
          const moments=(cs.moments||[]).filter(m=>m.year===season&&m.week===week);
          const pulls=(cs.newsLog||[]).filter(n=>n.year===season&&n.week===week);
          if(moments.length||pulls.length)body.insertAdjacentHTML('beforeend',`<div class="card" id="newsCallSheet"><div class="eyebrow">CALL SHEET</div><h3>Card battle notes</h3>
            ${moments.map(m=>`<div class="news-item"><div class="${m.kind==='pog'?'strong':''}">${escH(m.text)}</div>${m.playerId?`<button type="button" class="linkish" data-player="${escH(m.playerId)}">Battle card</button>`:''}</div>`).join('')}
            ${pulls.length?`<div class="news-item"><div class="strong">Opponents' packs</div><div class="compact muted">${pulls.map(n=>`${escH(n.team)} ${n.evolved?`evolved ${escH(cardName(n.evolved))}`:`pulled ${escH(cardName(n.card))}${n.rarity&&n.rarity!=='common'?` (${escH(n.rarity)})`:''}`}`).join(' · ')}</div></div>`:''}</div>`);
          try{attachPlayerLinks()}catch(err){}
        }
      }catch(err){console.error(err)}
      return out;
    };
    if(typeof TAB_RENDERERS==='object'&&TAB_RENDERERS)TAB_RENDERERS.newsletter=renderNewsletter;
  }

  // ---------------------------------------------------------------- recruit cards
  // A recruit's card shows what he would bring to the card game: his projected role and archetype ability, his
  // grades as scouted ranges (never the true values), how much of your playbook runs through his duels, and how
  // he compares with your current starter. Ranges narrow as your scouting confidence rises.
  function recruitCardHTML(r,u){
    const AD=CS.adapter,D=CS.data;if(!AD||!D||!r||!u)return'';
    const role=Object.keys(AD.ROLE_MAP).find(x=>(AD.POS_FALLBACK[x]||[])[0]===r.pos)||Object.keys(AD.ROLE_MAP).find(x=>(AD.POS_FALLBACK[x]||[]).includes(r.pos));if(!role)return'';
    let conf=50;try{const dom=Object.entries(ensureScoutingIntel(r,u,true)||{}).filter(([k])=>k!=='upside').map(([,v])=>Number(v.confidence)).filter(Number.isFinite);if(dom.length)conf=dom.reduce((a,b)=>a+b,0)/dom.length}catch(err){}
    const width=Math.max(1,Math.round((100-conf)/5)),est={};
    for(const k of D.TRAITS){const t=Number(r[k])||Number(r.trueNow)||60;est[k]=Math.max(25,Math.min(99,Math.round(t+scoutHash(r,k,'card')*width)))}
    const range=v=>[Math.max(25,v-width),Math.min(99,v+width)],g=v=>Math.round(v/10);
    const bp=AD.toBattlePlayer({...r,...est,health:100,wear:0,morale:70,positionFamiliarity:{[r.pos]:100}},role),strong=new Set(D.STYLE_TRAITS[bp.archetype]||[]);
    const lo=AD.toBattlePlayer({...r,...Object.fromEntries(D.TRAITS.map(k=>[k,range(est[k])[0]])),positionFamiliarity:{[r.pos]:100}},role).ovr,hi=AD.toBattlePlayer({...r,...Object.fromEntries(D.TRAITS.map(k=>[k,range(est[k])[1]])),positionFamiliarity:{[r.pos]:100}},role).ovr;
    const offense=role in (D.OFF_ROLES||{}),pb=universe.callSheet?.playbook;
    const deck=offense&&pb?[...pb.off.base,...pb.off.wrinkles]:[],inPlay=id=>Object.values(D.PLAYS[id]?.duels||{}).some(d=>(d.off||[]).includes(role)||(d.def||[]).includes(role));
    const usage=offense?(deck.length?`In ${deck.filter(inPlay).length} of the ${deck.length} plays in your playbook`:''):(()=>{const all=Object.values(D.PLAYS).filter(p=>!p.signature&&!p.evolvedFrom);return`Fights in ${Math.round(all.filter(p=>inPlay(p.id)).length*100/Math.max(1,all.length))}% of the plays offenses run`})();
    const starter=AD.lineupFromTeam(u).lineup[offense?'off':'def'][role];
    const cmp=starter?(lo>starter.ovr?`Projects ahead of your starter ${starter.name} (${starter.ovr}) right away.`:hi<starter.ovr?`Behind your starter ${starter.name} (${starter.ovr}) for now; a development project.`:`Neck and neck with your starter ${starter.name} (${starter.ovr}).`):'You have no starter at this spot.';
    const ability=D.SIGNATURES[bp.archetype]?.text||'',duels=duelsForRole(role),fit=recruitingFit(u,r);
    return`<section class="cs-pcard cs-rcard" id="recruitBattleCard" aria-label="Recruit battle card">
      <div class="cs-pcard-face" style="--tc:${escH(u.primary||'#2a3550')};--tc2:${escH(u.secondary||'#e8e2d0')}">
        <div class="cs-pcard-top"><span class="cs-pcard-ovr">${lo===hi?lo:`${lo}–${hi}`}</span><span class="cs-pcard-num">${'★'.repeat(r.stars||0)}</span></div>
        ${portraitTag(r,112,'card','recruit')}
        <strong>${escH(r.name)}</strong><span>${escH(ROLE_NAMES[role]||role)}</span><em>${escH(bp.archetype||'')}</em>
        <b class="cs-pcard-badge">PROSPECT</b>
      </div>
      <div class="cs-pcard-body">
        <span class="eyebrow">PROSPECT CARD · SCOUTING ${Math.round(conf)}%</span>
        <h3>Projects as: ${escH(ROLE_NAMES[role]||role)}</h3>
        ${fit.plays.length?`<p class="cs-pcard-note"><b>Fits your active playbook:</b> ${escH(fit.plays.join(', '))}${fit.bonus?` · +${fit.bonus} to your recruiting pitch`:""}. Based on his archetype, not hidden ratings.</p>`:''}
        ${ability?`<p class="cs-pcard-ability"><b>${escH(bp.archetype)}:</b> ${escH(ability)}</p>`:''}
        ${duels.length?`<p class="cs-pcard-duels">Fights in: ${duels.map(x=>`<span>${escH(x)}</span>`).join('')}</p>`:''}
        <div class="cs-pcard-traits">${D.TRAITS.map(k=>{const [a,b]=range(est[k]);return`<div class="${strong.has(k)?'key':''}"><span>${k==='iq'?'IQ':escH(k)}</span><i style="--v:${b}%;--lo:${a}%"></i><b>${g(a)===g(b)?g(a):`${g(a)}–${g(b)}`}</b></div>`}).join('')}</div>
        <div class="cs-pcard-career"><div style="grid-column:1/-1"><span>In your card game</span><b style="font-size:15px">${escH(cmp)}</b>${usage?`<small>${escH(usage)}</small>`:''}</div></div>
        <p class="cs-pcard-note muted">Ranges come from your scouting: scout him to narrow them. Card OVR uses the same formula as your roster.</p>
      </div></section>`;
  }
  if(typeof showRecruitProfile==='function'){
    const showRecruitProfileBase=showRecruitProfile;
    showRecruitProfile=function showRecruitProfileWithCard(id){
      const out=showRecruitProfileBase(id);
      try{
        if(typeof document!=='undefined'&&typeof document.getElementById==='function'){
          const r=universe.recruits.find(x=>x.id===id),host=$('#recruitDialogBody');
          if(r&&host&&!host.querySelector('#recruitBattleCard')){const html=recruitCardHTML(r,selected());if(html){injectPlayerCardStyles();host.insertAdjacentHTML('afterbegin',html);paintPortraits(host.querySelector('#recruitBattleCard'))}}
        }
      }catch(err){console.error(err)}
      return out;
    };
  }
  const renderBase=render;
  render=function renderWithCardProgram(...args){
    const out=renderBase.apply(this,args);
    try{paintCardProgram()}catch(err){console.error(err)}
    return out;
  };
  if(typeof document!=='undefined')document.addEventListener('click',e=>{if(e.target.closest('[data-card-settings]'))openCardSettings();if(e.target.closest('[data-card-deck]')){const cg=currentCardGame();if(cg&&cardMeta().activeBattle?.seed===battleSeed(cg)){setStatus('Finish your current card battle before changing the deck.');return}CS.playbookUI.open(syncProgramCapacity(selected(),userPlaybook()),{onSave:pb=>{cardMeta().playbook=normalizeCardPlaybook(pb);autosaveAfter('game');paintCardProgram()}})}});

  let host=null;
  globalThis.__callSheetDynasty={
    launch:buildLaunch,
    record(state,tally){
      const key=cardMeta().activeBattle?.seed;
      if(key&&cardMeta().recordedBattleSeed===key)return{ok:true};
      const pg=currentCardGame();
      if(pg?.postseason){if(pg.played)return{ok:true};return globalThis.__callSheetPostseason.record(pg,state,tally,key)}
      try{const g=findUserGame(),week=g?.week,me=selected(),userSide=g&&g.home===me.name?'home':'away',opp=g?T(userSide==='home'?g.away:g.home):null,ranks=rankSnapshot(opp);
        const out=recordGameBase({externalState:state});try{addCardCareer(tally,week)}catch(err){console.error(err)}if(key)cardMeta().recordedBattleSeed=key;
        try{const us=Number(state?.score?.[userSide])||0,them=Number(state?.score?.[userSide==='home'?'away':'home'])||0;programAwards({won:us>them,us,them,postseason:false,ranks,oppName:opp?.name})}catch(err){console.error(err)}
        return{ok:true,result:out.result}}
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
    recruitingFit,trainingFor,syncProgramCapacity,programAwards,takeRewardCard,rewards:{booster:boosterPack,signing:signingPack,scheme:schemeCards,legacy:legacyCards},register:registerCardIntegration,openSettings:openCardSettings,paint:paintCardProgram,news:()=>JSON.parse(JSON.stringify(universe?.callSheet?.newsLog||[])),recruitCard:(id)=>recruitCardHTML(universe.recruits.find(x=>x.id===id),selected()),playerCard:(id)=>{const h=findPlayer(id);return h?playerCardHTML(h.p,h.team):''},launch:()=>buildLaunch(),enable:()=>{cardMeta();userPlaybook()}};
  document.addEventListener('click',e=>{if(e.target.closest('[data-coach-cards]'))openCardGameDay()});
})();
