// Call Sheet fork: card battles inside Dynasty Lab.
// Engine extension (runs inside the app closure). Three parts:
//   1. The save format for the card program (universe.callSheet), repaired and validated on every load.
//   2. The integration framework: small named integrations that hook into game day, finished games and the
//      weekly cycle. Each can be switched off in settings (callSheet.settings.integrations[id] = false).
//   3. "Coach with Cards" game day and card-simulated games, both recorded through recordV2GameLabResult.
//   4. The Cards & Deck workspace, its weekly shortcut and the Card Settings dialog.

// ================================================================ 1. save format
const CALL_SHEET_SAVE_VERSION=1,CALL_SHEET_RESERVE_LIMIT=500,CALL_SHEET_UNUSED_SIGNATURE_LIMIT=100;
// The rolling live ledger is bounded; retired signatures keep their own four final counters.
function cleanCardCareer(c){
  if(!c||typeof c!=='object'||Array.isArray(c))return null;
  const entries=['w','l','big','games'].map(k=>[k,Number(c[k])]);
  return entries.every(([,v])=>Number.isFinite(v)&&v>=0)?Object.fromEntries(entries.map(([k,v])=>[k,Math.min(1e6,Math.round(v))])):null;
}
function cleanStaffCards(grants){
  const cards=Object.values(globalThis.CallSheet?.data?.SCHEME_CARDS||{});
  return Object.fromEntries(Object.entries(grants&&typeof grants==='object'?grants:{}).filter(([id,g])=>cards.includes(id)&&g?.coachId!=null).slice(0,20)
    .map(([id,g])=>[id,{coachId:String(g.coachId).slice(0,40),name:String(g.name||'Coordinator').slice(0,60)}]));
}
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
  const opener=pb.off?.openingScript;
  pb.off=deck(pb.off,'off');pb.def=deck(pb.def,'def');
  if(D?.canScriptOpener(pb.off,opener))pb.off.openingScript=opener;
  if([pb.off,pb.def].some(d=>new Set(d.base).size!==4))return null; // invalid base sheets reset rather than crash on the next draw
  pb.reserve=Object.fromEntries(['off','def'].map(side=>[side,{wrinkles:ids(pb.reserve?.[side]?.wrinkles,CALL_SHEET_RESERVE_LIMIT).filter(id=>legal(id,side,false)),tactics:ids(pb.reserve?.[side]?.tactics,CALL_SHEET_RESERVE_LIMIT).filter(id=>legal(id,side,true))}]));
  pb.achievements=[...new Set(ids(pb.achievements,30))].filter(id=>CS.packs.ACHIEVEMENTS.some(a=>a.id===id));
  pb.capacity={wrinkles:int(pb.capacity?.wrinkles,10,30,14),tactics:int(pb.capacity?.tactics,10,30,14)};
  pb.legendaries=ids(pb.legendaries,20);pb.record={w:int(pb.record?.w,0,9999,0),l:int(pb.record?.l,0,9999,0)};
  pb.packsOpened=int(pb.packsOpened,0,99999,0);pb.gamesPlayed=int(pb.gamesPlayed,0,99999,0);
  if(pb.lastSignatureGame!==undefined)pb.lastSignatureGame=int(pb.lastSignatureGame,0,99999,0);
  if(pb.recordYear!==undefined)pb.recordYear=int(pb.recordYear,0,99999,0);
  pb.borrowed=objs(pb.borrowed,20).filter(x=>typeof x.from==='string'&&Number.isFinite(Number(x.year))).map(x=>({id:x.id,from:x.from.slice(0,60),year:Math.round(Number(x.year))}));pb.programCards=[...new Set(ids(pb.programCards,60))].filter(id=>CS.data?.PROGRAM_CARDS?.includes(id));pb.legacies=[...new Set(ids(pb.legacies,60))];
  pb.mastery=intMap(pb.mastery);pb.evolved=strMap(pb.evolved);pb.finishes=Object.fromEntries(Object.entries(strMap(pb.finishes)).filter(([,v])=>v==='foil'||v==='gold').slice(0,400));pb.history=objs(pb.history,300);
  if(pb.staffLoans)pb.staffLoans=cleanStaffCards(pb.staffLoans);
  CS.packs.reconcileAwards(pb);
  const validSignature=x=>{
    if(!CS?.signatures||!['string','number'].includes(typeof x.playerId)||x.id!==`${x.legacy?'leg':'sig'}_${x.playerId}`||(x.legacy&&(typeof x.legacy!=='object'||typeof x.legacy.name!=='string'||typeof x.legacy.last!=='string'))||typeof x.name!=='string'||typeof x.last!=='string')return false;
    if(!Object.hasOwn(D.OFF_ROLES,x.role)&&!Object.hasOwn(D.DEF_ROLES,x.role))return false;
    if(CS.signatures.templateFor({role:x.role,archetype:x.archetype})!==x.template)return false;
    const built=CS.signatures.build(x);return x.side===built.side&&x.pile===(built.kind==='tactic'?'tactics':'wrinkles');
  };pb.signatures=objs(pb.signatures,maxSignatures).filter(validSignature);pb.reserveSignatures=objs(pb.reserveSignatures,CALL_SHEET_UNUSED_SIGNATURE_LIMIT).filter(validSignature);pb.ringOfHonor=objs(pb.ringOfHonor,200);
  for(const spec of [...pb.signatures,...pb.reserveSignatures,...pb.ringOfHonor])if(spec.provenance)spec.provenance=CS.signatures.cardHistory(spec.provenance);
  for(const r of pb.ringOfHonor)if(r.cardCareer!==undefined){const c=cleanCardCareer(r.cardCareer);if(c)r.cardCareer=c;else delete r.cardCareer}
  if(Array.isArray(pb.deferredEvolutions))pb.deferredEvolutions=[...new Set(ids(pb.deferredEvolutions,20))].filter(id=>Object.hasOwn(CS.evolution.TREE,id)&&!pb.evolved[id]);else delete pb.deferredEvolutions;
  if(Array.isArray(pb.gamePacks)){
    const keys=new Set();pb.gamePacks=pb.gamePacks.map(CS.packs.cleanGamePack).filter(p=>p&&!keys.has(p.key)&&keys.add(p.key));
  }else delete pb.gamePacks;
  return pb;
}
function cleanRivalryPlay(x){
  if(!x||typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name||
    !['X','Z','SLOT','TE','RB'].includes(x.role)||!['third','fourth','touchdown','explosive'].includes(x.kind)||!Array.isArray(x.snaps))return null;
  const inRange=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  const snaps=x.snaps.filter(e=>e&&typeof e.play==='string'&&e.play&&inRange(e.down,1,4)&&inRange(e.distance,1,99)&&
    inRange(e.period,1,99)&&inRange(e.clock,0,900)&&inRange(e.yards,1,99)).slice(0,2)
    .map(e=>({play:e.play.slice(0,80),down:e.down,distance:e.distance,period:e.period,clock:e.clock,yards:e.yards}));
  return snaps.length?{id:x.id.slice(0,64),name:x.name.slice(0,60),role:x.role,kind:x.kind,snaps}:null;
}
function normalizeCallSheet(u){
  const cs=u?.callSheet;if(cs===undefined)return;
  if(!cs||typeof cs!=='object'||Array.isArray(cs)){delete u.callSheet;return}
  if(Number(cs.version)>CALL_SHEET_SAVE_VERSION)throw new Error('This dynasty’s card playbook needs a newer version of Call Sheet.');
  cs.version=CALL_SHEET_SAVE_VERSION;
  cs.playbook=normalizeCardPlaybook(cs.playbook);
  globalThis.CallSheet?.packs?.updateStarterBook(cs.playbook,CALL_SHEET_RESERVE_LIMIT);
  cs.combos=Array.isArray(cs.combos)?cs.combos.filter(x=>typeof x==='string').slice(0,20):[];
  const st=cs.settings&&typeof cs.settings==='object'?cs.settings:{};
  const integrations=Object.fromEntries(Object.entries(st.integrations&&typeof st.integrations==='object'?st.integrations:{}).filter(([k,v])=>typeof k==='string'&&typeof v==='boolean'));
  cs.settings={mode:['key','series','snap','sim'].includes(st.mode)?st.mode:'key',control:['offense','both','defense'].includes(st.control)?st.control:'offense',replays:st.replays==='moments'?'moments':'all',fast:!!st.fast,sound:st.sound!==false,integrations};
  if(cs.activeBattle&&(typeof cs.activeBattle.seed!=='string'||typeof cs.activeBattle.battle!=='string'||cs.activeBattle.battle.length>4000000))cs.activeBattle=null;
  if(globalThis.CallSheet?.battle)cs.settings.headset=globalThis.CallSheet.battle.headsetSettings(st.headset);
  if(['system','reduced','instant'].includes(st.motion))cs.settings.motion=st.motion;
  if(['auto','primary'].includes(st.readMode))cs.settings.readMode=st.readMode;
  for(const key of ['guidedDrivePending','guidedDriveDone'])if(Object.hasOwn(st,key))cs.settings[key]=st[key]===true;
  cs.games=Number.isFinite(Number(cs.games))?Math.max(0,Math.min(99999,Math.round(Number(cs.games)))):0;cs.seenHelp=!!cs.seenHelp;
  // AI programs' playbooks, keyed by team id. Kept small: only programs you play, plus your rival.
  const ai={};for(const [id,pb] of Object.entries(cs.ai&&typeof cs.ai==='object'?cs.ai:{}).slice(0,40)){const n=normalizeCardPlaybook(pb,2);if(n)ai[id]=n}
  cs.ai=ai;
  // Old saves may still carry an alumnus in the rolling ledger. Preserve it before trimming.
  for(const book of [cs.playbook,...Object.values(ai)])for(const honor of book?.ringOfHonor||[]){
    if(!honor.cardCareer&&Object.hasOwn(cs.players||{},honor.playerId)){
      const c=cleanCardCareer(cs.players[honor.playerId]);if(c)honor.cardCareer=c;
    }
  }
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
  const anyCard=id=>typeof id==='string'&&[D?.PLAYS,D?.CALLS,D?.TACTICS].some(t=>t&&Object.hasOwn(t,id)&&!t[id].signature);
  const packKeys=new Set();
  cs.rewardPacks=(Array.isArray(cs.rewardPacks)?cs.rewardPacks:[]).filter(x=>x&&typeof x==='object'&&typeof x.key==='string')
    .map(x=>({key:x.key.slice(0,60),year:ci(x.year),type:typeof x.type==='string'?x.type.slice(0,20):'reward',title:typeof x.title==='string'?x.title.slice(0,60):'Reward Pack',subtitle:typeof x.subtitle==='string'?x.subtitle.slice(0,160):'',cards:(Array.isArray(x.cards)?x.cards:[]).filter(anyCard).slice(0,6)}))
    .filter(x=>x.cards.length&&!packKeys.has(x.key)&&packKeys.add(x.key));
  cs.programPackKeys=[...new Set([...(Array.isArray(cs.programPackKeys)?cs.programPackKeys:[]),...(Array.isArray(cs.rewardKeys)?cs.rewardKeys:[]),...packKeys].filter(k=>typeof k==='string'&&/^(?:album:\w{1,32}|(?:booster|signing):\d{1,8})$/.test(k)))];
  cs.rewardKeys=(Array.isArray(cs.rewardKeys)?cs.rewardKeys:[]).filter(k=>typeof k==='string').map(k=>k.slice(0,60)).slice(-120);
  if(cs.gradeSnap!==undefined){const g=cs.gradeSnap;cs.gradeSnap=g&&typeof g==='object'&&g.grades&&typeof g.grades==='object'?{year:ci(g.year),grades:Object.fromEntries(Object.entries(g.grades).filter(([k,v])=>k.length<64&&Number.isFinite(Number(v))).slice(0,200).map(([k,v])=>[k,ci(v)]))}:undefined;if(!cs.gradeSnap)delete cs.gradeSnap}
  if(typeof cs.trackedAlbum!=='string'||!/^\w{1,32}$/.test(cs.trackedAlbum))delete cs.trackedAlbum;
  cs.cardStreak=ci(cs.cardStreak);
  if(cs.springStandout!==undefined){const x=cs.springStandout,str=v=>String(v??'').slice(0,60);cs.springStandout=x&&typeof x==='object'&&x.id!=null?{year:ci(x.year),roleId:str(x.roleId),role:str(x.role),id:str(x.id),name:str(x.name),starterId:str(x.starterId),starterName:str(x.starterName),score:str(x.score)}:null}
  cs.milestones=[...new Set((Array.isArray(cs.milestones)?cs.milestones:[]).filter(x=>['bowl_win','conf_title','unbeaten','national_title'].includes(x)))];
  cs.honors=Object.fromEntries(Object.entries(cs.honors&&typeof cs.honors==='object'?cs.honors:{}).filter(([k,v])=>k.length<64&&Number.isFinite(Number(v))).slice(0,200).map(([k,v])=>[k,ci(v)]));
  cs.schemeGrants=cleanStaffCards(cs.schemeGrants);
  cs.installFocus=typeof cs.installFocus==='string'&&cs.installFocus.length<60?cs.installFocus:null;
  cs.filmLog=(Array.isArray(cs.filmLog)?cs.filmLog:[]).filter(x=>x&&typeof x==='object').slice(-3).map(x=>({year:ci(x.year),week:ci(x.week),plays:Object.fromEntries(Object.entries(x.plays&&typeof x.plays==='object'?x.plays:{}).filter(([k,v])=>k.length<60&&Number.isFinite(Number(v))).slice(0,60).map(([k,v])=>[k,ci(v)]))}));
  cs.lastWeekNews=(Array.isArray(cs.lastWeekNews)?cs.lastWeekNews:[]).filter(x=>x&&typeof x==='object'&&typeof x.team==='string').slice(0,60);
  // Season call ledgers for the recap: at most two seasons, bounded maps of counts.
  const cnum=v=>Number.isFinite(Number(v))?Math.round(Number(v)*10)/10:0;
  cs.seasonCalls=Object.fromEntries(Object.entries(cs.seasonCalls&&typeof cs.seasonCalls==='object'?cs.seasonCalls:{}).filter(([k,v])=>/^\d{4}$/.test(k)&&v&&typeof v==='object').slice(-2)
    .map(([k,v])=>[k,{games:ci(v.games),snaps:ci(v.snaps),mine:ci(v.mine),
      plays:Object.fromEntries(Object.entries(v.plays&&typeof v.plays==='object'?v.plays:{}).filter(([id,t])=>id.length<60&&t&&typeof t==='object').slice(0,80).map(([id,t])=>[id,{n:ci(t.n),yards:cnum(t.yards),stops:ci(t.stops),mine:ci(t.mine)}])),
      players:Object.fromEntries(Object.entries(v.players&&typeof v.players==='object'?v.players:{}).filter(([id,p])=>id.length<64&&p&&typeof p==='object').slice(0,150).map(([id,p])=>[id,{name:String(p.name||'').slice(0,60),w:ci(p.w),l:ci(p.l)}]))}]));
  const plan=cs.rivalryPrep;
  if(plan&&typeof plan.match==='string'&&plan.match.length<=240&&typeof plan.id==='string'&&plan.id.length<=64)cs.rivalryPrep={match:plan.match,id:plan.id};
  else delete cs.rivalryPrep;
  // Last three card meetings per opponent, with at most two remembered catches per rivalry meeting.
  const fc=(o,keys)=>Object.fromEntries(keys.map(k=>[k,ci(o?.[k])]));
  cs.oppFilm=Object.fromEntries(Object.entries(cs.oppFilm&&typeof cs.oppFilm==='object'?cs.oppFilm:{}).filter(([k,v])=>k.length<64&&Array.isArray(v)).slice(-80)
    .map(([k,v])=>[k,v.filter(x=>x&&typeof x==='object').slice(-3).map(x=>({year:ci(x.year),week:ci(x.week),def:fc(x.def,['pressure','man','zone','total']),off:fc(x.off,['run','pass','total']),...(cleanRivalryPlay(x.rivalryPlay)?{rivalryPlay:cleanRivalryPlay(x.rivalryPlay)}:{}),...(x.star&&typeof x.star==='object'&&x.star.id!=null&&typeof x.star.name==='string'?{star:{id:String(x.star.id).slice(0,64),name:x.star.name.slice(0,60),w:ci(x.star.w),l:ci(x.star.l)}}:{})}))]));
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
  let loadingSignatureArchive=null;
  function syncSignatures(meta,me){
    if(!meta.playbook||!me)return[];
    const owners=new Map();for(const team of universe.teams)for(const p of team.roster||[])owners.set(String(p.id),{team,p});
    const books=[{team:me,pb:meta.playbook},...Object.entries(meta.ai||{}).map(([id,pb])=>({team:universe.teams.find(t=>String(t.id)===id),pb})).filter(x=>x.team&&x.team.id!==me.id)];
    const moves=[],seen=new Set(),lineups=new Map();let needsArchive=false;
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
            CS.signatures.remember(incoming,`${universe.year} · Transferred from ${team.name} to ${owner.team.name}.`);
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
          // Hot saves omit archived players until their separate archive is loaded.
          if(!arch&&archiveIsDeferred()){needsArchive=true;return true}
          if(arch){if(!(pb.ringOfHonor||[]).some(x=>String(x.playerId)===id))(pb.ringOfHonor??=[]).push({...sg,...(meta.players?.[id]?{cardCareer:cleanCardCareer(meta.players[id])}:{}),career:careerLine(arch.career),exit:arch.exitReason||'',year:arch.retiredYear||universe.year});
            if(team.id===me.id)moves.push({name:sg.name,how:'ring',exit:arch.exitReason||''});
          }else{(pb.history??=[]).push({id:sg.id,kind:'departed',side:sg.side});if(team.id===me.id)moves.push({name:sg.name,how:'left'})}
        }
        return false;
      });
    }
    if(needsArchive&&loadingSignatureArchive!==universe){
      const target=universe;loadingSignatureArchive=target;
      ensureArchiveLoaded().then(()=>{
        if(universe!==target||target.callSheet!==meta||selected()?.id!==me.id||archiveIsDeferred()||!integrationOn(SIGNATURE_LINK))return;
        syncSignatures(meta,me);autosaveAfter('game');
      }).catch(err=>console.warn('Signature archive unavailable; keeping cards until the next check.',err)).finally(()=>{
        if(loadingSignatureArchive===target)loadingSignatureArchive=null;
      });
    }
    return moves;
  }
  const SIGNATURE_LINK=registerCardIntegration({id:'signature-graduation',label:'Signature cards follow players',about:'Transfers bring their signatures to their new program; graduates retire to the Ring of Honor. Extra signatures stay in your collection.',
    hooks:{launch(ctx){ctx.cfg.moves=syncSignatures(cardMeta(),ctx.me)},weekTick(){syncSignatures(cardMeta(),selected())},offseason(){syncSignatures(cardMeta(),selected())}}});

  // Scouting fog: until your staff knows the opponent well, their players' ratings show as ranges.
  const FOG_LINK=registerCardIntegration({id:'scouting-fog',label:'Scouting fog',about:'Opponent ratings show as ranges until your film confidence is high. Scouting sharpens them.',
    hooks:{launch(ctx){
      ctx.cfg.scouting={confidence:filmConfidence(ctx.me,ctx.opp,ctx.g)};
    }}});
  // Postseason games after a layoff (bowls, playoff rounds, the title game; not the conference championship, which
  // follows the season directly) get an extra week of film: +6 confidence, within the staff formula's 94 ceiling.
  const PREP_WEEK=6,PREP_CAP=94;
  const prepWeekFor=g=>!!(g?.postseason&&g.stage&&g.stage!=='conference');
  function filmConfidence(me,opp,g=null){let confidence=70;try{const r=v0102WeeklyOpponentReport(me,opp);if(Number.isFinite(Number(r?.confidence)))confidence=Number(r.confidence)}catch(err){}
    return prepWeekFor(g)?Math.min(PREP_CAP,confidence+PREP_WEEK):confidence}
  // Coordinator and head coach hiring: show how a candidate would change the card battle's film read, as a band (the
  // ratings themselves stay letter grades). Uses Dynasty's own staff-confidence formula on a copy of the staff.
  const FILM_BAND=c=>{const f=CS.battle.filmFog(c);return f.exact?'High (exact grades)':f.spread===1?'Medium (one-point ranges)':'Low (wide ranges)'};
  function hireFilmEffect(o,c){
    if(!o||!c||!['OC','DC','HC'].includes(o.slot)||typeof v0102WeeklyStaffConfidence!=='function'||!integrationOn(FOG_LINK))return null;
    const t=T(o.schoolName)||selected();if(!t||t.id!==selected()?.id)return null;
    const now=v0102WeeklyStaffConfidence(t),staff={...t.staff,[o.slot]:{...(t.staff?.[o.slot]||{}),playCall:c.playCall,development:c.development}};
    const after=v0102WeeklyStaffConfidence({...t,staff}),a=FILM_BAND(now),b=FILM_BAND(after);
    return{now:a,after:b,change:Math.sign(after-now),text:a===b?`Card film read stays ${a}${after>now?', a little sharper':after<now?', a little blurrier':''}.`:`Card film read: ${a} → ${b}.`};
  }
  if(typeof candidateCardHTML==='function'){
    const candidateBase=candidateCardHTML;
    candidateCardHTML=function candidateCardWithFilm(o,c){
      const html=candidateBase(o,c);let fx=null;try{fx=hireFilmEffect(o,c)}catch(err){console.error(err)}
      // Right under the ratings row (Recruit · Develop · Evaluate · Call · Adapt).
      return fx?html.replace(/(· Adapt [^<]*<\/div>)/,`$1<div class="small cs-hire-film" data-film-change="${fx.change}">${escH(fx.text)}</div>`):html;
    };
  }
  // Before kickoff: how sharply you will see their grades, and what actually changes that (staff, not recruiting).
  function filmNote(me,opp,g=null){
    if(!me||!opp||!integrationOn(FOG_LINK))return null;const f=CS.battle.filmFog(filmConfidence(me,opp,g)),prep=prepWeekFor(g)?` Includes +${PREP_WEEK} for the extra week of postseason film.`:'';
    return{...f,prep:!!prep,text:(f.exact?`Film confidence ${f.confidence}%: you see ${opp.name}'s exact grades in the battle.`:`Film confidence ${f.confidence}% (your coordinators and head coach): ${opp.name}'s grades show as ranges in the battle. ${f.nextAt}% ${f.nextAt===82?'shows them exactly':'narrows them'}.`)+prep};
  }

  // Practice reps: this week's prep focus trains the matching cards toward evolution.
  const PRACTICE={pass_protection:['deep_cross','pa_boot'],run_blocking:['inside_zone','outside_zone','power'],explosive_pass:['deep_cross','pa_boot'],
    run_fits:['run_fit','cover3'],coverage:['two_high','cover1'],pressure:['zone_pressure','cover1']};
  const PRACTICE_REPS=5;
  function practiceReps(team,opp){
    const wp=team.weeklyPrep;if(universe.phase!=='regular'||!wp||wp.opponent!==opp.name||wp.year!==universe.year||wp.week!==universe.week)return{};
    const out={};for(const f of wp.focuses||[])for(const root of PRACTICE[f]||[])out[root]=(out[root]||0)+PRACTICE_REPS;
    return out;
  }
  const PRACTICE_LINK=registerCardIntegration({id:'practice-reps',label:'Practice builds mastery',about:'Each week’s prep focus adds mastery reps to the matching cards.',
    hooks:{
      launch(ctx){ctx.cfg.practiceReps=practiceReps(ctx.me,ctx.opp)}, // a coached game: the battle adds them
      afterGame(ctx){if(ctx.coached)return;const pb=userPlaybook();for(const [root,n] of Object.entries(practiceReps(ctx.me,ctx.opp)))CS.evolution?.addReps(pb,root,n)}
    }});

  // The facilities rating is already earned through Dynasty Lab's building projects.
  const FACILITY_LINK=registerCardIntegration({id:'facility-playbook',label:'Facilities support the playbook',about:'Facilities 75 unlock 16 play/tactic slots; 90 unlock 18. Earned capacity stays unlocked.',
    hooks:{launch(ctx){syncProgramCapacity(ctx.me,userPlaybook());ctx.cfg.playbook=userPlaybook()},weekTick(){syncProgramCapacity(selected(),userPlaybook())},offseason(){syncProgramCapacity(selected(),userPlaybook())}}});
  function syncProgramCapacity(team,pb){if(team&&pb&&integrationOn(FACILITY_LINK))CS.program.syncCapacity(pb,team);return pb}
  function trainingFor(team,pb){
    const support={},roster=new Map((team.roster||[]).map(p=>[String(p.id),p])),lineup=gameLineup(team).lineup;
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
    // Existing program packs promise their exact IDs. Keep their unclaimed one-of-ones out
    // of subsequent draws and game-pack exchanges until the program pack is resolved.
    for(const p of m.rewardPacks||[])for(const id of p.cards)if(CS.data.rarityOf(id)==='legendary')out.push(id);
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
    const lineup=CS.adapter.lineupFromTeam(team).lineup,ready=CS.evolution.ready(pb,{lineup})[0];
    if(ready){const open=ready.options.filter(id=>!ready.locks?.[id]);
      if(open.length){const pick=open.length>1&&CS.world.fit(spec,open[1])>CS.world.fit(spec,open[0])?open[1]:open[0];CS.evolution.evolve(pb,ready.rootId,pick,{lineup});news.push({team:team.name,evolved:pick})}}
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
  // Eligibility comes from Dynasty Lab itself. The plain ID snapshot crosses the battle iframe boundary.
  // Keep spring practice separate: redshirts may practice, but cannot appear in a scheduled game.
  function availabilityFor(team){return{unavailableIds:(team.roster||[]).filter(p=>!gameAvailable(p)).map(p=>String(p.id))}}
  function gameLineup(team){return CS.adapter.lineupFromTeam(team,availabilityFor(team))}
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
    applyRivalryPrep(cfg,opp);
    // Eligibility is a game rule, not an optional program bonus. Apply after hooks replace program info.
    for(const side of ['home','away'])cfg.program[side]={...cfg.program[side],...availabilityFor(cfg[side])};
    if(cfg.moves.length)try{autosaveAfter('game')}catch(err){}
    return cfg;
  }
  // A simulated week: your coordinators play the card battle with your playbook, then it records like any game.
  function simulateCardGame(cfg=buildLaunch()){
    const pb=userPlaybook(),AD=CS.adapter;
    CS.signatures.registerAll(pb);for(const p of Object.values(cardMeta().ai))CS.signatures.registerAll(p);
    const mine=CS.packs.decksOf(pb),theirs=cfg.oppPlaybook?CS.packs.decksOf(cfg.oppPlaybook):null;
    const team=(t,side)=>AD.battleTeam(t,side===cfg.userSide?mine:theirs,cfg.program?.[side]);
    const b=CS.battle.simulate({home:team(cfg.home,'home'),away:team(cfg.away,'away'),seed:`${cfg.seed}:sim`,user:cfg.userSide,headset:cardMeta().settings.headset,classicSide:cfg.userSide,weather:cfg.weather,conditions:cfg.conditions,rivalry:cfg.rivalry});
    return{cfg,b};
  }
  function simWithCardsOn(){return!!universe?.callSheet&&integrationOn(SIM_WITH_CARDS)&&!!globalThis.CallSheet?.battle}
  const SIM_WITH_CARDS=registerCardIntegration({id:'sim-with-cards',label:'Simulated games use your playbook',about:'Coordinators use your deck, evolutions and signatures in regular-season and postseason games, with mastery and card rewards.',hooks:{}});
  // Player stories: last game's card Player of the Game joins This Week's factual player stories. Reads the recorded
  // moment (6+ duels won); no new evidence and no rating is shown. Kept within the stories' own limit.
  function cardDuelStory(t){
    const cs=universe?.callSheet;if(!cs||!t||t.id!==selected()?.id||!integrationOn(PLAYER_STORY_LINK))return null;
    const m=[...(cs.moments||[])].reverse().find(x=>x.kind==='pog'&&x.year===universe.year);if(!m)return null;
    const last=Math.max(...(cs.moments||[]).filter(x=>x.year===universe.year&&Number.isFinite(x.week)).map(x=>x.week));
    if(m.week!==last||m.week<universe.week-1)return null; // only the most recent game, and only until the next one
    const p=(t.roster||[]).find(x=>String(x.id)===String(m.playerId));if(!p)return null;
    return{playerId:p.id,name:p.name,pos:p.pos,type:'card_duels',priority:93,title:`${p.name} — won the matchups`,summary:m.text.replace(/^Card Player of the Game: /,'Card battle, Week '+m.week+': '),tone:'good'};
  }
  const PLAYER_STORY_LINK=registerCardIntegration({id:'card-player-stories',label:'Card duels in player stories',about:'Last game’s card Player of the Game appears among This Week’s player stories.',hooks:{}});
  if(typeof v0102PlayerStories==='function'){
    const storiesBase=v0102PlayerStories;
    v0102PlayerStories=function v0102PlayerStoriesWithCards(t=selected()){
      const list=storiesBase(t);let extra=null;try{extra=cardDuelStory(t)}catch(err){console.error(err)}
      if(!extra||list.some(x=>String(x.playerId)===String(extra.playerId)))return list;
      return [...list,extra].sort((a,b)=>b.priority-a.priority||String(a.name).localeCompare(String(b.name))).slice(0,Math.max(list.length,5));
    };
  }
  // Card careers: every duel your players win or lose, and their highlight plays, from both coached and simulated games.
  function recordOppFilm(oppId,film,week,tally){
    if(oppId==null||!film||typeof film!=='object')return;const meta=cardMeta(),key=String(oppId),n=v=>Math.max(0,Math.min(999,Number(v)|0));
    const entry={year:universe.year,week:n(week),def:{pressure:n(film.def?.pressure),man:n(film.def?.man),zone:n(film.def?.zone),total:n(film.def?.total)},off:{run:n(film.off?.run),pass:n(film.off?.pass),total:n(film.off?.total)}};
    // Their player who won the most duels against you (4+ wins), for rivalry history. Names come from the battle tally.
    const opp=teamById(oppId),theirs=new Set((opp?.roster||[]).map(p=>String(p.id)));
    const star=Object.entries(tally&&typeof tally==='object'?tally:{}).filter(([id,t])=>theirs.has(String(id))&&(t.w|0)>=4).sort((a,c)=>((c[1].w|0)-(c[1].l|0))-((a[1].w|0)-(a[1].l|0))||(c[1].w|0)-(a[1].w|0))[0];
    const play=cleanRivalryPlay(film.rivalryPlay);
    if(play&&theirs.has(play.id)&&(selected()?.protectedRivalIds||[]).includes(oppId))entry.rivalryPlay=play;
    if(star)entry.star={id:String(star[0]).slice(0,64),name:String(star[1].name||'').slice(0,60),w:n(star[1].w),l:n(star[1].l)};
    meta.oppFilm??={};meta.oppFilm[key]=[...(meta.oppFilm[key]||[]),entry].slice(-3);
    addSeasonCalls(film,tally);
  }
  // The season's card battles, summed for the recap: this year and last. Counts only; validated on load.
  function addSeasonCalls(film,tally){
    const own=film?.own;if(!own)return;const meta=cardMeta(),y=String(universe.year),n=v=>Math.max(0,Number(v)|0);
    meta.seasonCalls??={};const L=meta.seasonCalls[y]??={games:0,snaps:0,mine:0,plays:{},players:{}};
    L.games++;L.snaps+=n(own.snaps);L.mine+=n(own.mine);
    for(const [id,t] of Object.entries(own.plays||{})){if(!CS.data?.PLAYS?.[id])continue;const r=L.plays[id]??={n:0,yards:0,stops:0,mine:0};r.n+=n(t.n);r.yards+=Number(t.yards)||0;r.stops+=n(t.stops);r.mine+=n(t.mine)}
    const mine=new Set((selected()?.roster||[]).map(p=>String(p.id)));
    for(const [id,t] of Object.entries(tally&&typeof tally==='object'?tally:{})){if(!mine.has(String(id)))continue;const r=L.players[id]??={name:String(t.name||'').slice(0,60),w:0,l:0};r.w+=n(t.w);r.l+=n(t.l)}
    for(const k of Object.keys(meta.seasonCalls))if(Number(k)<universe.year-1)delete meta.seasonCalls[k];
  }
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
    if(sim&&out?.ok){completeSimCardGame(sim);try{markArchive(out.result?.gameId,{classic:simClassic(sim),moments:CS.battle.decidingMoments(sim.b)})}catch(err){console.error(err)}if(!options.advancingWeek)try{autosaveAfter('game')}catch(err){console.error(err)}}
    return out;
  };
  function completeSimCardGame(sim){
      const pb=userPlaybook(),breakout=CS.signatures.candidate(sim.b,sim.cfg.userSide,pb),me=selected(),opp=sim.cfg.userSide==='home'?sim.cfg.away:sim.cfg.home;
      CS.evolution.recordReps(pb,sim.b.log,sim.cfg.userSide,sim.cfg.trainingRates||{});pb.gamesPlayed=(pb.gamesPlayed||0)+1;cardMeta().games++;
      const won=sim.b.game.score[sim.cfg.userSide]>sim.b.game.score[sim.cfg.userSide==='home'?'away':'home'];pb.record[won?'w':'l']++;
      CS.packs.awardAchievements(pb,sim.b,sim.cfg.userSide);
      // Sim delegates the pick to the same scheme-aware coordinator used by AI programs.
      const pack=CS.packs.openPack(pb,{won,rivalry:sim.cfg.rivalry,stage:sim.cfg.stage||null,favor:won?sim.cfg.packFavor:null,favorWhy:sim.cfg.packFavorWhy,seed:sim.cfg.seed,oppTendency:sim.b.tend[sim.cfg.userSide==='home'?'away':'home'],worldTaken:takenLegendaries()});
      let picked=null;if(pack.cards.length){const spec=aiSpec(me),pick=CS.world.aiPick(spec,pack,pb,DynastyRng.create(`${sim.cfg.seed}:pick`));picked=pick;CS.packs.applyPick(pb,pick);
        for(let over=CS.packs.overCapacity(pb);over;over=CS.packs.overCapacity(pb))CS.world.aiCut(spec,pb,over)}
      if(breakout){const sg=CS.signatures.breakoutCard(sim.b,sim.cfg.userSide,breakout,{season:universe.year,colors:sim.b.teams[sim.cfg.userSide].colors});if(pb.signatures.length<CS.signatures.SLOTS)CS.signatures.add(pb,sg);else{(pb.reserveSignatures??=[]).push(sg);pb.lastSignatureGame=pb.gamesPlayed;CS.signatures.register(sg)}}
      (cardMeta().moments??=[]).push({year:universe.year,week:sim.week,kind:'reward',text:`${sim.cfg.label}: ${pack.title}${picked?' — '+(CS.packs.cardDef(picked.id)?.name||picked.id)+' added to the collection':''}.`});
      try{addCardCareer(CS.battle.duelTally(sim.b),sim.week)}catch(err){console.error(err)}
      try{const oppSide=sim.cfg.userSide==='home'?'away':'home';recordOppFilm(sim.cfg[oppSide]?.id,CS.battle.callFilm(sim.b,sim.cfg.userSide),sim.week,CS.battle.duelTally(sim.b))}catch(err){console.error(err)}
      try{noteUsage(sim.b.game,sim.cfg.userSide)}catch(err){console.error(err)}
      {const us=sim.b.game.score[sim.cfg.userSide],them=sim.b.game.score[sim.cfg.userSide==='home'?'away':'home'];programAwards({won,us,them,postseason:!!sim.postseason,ranks:sim.ranks,oppName:opp?.name,opp})}
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
      runHook('launch',{cfg,g:{week,postseason:true,stage:cfg.stage},home,away,me,opp,userSide});
      applyRivalryPrep(cfg,opp);
      for(const side of ['home','away'])cfg.program[side]={...cfg.program[side],...availabilityFor(cfg[side])};
      const sim=simulateCardGame(cfg);sim.week=week;sim.postseason=true;sim.ranks=rankSnapshot(opp);
      const out=postseasonRecordBase(home,away,{...options,externalState:sim.b.game});
      if(out?.ok){completeSimCardGame(sim);out.record.cardBattle=true;const classic=simClassic(sim);if(classic)out.record.classicDrive=classic;try{out.record.cardMoments=cleanMoments(CS.battle.decidingMoments(sim.b))}catch(err){console.error(err)}}return out;
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
        const meta=cardMeta();if(out?.record){out.record.cardBattle=true;out.record.cardCoached=true;if(p.classic)out.record.classicDrive=p.classic;if(p.moments?.length)out.record.cardMoments=p.moments}
        try{addCardCareer(p.tally,options.week)}catch(err){console.error(err)}
        try{recordOppFilm(String(home.id)===String(selected().id)?away.id:home.id,p.film,options.week,p.tally)}catch(err){console.error(err)}
        const side=String(home.id)===String(selected().id)?'home':'away',us=Number(p.state?.score?.[side])||0,them=Number(p.state?.score?.[side==='home'?'away':'home'])||0;
        try{noteUsage(p.state,side)}catch(err){console.error(err)}
        programAwards({won:us>them,us,them,postseason:true,ranks:p.ranks,oppName:p.oppName,opp:side==='home'?away:home});
        meta.recordedBattleSeed=p.seed;meta.lastPostseasonGameId=out?.result?.gameId||out?.record?.id||null;delete meta.pendingPostseason;
      }};
    };
    const STAGE_RUN={conference:()=>simConferenceChampionships(),bowl:()=>simBowls(),playoff:()=>simPlayoff(),title:()=>simPlayoff()};
    function recordPostseasonBattle(g,state,tally,key,moments,film,classic){
      const seed=key||g.seed;
      const oppTeam=teamById(String(g.homeId)===String(selected().id)?g.awayId:g.homeId);
      cardMeta().pendingPostseason={seed,classic,year:universe.year,label:g.label,homeId:g.homeId,awayId:g.awayId,ranks:rankSnapshot(oppTeam),oppName:oppTeam?.name||'',moments:cleanMoments(moments),state:JSON.parse(JSON.stringify(state)),tally:tally&&typeof tally==='object'?JSON.parse(JSON.stringify(tally)):{},film:film&&typeof film==='object'?JSON.parse(JSON.stringify(film)):null};
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
    hooks:{weekTick(ctx){boosterPack(ctx.year,ctx.week);schemeCards();checkAlbums()},offseason(){returnBorrowed();schemeCards();signingPack();legacyCards();checkAlbums()}}});
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
    const meta=cardMeta();meta.rewardPacks??=[];meta.programPackKeys??=[];
    if(meta.programPackKeys.includes(key)||meta.rewardKeys?.includes(key)||meta.rewardPacks.some(p=>p.key===key)||!pack.cards.length)return false;
    meta.programPackKeys.push(key);
    meta.rewardPacks.push({key,year:universe.year,type:pack.type,title:pack.title,subtitle:pack.subtitle,cards:pack.cards});
    rewardMoment(`${pack.title} earned. Open it from Collection.`);return true;
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
  // Dynasty enrollment and alumni records use recruitingMemory; retain older card-only records.
  const recruitmentOf=p=>p?.recruitingMemory??p?.recruitment;
  function signingPack(){
    const me=selected();if(!programRewardsOn()||!me)return;
    const signees=(me.roster||[]).filter(p=>String(recruitmentOf(p)?.schoolId)===String(me.id)&&Number(recruitmentOf(p)?.season)>=universe.year-1);
    if(!signees.length)return;
    const season=Math.max(...signees.map(p=>Number(recruitmentOf(p).season))),cls=signees.filter(p=>Number(recruitmentOf(p).season)===season),w={},count={};
    for(const p of cls){count[p.pos]=(count[p.pos]||0)+1;for(const [k,v] of Object.entries(POS_WEIGHTS[p.pos]||{}))w[k]=(w[k]||0)+v}
    const top=Object.entries(count).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([pos,n])=>`${n} ${pos}`).join(', ');
    const pack=CS.packs.rewardPack(userPlaybook(),{seed:`signing:${season}:${me.id}`,weights:w,n:4,bonusRare:Math.min(.12,cls.length/150),worldTaken:takenLegendaries(),type:'signing',title:'Signing Day Pack',
      subtitle:`Built around your ${cls.length} signee${cls.length===1?'':'s'} (${top}) · pick 1 of 4`});
    queueRewardPack(`signing:${season}`,pack);
    try{signingGoals(cls,me,season)}catch(err){console.error(err)}
  }
  // Signing day: for up to two signees whose public archetype fits your active playbook, name the signature they are
  // chasing and the breakout bar. A goal, not a grant; posted once per class.
  function signingGoals(cls,me,season){
    const meta=cardMeta(),key=`goal:${season}`;if((meta.rewardKeys||[]).includes(key))return;
    const picks=cls.map(p=>({p,fit:recruitingFit(me,p),role:battleRoleOf(p,me)?.role})).filter(x=>x.role&&x.fit.plays?.length)
      .sort((a,b)=>(Number(recruitmentOf(b.p)?.stars)||0)-(Number(recruitmentOf(a.p)?.stars)||0)||b.fit.plays.length-a.fit.plays.length).slice(0,2);
    for(const x of picks){
      const spec=CS.signatures.specFor(CS.adapter.toBattlePlayer(x.p,x.role)),name=CS.signatures.describe(spec)?.def?.name;if(!name)continue;
      meta.moments.push({year:universe.year,week:0,kind:'signing-goal',playerId:x.p.id,text:`Signed: ${x.p.name} (${x.p.pos}) fits your ${x.fit.plays.slice(0,2).join(' and ')} and is chasing ${name}. Breakout bar: ${CS.signatures.BREAKOUT.wins}+ duels at ${Math.round(CS.signatures.BREAKOUT.rate*100)}% in one game, or catch fire ${CS.signatures.BREAKOUT.fire} times.`});
    }
    meta.moments=meta.moments.slice(-60);(meta.rewardKeys??=[]).push(key);
  }
  function schemeCards(){
    const me=selected();if(!programRewardsOn()||!me?.staff)return;
    coachDepartures();
    const pb=userPlaybook(),grants=cardMeta().schemeGrants??={};
    for(const role of ['OC','DC']){
      const c=me.staff[role],id=CS.data.SCHEME_CARDS?.[c?.preferredScheme];
      if(!id||c?.id==null)continue;
      const def=CS.packs.cardDef(id),side=def.side,owned=[...pb[side].base,...pb[side].wrinkles,...(pb.reserve?.[side]?.wrinkles||[])].includes(id);
      const legacy=pb.programCards?.includes(id);
      if(legacy)pb.programCards=pb.programCards.filter(x=>x!==id);
      if(!grants[id]||!owned){
        if(!legacy||!owned){
          CS.packs.grantCard(pb,id,{kind:'staff',why:c.name||role});
          rewardMoment(`${c.name||role} brought ${def.name} to your collection. It travels with the coordinator.`);
        }
        grants[id]={coachId:c.id,name:c.name||role};
      }
    }
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
      const spec=CS.signatures.specFor(CS.adapter.toBattlePlayer(heir,slot[0]),{legacy,earned:`Legacy of #${entry.number??''} ${legacy.last}`,season:universe.year,provenance:[`${universe.year} · ${heir.name} inherited the retired number of ${legacy.name} at ${me.name}.`]});
      pb.signatures??=[];pb.reserveSignatures??=[];
      (pb.signatures.length<CS.signatures.SLOTS?pb.signatures:pb.reserveSignatures).push(spec);CS.signatures.register(spec);
      (pb.history??=[]).push({id:spec.id,kind:'legacy',side:spec.side});pb.legacies.push(legendId);carded.add(String(heir.id));
      rewardMoment(`${heir.name} inherits the legacy of #${entry.number??''} ${legacy.name}: a Legacy signature card.`);
    }
  }
  // After any recorded card game (coached or simulated, regular season or postseason).
  // ranks: {opp, me} read before the game was recorded.
  function programAwards({won,us,them,postseason,ranks,oppName,opp}){
    try{nemesisMoments(opp,won)}catch(err){console.error(err)}
    if(!programRewardsOn())return[];
    const meta=cardMeta(),got=[];meta.cardStreak=won?(meta.cardStreak|0)+1:0;
    const upset=won&&ranks&&ranks.opp<=10&&(ranks.me>25||ranks.me-ranks.opp>=15);
    if(upset&&grantProgramCard('giant_killer',`upset No. ${ranks.opp} ${oppName||''}`.trim()))got.push('giant_killer');
    if(meta.cardStreak>=3&&grantProgramCard('flea_flicker','three straight wins'))got.push('flea_flicker');
    if(won&&them<=7&&grantProgramCard('bluff_zero',`held a winner to ${them} points`))got.push('bluff_zero');
    if(won&&postseason&&grantProgramCard('jet_reverse','a postseason win'))got.push('jet_reverse');
    const borrowed=won&&opp?borrowRivalCard(opp):null;if(borrowed)got.push(borrowed);
    try{checkAlbums()}catch(err){console.error(err)}
    return got;
  }
  // Rivalry stakes: beat your protected rival and hold one of their cards until next season.
  function borrowRivalCard(opp){
    const me=selected(),meta=cardMeta();if(!me||!(me.protectedRivalIds||[]).map(String).includes(String(opp.id)))return null;
    const key=`rival:${universe.year}:${opp.id}`;meta.rewardKeys??=[];if(meta.rewardKeys.includes(key))return null;
    const pb=userPlaybook(),theirs=meta.ai?.[opp.id],taken=takenLegendaries();
    const pool=theirs?['off','def'].flatMap(side=>[...theirs[side].wrinkles,...theirs[side].tactics]).filter(id=>{const c=CS.packs.cardDef(id);return c&&!c.signature&&CS.data.rarityOf(id)!=='legendary'&&!c.evolvedFrom}):[];
    const id=pool.length?pool[Math.floor(DynastyRng.create(key).next()*pool.length)]:CS.packs.rewardPack(pb,{seed:key,n:1,worldTaken:taken}).cards[0];
    if(!id)return null;meta.rewardKeys.push(key);
    CS.packs.grantCard(pb,id,{kind:'borrowed',why:opp.name});(pb.borrowed??=[]).push({id,from:String(opp.name).slice(0,60),year:universe.year});
    rewardMoment(`Rivalry won: you hold ${opp.name}'s ${CS.packs.cardDef(id).name} until next season.`);return id;
  }
  function removeSuppliedCopy(pb,id){
    const side=CS.packs.cardDef(id).side,deck=pb[side],reserve=CS.packs.ensureCollection(pb)[side];
    const pile=[reserve.wrinkles,reserve.tactics,deck.wrinkles,deck.tactics].find(list=>list.includes(id));
    if(pile)pile.splice(pile.indexOf(id),1);
    else{
      const slot=deck.base.indexOf(id);if(slot<0)return false;
      const candidates=[...deck.wrinkles,...reserve.wrinkles].filter(x=>!deck.base.includes(x));
      const replacement=candidates.find(x=>{
        const c=CS.packs.cardDef(x);
        return c&&!c.trick&&!c.signature&&deck.base.some((old,i)=>{
          const next=i===slot?c:CS.packs.cardDef(old);return next.cost===0&&!next.needs;
        });
      });
      if(!replacement)return false;
      CS.packs.setBase(pb,side,slot,replacement);
      const source=[deck.wrinkles,reserve.wrinkles].find(list=>list.includes(id));
      source.splice(source.indexOf(id),1);
    }
    CS.packs.clearStaleOpener(pb);return true;
  }
  // Borrowed cards go back after the season: one copy, from wherever it sits (a base slot gets a stored play back).
  function returnBorrowed(){
    const pb=universe.callSheet?.playbook;if(!pb?.borrowed?.length)return;
    pb.borrowed=pb.borrowed.filter(x=>{
      if(x.year>=universe.year)return true;
      const id=CS.packs.awardedId(pb,x.id),c=CS.packs.cardDef(id);if(!c)return false;
      removeSuppliedCopy(pb,id);
      rewardMoment(`${c.name} went back to ${x.from} for the new season.`);return false;
    });
    CS.packs.clearStaleOpener(pb);
  }
  const rankSnapshot=opp=>({opp:Number(opp?.rank)||99,me:Number(selected()?.rank)||99});
  // The Card Program's reward packs: pick one card for the collection.
  const reducedMotion=()=>{try{return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches}catch(err){return false}};
  function openRewardPack(gameKey){
    const meta=cardMeta(),pb=userPlaybook(),game=gameKey!=null;
    const pack=game?(pb.gamePacks||[]).find(p=>p.key===gameKey):(meta.rewardPacks||[])[0];if(!pack)return;
    if(meta.activeBattle){setStatus('Finish the current card battle before claiming a pack.');return}
    const trigger=document.activeElement,choices=game?CS.packs.gamePackChoices(pb,pack,takenLegendaries()):pack.cards.map(id=>({id:CS.packs.awardedId(pb,id)}));
    const dialog=document.createElement('dialog');dialog.id='rewardPack';dialog.setAttribute('aria-label',pack.title);
    const UI=CS.playbookUI;UI?.injectFaceCSS?.();
    const target=pursuit(),fit=CS.packs.packFit(pb,choices,{game,target,reserveLimit:CALL_SHEET_RESERVE_LIMIT});
    const card=c=>{
      const destinations=!game?['collection']:c.kind==='upgrade'?['upgrade']:['deck','collection'];
      const actions=destinations.map(want=>{
        const full=CS.packs.rewardDestination(pb,c,game,CALL_SHEET_RESERVE_LIMIT,want)==='full';
        const label=want==='upgrade'?'Upgrade '+cardName(c.replaces):want==='deck'?(full?'Deck limit reached':'Add to deck'):(full?'Collection limit reached':'Add to collection');
        return `<button type="button" data-take="${escH(c.id)}" data-destination="${want}" aria-label="${escH(label+' · '+cardName(c.id))}"${full?' disabled':''}>${escH(label)}</button>`;
      }).join('');
      const note=c.exchangeFor?`Alternate for ${cardName(c.exchangeFor)}: ${c.why}`:c.why;
      const footer=`${fit?.id===c.id?`<small data-pack-fit="${escH(c.id)}"><b>Coach’s pick:</b> ${escH(fit.reason)}</small>`:target?.missing.includes(c.id)?`<small>For your ${escH(target.name)} album</small>`:''}${note?`<small>${escH(note)}</small>`:''}<div class="rp-actions">${actions}${game?`<button type="button" data-try-card="${escH(c.id)}" aria-label="${escH('Try '+cardName(c.id))}">Try this card</button>`:''}</div>`;
      return UI?.faceHTML?UI.faceHTML(c.id,{footer}):`<article><b>${escH(cardName(c.id))}</b>${footer}</article>`;
    };
    const wrapText={booster:'BOOSTER',signing:'SIGNING<br>DAY',album:'ALBUM',film:'FILM<br>STUDY',victory:'VICTORY',rivalry:'RIVALRY',...Object.fromEntries(Object.entries(CS.packs.STAGE_PACKS).map(([k,p])=>[k,p.wrap]))}[pack.type]||'REWARD';
    dialog.innerHTML=`<style>#rewardPack{width:min(900px,94vw);padding:22px;border:1px solid #66592e;border-radius:16px;background:#10151f;color:#f2efe5;font:15px system-ui}#rewardPack::backdrop{background:#03060bd9}#rewardPack h2{margin:0 0 4px;color:#ffd76a}
.rp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin:16px 0}.rp-cards[hidden]{display:none}.rp-cards .cs-face{animation:rpIn .45s cubic-bezier(.2,1.3,.4,1) both}.rp-cards .cs-face:nth-child(2){animation-delay:.12s}.rp-cards .cs-face:nth-child(3){animation-delay:.24s}.rp-cards .cs-face:nth-child(4){animation-delay:.36s}.rp-cards .cs-face:nth-child(5){animation-delay:.48s}
@keyframes rpIn{from{opacity:0;transform:rotateY(80deg) translateY(16px)}to{opacity:1;transform:none}}
.rp-hint{grid-column:1/-1;margin:0}.rp-actions{display:grid;gap:2px}.rp-actions button:disabled{opacity:.6;cursor:not-allowed}.rp-cards .cs-face button,#rewardPack [data-later]{margin-top:6px;padding:9px;border-radius:8px;border:1px solid #66592e;background:#2a2412;color:#ffd76a;cursor:pointer;font-weight:700}
.rp-wrap{display:grid;place-items:center;gap:6px;width:180px;height:250px;margin:18px auto;border-radius:16px;border:2px solid #ffd84d;cursor:pointer;color:#1a1200;font:900 28px/1 system-ui;letter-spacing:.06em;background:linear-gradient(160deg,#ffe58a,#c8901a);box-shadow:0 14px 40px rgba(0,0,0,.5),inset 0 0 0 6px rgba(255,255,255,.18);animation:rpBob 1.6s ease-in-out infinite}
.rp-wrap small{font:700 12px system-ui;letter-spacing:.14em}.rp-wrap.rp-signing{background:linear-gradient(160deg,#9ad8ff,#2a62b8);color:#04122a;border-color:#cfeaff}.rp-wrap.rp-album{background:linear-gradient(160deg,#e3c3ff,#6a35b8);color:#170630;border-color:#f0dcff}
.rp-wrap.ripped{animation:rpRip .35s ease-in forwards}@keyframes rpBob{50%{transform:translateY(-6px) rotate(-1deg)}}@keyframes rpRip{to{opacity:0;transform:scale(1.35) rotate(4deg)}}
@media (prefers-reduced-motion:reduce){.rp-wrap,.rp-cards .cs-face{animation:none!important}}</style>
      <h2>${escH(pack.title)}</h2><p>${game?`${pack.year} · ${escH(pack.source)}<br>`:''}${escH(pack.subtitle||'')}</p><button type="button" class="rp-wrap rp-${escH(pack.type||'reward')}" data-rip>${wrapText}<small>TAP TO OPEN</small></button><div class="rp-cards" hidden>${game?'<p class="rp-hint">Add to deck to use a card next game. Add to collection to keep it for later. Upgrades replace the original card.</p>':''}${choices.map(card).join('')}</div><p role="status" data-pack-status></p><button type="button" data-later>Open later</button>`;
    document.body.appendChild(dialog);
    const close=()=>{dialog.close();dialog.remove();paintCardProgram();(document.querySelector(game?'[data-game-pack]':'[data-reward-pack]')||document.querySelector('#cardBinder [data-card-deck]')||trigger)?.focus?.()};
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
    dialog.querySelector('[data-later]').onclick=close;
    const rip=dialog.querySelector('[data-rip]');rip.onclick=()=>{rip.classList.add('ripped');setTimeout(()=>{rip.remove();dialog.querySelector('.rp-cards').hidden=false},reducedMotion()?0:330)};
    dialog.querySelectorAll('[data-try-card]').forEach(el=>el.onclick=()=>{
      const id=el.dataset.tryCard;
      dialog.querySelector('[data-pack-status]').textContent=pack.tryouts?.[id]||CS.battle.tryRewardCard({team:CS.adapter.battleTeam(selected(),null,availabilityFor(selected())),seed:pack.key},id);
    });
    dialog.querySelectorAll('[data-take]').forEach(el=>el.onclick=()=>{const r=game?takeGamePack(pack.key,el.dataset.take,el.dataset.destination):takeRewardCard(pack.key,el.dataset.take);if(r.ok)close();else dialog.querySelector('[data-pack-status]').textContent=r.error});
    dialog.showModal();
  }
  function takeGamePack(key,id,want){
    if(cardMeta().activeBattle)return{ok:false,error:'Finish the current card battle before claiming a pack.'};
    const pb=userPlaybook(),pack=pb.gamePacks?.find(p=>p.key===key),r=CS.packs.claimGamePack(pb,key,id,takenLegendaries(),CALL_SHEET_RESERVE_LIMIT,want);if(!r.ok)return r;
    const outcome=`${pack.title}: ${cardName(id)} ${r.stored?'added to your collection (not in deck)':r.upgrade?'upgraded in your playbook':'added to your deck'}${r.finish?' ('+r.finish+' print)':''}.`;
    rewardMoment(outcome);setStatus(outcome);
    try{checkAlbums()}catch(err){console.error(err)}
    try{autosaveAfter('game')}catch(err){console.error(err)}
    return r;
  }
  function takeRewardCard(key,id){
    if(cardMeta().activeBattle)return{ok:false,error:'Finish the current card battle before claiming a pack.'};
    const meta=cardMeta(),i=(meta.rewardPacks||[]).findIndex(x=>x.key===key);if(i<0)return{ok:false,error:'That pack is already open.'};
    const pack=meta.rewardPacks[i],pb=userPlaybook();if(!pack.cards.some(raw=>CS.packs.awardedId(pb,raw)===id))return{ok:false,error:'That card is not in this pack.'};
    if(CS.packs.rewardDestination(pb,{id},false,CALL_SHEET_RESERVE_LIMIT)==='full')return{ok:false,error:'Your collection is full for this card type. Choose another card or keep the pack for later.'};
    CS.packs.grantCard(pb,id,{kind:pack.type||'reward',why:pack.title});meta.rewardPacks.splice(i,1);
    rewardMoment(`${pack.title}: ${CS.packs.cardDef(id).name} added to the collection.`);
    try{checkAlbums()}catch(err){console.error(err)}
    try{autosaveAfter('game')}catch(err){console.error(err)}
    return{ok:true};
  }
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('click',e=>{const g=e.target.closest?.('[data-game-pack]');if(g)openRewardPack(g.dataset.gamePack);else if(e.target.closest?.('[data-reward-pack]'))openRewardPack()});

  // ============================================================== 6. recruiting and development, in cards
  // Nemesis recruits, visit pitches, camp auditions, portal arrivals with a card, Players of the Week breakouts,
  // mentors passing a signature down, and development stamps on player cards. Public data only: archetypes, the
  // depth chart, recruiting history, awards. Hidden true ratings are never read.
  const PEOPLE_LINK=registerCardIntegration({id:'people-cards',label:'Recruiting and development in cards',
    about:'Recruits who chose a rival play up against you, camp auditions settle close position battles, transfers bring a card, Players of the Week break out, mentors pass a signature down, and player cards show development stamps.',
    hooks:{
      launch(ctx){if(!peopleOn())return;const side=ctx.userSide==='home'?'away':'home',p=ctx.cfg.program??={home:{enabled:false},away:{enabled:false}};p[side]??={enabled:false};
        const conds=p[side].conds??={};for(const n of nemesesOn(ctx.opp,ctx.me))conds[n.p.id]=[{v:1,when:'money',src:`Nemesis: chose ${ctx.opp.name} over you`}]},
      weekTick(ctx){portalCards();potwBreakouts(ctx.week)},
      offseason(){gradeSnapshot();portalCards();mentorCards()}
    }});
  const peopleOn=()=>!!universe?.callSheet&&integrationOn(PEOPLE_LINK);
  // A nemesis: a player on that roster who had you in his final five, took your offer, and signed elsewhere.
  function isNemesis(p,team,me){const r=recruitmentOf(p);return!!r&&String(r.schoolId)===String(team.id)&&String(team.id)!==String(me.id)&&(r.offerSchoolIds||[]).map(String).includes(String(me.id))&&(r.topFiveSchoolIds||[]).map(String).includes(String(me.id))}
  function nemesesOn(team,me){
    if(!team||!me)return[];const lu=gameLineup(team).lineup,ids=new Set([...Object.values(lu.off),...Object.values(lu.def)].map(x=>String(x.id)));
    return(team.roster||[]).filter(p=>ids.has(String(p.id))&&isNemesis(p,team,me)).map(p=>({p}));
  }
  function nemesisMoments(opp,won){
    if(!won||!opp||!peopleOn())return;const meta=cardMeta();meta.rewardKeys??=[];
    for(const {p} of nemesesOn(opp,selected())){const key=`nemesis:${universe.year}:${p.id}`;if(meta.rewardKeys.includes(key))continue;meta.rewardKeys.push(key);
      rewardMoment(`Should've signed with us: you beat ${p.name}, who chose ${opp.name} over you.`)}
  }
  // Transfers who arrive bring one card from their old program's playbook (or one that suits their position).
  function portalCards(){
    const me=selected();if(!peopleOn()||!me)return;const meta=cardMeta(),pb=userPlaybook();meta.rewardKeys??=[];
    for(const p of me.roster||[]){
      const h=(p.transferHistory||[]).filter(x=>String(x.toSchoolId)===String(me.id)&&Number(x.season)>=universe.year-1).at(-1);if(!h)continue;
      const key=`portal:${p.id}:${h.season}`;if(meta.rewardKeys.includes(key))continue;meta.rewardKeys.push(key);
      const off=Object.values(CS.data.OFF_ROLES).includes(p.pos),side=off?'off':'def',theirs=meta.ai?.[h.fromSchoolId],taken=takenLegendaries();
      let id=null;
      if(theirs){const pool=[...theirs[side].wrinkles,...theirs[side].tactics].filter(x=>{const c=CS.packs.cardDef(x);return c&&!c.signature&&!(CS.data.rarityOf(x)==='legendary'&&taken.includes(x))});
        if(pool.length)id=pool[Math.floor(DynastyRng.create(`portal:${key}`).next()*pool.length)]}
      if(!id)id=CS.packs.rewardPack(pb,{seed:`portal:${key}`,weights:POS_WEIGHTS[p.pos]||{},n:1,worldTaken:taken}).cards[0];
      if(!id)continue;CS.packs.grantCard(pb,id,{kind:'portal',why:`${p.name} from ${h.fromSchool||'the portal'}`});
      rewardMoment(`${p.name} arrived from ${h.fromSchool||'the portal'} and brought ${CS.packs.cardDef(id).name} with him.`);
    }
    meta.rewardKeys=meta.rewardKeys.slice(-120);
  }
  function roleFor(p,team){const lu=CS.adapter.lineupFromTeam(team).lineup;return[...Object.entries(lu.off),...Object.entries(lu.def)].find(([,bp])=>String(bp.id)===String(p.id))?.[0]||battleRoleOf(p,team)?.role||null}
  function giveSignature(p,team,info,why){
    const pb=userPlaybook(),role=roleFor(p,team);if(!role)return null;
    const spec=CS.signatures.specFor(CS.adapter.toBattlePlayer(p,role),{season:universe.year,provenance:[`${universe.year} · ${team.name} · ${info.earned||why}.`],...info});
    pb.signatures??=[];pb.reserveSignatures??=[];
    (pb.signatures.length<CS.signatures.SLOTS?pb.signatures:pb.reserveSignatures).push(spec);CS.signatures.register(spec);
    (pb.history??=[]).push({id:spec.id,kind:info.legacy?'legacy':'signature',side:spec.side,why});return spec;
  }
  const hasCard=(pb,id)=>[...(pb.signatures||[]),...(pb.reserveSignatures||[])].some(x=>String(x.playerId)===String(id));
  // Players of the Week on your roster break out with a signature card.
  function potwBreakouts(week){
    const me=selected(),rows=universe.weeklyHonors?.year===universe.year?universe.weeklyHonors.rows||[]:[];if(!peopleOn()||!me||!rows.length)return;
    const meta=cardMeta(),pb=userPlaybook();meta.rewardKeys??=[];
    for(const row of rows)for(const w of [row.off,row.def]){
      if(!w||String(w.teamId)!==String(me.id))continue;const key=`potw:${universe.year}:${row.week}:${w.playerId}`;if(meta.rewardKeys.includes(key))continue;meta.rewardKeys.push(key);
      const p=(me.roster||[]).find(x=>String(x.id)===String(w.playerId));if(!p||hasCard(pb,p.id))continue;
      if(giveSignature(p,me,{earned:`Player of the Week ${row.week}`},'Player of the Week'))rewardMoment(`${p.name} was Player of the Week and broke out with a signature card.`);
    }
  }
  // A graduating signature player hands a fainter version to the starter who replaces him at his position.
  function mentorCards(){
    const me=selected();if(!peopleOn()||!me)return;const pb=userPlaybook();pb.legacies??=[];
    const lu=CS.adapter.lineupFromTeam(me).lineup;
    for(const r of (pb.ringOfHonor||[]).filter(x=>Number(x.year)>=universe.year-1)){
      const id=`mentor:${r.playerId}`;if(pb.legacies.includes(id))continue;
      const slot=[...Object.entries(lu.off),...Object.entries(lu.def)].find(([,bp])=>bp.pos===r.pos&&!hasCard(pb,bp.id)&&String(bp.id)!==String(r.playerId));
      const heir=slot&&(me.roster||[]).find(p=>String(p.id)===String(slot[1].id));if(!heir)continue;
      pb.legacies.push(id);
      const legacy={playerId:String(r.playerId),name:String(r.name||'').slice(0,60),last:String(r.last||CS.signatures.lastName(r.name||'Mentor')),number:r.number??null};
      if(giveSignature(heir,me,{legacy,earned:`Mentored by ${legacy.name}`},'Mentor'))rewardMoment(`${legacy.name} graduated and passed his card down: ${heir.name} carries a Legacy signature.`);
    }
  }
  // Development stamps: card OVR when the season ended, compared on player cards after camp.
  function gradeSnapshot(){
    const me=selected();if(!peopleOn()||!me)return;const meta=cardMeta();
    if(meta.gradeSnap?.year===universe.year)return;
    const grades={};for(const p of me.roster||[]){const r=battleRoleOf(p,me);if(r)grades[p.id]=CS.adapter.toBattlePlayer(p,r.role).ovr}
    meta.gradeSnap={year:universe.year,grades};
  }
  function developmentStamp(p,t,ovr){
    const snap=universe.callSheet?.gradeSnap;if(!snap||t?.id!==selected()?.id||!(snap.year===universe.year||snap.year===universe.year-1))return null;
    const was=Number(snap.grades?.[p.id]);return Number.isFinite(was)&&was!==ovr?{was,now:ovr,year:snap.year}:null;
  }
  // Camp auditions: in a close position battle, the candidates trade card duels on their role's assignments.
  function campAudition(battle,team){
    const ids=battle.candidates.slice(0,2).map(c=>c.id),players=ids.map(id=>(team.roster||[]).find(p=>String(p.id)===String(id)));if(players.some(x=>!x))return null;
    const role=Object.keys(CS.adapter.ROLE_MAP).find(r=>CS.adapter.ROLE_MAP[r]===battle.roleId)||battleRoleOf(players[0],team)?.role;if(!role)return null;
    const duels=Object.values({...CS.data.PLAYS,...CS.data.CALLS}).flatMap(c=>Object.values(c.duels||{})).filter(d=>(d.off||[]).includes(role)||(d.def||[]).includes(role)).slice(0,24);
    if(!duels.length)return null;
    const bps=players.map(p=>CS.adapter.toBattlePlayer(p,role)),rng=DynastyRng.create(`audition:${universe.year}:${battle.phase}:${battle.roleId}:${ids.join(':')}`),wins=[0,0];
    for(let i=0;i<9;i++){const d=duels[i%duels.length],traits=(d.off||[]).includes(role)?d.ot:d.dt,g=bp=>traits.reduce((n,k)=>n+(bp.traits[k]||50),0)/traits.length;
      const m=Math.max(-3,Math.min(3,Math.round((g(bps[0])-g(bps[1]))/6))),chance=CS.data.WIN_CHANCE[String(m)];wins[rng.next()<chance?0:1]++}
    const w=wins[0]>=wins[1]?0:1;return{winnerId:ids[w],winner:players[w].name,score:`${wins[w]}–${wins[1-w]}`,loser:players[1-w].name};
  }
  if(typeof buildCampBattles==='function'){
    const buildCampBattlesBase=buildCampBattles;
    buildCampBattles=function buildCampBattlesWithCards(t,phase){
      const out=buildCampBattlesBase(t,phase);if(t?.id!==selected()?.id)return out;
      const ss=universe.callSheet?.springStandout;
      if(ss&&ss.year===universe.year&&String(phase).toLowerCase()==='spring'&&!out.some(x=>x.roleId===ss.roleId)&&(t.roster||[]).some(p=>String(p.id)===String(ss.id))){
        out.push({roleId:ss.roleId,label:`${ROLE_NAMES[ss.role]||ss.role} (spring game)`,candidates:[{id:ss.id,name:ss.name,score:100},{id:ss.starterId,name:ss.starterName,score:99}],recommended:ss.id,gap:1,phase:'Spring',cardAudition:{winnerId:ss.id,winner:ss.name,score:ss.score,loser:ss.starterName},auditionDecided:true});
      }
      if(!peopleOn())return out;
      for(const b of out){try{const a=campAudition(b,t);if(!a)continue;b.cardAudition=a;
        // Only a close battle (gap 5 or less) can swing on the audition, and only between the top two.
        if(b.gap<=5&&a.winnerId!==b.recommended&&b.candidates.slice(0,2).some(c=>c.id===a.winnerId)){b.recommended=a.winnerId;b.auditionDecided=true;
          const meta=cardMeta(),key=`audition:${universe.year}:${b.phase}:${b.roleId}`;meta.rewardKeys??=[];if(!meta.rewardKeys.includes(key)){meta.rewardKeys.push(key);rewardMoment(`${b.label||b.roleId} camp battle: ${a.winner} won the card audition ${a.score} over ${a.loser} and earns the staff's recommendation.`)}}}catch(err){console.error(err)}}
      return out;
    };
  }
  // Visit pitch: the three cards a recruit would star in, from his archetype's strengths.
  function visitPitchHTML(r,u){
    const fit=recruitingFit(u,r);if(!fit.plays.length)return'';
    return`<p class="cs-pcard-note"><b>Visit pitch:</b> show him ${escH(fit.plays.slice(0,3).join(', '))} — the cards in your playbook built on his strengths.</p>`;
  }

  // ============================================================== 7. card upgrades: install weeks, film wear, eras
  // Install focus: one card a week gets extra reps (and a fresh install clears opponents' film on it).
  // Film wear: a play you leaned on over your last three games gives opponents a labeled film edge on it.
  // Eras: each season the league leans one way; cards that fit get a half-point edge for every team.
  const ERAS=[
    {id:'option',name:'Option Era',about:'Run plays +0.5 on the Key duel',off:[{family:'run',duel:'K',v:.5}]},
    {id:'airraid',name:'Air Raid Era',about:'Quick passes +0.5 on the Key duel',off:[{family:'quick',duel:'K',v:.5}]},
    {id:'vertical',name:'Vertical Era',about:'Deep passes +0.5 on the Key duel',off:[{family:'deep',duel:'K',v:.5}]},
    {id:'misdirection',name:'Misdirection Era',about:'Constraint plays +0.5 on the Key duel',off:[{family:'constraint',duel:'K',v:.5}]},
    {id:'blitz',name:'Blitz Era',about:'Pressure calls +0.5 on Protection duels',def:[{pressureCall:true,flag:'protect',v:.5}]},
    {id:'single_wing',name:'Single Wing Era',about:'Run plays +0.5 at the point of attack',off:[{family:'run',duel:'G',v:.5}]},
    {id:'two_way',name:'Two-Way Era',about:'Duels with a versatile (8+) offensive player +0.5',off:[{flag:'versatile',v:.5}]}
  ];
  const UPGRADES=registerCardIntegration({id:'card-upgrades',label:'Install weeks, film wear and eras',
    about:'Pick a card to install each week for extra reps, opponents scout plays you overuse, and each season’s era favors one style of card for everyone.',
    hooks:{
      launch(ctx){if(!upgradesOn())return;const prog=ctx.cfg.program??={home:{enabled:false},away:{enabled:false}},era=eraFor(universe.year);
        for(const side of ['home','away']){prog[side]??={enabled:false};prog[side].era={off:(era.off||[]).map(e=>({...e,src:era.name})),def:(era.def||[]).map(e=>({...e,src:era.name}))}}
        const opp=ctx.userSide==='home'?'away':'home',worn=wornPlays();if(worn.length){prog[opp].extra??={off:[],def:[]};prog[opp].extra.def=(prog[opp].extra.def||[]).concat(worn.map(w=>({play:w.id,duel:'K',v:1,src:`Film on your ${w.name}`})))}},
      weekTick(){installWeek()}
    }});
  const upgradesOn=()=>!!universe?.callSheet&&integrationOn(UPGRADES);
  function eraFor(year){return ERAS[Math.floor(DynastyRng.create(`era:${year}`).next()*ERAS.length)]}
  const WEAR_GAMES=3,WEAR_AT=30;
  function noteUsage(state,side){
    if(!upgradesOn()||!state?.events)return;const meta=cardMeta(),plays={};
    for(const e of state.events)if(e.card?.play&&e.team===side){const r=CS.evolution.rootOf(e.card.play);plays[r]=(plays[r]||0)+1}
    meta.filmLog=(meta.filmLog||[]).concat([{year:universe.year,week:universe.week|0,plays}]).slice(-WEAR_GAMES);
  }
  function wornPlays(){
    const totals={};for(const g of universe.callSheet?.filmLog||[])for(const [id,n] of Object.entries(g.plays||{}))totals[id]=(totals[id]||0)+n;
    return Object.entries(totals).filter(([,n])=>n>=WEAR_AT).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id,n])=>({id,n,name:CS.packs.cardDef(id)?.name||id}));
  }
  function installable(){
    const pb=universe.callSheet?.playbook;if(!pb)return[];const EV=CS.evolution,out=[];
    const worn=new Set(wornPlays().map(w=>w.id));
    for(const side of ['off','def'])for(const id of new Set([...pb[side].base,...pb[side].wrinkles])){
      const r=EV.rootOf(id),pr=EV.progress(pb,id);
      if((pr||worn.has(r))&&!out.some(x=>x.root===r))out.push({root:r,name:CS.packs.cardDef(r)?.name||r,...pr});
    }
    return out;
  }
  const INSTALL_REPS=6;
  function installWeek(){
    if(!upgradesOn())return;const meta=cardMeta(),root=meta.installFocus;if(!root)return;
    const focus=installable().find(x=>x.root===root);
    if(!focus){meta.installFocus=null;return}
    if(focus.need)CS.evolution.addReps(userPlaybook(),root,INSTALL_REPS);else meta.installFocus=null;
    for(const g of meta.filmLog||[])if(g.plays?.[root])g.plays[root]=0;
  }
  function setInstallFocus(root){const meta=cardMeta();meta.installFocus=root&&installable().some(x=>x.root===root)?root:null;try{autosaveAfter('game')}catch(err){}return meta.installFocus}
  function installTip(){return upgradesOn()&&universe?.callSheet?.playbook?CS.evolution.installSuggestion(installable(),{worn:wornPlays(),perInstall:INSTALL_REPS}):null}
  function upgradesHTML(){
    if(!upgradesOn())return'';const era=eraFor(universe.year),list=installable(),focus=universe.callSheet.installFocus,worn=wornPlays();
    return`<div class="cpn-upgrades"><p class="cpn-foot"><b>${universe.year}: ${escH(era.name)}</b> · ${escH(era.about)} for every team.</p>
      ${(()=>{const tip=installTip();return tip&&tip.root!==focus?`<p class="cpn-foot cpn-install-tip" id="installTip"><b>Suggested install:</b> ${escH(tip.text)}</p>`:''})()}
      ${list.length?`<label class="cpn-foot">Practice this week: <select data-install><option value="">None</option>${list.map(x=>`<option value="${escH(x.root)}" ${x.root===focus?'selected':''}>${escH(x.name)} · ${x.need?`${x.reps}/${x.need} (+${INSTALL_REPS} reps)`:'rehearse to clear film wear'}</option>`).join('')}</select></label>`:''}
      ${worn.length?`<p class="cpn-foot">Opponents have film on ${worn.map(w=>escH(w.name)).join(' and ')} (Key −1). Mix it up, or install it again to reset.</p>`:''}</div>`;
  }
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('change',e=>{const el=e.target.closest?.('[data-install]');if(el){setInstallFocus(el.value||null);paintCardProgram()}});

  // ============================================================== 8. duel moments and collection albums
  const cleanMoments=m=>(Array.isArray(m)?m:[]).filter(x=>typeof x==='string').map(x=>x.slice(0,220)).slice(0,3);
  function simClassic(sim){
    return CS.battle.archivedDrive(sim.b,[sim.cfg.playbook,sim.cfg.oppPlaybook]);
  }
  function markArchive(gameId,{coached=false,moments,classic}={}){
    if(!gameId)return;const rec=(universe.gameArchive||[]).find(r=>r.id===gameId);if(!rec)return;
    if(classic)rec.classicDrive=classic;
    rec.cardBattle=true;if(coached)rec.cardCoached=true;const m=cleanMoments(moments);if(m.length)rec.cardMoments=m;
  }
  if(typeof gameSummaryHTML==='function'){
    const gameSummaryBase=gameSummaryHTML;
    gameSummaryHTML=function gameSummaryWithDuels(g){
      let html=gameSummaryBase(g);
      if(g?.classicDrive?.battle)html=`<p><button type="button" data-classic-drive="${escH(g.id)}">Replay the final drive</button> · Coach the original matchup from the spot where the drive began.</p>`+html;
      if(!g?.cardMoments?.length)return html;
      return html+`<h3>Card battle${g.cardCoached?' · coached':''}</h3>`+g.cardMoments.map(t=>`<p class="cs-duel-moment">${escH(t)}</p>`).join('');
    };
  }
  // Albums: themed sets across your collection. Evolved and upgraded cards count for the card they grew from.
  const ALBUMS=[
    {id:'ground',name:'Ground and Pound',cards:['inside_zone','outside_zone','power','draw','counter_trey','buck_sweep','wishbone_dive','power_lead'],weights:{run:3}},
    {id:'option',name:'Option Football',cards:['read_option','qb_draw','midline_option','rpo_bubble','triple_option','split_veer'],weights:{run:2,constraint:1}},
    {id:'single_wing',name:'Single Wing',cards:['spinner','buck_lateral','buck_sweep','counter_trey'],weights:{run:2,constraint:1}},
    {id:'west_coast',name:'West Coast',cards:['shallow_cross','curl_flat','stick','quick_slant','smash'],weights:{quick:3}},
    {id:'airraid',name:'Air Raid',cards:['quick_slant','stick','four_verts','choice_route','smash','dagger','deep_cross'],weights:{quick:2,deep:2}},
    {id:'trick',name:'Trick Bag',cards:['statue_left','hook_ladder','flea_flicker','jet_reverse'],weights:{constraint:3}},
    {id:'pressure',name:'Pressure Package',cards:['zone_pressure','sim_pressure','cover0','corner_blitz','fire_zone','wide_nine','forty_six','zone_blitz'],weights:{pressure:3}},
    {id:'coverage',name:'No Fly Zone',cards:['two_man','tampa2','cover2_trap','robber','cover4_match','man_free'],weights:{man:2,zone:2}},
    {id:'ring',name:'Ring of Honor',ring:3,weights:{}},
    {id:'history',name:'Program History',milestones:['bowl_win','conf_title','unbeaten','national_title'],weights:{}}
  ];
  function ownedCards(pb){
    const ids=new Set(),EV=CS.evolution;if(!pb)return ids;
    for(const side of ['off','def'])for(const id of [...pb[side].base,...pb[side].wrinkles,...pb[side].tactics,...(pb.reserve?.[side]?.wrinkles||[]),...(pb.reserve?.[side]?.tactics||[])]){ids.add(id);const c=CS.packs.cardDef(id);if(c?.evolvedFrom)ids.add(c.evolvedFrom);ids.add(EV.rootOf(id))}
    for(const root of Object.keys(pb.evolved||{}))ids.add(root);
    return ids;
  }
  function albumProgress(){
    const pb=universe.callSheet?.playbook,own=ownedCards(pb);
    const ms=universe.callSheet?.milestones||[];
    return ALBUMS.map(a=>a.milestones?{...a,have:a.milestones.filter(id=>ms.includes(id)).length,need:a.milestones.length,missing:[]}:a.ring?{...a,have:Math.min(a.ring,(pb?.ringOfHonor||[]).length),need:a.ring}:{...a,have:a.cards.filter(id=>own.has(id)).length,need:a.cards.length,missing:a.cards.filter(id=>!own.has(id))});
  }
  // An optional personal target. Reads existing ownership, staffing and milestones. Never changes a roll.
  function trackAlbum(id){
    if(id!=null&&(!programRewardsOn()||!ALBUMS.some(a=>a.id===id)))return false;
    if(id==null)delete cardMeta().trackedAlbum;else cardMeta().trackedAlbum=id;
    try{autosaveAfter('game')}catch(err){console.error(err)}return true;
  }
  function pursuit(){
    const meta=universe.callSheet;if(!programRewardsOn()||!meta.trackedAlbum)return null;
    const a=albumProgress().find(a=>a.id===meta.trackedAlbum);if(!a)return null;
    const routes=[],pack=[],missing=a.missing||[];
    if(a.have<a.need){
      if(a.ring)routes.push('Graduating players with signature cards join your Ring of Honor.');
      if(a.milestones)for(const [id,label] of MILESTONES)if(!meta.milestones?.includes(id))routes.push(label);
      for(const id of missing){
        const backgrounds=Object.entries(CS.data.SCHEME_CARDS).filter(([,card])=>card===id).map(([name])=>name);
        if(backgrounds.length)routes.push(cardName(id)+': a coordinator with a '+backgrounds.join(' or ')+' background.');
        else if(id==='flea_flicker')routes.push('Flea Flicker: win three straight card games.');
        else if(id==='jet_reverse')routes.push('Jet Reverse: win a postseason card game.');
        else if(CS.packs.POOL.some(c=>c.id===id))pack.push(cardName(id));
      }
      if(pack.length)routes.unshift('Look for '+pack.join(', ')+' in packs.');
    }
    return{id:a.id,name:a.name,have:a.have,need:a.need,missing,routes};
  }
  function pursuitHTML(){
    const a=pursuit();if(!a)return '';
    return `<section class="cpn-locker"><h3>Tracking: ${escH(a.name)} · ${a.have}/${a.need}</h3>
      ${a.have>=a.need?'<p>Album complete.</p>':a.routes.map(line=>`<p class="cpn-foot">${escH(line)}</p>`).join('')}<button type="button" class="cpn-link" data-track-album="">Stop tracking</button></section>`;
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-track-album]');if(!btn)return;
    const id=btn.dataset.trackAlbum||null;
    if(trackAlbum(id)){paintCardProgram();(document.querySelector('#cardBinder [data-track-album=""]')||document.querySelector('#cardBinder .cpn-albums summary'))?.focus?.()}
  });
  function checkAlbums(){
    if(!programRewardsOn())return[];const done=[];
    for(const a of albumProgress())if(a.have>=a.need){
      const pack=CS.packs.rewardPack(userPlaybook(),{seed:`album:${a.id}:${selected()?.id}`,weights:a.weights,n:4,bonusRare:.2,worldTaken:takenLegendaries(),type:'album',title:`${a.name} Album Pack`,subtitle:`You completed the ${a.name} album · pick 1 of 4`});
      if(queueRewardPack(`album:${a.id}`,pack))done.push(a.id);
    }
    return done;
  }
  // The Ring of Honor binder: graduated signature players' career cards, newest first.
  function ringHTML(){
    const ring=(universe.callSheet?.playbook?.ringOfHonor||[]).slice().reverse();if(!ring.length)return'';
    if(!IDX.archive)rebuildIndexes();else indexArchive();
    const canOpen=r=>!!r.playerId&&(IDX.archive?.has(r.playerId)||archiveIsDeferred());
    return`<details class="cpn-albums cpn-ring" data-card-fold="ring"><summary>Ring of Honor binder · ${ring.length}</summary><div class="cs-ring">${ring.slice(0,24).map(r=>`<article class="cs-face r-signature"><span class="cs-face-origin">${escH(String(r.exit||'graduated'))}</span><b class="cs-face-name">#${escH(r.number??'')} ${escH(r.name||'')}</b><small class="cs-face-type">${escH([r.pos,r.archetype].filter(Boolean).join(' · '))}</small><p class="cs-face-text">${escH(r.career||'Career stats not recorded.')}</p>${provenanceHTML(r)}<span class="cs-face-rar">${escH(String(r.year||''))}</span>${canOpen(r)?`<button type="button" class="cpn-link" data-card-alumnus="${escH(r.playerId)}" aria-label="View career of ${escH(r.name||'player')}">View career</button>`:''}</article>`).join('')}</div></details>`;
  }
  function albumsHTML(){
    if(!programRewardsOn()||!universe.callSheet?.playbook)return'';const list=albumProgress(),complete=list.filter(a=>a.have>=a.need).length;
    return`<details class="cpn-albums" data-card-fold="albums"><summary>Albums · ${complete}/${list.length} complete</summary>${list.map(a=>`<p class="cpn-foot"><b>${a.have>=a.need?'✓ ':''}${escH(a.name)}</b> ${a.have}/${a.need}${a.missing?.length&&a.have<a.need?` · missing ${escH(a.missing.map(id=>CS.packs.cardDef(id)?.name||id).join(', '))}`:''}${a.id===cardMeta().trackedAlbum?' · Tracking':a.have<a.need?` <button type="button" class="cpn-link" data-track-album="${a.id}" aria-label="Track ${escH(a.name)}">Track album</button>`:''}</p>`).join('')}<p class="cpn-foot cpn-album-note" style="opacity:.75">Completing an album earns an Album Pack. Evolved cards count for the card they grew from.</p></details>`;
  }

  // ============================================================== 9. the card game is the game
  // Next, Game Day and the matchup's Open Game Day all coach your game as a card battle. Classic Game Day stays one
  // click away on the matchup card; Sim Week still lets your coordinators play it. Card Settings can turn this off.
  const CARD_DEFAULT=registerCardIntegration({id:'cards-default',label:'Card battles are your game day',
    about:'Card battles are how you play your games: Next and Game Day coach them as card battles, and the classic versions are hidden. Turn off to bring back Classic Game Day, Watch and the classic roster view.',hooks:{}});
  function cardGameIsDefault(){return!!universe&&!!selected()&&integrationOn(CARD_DEFAULT)&&!!globalThis.CallSheetBundle}
  // A game to coach right now (or a card battle to resume).
  function coachableGame(){
    if(!cardGameIsDefault()||cardGameBlocker())return null;const g=currentCardGame();if(!g)return null;
    const active=universe.callSheet?.activeBattle?.seed===battleSeed(g);return!g.played||active?{g,active}:null;
  }
  function nextLabel(){
    const c=coachableGame();if(!c)return null;if(c.active)return'Next: Resume Card Battle';
    const me=selected(),g=c.g;if(g.postseason)return`Next: Coach the ${g.label}`;
    const opp=g.home===me.name?g.away:g.home;return`Next: Coach Week ${g.week} ${g.home===me.name?'vs':'at'} ${opp}`;
  }
  function nextIsAdvance(btn){return btn&&!btn.disabled&&btn.dataset.openingPreseason!=='true'&&/^Next: /.test(btn.textContent||'')}
  function labelNextButton(){
    const btn=document.querySelector('#hubAdvance');if(!btn)return;
    if(!btn.__cardObserver&&typeof MutationObserver==='function'){btn.__cardObserver=new MutationObserver(()=>{try{labelNextButton()}catch(err){}});btn.__cardObserver.observe(btn,{childList:true,characterData:true,subtree:true})}
    const label=nextIsAdvance(btn)?nextLabel():null;
    if(label&&btn.textContent!==label){btn.textContent=label;btn.title='Coach this game as a card battle. Sim Week (season controls) lets your coordinators play it instead.'}
  }
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('click',e=>{
    const t=e.target?.closest?.('#hubAdvance,[data-client-tab="gamelab"],[data-tab="gamelab"],#broadcastFeature [data-sports-tab="gamelab"]');if(!t)return;
    if(t.id==='hubAdvance'&&!nextIsAdvance(t))return;
    if(!coachableGame())return;
    e.preventDefault();e.stopImmediatePropagation();openCardGameDay();
  },true);

  // ============================================================== 10. cards everywhere in the dynasty
  // Players and coaches appear as cards across Dynasty Lab: roster (card grid by default), Roles & Depth (starting
  // lineup), Recruiting (prospect cards from your scouting, never hidden ratings), Staff (coach cards and what they do in
  // a battle), Development (card growth), the matchup (their key players) and the newsletter (card moments).
  const CARD_PAGES=registerCardIntegration({id:'card-pages',label:'Player cards across the dynasty',
    about:'Roster, Roles & Depth, Recruiting, Staff, Development, the matchup and the newsletter show players and coaches as cards.',hooks:{}});
  const pagesOn=()=>!!universe&&!!selected()&&integrationOn(CARD_PAGES)&&typeof document!=='undefined'&&typeof document.querySelector==='function';
  function savedBookFor(team){return String(team?.id)===String(selected()?.id)?universe.callSheet?.playbook:universe.callSheet?.ai?.[team?.id]}
  function cardOf(p,team){
    const pb=savedBookFor(team);
    return[...(pb?.signatures||[]),...(pb?.reserveSignatures||[])].find(x=>String(x.playerId)===String(p.id))||null;
  }
  // Specialists (kickers, punters) have no battle role but still get a card; card OVR does not depend on the role.
  const roleLabel=(role,p)=>role?(ROLE_NAMES[role]||role):({K:'Kicker',P:'Punter',LS:'Long snapper'}[p.pos]||`${p.pos} · special teams`);
  function miniCardHTML(p,team,{role=null,note=''}={}){
    const r=role?{role}:battleRoleOf(p,team)||{role:null};
    const bp=CS.adapter.toBattlePlayer(p,r.role),sig=cardOf(p,team),stamp=developmentStamp(p,team,bp.ovr);
    const nem=selected()&&String(team.id)!==String(selected().id)&&isNemesis(p,team,selected());
    const badge=nem?'NEMESIS':sig?.legacy?'LEGACY':sig?'SIGNATURE':isWalkOn(p)&&r.role&&battleRoleOf(p,team)?.depth===0?'WALK-ON':'';
    return`<button type="button" class="cs-mini${sig?' sig':''}${nem?' nem':''}" data-card-player="${escH(p.id)}" style="--tc:${escH(team?.primary||'#2a3550')};--tc2:${escH(team?.secondary||'#e8e2d0')}" title="${escH(p.name)} · card OVR ${bp.ovr}">
      <span class="cs-mini-ovr">${bp.ovr}</span>${portraitTag(p,56,'card')}<b>${escH(p.name)}</b><small>${escH(roleLabel(r.role,p))}</small><small>${escH(bp.archetype||p.pos)}</small>
      ${badge?`<em>${badge}</em>`:''}${stamp?`<i class="${stamp.now>stamp.was?'up':'down'}">${stamp.now>stamp.was?'▲':'▼'} ${Math.abs(stamp.now-stamp.was)}</i>`:''}${note?`<small class="cs-mini-note">${escH(note)}</small>`:''}</button>`;
  }
  function prospectMiniHTML(r,u){
    const pe=prospectEstimate(r,u);if(!pe)return'';
    return`<button type="button" class="cs-mini prospect" data-card-recruit="${escH(r.id)}" style="--tc:#24324f;--tc2:#8ea2d6" title="Range from your scouting (${Math.round(pe.conf)}% confidence)">
      <span class="cs-mini-ovr">${pe.lo===pe.hi?pe.lo:`${pe.lo}–${pe.hi}`}</span>${portraitTag(r,56,'card','recruit')}<b>${escH(r.name)}</b><small>${escH(ROLE_NAMES[pe.role]||pe.role)} · ${'★'.repeat(r.stars||0)}</small><small>${escH(pe.bp.archetype||r.pos)}</small><em>PROSPECT</em></button>`;
  }
  function wireCards(host){
    if(!host)return;
    host.querySelectorAll('[data-card-player]').forEach(b=>b.onclick=()=>showPlayerProfile(b.dataset.cardPlayer));
    host.querySelectorAll('[data-card-recruit]').forEach(b=>b.onclick=()=>showRecruitProfile(b.dataset.cardRecruit));
    try{paintPortraits(host)}catch(err){}
    injectMiniCardStyles();
  }
  function injectMiniCardStyles(){
    if(document.getElementById('cardMiniStyles'))return;
    const st=document.createElement('style');st.id='cardMiniStyles';st.textContent=`
.cs-cards{margin:12px 0}.cs-cards h4{margin:14px 0 6px;font:700 12px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#aab6e8}
.cs-mini-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
.cs-mini{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 6px 7px;border-radius:12px;border:2px solid var(--tc2);background:linear-gradient(170deg,var(--tc),#0b0f1c 80%);color:#eef2ff;text-align:center;cursor:pointer;font:12px system-ui;min-width:0}
.cs-mini:hover,.cs-mini:focus-visible{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.35)}
.cs-mini.sig{border-color:#ffd34d;box-shadow:0 0 0 1px #ffd34d}.cs-mini.nem{border-color:#ff5d5d}.cs-mini.prospect{border-style:dashed}
.cs-mini canvas{width:56px;height:56px;border-radius:8px}
.cs-mini-ovr{position:absolute;top:4px;left:7px;font:800 17px 'Barlow Condensed',Impact,system-ui;text-shadow:0 2px 0 rgba(0,0,0,.5)}
.cs-mini b{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;margin-top:2px}
.cs-mini small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#c8d0ee;font-size:10.5px}
.cs-mini em{margin-top:3px;padding:1px 6px;border-radius:999px;background:#ffd34d;color:#241a00;font:800 9px system-ui;letter-spacing:.08em;font-style:normal}
.cs-mini.nem em{background:#ff5d5d;color:#fff}.cs-mini.prospect em{background:#8ea2d6;color:#0b1020}
.cs-mini i{position:absolute;top:5px;right:7px;font:800 11px system-ui;font-style:normal}.cs-mini i.up{color:#5be08a}.cs-mini i.down{color:#ff8a8a}
#roster.cs-cards-view #rosterPositionBoard,#roster.cs-cards-view>.table-wrap{display:none!important}
.cs-ring{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:8px}
.cs-view-toggle{display:inline-flex;gap:4px}.cs-view-toggle button[aria-pressed="true"]{outline:2px solid #ffd34d}
.cs-coach{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.cs-coach article{padding:12px;border-radius:12px;border:1px solid #39456f;background:linear-gradient(160deg,#141b30,#0c111e);color:#eef2ff}
.cs-coach article b{display:block;font-size:15px}.cs-coach article small{color:#aab6e8}.cs-coach ul{margin:6px 0 0;padding-left:18px;font-size:13px}`;
    document.head.appendChild(st);
  }
  const POS_ORDER=['QB','RB','WR','TE','OT','OG','C','EDGE','DT','LB','CB','S','K','P'];
  // Roster: a card grid (default) or the classic table, filtered by the same position menu.
  function paintRosterCards(){
    const host=document.querySelector('#roster');if(!host)return;try{applyCardMode()}catch(err){}
    // Classic is Dynasty Lab's own roster layout (position board plus its folding full table), left untouched.
    let grid=host.querySelector('#rosterCards'),table=host.querySelector('.table-wrap'),board=host.querySelector('#rosterPositionBoard'),toggle=host.querySelector('#rosterViewToggle');
    if(!pagesOn()){grid?.remove();toggle?.remove();host.classList.remove('cs-cards-view');return}
    const meta=cardMeta(),view=meta.rosterView==='classic'&&!cardGameIsDefault()?'classic':'cards',me=selected(),f=document.querySelector('#positionFilter')?.value||'ALL';
    if(!toggle){host.querySelector('.section-head')?.insertAdjacentHTML('beforeend','<div id="rosterViewToggle" class="cs-view-toggle" role="group" aria-label="Roster view"><button type="button" data-roster-view="cards">Cards</button><button type="button" data-roster-view="classic">Classic</button></div>');toggle=host.querySelector('#rosterViewToggle');
      toggle.querySelectorAll('[data-roster-view]').forEach(b=>b.onclick=()=>{cardMeta().rosterView=b.dataset.rosterView;try{autosaveAfter('game')}catch(err){}paintRosterCards()})}
    toggle.querySelectorAll('[data-roster-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rosterView===view)));
    if(!grid){host.querySelector('.section-head')?.insertAdjacentHTML('afterend','<div id="rosterCards" class="cs-cards"></div>');grid=host.querySelector('#rosterCards')}
    // A class (not per-element hidden) so Dynasty Lab's own roster layer can render in any order underneath.
    host.classList.toggle('cs-cards-view',view==='cards');grid.hidden=view!=='cards';injectMiniCardStyles();if(view!=='cards')return;
    const players=(me.roster||[]).filter(p=>f==='ALL'||p.pos===f),groups=[...new Set([...POS_ORDER,...players.map(p=>p.pos)])].filter(pos=>players.some(p=>p.pos===pos));
    grid.innerHTML=groups.map(pos=>{const list=players.filter(p=>p.pos===pos).map(p=>({p,html:miniCardHTML(p,me),ovr:CS.adapter.toBattlePlayer(p,null).ovr})).sort((a,b)=>b.ovr-a.ovr);
      return`<h4>${escH(pos)} · ${list.length}</h4><div class="cs-mini-row">${list.map(x=>x.html).join('')}</div>`}).join('');
    wireCards(grid);
  }
  // Roles & Depth: your card starting lineup, exactly who the battle puts on the field.
  function paintDepthCards(){
    const host=document.querySelector('#depth'),grid=host?.querySelector('#depthGrid');if(!host||!grid)return;let box=host.querySelector('#depthCards');
    if(!pagesOn()){box?.remove();return}
    const me=selected(),lu=gameLineup(me).lineup,byId=new Map((me.roster||[]).map(p=>[String(p.id),p]));
    const row=side=>Object.entries(lu[side]).map(([role,bp])=>{const p=byId.get(String(bp.id));return p?miniCardHTML(p,me,{role}):''}).join('');
    if(!box){grid.insertAdjacentHTML('beforebegin','<div id="depthCards" class="cs-cards card"></div>');box=host.querySelector('#depthCards')}
    box.innerHTML=`<h3>Card lineup</h3><p class="muted">Who the card battle puts on the field from this depth chart. Gold borders are signature cards.</p><h4>Offense</h4><div class="cs-mini-row">${row('off')}</div><h4>Defense</h4><div class="cs-mini-row">${row('def')}</div>`;
    wireCards(box);
  }
  // Recruiting: prospect cards for your targets (or the top of the board), ranges from your scouting only.
  function paintProspectCards(){
    const host=document.querySelector('#recruiting');if(!host)return;let box=host.querySelector('#prospectCards');
    if(!pagesOn()){box?.remove();return}
    const me=selected(),targets=(universe.recruits||[]).filter(r=>r.targeted&&!r.committed),list=(targets.length?targets:(universe.recruits||[]).filter(r=>!r.committed)).slice().sort((a,b)=>(b.stars||0)-(a.stars||0)).slice(0,12);
    if(!list.length){box?.remove();return}
    if(!box){const head=host.querySelector('.section-head');(head||host.firstElementChild)?.insertAdjacentHTML('afterend','<div id="prospectCards" class="cs-cards card"></div>');box=host.querySelector('#prospectCards')}
    box.innerHTML=`<h3>${targets.length?'Your targets as cards':'Top prospects as cards'}</h3><p class="muted">Card OVR ranges come from your scouting: scout a prospect to narrow his.</p><div class="cs-mini-row">${list.map(r=>prospectMiniHTML(r,me)).join('')}</div>`;
    wireCards(box);
  }
  // Staff: coach cards, with what each coach does in a card battle.
  function paintStaffCards(){
    const host=document.querySelector('#staff');if(!host)return;let box=host.querySelector('#staffCards');
    if(!pagesOn()){box?.remove();return}
    const me=selected(),cmd=CS.adapter.staffCommand(me),pb=universe.callSheet?.playbook,teach=pb?trainingFor(me,pb):{};
    const roleName={HC:'Head coach',OC:'Offensive coordinator',DC:'Defensive coordinator',SC:'Strength coach',RC:'Recruiting coordinator'};
    const cards=['HC','OC','DC','SC','RC'].map(k=>[k,me.staff?.[k]]).filter(([,c])=>c).map(([k,c])=>{
      const lines=[],tree=CS.data.SCHEME_CARDS?.[c.preferredScheme];
      if(k==='OC')lines.push(cmd.off?'Play calling 80+: +1 Command on offense':'Play calling under 80: no Command bonus');
      if(k==='DC')lines.push(cmd.def?'Play calling 80+: +1 Command on defense':'Play calling under 80: no Command bonus');
      if((k==='OC'||k==='DC')&&tree){
        const holds=universe.callSheet.schemeGrants?.[tree];
        lines.push(holds&&String(holds.coachId)===String(c.id)?`${c.name} supplies one copy of ${cardName(tree)}. That copy leaves when he does.`:`Scheme card: ${cardName(tree)} (${c.preferredScheme})`);
      }
      if((k==='OC'||k==='DC')&&pb&&integrationOn(STAFF_LINK)){
        const side=k==='OC'?'off':'def',active=[...new Set([...pb[side].base,...pb[side].wrinkles])].map(id=>{
          const card=CS.packs.cardDef(id),root=card?.evolvedFrom||card?.upgradeOf||id;
          return{id,root,rate:Math.round((teach[root]||0)*100),reps:pb.mastery?.[root]||0};
        }).filter(x=>x.rate>0&&!pb.evolved?.[x.root]).sort((a,b)=>b.reps-a.reps||b.rate-a.rate);
        if(active.length)lines.push(`${cardName(active[0].id)} earns +${active[0].rate}% mastery on game reps.`);
      }
      if(k==='HC')lines.push(`Program schemes: ${me.offScheme} / ${me.defScheme}`);
      if(k==='RC')lines.push('Signing Day Pack is built from the class he lands');
      if(k==='SC')lines.push('Development stamps show what his camp work changed');
      return`<article><small>${escH(roleName[k]||k)}</small><b>${escH(c.name||'Vacant')}</b>${c.preferredScheme?`<small>${escH(c.preferredScheme)}</small>`:''}<ul>${lines.map(x=>`<li>${escH(x)}</li>`).join('')}</ul></article>`});
    if(!box){const head=host.querySelector('.section-head');(head||host.firstElementChild)?.insertAdjacentHTML('afterend','<div id="staffCards" class="cs-cards card"></div>');box=host.querySelector('#staffCards')}
    box.innerHTML=`<h3>Coach cards</h3><div class="cs-coach">${cards.join('')}</div>`;injectMiniCardStyles();
  }
  // Development: players whose card OVR moved since the season ended.
  function paintGrowthCards(){
    const host=document.querySelector('#development');if(!host)return;let box=host.querySelector('#growthCards');
    if(!pagesOn()){box?.remove();return}
    const me=selected(),moved=(me.roster||[]).map(p=>{const r=battleRoleOf(p,me);if(!r)return null;const ovr=CS.adapter.toBattlePlayer(p,r.role).ovr,s=developmentStamp(p,me,ovr);return s?{p,d:s.now-s.was}:null}).filter(Boolean).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,12);
    if(!moved.length){box?.remove();return}
    if(!box){const head=host.querySelector('.section-head');(head||host.firstElementChild)?.insertAdjacentHTML('afterend','<div id="growthCards" class="cs-cards card"></div>');box=host.querySelector('#growthCards')}
    box.innerHTML=`<h3>Card growth since the season ended</h3><div class="cs-mini-row">${moved.map(x=>miniCardHTML(x.p,me)).join('')}</div>`;wireCards(box);
  }
  // This week's regular-season game is already recorded and no battle is open: the hub still lists it as "next up"
  // until the week advances, so the matchup card must not offer to coach it again.
  function weekGamePlayed(){
    const me=selected();if(!me||universe?.phase!=='regular'||universe.callSheet?.activeBattle)return false;
    return !!(universe.schedule?.[universe.week]||[]).find(x=>x.played&&(x.home===me.name||x.away===me.name));
  }
  function markPlayedMatchup(feature){
    const played=weekGamePlayed(),kicker=feature.querySelector('.broadcast-kicker');
    feature.classList.toggle('cs-week-played',played);
    if(kicker){if(played&&!kicker.dataset.csPlayed){kicker.dataset.csPlayed=kicker.textContent;kicker.textContent=kicker.textContent.replace(/NEXT MATCHUP/i,'FINAL RECORDED')}
      else if(!played&&kicker.dataset.csPlayed){delete kicker.dataset.csPlayed}}
    let note=feature.querySelector('#csPlayedNote');
    if(played&&!note){feature.querySelector('.broadcast-actions')?.insertAdjacentHTML('afterbegin','<p id="csPlayedNote" class="cs-played-note">Game complete. Advance the week to meet your next opponent.</p>');note=feature.querySelector('#csPlayedNote')}
    else if(!played)note?.remove();
    if(!document.getElementById('csPlayedStyles')){const st=document.createElement('style');st.id='csPlayedStyles';st.textContent='#broadcastFeature.cs-week-played [data-coach-cards],#broadcastFeature.cs-week-played [data-coach-live]{display:none!important}.cs-played-note{margin:0;color:#d3dded;font-size:14px}';document.head.appendChild(st)}
  }
  // Rivalry weeks remember the last card meeting: who on their side won the most duels against you, and whether that
  // player is still on their roster. Only for protected rivals, and only from a recorded card battle.
  function rivalryHistory(me,opp){
    if(!me||!opp||!(me.protectedRivalIds||[]).includes(opp.id))return null;
    const last=[...(universe.callSheet?.oppFilm?.[String(opp.id)]||[])].reverse().find(x=>x.rivalryPlay||x.star);if(!last)return null;
    const play=cleanRivalryPlay(last.rivalryPlay);
    if(play){
      const roster=opp.roster||[],still=roster.some(p=>String(p.id)===play.id),line=gameLineup(opp).lineup.off;
      const roles=CS.resolver.bracketOptions(line),returning=roles.find(o=>String(line[o.role].id)===play.id);
      const starter=line[play.role],realStarter=starter&&roster.some(p=>String(p.id)===String(starter.id));
      const target=returning?line[returning.role]:realStarter&&roles.some(o=>o.role===play.role)?starter:null;
      const archived=!still&&(universe.playerArchive||[]).find(p=>String(p.id)===play.id);
      const departure=/graduat/i.test(archived?.exitReason||'')?'graduated':'has left their roster';
      const change=returning?`${play.name} is back at ${returning.role}.`:
        `${play.name} ${still?'is still on their roster':departure}.${realStarter&&String(starter.id)!==play.id?' '+starter.name+' now starts at '+play.role+'.':''}`;
      const n=play.snaps.length,action=play.kind==='fourth'||play.kind==='third'?`caught ${n===2?'two':'a'} ${play.kind}-down conversion${n===2?'s':''}`:
        play.kind==='touchdown'?`caught ${n===2?'two touchdown passes':'a touchdown pass'}`:`caught ${n===2?'two passes':'a pass'} for 20+ yards`;
      return{...play,year:last.year,week:last.week,still,target:target?{id:String(target.id),name:target.name}:null,
        text:`${last.year}, Week ${last.week} · ${play.name} ${action} against you. ${change}`};
    }
    if(!last.star)return null;
    const s=last.star,still=(opp.roster||[]).some(p=>String(p.id)===String(s.id));
    return{...s,year:last.year,week:last.week,still,text:`Last card meeting (${last.year}${last.week?`, Week ${last.week}`:''}): ${s.name} won ${s.w} of ${s.w+s.l} duels against you${still?' and is still on their roster':' and has since left'}.`};
  }
  function rivalryMatch(g,opp){return JSON.stringify([universe.year,g.week,String(opp.id),g.stage||'regular'])}
  function applyRivalryPrep(cfg,opp){
    const plan=universe.callSheet?.rivalryPrep;
    if(cfg.rivalry&&plan?.match===rivalryMatch(cfg,opp))cfg.program[cfg.userSide].rivalryBracketId=plan.id;
  }
  function setRivalryPrep(enabled){
    const g=currentCardGame(),me=selected();if(!g||!me||g.played)return false;
    const opp=T(g.home===me.name?g.away:g.home),meta=cardMeta(),target=rivalryHistory(me,opp)?.target;
    if(!target||meta.activeBattle?.seed===battleSeed(g))return false;
    if(enabled)meta.rivalryPrep={match:rivalryMatch(g,opp),id:target.id};else delete meta.rivalryPrep;
    autosaveAfter('game');return true;
  }
  function rivalryHistoryHTML(h,g,opp){
    if(!h)return '';
    if(!h.snaps)return `<p class="cpn-foot" id="rivalryHistory">${escH(h.text)}</p>`;
    const ord=['','1st','2nd','3rd','4th'],meta=universe.callSheet,plan=meta.rivalryPrep;
    const prepared=!!h.target&&plan?.id===h.target.id&&plan.match===rivalryMatch(g,opp);
    const rows=h.snaps.map(e=>`<li>${e.period>4?'OT'+(e.period-4):'Q'+e.period+' '+Math.floor(e.clock/60)+':'+String(e.clock%60).padStart(2,'0')} · ${ord[e.down]} &amp; ${e.distance} · ${escH(e.play)} · ${e.yards} yards</li>`).join('');
    const prep=h.target&&!g.played&&meta.activeBattle?.seed!==battleSeed(g)?`<button type="button" data-rivalry-prep aria-pressed="${prepared}">${prepared?'Clear prepared bracket':'Prepare bracket on '+escH(h.target.name)}</button><small> Sets the assignment when you play Bracket this game.</small>`:'';
    return `<details class="cpn-foot" id="rivalryHistory"><summary>${escH(h.text)}</summary><ol>${rows}</ol>${prep}</details>`;
  }
  // Who the opponent is, in card terms: staff's pass estimate (Dynasty's weekly report) and their defensive call sheet.
  function opponentIdentityFor(me,opp){
    if(!me||!opp||!universe?.callSheet)return null;let pe=null;
    try{const r=v0102WeeklyOpponentReport(me,opp),est=r?.passEstimate??r?.metrics?.passEstimate;if(Number.isFinite(Number(est)))pe=Number(est)}catch(err){}
    // Read only: an opponent without a saved playbook uses the default one the AI would start from; nothing is written.
    return CS.packs.opponentIdentity(universe.callSheet.ai?.[opp.id]||CS.packs.newPlaybook(),{film:universe.callSheet.oppFilm?.[String(opp.id)]||null,passEstimate:pe,mine:universe.callSheet.playbook,name:opp.short||opp.name});
  }
  // The matchup: their four best starters as cards (nemeses marked).
  function paintMatchupCards(){
    const feature=document.querySelector('#broadcastFeature');if(!feature)return;let box=feature.querySelector('#matchupCards');
    // The matchup card is redrawn by its own presentation layer; repaint the strip whenever that wipes it.
    if(!feature.__cardsObs&&typeof MutationObserver==='function'){let queued=false;feature.__cardsObs=new MutationObserver(()=>{if(queued||feature.querySelector('#matchupCards')||!pagesOn())return;queued=true;(window.requestAnimationFrame||setTimeout)(()=>{queued=false;try{paintMatchupCards()}catch(err){}})});feature.__cardsObs.observe(feature,{childList:true})}
    const g=pagesOn()?currentCardGame():null,me=selected();
    try{markPlayedMatchup(feature)}catch(err){console.error(err)}
    if(!g){box?.remove();return}
    const opp=T(g.home===me.name?g.away:g.home);if(!opp){box?.remove();return}
    const lu=gameLineup(opp).lineup,byId=new Map((opp.roster||[]).map(p=>[String(p.id),p]));
    const top=[...Object.entries(lu.off),...Object.entries(lu.def)].map(([role,bp])=>({role,bp,p:byId.get(String(bp.id))})).filter(x=>x.p).sort((a,b)=>b.bp.ovr-a.bp.ovr).slice(0,4);
    if(!box){feature.insertAdjacentHTML('beforeend','<div id="matchupCards" class="cs-cards"></div>');box=feature.querySelector('#matchupCards')}
    const history=rivalryHistory(me,opp),ident=opponentIdentityFor(me,opp),film=filmNote(me,opp,g),stakes=CS.packs.packStakes({rivalry:(me.protectedRivalIds||[]).includes(opp.id),stage:g.stage||null});
    box.innerHTML=`<h4>${escH(opp.name)} · players to beat</h4>${stakes.elevated?`<p class="cpn-foot" id="packStakes"><b>${escH(stakes.text)}</b></p>`:''}${rivalryHistoryHTML(history,g,opp)}${ident?`<p class="cpn-foot" id="opponentIdentity">${escH(ident.text)}</p>`:''}${film?`<p class="cpn-foot" id="filmNote">${escH(film.text)}</p>`:''}<div class="cs-mini-row">${top.map(x=>miniCardHTML(x.p,opp,{role:x.role})).join('')}</div>`;wireCards(box);
    const prepButton=box.querySelector('[data-rivalry-prep]');
    if(prepButton)prepButton.onclick=()=>{
      if(!setRivalryPrep(prepButton.getAttribute('aria-pressed')!=='true'))return;
      paintMatchupCards();const details=box.querySelector('#rivalryHistory');if(details)details.open=true;
      box.querySelector('[data-rivalry-prep]')?.focus();
    };
  }
  // The newsletter: this season's card moments (packs, breakouts, legacies, nemeses, rewards).
  function paintNewsCards(){
    const host=document.querySelector('#newsletterBody');if(!host)return;let box=document.querySelector('#cardNews');
    const list=pagesOn()?(universe.callSheet?.moments||[]).filter(m=>m.year===universe.year).slice(-10).reverse():[];
    if(!list.length){box?.remove();return}
    if(!box){host.insertAdjacentHTML('beforebegin','<div id="cardNews" class="card cs-cards"></div>');box=document.querySelector('#cardNews')}
    box.innerHTML=`<h3>Card Program</h3>${list.map(m=>`<p class="cpn-foot">${m.week?`<b>Week ${m.week}</b> · `:''}${escH(m.text)}</p>`).join('')}`;
  }
  if(typeof extendRender==='function'){
    extendRender('roster',()=>{try{paintRosterCards()}catch(err){console.error(err)}});
    extendRender('recruiting',()=>{try{paintProspectCards()}catch(err){console.error(err)}});
    extendRender('staff',()=>{try{paintStaffCards()}catch(err){console.error(err)}});
    extendRender('development',()=>{try{paintGrowthCards()}catch(err){console.error(err)}});
  }
  if(typeof renderDepth==='function'){const renderDepthBase=renderDepth;renderDepth=function renderDepthWithCards(...a){const out=renderDepthBase.apply(this,a);try{paintDepthCards()}catch(err){console.error(err)}return out}}
  if(typeof renderNewsletter==='function'){const renderNewsletterBase=renderNewsletter;renderNewsletter=function renderNewsletterWithCards(...a){const out=renderNewsletterBase.apply(this,a);try{paintNewsCards()}catch(err){console.error(err)}return out}}
  // The tab table captured its renderers when it was built, and other layers (table folding) wrap its entries: wrap
  // them again rather than replacing them, so every layer still runs on a tab switch.
  if(typeof TAB_RENDERERS==='object'&&TAB_RENDERERS)for(const [view,paint] of [['depth',paintDepthCards],['newsletter',paintNewsCards]]){
    const base=TAB_RENDERERS[view];if(typeof base!=='function')continue;
    TAB_RENDERERS[view]=function(){const out=base.apply(this,arguments);try{paint()}catch(err){console.error(err)}return out};
  }

  // ============================================================== 11. card mode hides the classic versions
  // With card battles as the game day (the default), the non-card versions are not shown at all: Classic Game Day,
  // Watch, the live classic coach, the matchup's Open Game Day duplicate, and the roster's Classic view. Turning
  // "Card battles are your game day" off in Card Settings brings every one of them back.
  function applyCardMode(){
    if(typeof document==='undefined'||typeof document.body?.classList?.toggle!=='function'||typeof document.createElement!=='function'||!document.head)return; // headless runs
    const on=cardGameIsDefault();document.body.classList.toggle('cs-card-mode',on);
    if(!document.getElementById('cardModeStyles')){const st=document.createElement('style');st.id='cardModeStyles';
      st.textContent=`body.cs-card-mode [data-coach-live],body.cs-card-mode #coachLiveGame,body.cs-card-mode #watchDetailedGame,body.cs-card-mode #broadcastFeature [data-sports-tab="gamelab"],body.cs-card-mode #rosterViewToggle{display:none!important}`;
      document.head.appendChild(st)}
    // Game Day page: lead with the card battle.
    const head=document.querySelector('#gamelab > .section-head');if(!head)return;
    const sub=head.querySelector('.muted'),row=head.querySelector('.button-row');
    if(sub){sub.dataset.classic??=sub.textContent;sub.textContent=on?'Coach your game as a card battle, or let your coordinators sim it with your playbook.':sub.dataset.classic}
    let btn=row?.querySelector('[data-coach-cards]');
    if(on&&row&&!btn)row.insertAdjacentHTML('afterbegin','<button type="button" class="bi-primary" data-coach-cards id="gamelabCoachCards">Coach with Cards</button>');
    else if(!on)btn?.remove();
  }

  // ============================================================== 12. the dynasty's big moments, in cards
  // Bowl traditions theme the bowl pack, signature cards grow with honors (the Heisman chase), the rivalry trophy plays
  // in its game, coaching-tree cards leave with their coach, program milestones fill an album, walk-ons get a frame,
  // and the spring game gives everyone reps.
  const MOMENTS=registerCardIntegration({id:'dynasty-moments',label:'Bowl traditions, honors, trophies and the spring game',
    about:'Classic and modern bowls theme their packs, signature cards grow with honors, a held rivalry trophy plays in that game, coaching-tree cards leave with their coach, program milestones fill an album, and the spring game gives your players reps.',
    hooks:{
      launch(ctx){if(!momentsOn())return;
        const fav=bowlTheme(ctx.cfg.label,ctx.cfg.stage);if(fav){ctx.cfg.packFavor=fav.cards;ctx.cfg.packFavorWhy=fav.why}
        const t=trophyEdge(ctx.me,ctx.opp);if(t){const prog=ctx.cfg.program??={home:{enabled:false},away:{enabled:false}},side=ctx.userSide;prog[side]??={enabled:false};prog[side].extra??={off:[],def:[]};
          prog[side].extra.off=(prog[side].extra.off||[]).concat([t]);prog[side].extra.def=(prog[side].extra.def||[]).concat([t])}},
      weekTick(ctx){honorTiers();coachDepartures();programMilestones();walkOnBreakouts(ctx)},
      offseason(){honorTiers();coachDepartures();programMilestones();springGame()}
    }});
  const momentsOn=()=>!!universe?.callSheet&&integrationOn(MOMENTS);
  // Bowl traditions: older bowls hand out era cards, newer ones spread-era cards (alternating through the bowl list).
  const CLASSIC_CARDS=['spinner','buck_lateral','triple_option','split_veer','wishbone_dive','power_lead','draw'],MODERN_CARDS=['shallow_cross','curl_flat','four_verts','rpo_bubble','hb_wheel','quick_slant_plus'];
  function bowlTheme(label,stage){
    if(stage!=='bowl'||!label)return null;let h=0;for(const ch of String(label))h=(h*31+ch.charCodeAt(0))>>>0;
    return h%2?{cards:CLASSIC_CARDS,why:`${label} tradition: an old-school card`}:{cards:MODERN_CARDS,why:`${label}: a modern-game card`};
  }
  // The Heisman chase: a signature card's tier follows its player's honors (Players of the Week and season awards).
  function honorsFor(p,me){
    let n=0;for(const row of universe.weeklyHonors?.year===universe.year?universe.weeklyHonors.rows||[]:[])for(const w of [row.off,row.def])if(w&&String(w.playerId)===String(p.id)&&String(w.teamId)===String(me.id))n++;
    const past=cardMeta().honors?.[p.id]||0,awards=(p.awards||[]).length,national=(p.awards||[]).some(a=>/Player of the Year|Heisman/i.test(a.name||''));
    return{count:Math.max(n,past)+awards,national};
  }
  function honorTiers(){
    const me=selected();if(!momentsOn()||!me)return;const meta=cardMeta(),pb=userPlaybook();meta.honors??={};
    for(const sg of [...(pb.signatures||[]),...(pb.reserveSignatures||[])]){
      const p=(me.roster||[]).find(x=>String(x.id)===String(sg.playerId));if(!p)continue;
      const h=honorsFor(p,me);meta.honors[p.id]=Math.max(meta.honors[p.id]||0,h.count-(p.awards||[]).length);
      const tier=h.national||h.count>=5?3:h.count>=3?2:h.count>=1?1:0;
      if(tier>(sg.tier|0)){
        const honors=(p.awards||[]).map(a=>a.name).filter(Boolean);
        CS.signatures.remember(sg,`${universe.year} · ${honors.length?honors.slice(-3).join(', '):h.count+' recorded weekly honor'+(h.count===1?'':'s')}.`);
        sg.tier=tier;CS.signatures.register(sg);rewardMoment(`${p.name}'s card grows: ${tier>=3?'award winner':`${'★'.repeat(tier)} honored`}${tier>=3?' (+1 on its key duel)':''}.`)}
    }
  }
  // A held rivalry trophy: half a point on 3rd and 4th down in that game only, both ways.
  function trophyEdge(me,opp){
    const r=me?.rivalry;if(!r||!opp||String(r.rivalId)!==String(opp.id)||String(r.series?.holderId)!==String(me.id))return null;
    return{when:'money',duel:'K',v:.5,src:`${r.trophy||'The trophy'}: it lives in our building`};
  }
  // Coaching-tree cards leave with their coordinator and join his new program's playbook.
  function coachDepartures(){
    const me=selected();if(!momentsOn()||!me)return;const meta=cardMeta(),pb=userPlaybook(),grants=meta.schemeGrants??={};
    const sources=[[me,pb,grants]];
    for(const [teamId,other] of Object.entries(meta.ai||{})){
      if(!other.staffLoans||!Object.keys(other.staffLoans).length)continue;
      const team=universe.teams.find(t=>String(t.id)===teamId);if(team)sources.push([team,other,other.staffLoans]);
    }
    const moves=[];
    for(const [from,book,loans] of sources)for(const [id,g] of Object.entries(loans)){
      const employs=team=>Object.values(team.staff||{}).some(c=>c?.id!=null&&String(c.id)===String(g.coachId));
      if(employs(from))continue;
      delete loans[id];book.programCards=(book.programCards||[]).filter(x=>x!==id);
      if(!CS.packs.cardDef(id)||!removeSuppliedCopy(book,id))continue;
      moves.push({from,id,g,to:universe.teams.find(employs)});
    }
    // All departures are removed first so that simultaneous staff swaps conserve both loans.
    for(const {from,id,g,to} of moves){
      const card=CS.packs.cardDef(id);
      if(to){
        const target=to===me?pb:aiPlaybookFor(to),ledger=to===me?grants:(target.staffLoans??={});
        const pile=CS.data.TACTICS[id]?'tactics':'wrinkles',side=card.side;
        if(to!==me&&target[side][pile].length<target.capacity[pile])target[side][pile].push(id);
        else CS.packs.ensureCollection(target)[side][pile].push(id);
        ledger[id]=g;
      }
      if(from===me||to===me)rewardMoment(`${g.name} left ${from.name}${to?` for ${to.name}`:''} and took ${card.name} with him.`);
    }
  }
  // Program history: milestones your dynasty actually reached.
  const MILESTONES=[['bowl_win','First bowl win'],['conf_title','Conference title'],['unbeaten','Undefeated regular season'],['national_title','National title']];
  function programMilestones(){
    const me=selected();if(!momentsOn()||!me)return;const meta=cardMeta(),got=meta.milestones??=[];
    const add=(id,label)=>{if(got.includes(id))return;got.push(id);rewardMoment(`Program history: ${label}. Added to the Program History album.`)};
    if(me.bowlResult?.won&&me.bowlResult.year===universe.year)add('bowl_win','First bowl win');
    if(me.champ)add('conf_title','Conference title');
    if(universe.phase!=='regular'&&(me.w||0)>=12&&(me.l||0)===0)add('unbeaten','Undefeated regular season');
    if(universe.champion&&universe.champion===me.name)add('national_title','National title');
  }
  // Walk-ons who become starters get the Walk-On frame on their card.
  const isWalkOn=p=>{const stars=Number(recruitmentOf(p)?.stars);return /walk-on/i.test(String(p?.origin||''))||stars>0&&stars<=2};
  // A walk-on who earns a starting job can break out: a 10% chance each week until he gets his card (once ever).
  function walkOnBreakouts(ctx){
    const me=selected();if(!momentsOn()||!me||universe.phase!=='regular')return;const meta=cardMeta(),pb=userPlaybook();meta.rewardKeys??=[];
    for(const p of me.roster||[]){
      if(!isWalkOn(p)||battleRoleOf(p,me)?.depth!==0||hasCard(pb,p.id))continue;const key=`walkon:${p.id}`;if(meta.rewardKeys.includes(key))continue;
      if(DynastyRng.create(`walkon:${universe.year}:${ctx?.week??universe.week}:${p.id}`).next()>=.1)continue;
      meta.rewardKeys.push(key);if(giveSignature(p,me,{earned:'Walk-on to starter'},'Walk-on breakout'))rewardMoment(`${p.name} walked on and earned his spot. Now he has a signature card.`);
    }
  }
  // The trophy case: rivalry trophies you hold, as cards in the Card Program.
  function trophyCaseHTML(){
    const me=selected(),r=me?.rivalry;if(!momentsOn()||!r||String(r.series?.holderId)!==String(me.id))return'';
    const rival=universe.teams.find(t=>String(t.id)===String(r.rivalId));
    return`<details class="cpn-albums"><summary>Trophy case · 1</summary><div class="cs-ring"><article class="cs-face r-legendary"><span class="cs-face-origin">rivalry trophy</span><b class="cs-face-name">${escH(r.trophy||'Rivalry trophy')}</b><small class="cs-face-type">held over ${escH(rival?.name||'your rival')}</small><p class="cs-face-text">In our building. In the rivalry game: +½ on the Key duel on 3rd and 4th down, both ways.${r.series?.w!=null?` Series ${r.series.w}–${r.series.l}.`:''}</p></article></div></details>`;
  }
  // The spring game: first team against second team, a real card battle; everyone gets reps, a backup can shine.
  function springGame(){
    const me=selected();if(!momentsOn()||!me||universe.offseason?.phase!=='spring')return;const meta=cardMeta();
    if(meta.springGameYear===universe.year)return;meta.springGameYear=universe.year;
    try{
      const pb=userPlaybook(),first=CS.adapter.battleTeam(me,CS.packs.decksOf(pb)),depth=JSON.parse(JSON.stringify(me.roleDepth||{}));
      for(const k of Object.keys(depth))if(Array.isArray(depth[k])&&depth[k].length>1)depth[k]=depth[k].slice(1);
      const second=CS.adapter.battleTeam({...me,roleDepth:depth,name:`${me.name} White`},CS.packs.decksOf(pb));second.name=`${me.name} White`;first.name=`${me.name} Blue`;
      const b=CS.battle.simulate({home:first,away:second,seed:`spring:${universe.year}:${me.id}`});
      for(const id of [...pb.off.base,...pb.def.base])CS.evolution.addReps(pb,CS.evolution.rootOf(id),3);
      const tally=CS.battle.duelTally(b),firstIds=new Set([...Object.values(first.lineup.off),...Object.values(first.lineup.def)].map(x=>String(x.id)));
      const star=Object.entries(tally).filter(([id])=>!firstIds.has(String(id))).sort((a,c)=>(c[1].w-c[1].l)-(a[1].w-a[1].l))[0];
      // A backup who outdueled the starter at his spot becomes a real camp recommendation (applied through camp).
      let rec='';
      if(star){const role=[...Object.entries(second.lineup.off),...Object.entries(second.lineup.def)].find(([,p])=>String(p.id)===String(star[0]))?.[0],starter=role?(first.lineup.off[role]||first.lineup.def[role]):null,st=starter?tally[starter.id]:null;
        if(role&&starter&&String(starter.id)!==String(star[0])&&(!st||(star[1].w-star[1].l)>(st.w-st.l))){meta.springStandout={year:universe.year,roleId:CS.adapter.ROLE_MAP[role]||role,role,id:star[0],name:star[1].name,starterId:starter.id,starterName:starter.name,score:`${star[1].w}–${star[1].l}`};rec=` He outdueled ${starter.name}, so the staff recommends him at ${ROLE_NAMES[role]||role} in spring camp`}}
      rewardMoment(`Spring game: Blue ${b.game.score.home}, White ${b.game.score.away}. Base plays +3 reps${star?`; ${star[1].name} stood out for the second team (${star[1].w}–${star[1].l} in duels)`:''}.${rec}`);
    }catch(err){console.error(err)}
  }

  // ============================================================== 4. the Card Program panel and settings
  // Two native Dynasty tabs, backed by the same playbook the battle actually draws.
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
  // A read-only bridge to the existing Dynasty Lab decisions, not another preparation system.
  function connectionsHTML(){
    const me=selected(),cs=universe?.callSheet,pb=cs?.playbook;if(!me||!pb)return'';
    const link=(tab,label)=>`<button type="button" class="cpn-link" data-card-dynasty-tab="${tab}">${label}</button>`;
    const active=!!cs.activeBattle,g=universe.phase==='regular'?currentCardGame():null;
    const opp=g&&!g.played?T(g.home===me.name?g.away:g.home):null;
    const reps=opp&&integrationOn(PRACTICE_LINK)?practiceReps(me,opp):{};
    const prep=active?'This battle’s roster, preparation and coaching are already locked in. Changes apply to a future game.':!opp?'Next regular-season opponent: preparation will appear when a game is scheduled.':!integrationOn(PRACTICE_LINK)?'Practice mastery is off in Card Settings.':Object.keys(reps).length?`${opp.name}: ${Object.entries(reps).map(([id,n])=>`${cardName(id)} +${n} reps`).join(' · ')}. Awarded with the game, not by opening this panel.`:`No matching practice reps set against ${opp.name}. Your existing preparation board trains cards as well as the team.`;
    const rates=integrationOn(STAFF_LINK)?trainingFor(me,pb):{};
    const teachers=['off','def'].map(side=>{const c=me.staff?.[side==='off'?'OC':'DC'];const roots=[...pb[side].base,...pb[side].wrinkles].map(id=>CS.packs.cardDef(id)).filter(Boolean).map(c=>c.evolvedFrom||c.upgradeOf||c.id);const n=Math.round(Math.max(0,...roots.map(id=>rates[id]||0))*100);return`${side==='off'?'Offensive':'Defensive'} staff${c?.name?` (${c.name})`:''}: ${n?`up to +${n}%`:'no extra'} mastery`;}).join(' · ');
    const unavailable=(me.roster||[]).filter(p=>Number(p.injuryWeeks)>0).length;
    return`<div class="cpn-connections" aria-label="Dynasty Lab connections"><h4>Dynasty Lab → Game Day</h4><div class="cpn-bridge-grid">
      <article><b>This week’s preparation</b><p>${escH(prep)}</p>${opp&&!active?link('gamelab','Scout & prepare'):''}</article>
      <article><b>Your people, your cards</b><p>${unavailable?`${unavailable} injured player${unavailable===1?' is':'s are'} unavailable. `:''}Roles & Depth chooses the real players on the field. Redshirts, academic holds and this week’s sit decisions are respected. Camp gains change their duel traits, not a second bonus.</p>${link('depth','Set the lineup')}${link('development','Develop players')}</article>
      <article><b>Coaches teach what you call</b><p>${escH(teachers)}. Coordinator development and player coaching support contribute. Only cards used in games earn the coaching boost.</p>${link('staff','Manage staff')}</article>
      <article><b>Recruit for your playbook</b><p>${integrationOn(RECRUIT_LINK)?'Prospect cards show archetype fit with your active deck. Matching strengths contribute to the existing recruiting pitch, without revealing hidden ratings.':'Playbook recruiting is off in Card Settings; the normal recruiting pitch is unchanged.'}</p>${link('recruiting','Find your next playmaker')}</article>
    </div></div>`;
  }
  function offseasonRetools(){
    const pb=universe?.callSheet?.playbook,me=selected(),EV=CS.evolution;
    if(!pb||!me||!upgradesOn()||universe.phase!=='complete'||!['spring','fall','preseason'].includes(universe.offseason?.phase)||
       universe.callSheet.activeBattle||pb.retoolYear===universe.year)return[];
    const lineup=gameLineup(me).lineup,options=[];
    for(const [root,from] of Object.entries(pb.evolved||{})){
      const branches=EV.TREE[root];
      if(!branches?.some(([id])=>id===from))continue;
      const side=CS.data.PLAYS[root]?'off':'def',deck=pb[side],coach=me.staff?.[side==='off'?'OC':'DC'];
      if(!coach?.name||coach.leftSeason!=null||['RETIRED','DEPARTED','INACTIVE'].includes(String(coach.status).toUpperCase())||(coach.schoolId!=null&&String(coach.schoolId)!==String(me.id)))continue;
      const to=branches.find(([id])=>id!==from)[0],n=EV.NEEDS[to],player=lineup[side][n.role];
      if(!player||!(me.roster||[]).some(p=>String(p.id)===String(player.id))||EV.lockReason(to,lineup))continue;
      const copies=[...deck.base,...deck.wrinkles,...(pb.reserve?.[side]?.wrinkles||[])].filter(id=>id===from).length;
      if(!copies)continue;
      const base=deck.base.map(id=>id===from?to:id);
      if(new Set(base).size!==4||!base.some(id=>{const c=CS.packs.cardDef(id);return c.cost===0&&!c.needs}))continue;
      options.push({root,side,from,to,copies,coach:coach.name,player:player.name,need:n.label,rating:player.traits[n.trait],minimum:n.grade*10});
    }
    return options;
  }
  function retrainBranch(root,to){
    const choice=offseasonRetools().find(x=>x.root===root&&x.to===to);
    if(!choice)return false;
    const pb=userPlaybook(),{from,side}=choice;
    for(const pile of [pb[side].base,pb[side].wrinkles,pb.reserve?.[side]?.wrinkles||[]])
      for(let i=0;i<pile.length;i++)if(pile[i]===from)pile[i]=to;
    if(side==='off'&&pb.off.openingScript===from){
      if(CS.data.canScriptOpener(pb.off,to))pb.off.openingScript=to;else delete pb.off.openingScript;
    }
    pb.evolved[root]=to;pb.retoolYear=universe.year;
    const finish=pb.finishes?.[from];
    if(finish&&(!pb.finishes[to]||finish==='gold'))pb.finishes[to]=finish;
    (pb.history??=[]).push({id:to,from,side,kind:'retool',season:universe.year});
    rewardMoment(`${choice.coach} retrained ${cardName(from)} as ${cardName(to)} with ${choice.player}.`);
    autosaveAfter('game');return true;
  }
  function retoolHTML(){
    const choices=offseasonRetools();if(!choices.length)return'';
    return `<details class="cpn-fold" data-card-fold="retool"><summary>Offseason branch retraining</summary>
      <p class="cpn-foot">Your staff can retrain one branch this offseason. Every owned copy changes, including copies in your deck. You can keep your current playbook.</p>
      ${choices.map(o=>`<p><b>${escH(cardName(o.from))} → ${escH(cardName(o.to))}</b> · ${o.copies} ${o.copies===1?'copy':'copies'}<br>${escH(o.coach)} can teach ${escH(o.player)} (${escH(o.need)} ${o.rating}, requires ${o.minimum}).<br>${escH(CS.packs.cardDef(o.to).text.replace(/^EVOLVED · /,''))}<br><button type="button" class="cpn-link" data-retool-root="${escH(o.root)}" data-retool-to="${escH(o.to)}">Retrain as ${escH(cardName(o.to))}</button></p>`).join('')}</details>`;
  }
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-retool-root]');if(!button)return;
    if(retrainBranch(button.dataset.retoolRoot,button.dataset.retoolTo)){paintCardRoom();setStatus('Your offseason branch has been retrained.')}
  });
  function openDynastyConnection(tab){
    if(!['deckroom','collection','gamelab','depth','development','staff','recruiting'].includes(tab))return;
    // Calling the existing router directly avoids the card-first Game Day nav shortcut.
    goToTab(tab);
    if(tab==='gamelab')document.querySelector('#v0102WeeklyCoaching')?.scrollIntoView?.({block:'start'});
  }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-card-dynasty-tab]');if(b)openDynastyConnection(b.dataset.cardDynastyTab)});
  function deckEditsLocked(){const g=currentCardGame();return !!g&&cardMeta().activeBattle?.seed===battleSeed(g)}
  // This season in calls: the recap of every card battle so far (3+ games), from the season ledger.
  function seasonRecapHTML(){
    const r=CS.battle.seasonRecap?.(universe.callSheet?.seasonCalls?.[String(universe.year)]);if(!r)return'';
    return`<section class="cpn-season" id="seasonRecap"><h3>${universe.year} in calls</h3>${r.lines.map(l=>`<p class="cpn-foot">${escH(l)}</p>`).join('')}</section>`;
  }
  function cardProgramHTML(){
    const cs=universe.callSheet,pb=cs.playbook,on=INTEGRATIONS.filter(integrationOn).length;
    const stat=(k,v)=>`<div><span>${k}</span><b>${v}</b></div>`;
    const stats=pb?stat('Card record',`${pb.record?.w||0}–${pb.record?.l||0}`)+stat('Packs',pb.packsOpened||0)+stat('Evolved',Object.keys(pb.evolved||{}).length)
      +stat('Ready to evolve',CS.evolution.ready({...pb}).length)+stat('Ring of Honor',(pb.ringOfHonor||[]).length):'<p class="muted">Play a card game to start your playbook.</p>';
    const teaching=pb&&integrationOn(STAFF_LINK)?trainingFor(selected(),pb):{},maxTeach=Math.round(Math.max(0,...Object.values(teaching))*100);
    // Match the editor's facility-adjusted limits without writing to the playbook on a read-only visit.
    const limits=pb?syncProgramCapacity(selected(),{capacity:{...pb.capacity}}).capacity:{};
    const active=pb?['off','def'].map(side=>`<article><b>${side==='off'?'Offense':'Defense'}</b><p>${pb[side].base.length}/4 base calls · ${pb[side].wrinkles.length}/${limits.wrinkles} plays · ${pb[side].tactics.length}/${limits.tactics} tactics</p><small>Base calls: ${pb[side].base.map(id=>escH(cardName(id))).join(' · ')}</small></article>`).join(''):'';
    const locked=deckEditsLocked();
    const coach=locked?'<button type="button" class="cpn-btn" data-coach-cards>Resume Battle</button>':postCoachHTML()||(coachableGame()?'<button type="button" class="cpn-link" data-coach-cards>Coach this game</button>':'');
    return`<div id="cardProgram" class="card cpn">
      <span class="eyebrow">CARDS &amp; DECK / CALL SHEET</span><h2>Deck Room</h2><p class="cpn-intro">Choose which cards from your collection to take into the next game.</p>
      <div class="cpn-actions"><button type="button" class="cpn-btn" data-card-deck${locked?' disabled':''}>Build Deck</button>${coach}</div>
      ${locked?'<p class="cpn-foot">Your deck is locked for the current battle. Finish it before editing.</p>':''}
      ${retoolHTML()}
      <h3>In your deck</h3><div class="cpn-bridge-grid">${active}</div><p class="cpn-foot"><b>Player signatures:</b> ${(pb?.signatures||[]).length}/${CS.signatures.SLOTS} across both sides</p>
      <p class="cpn-foot">Facilities increase pile capacity. A normal series draws up to three plays and four tactics. Filling extra slots spreads those draws across more cards.</p>
      <p class="cpn-foot"><b>Opening script:</b> ${pb?.off.openingScript?escH(cardName(pb.off.openingScript)):'Normal draw'}</p>
      ${seasonRecapHTML()}
      <details class="cpn-fold" data-card-fold="training"><summary>Training &amp; roster connections</summary><p class="cpn-foot" data-card-connections>Facilities ${Math.round(selected().facilities||0)}${maxTeach?` · Coaching: up to +${maxTeach}% mastery on used cards`:""}<br>${escH(selected().offScheme)} / ${escH(selected().defScheme)}</p>
      ${upgradesHTML()}${connectionsHTML()}</details>
      <details class="cpn-fold" data-card-fold="record"><summary>Record &amp; settings</summary><button type="button" class="cpn-link" data-card-settings>Card Settings</button><div class="cpn-stats">${stats}</div>
      <p class="cpn-foot muted">${escH(MODES.find(m=>m[0]===cs.settings.mode)?.[1]||'Key downs')} · ${escH(CONTROLS.find(c=>c[0]===cs.settings.control)?.[1]||'Offense')} · ${on}/${INTEGRATIONS.length} connections on</p></details>
    </div>`;
  }
  function collectionHTML(){
    const cs=universe.callSheet,pb=cs.playbook,ui=CS.playbookUI;
    // Use the actual inventory piles, not album roots (which include historic card IDs).
    CS.signatures.registerAll(pb);
    const binder=['off','def'].map(side=>{
      const deck=pb[side],extra=pb.reserve?.[side],copies=new Map();
      const inDeck=[...deck.base,...deck.wrinkles,...deck.tactics,...(pb.signatures||[]).filter(s=>s.side===side).map(s=>s.id)];
      const unselected=[...(extra?.wrinkles||[]),...(extra?.tactics||[]),...(pb.reserveSignatures||[]).filter(s=>s.side===side).map(s=>s.id)];
      for(const id of inDeck){const c=copies.get(id)||{owned:0,selected:0};c.owned++;c.selected++;copies.set(id,c)}
      for(const id of unselected){const c=copies.get(id)||{owned:0,selected:0};c.owned++;copies.set(id,c)}
      const faces=[...copies].map(([id,c])=>ui.faceHTML(id,{printFinishes:pb.finishes||{},footer:`<small>${c.owned} owned · ${c.selected} in deck</small>${provenanceHTML(CS.packs.cardDef(id)?.signature)}`})).join('');
      return `<details class="cpn-pile" data-card-fold="cards-${side}" ${side==='off'?'open':''}><summary>${side==='off'?'Offense':'Defense'} · ${inDeck.length+unselected.length} owned</summary>${faces?`<div class="cpn-faces">${faces}</div>`:'<p class="cpn-foot">No cards yet.</p>'}</details>`;
    }).join('');
    const log=(cs.newsLog||[]).slice().reverse().slice(0,8),packs=cs.rewardPacks||[],banked=pb.gamePacks||[];
    return `<div id="cardBinder" class="card cpn"><span class="eyebrow">CARDS &amp; DECK / CALL SHEET</span><h2>Collection</h2>
      <p class="cpn-intro">Every card your program owns, including the ones you haven’t picked for your deck.</p>
      ${banked.length?`<section class="cpn-locker"><h3>Saved game packs · ${banked.length}</h3><p class="cpn-foot">Open these between games. If a legendary gets claimed or an upgrade no longer fits, its slot offers a rare alternate.</p><button type="button" class="cpn-btn cpn-reward" data-game-pack="${escH(banked[0].key)}" ${cs.activeBattle?'disabled':''}>Open ${escH(banked[0].title)}</button> <span class="cpn-foot">${banked[0].year} · ${escH(banked[0].source)}</span></section>`:''}
      <div class="cpn-actions">${packs.length?`<button type="button" class="cpn-btn cpn-reward" data-reward-pack ${cs.activeBattle?'disabled':''}>Open ${escH(packs[0].title)}${packs.length>1?` (+${packs.length-1} more)`:''}</button>`:banked.length?'':'<span class="cpn-foot">No unopened reward packs.</span>'}<button type="button" data-card-deck class="cpn-link"${deckEditsLocked()?' disabled':''}>Build Deck</button></div>
      ${binder}${pursuitHTML()}${albumsHTML()}${ringHTML()}${trophyCaseHTML()}
      <div class="cpn-league"><h3>Around the League</h3>${log.length?`<ul class="cpn-feed">${log.map(newsHTML).join('')}</ul>`:'<p class="muted cpn-empty">Sim a week and opponents on your schedule start opening packs.</p>'}</div></div>`;
  }
  function paintCardRoom(){
    const host=document.getElementById(activeTab);if(!host||!universe||!selected())return;
    userPlaybook();injectCardProgramStyles();CS.playbookUI.injectFaceCSS();
    const folds=new Map([...host.querySelectorAll('[data-card-fold]')].map(el=>[el.dataset.cardFold,el.open]));
    host.innerHTML=activeTab==='deckroom'?cardProgramHTML():collectionHTML();
    for(const btn of host.querySelectorAll('[data-card-alumnus]'))btn.onclick=()=>showPlayerProfile(btn.dataset.cardAlumnus);
    for(const el of host.querySelectorAll('[data-card-fold]'))if(folds.has(el.dataset.cardFold))el.open=folds.get(el.dataset.cardFold);
  }
  if(typeof TAB_RENDERERS==='object'){TAB_RENDERERS.deckroom=paintCardRoom;TAB_RENDERERS.collection=paintCardRoom}
  // This Week's Last Final card: add the recorded deciding snap from the game archive (same text as the final screen).
  // The card is redrawn wholesale by its own layer, so watch the dashboard and re-add the line when it returns.
  function paintDecidingSnap(){
    const host=document.querySelector('#dashboard #highlightsCard');if(!host||host.querySelector('#hlDecider'))return;
    const rec=(universe?.gameArchive||[]).find(r=>r.id===host.dataset.hlGame),t=rec?.cardMoments?.[0];
    if(!t||!/^(Deciding duel|Turning point)/.test(t))return;
    const pay=host.querySelector('.hl-payoff');if(!pay)return;
    pay.insertAdjacentHTML('beforeend',`<p class="hl-consequence" id="hlDecider"><small>Deciding snap</small><b>${escH(t.replace(/^(Deciding duel|Turning point): /,''))}</b></p>`);
  }
  function watchDecidingSnap(){
    const dash=document.querySelector('#dashboard');if(!dash||dash.__deciderObs||typeof MutationObserver!=='function')return;
    dash.__deciderObs=new MutationObserver(()=>{try{paintDecidingSnap()}catch(err){}});dash.__deciderObs.observe(dash,{childList:true});
  }
  function paintCardProgram(){
    if(typeof document==='undefined'||typeof document.getElementById!=='function'||typeof document.createElement!=='function')return;
    try{if(typeof document.querySelector==='function'){watchDecidingSnap();paintDecidingSnap()}}catch(err){console.error(err)}
    const dash=document.querySelector('#dashboard'),old=document.getElementById('cardDeskLink');
    if(dash&&universe&&!universe.callSheet&&selected()&&(cardGameIsDefault()||POST_PHASES.includes(universe.phase)&&postseasonCardGame()&&!cardGameBlocker()))cardMeta();
    if(cardGameIsDefault()&&universe?.callSheet&&!universe.callSheet.playbook)userPlaybook();
    if(!dash||!universe?.callSheet||!selected()){old?.remove();return}
    if(activeTab==='deckroom'||activeTab==='collection')paintCardRoom();
    const packs=(universe.callSheet.rewardPacks?.length||0)+(universe.callSheet.playbook?.gamePacks?.length||0);
    // One line on where last game's card went, read from the live deck (a later cut or edit is reflected).
    const won=CS.packs.lastGameCard?.(universe.callSheet.playbook),wonWhere=!won?'':won.status==='upgrade'?`replaced ${escH(won.replaced||'a card')} ${won.inDeck?'in your deck':'in your collection'}.`:won.status==='deck'?'is in your deck for next game.':won.status==='split'?`· ${won.inDeck} in your deck, ${won.inCollection} in your collection.`:'is in your collection, not your deck. Add it in Deck Room.';
    const wonLine=won?`<p class="cpn-last-card" id="lastGameCard"><span>From ${escH(won.source)}:</span> <b>${escH(won.name)}</b> ${wonWhere}</p>`:'';
    let tipLine='';try{const tip=installTip();if(tip?.reason==='finish'&&!universe.callSheet.installFocus)tipLine=`<p class="cpn-last-card" id="installTipWeek"><span>Install:</span> ${escH(tip.text)} Pick it in Deck Room.</p>`}catch(err){console.error(err)}
    const shortcut=`<div id="cardDeskLink" class="card cpn-shortcut" data-dview="week"><b>Cards &amp; Deck</b>${wonLine}${tipLine}<button type="button" data-card-dynasty-tab="deckroom">Deck Room</button>${packs?`<button type="button" data-card-dynasty-tab="collection">${packs} unopened pack${packs===1?'':'s'}</button>`:''}</div>`;
    if(old)old.outerHTML=shortcut;else dash.insertAdjacentHTML('beforeend',shortcut);
    try{if(cardGameIsDefault()){const tabs=dash.querySelector(':scope > .dash-views'),feature=dash.querySelector(':scope > #broadcastFeature'),link=dash.querySelector('#cardDeskLink'),desk=dash.querySelector(':scope > .command-center');
      if(tabs&&feature&&tabs.nextElementSibling!==feature)tabs.after(feature);
      // Cards & Deck is the first row of the weekly desk, right under the This Week tabs (dashboard-views keeps the desk
      // directly after the tabs, so the strip goes inside it rather than competing for that slot).
      if(desk&&link&&desk.firstElementChild!==link)desk.prepend(link);else if(!desk&&feature&&link&&feature.nextElementSibling!==link)feature.after(link)}}catch(err){console.error(err)}
    try{labelNextButton()}catch(err){console.error(err)}
    try{paintMatchupCards()}catch(err){console.error(err)}
    // Postseason with the card default off: offer the coached game beside the briefing's primary "Next" button.
    try{const adv=document.querySelector('#hubAdvance'),btn=document.querySelector('#cardHubCoach'),g=!cardGameIsDefault()&&POST_PHASES.includes(universe.phase)&&!universe.callSheet.activeBattle?currentCardGame():null,label=g&&!cardGameBlocker()?`Coach the ${g.label} with Cards`:null;
      if(!label||!adv)btn?.remove();else if(btn)btn.textContent=label;else adv.insertAdjacentHTML('afterend',`<button type="button" id="cardHubCoach" class="${escH(adv.className)}" data-coach-cards style="margin-left:8px">${escH(label)}</button>`)}catch(err){console.error(err)}
    injectCardProgramStyles();
  }
  function injectCardProgramStyles(){
    if(document.getElementById('cardProgramStyles'))return;
    const st=document.createElement('style');st.id='cardProgramStyles';st.textContent=`
.cpn{padding:clamp(16px,3vw,32px);border-radius:14px;background:linear-gradient(135deg,#10172a,#1a1030);color:#eef2ff;border:1px solid #2f3a66}
.cpn h2{font-size:clamp(26px,4vw,40px);margin:4px 0;color:#fff;line-height:1.1}.cpn .eyebrow{color:#aebfff;letter-spacing:.12em;font-size:12px}
.cpn h3{margin:22px 0 8px;font-size:20px;color:#fff}.cpn-intro{margin:5px 0 12px;color:#d3dded}.cpn-actions,.cpn-shortcut{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.cpn-shortcut{padding:10px 14px}.cpn-last-card{margin:0;flex:1 1 260px;color:#d3dded}.cpn-last-card span{color:#9fb0c8}.cpn-last-card b{color:#fff}.cpn-actions{margin:8px 0 16px}.cpn-actions button:disabled{opacity:.55;cursor:not-allowed}
.cpn-faces,.cpn .cs-ring{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,166px),1fr));gap:16px;padding:12px 8px 6px 0}
.cpn-fold,.cpn-pile,.cpn-albums{border-top:1px solid #3d4561;padding:4px 0}.cpn .cpn-fold:first-of-type{margin-top:20px}.cpn details summary{cursor:pointer;font-weight:700;padding:12px 0;min-height:44px}.cpn .cpn-league{margin-top:22px}.cpn .cs-face{min-width:0;overflow-wrap:anywhere}
.cpn-connections{margin:16px 0}.cpn-connections h4{margin:0 0 8px;color:#fff}.cpn-bridge-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:10px}.cpn-bridge-grid article{background:rgba(255,255,255,.06);border:1px solid #394365;border-radius:10px;padding:12px}.cpn-bridge-grid p{font-size:13px;line-height:1.5;color:#c5cfee;margin:6px 0}.cpn-link{min-height:44px;margin:4px 8px 0 0;padding:6px 0;background:none;border:0;color:#ffe291;text-decoration:underline;font:inherit;font-size:13px;cursor:pointer}.cpn-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px}
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
.cpn .muted{color:#aab6e8}.cpn-foot{margin:10px 0 0;font-size:12px}
@media(max-width:720px){.cpn .eyebrow,.cpn .cpn-stats span,.cpn .cpn-foot,.cs-mini small,.cs-mini em,.cs-coach small{font-size:12px!important}}
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
    const headset=CS.battle.headsetSettings(s.headset);
    const el=document.createElement('div');el.id='cardSettings';
    el.innerHTML=`<form class="cps" role="dialog" aria-modal="true" aria-labelledby="cpsTitle">
      <h2 id="cpsTitle">Card Settings</h2><p class="muted" style="margin:0;color:#aab6e8">Saved with this dynasty.</p>
      <fieldset><legend>How much you call</legend>${MODES.map(m=>radio('mode',m[0],m[1],m[2],s.mode===m[0])).join('')}</fieldset>
      <fieldset><legend>You coach</legend><div class="seg">${CONTROLS.map(c=>radio('control',c[0],c[1],'',s.control===c[0])).join('')}</div></fieldset>
      <fieldset><legend>Key Moments headset</legend>${CS.battle.HEADSET_RULES.map(({id,label})=>box('headset:'+id,label,'',headset[id])).join('')}</fieldset>
      <fieldset><legend>Game feel</legend><div class="seg">${box('fast','Fast animations','',s.fast)}${box('sound','Sound','',s.sound!==false)}</div></fieldset>
      <fieldset><legend>Dynasty connections</legend>${INTEGRATIONS.map(x=>box('int:'+x.id,x.label,x.about,integrationOn(x))).join('')}</fieldset>
      <div class="cps-actions"><button type="button" data-cps-cancel>Cancel</button><button type="submit" class="go">Save</button></div></form>`;
    document.body.appendChild(el);injectCardProgramStyles();
    const form=el.querySelector('form');
    form.addEventListener('submit',e=>{e.preventDefault();
      const f=new FormData(form),meta=cardMeta();
      meta.settings.mode=f.get('mode')||meta.settings.mode;meta.settings.control=f.get('control')||meta.settings.control;
      meta.settings.headset=Object.fromEntries(CS.battle.HEADSET_RULES.map(({id})=>[id,f.has('headset:'+id)]));
      meta.settings.fast=f.has('fast');meta.settings.sound=f.has('sound');
      for(const x of INTEGRATIONS)meta.settings.integrations[x.id]=f.has('int:'+x.id);
      try{autosaveAfter('game')}catch(err){console.error(err)}
      closeCardSettings(false);try{applyCardMode()}catch(err){}paintCardProgram();document.querySelector('#cardProgram [data-card-settings]')?.focus();try{setStatus('Card settings saved.')}catch(err){}
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
  // Use the same final definition as game day, without registering a prospect's card in the catalog.
  function signatureStory({spec,projection,status='',archived=false,ownTeam=false}){
    if(!spec){
      if(!projection?.role||!universe.callSheet)return'';
      spec=CS.signatures.specFor(projection);
    }
    if(!spec.role||!spec.template||!['string','number'].includes(typeof spec.playerId))return'';
    const {def,kind}=CS.signatures.describe(spec);
    const flags={qbRead:'QB read',protect:'protection',run:'run',separation:'separation',release:'release'};
    const defensive=spec.side==='def';
    const effect=def.effects?.map(e=>{
      const target=defensive&&e.flag==='protect'?'pass protection':flags[e.flag]||e.flag;
      return `+${e.v} ${defensive?'against the offense’s':'on'} ${target}${e.duel?(' '+({G:'Gate',K:'Key',F:'Finish'}[e.duel]||e.duel)):''} duels`;
    }).join(' · ');
    const line=kind==='play'?(def.pass?`A deep pass to the ${ROLE_NAMES[def.target]?.toLowerCase()||def.target}.`:`A designed run for the ${ROLE_NAMES[def.carrier]?.toLowerCase()||def.carrier}.`):
      `${kind==='call'?'Defensive call':spec.side==='off'?'Offensive tactic':'Defensive tactic'}${effect?' · '+effect:''}.`;
    const how=!status?(CS.signatures.breakoutGoal?.()||'A breakout at this role can earn it.'):archived?'':status==='In collection'?(ownTeam?'Select it under Build Deck → Signatures to put it in your deck.':'Stored, not in the game deck.'):'Only playable with him on the field at '+(ROLE_NAMES[spec.role]?.toLowerCase()||spec.role)+'.';
    const earned=status&&spec.earned?`Earned: ${spec.earned}${spec.season?' · '+spec.season:''}.`:'';
    return `<aside class="cs-signature-story"><small>${escH(status||'Possible signature')}</small><strong>${escH(def.name)}</strong><p>${escH(line)}</p>${def.matchupText?`<p class="cs-signature-matchup">${escH(def.matchupText)}</p>`:''}${earned||how?`<p>${escH([earned,how].filter(Boolean).join(' '))}</p>`:''}${status?provenanceHTML(spec):''}</aside>`;
  }
  function provenanceHTML(spec){
    if(!spec)return'';
    const history=CS.signatures.cardHistory(spec.provenance);
    if(!history.length&&spec.earned)history.push([spec.season,spec.earned].filter(Boolean).join(' · '));
    if(spec.year&&spec.exit)history.push(`${spec.year} · ${spec.exit}.`);
    if(!history.length)return'';
    return `<details class="cs-card-history"><summary>Card history</summary><ul>${history.map(line=>`<li>${escH(line)}</li>`).join('')}</ul></details>`;
  }
  function signingLine(p){
    const r=recruitmentOf(p);if(!r?.season||r.schoolId==null)return'';
    const school=teamById(r.schoolId);if(!school)return'';
    const stars=Number(r.stars);return `Signed with ${school.name} · ${r.season}${Number.isInteger(stars)&&stars>=1&&stars<=5?` · ${stars}-star recruit`:''}.`;
  }
  function cardCareerHTML(c){
    const pct=c&&c.w+c.l?Math.round(c.w*100/(c.w+c.l)):null;
    return c?`<div class="cs-pcard-career"><div><span>Duels</span><b>${c.w}–${c.l}</b>${pct==null?'':`<small>${pct}% won</small>`}</div><div><span>Highlight plays</span><b>${c.big}</b></div><div><span>Card games</span><b>${c.games}</b></div></div>`:'';
  }
  function alumniCardHTML(p){
    const cs=universe.callSheet;if(!cs)return'';
    const school=universe.teams.find(t=>t.name===p.lastTeam),lastBook=school?savedBookFor(school):null;
    let honor=null;
    for(const book of new Set([lastBook,cs.playbook,...Object.values(cs.ai||{})])){
      honor=book?.ringOfHonor?.find(x=>String(x.playerId)===String(p.id));if(honor)break;
    }
    const career=cleanCardCareer(honor?.cardCareer)||cleanCardCareer(cs.players?.[p.id]);
    if(!honor&&!career)return'';
    const signed=signingLine(p),end=[p.lastTeam,p.exitReason,p.retiredYear].filter(Boolean).join(' · ');
    return `<section id="alumniBattleCard" class="cs-alumni" aria-label="Alumni career card"><span class="eyebrow">${honor?'Ring of Honor':'Card career'}</span><h3>${escH(p.name)}</h3><p>${escH(end)}</p>${signed?`<p>${escH(signed)}</p>`:''}${honor?signatureStory({spec:honor,status:'Retired signature',archived:true}):''}${cardCareerHTML(career)||'<p>Card duel totals were not recorded.</p>'}</section>`;
  }
  function profileCard(hit){
    if(!hit||hit.portal)return'';
    return hit.active?playerCardHTML(hit.p,hit.team):alumniCardHTML(hit.p);
  }
  function playerCardHTML(p,t){
    const AD=CS.adapter,D=CS.data;if(!AD||!D)return'';
    const r=battleRoleOf(p,t)||{role:null,depth:null};
    const bp=AD.toBattlePlayer(p,r.role),cs=universe.callSheet,career=cs?.players?.[String(p.id)];
    const ownerBook=savedBookFor(t),sig=cardOf(p,t);
    const status=sig?(ownerBook.signatures?.includes(sig)?'In deck':'In collection'):'';
    const signed=signingLine(p);
    const strong=new Set(D.STYLE_TRAITS[bp.archetype]||[]),ability=D.SIGNATURES[bp.archetype]?.text||'';
    const depth=r.depth===0?'Starter':r.depth!=null?`No. ${r.depth+1} on the depth chart`:'Not on the depth chart';
    const development=t.id===selected()?.id?CS.program.developmentImpact(p,r.role,cs?.playbook):null;
    const duels=duelsForRole(r.role);
    const when={late:'4th quarter',money:'3rd & 4th down',any:'every snap'};
    const stamp=peopleOn()?developmentStamp(p,t,bp.ovr):null,nemesis=peopleOn()&&selected()&&t.id!==selected().id&&isNemesis(p,t,selected());
    return`<section class="cs-pcard${sig?' sig':''}" id="playerBattleCard" aria-label="Battle card">
      <div class="cs-pcard-face" style="--tc:${escH(t?.primary||'#2a3550')};--tc2:${escH(t?.secondary||'#e8e2d0')}">
        <div class="cs-pcard-top"><span class="cs-pcard-ovr">${bp.ovr}</span><span class="cs-pcard-num">#${escH(bp.number)}</span></div>
        ${portraitTag(p,112,'card')}
        <strong>${escH(p.name)}</strong><span>${escH(roleLabel(r.role,p))}</span><em>${escH(bp.archetype||'')}</em>
        ${sig?'<b class="cs-pcard-badge">SIGNATURE CARD</b>':''}
      </div>
      <div class="cs-pcard-body">
        <span class="eyebrow">BATTLE CARD</span>
        <h3>${escH(roleLabel(r.role,p))} · ${escH(depth)}</h3>
        ${ability?`<p class="cs-pcard-ability"><b>${escH(bp.archetype)}:</b> ${escH(ability)}</p>`:''}
        ${signatureStory({spec:sig,projection:bp,status,ownTeam:t.id===selected()?.id})}
        ${signed?`<p class="cs-pcard-note">${escH(signed)}</p>`:''}
        ${development?`<p class="cs-pcard-note"><b>${escH(development.phase)} ${development.year}: ${escH(development.trait)} +${development.gain}</b>${development.plays.length?` · Helps ${escH(development.plays.join(', '))}`:' · Applied through his current battle traits'}. No extra bonus is stacked.</p>`:''}
        ${stamp?`<p class="cs-pcard-note"><b>Development stamp: card OVR ${stamp.was} → ${stamp.now}</b> since the ${stamp.year} season ended.</p>`:''}
        ${nemesis?`<p class="cs-pcard-note"><b>NEMESIS:</b> he had you in his final five and chose ${escH(t.name)}. He plays up against you on 3rd and 4th down.</p>`:''}
        ${duels.length?`<p class="cs-pcard-duels">Fights in: ${duels.map(x=>`<span>${escH(x)}</span>`).join('')}</p>`:''}
        <div class="cs-pcard-traits">${D.TRAITS.map(k=>`<div class="${strong.has(k)?'key':''}"><span>${k==='iq'?'IQ':escH(k)}</span><i style="--v:${Math.max(0,Math.min(100,bp.traits[k]))}%"></i><b>${Math.round(bp.traits[k]/10)}</b></div>`).join('')}</div>
        ${bp.cond.length?`<div class="cs-pcard-cond">${bp.cond.map(c=>`<span class="${c.v>0?'up':'down'}">${c.v>0?'+1':'−1'} ${escH(c.src)} <small>${when[c.when]}</small></span>`).join('')}</div>`:''}
        ${cardCareerHTML(cleanCardCareer(career))||'<p class="cs-pcard-note muted">No card games yet. His duels are counted once he plays one.</p>'}
        <p class="cs-pcard-note muted">Duel grades are his ratings ÷ 10 (key traits in gold). Conditions come from his health, wear, composure, morale and position.</p>
      </div></section>`;
  }
  function injectPlayerCardStyles(){
    if(document.getElementById('cardPlayerStyles'))return;
    const st=document.createElement('style');st.id='cardPlayerStyles';st.textContent=`
.cs-pcard{display:grid;grid-template-columns:180px minmax(0,1fr);gap:16px;margin:0 0 16px;padding:14px;border-radius:14px;background:linear-gradient(135deg,#10172a,#1a1030);color:#eef2ff;border:1px solid #2f3a66}
.cs-signature-story,.cs-alumni{min-width:0;overflow-wrap:anywhere}.cs-signature-story{border-left:3px solid #e8b956;background:#222642;color:#f2f4ff;padding:9px 12px;margin:8px 0;border-radius:3px 8px 8px 3px}.cs-signature-story small,.cs-signature-story strong{display:block}.cs-signature-story small,.cs-alumni .eyebrow{color:#ffe09a;font-weight:700}.cs-signature-story p,.cs-alumni p{font-size:13px;line-height:1.4;margin:3px 0}.cs-alumni{background:#141a30;color:#eff1ff;border:1px solid #625234;border-radius:12px;padding:16px;margin-bottom:14px}.cs-alumni h3{margin:4px 0;color:#fff}
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
        const hit=findPlayer(id),host=$('#playerDialogBody');if(!hit||!host||host.querySelector('#playerBattleCard,#alumniBattleCard'))return;
        const html=profileCard(hit);if(!html)return;
        injectPlayerCardStyles();host.insertAdjacentHTML('afterbegin',html);if(hit.active)paintPortraits(host.querySelector('#playerBattleCard'));
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
  // A prospect as your scouts see him: estimated traits widened by scouting confidence, and the card OVR range.
  function prospectEstimate(r,u){
    const AD=CS.adapter,D=CS.data;if(!AD||!D||!r||!u)return null;
    const role=Object.keys(AD.ROLE_MAP).find(x=>(AD.POS_FALLBACK[x]||[])[0]===r.pos)||Object.keys(AD.ROLE_MAP).find(x=>(AD.POS_FALLBACK[x]||[]).includes(r.pos));if(!role)return null;
    // Use the same domain ranges the recruiting board publishes. They estimate related traits,
    // so label a mobility read as mobility, never as a measured speed rating.
    const rows=scoutingDomainView(r,u,true).filter(x=>x.key!=='upside');
    const weights=new Map(scoutingDefs(r).map(([key,label,w])=>[key,w]));
    const byTrait={},low={},high={},est={},scout=Number(r.scout)||60;
    for(const trait of D.TRAITS){
      const best=rows.filter(x=>weights.get(x.key)?.[trait]>0)
        .sort((a,b)=>weights.get(b.key)[trait]-weights.get(a.key)[trait])[0];
      const range=best?[best.low,best.high]:[Math.max(20,scout-16),Math.min(99,scout+16)];
      if(best)byTrait[trait]={...best,weight:weights.get(best.key)[trait]};
      low[trait]=range[0];high[trait]=Math.min(99,range[1]);est[trait]=Math.round((low[trait]+high[trait])/2);
    }
    const conf=rows.length?avg(rows.map(x=>x.confidence)):0;
    const publicPlayer={id:r.id,name:r.name,pos:r.pos,style:r.style,portraitSeed:r.portraitSeed};
    const battle=traits=>AD.toBattlePlayer({...publicPlayer,...traits},role);
    const bp=battle(est),strong=new Set(D.STYLE_TRAITS[bp.archetype]||[]);
    return{role,conf,low,high,byTrait,bp,strong,lo:battle(low).ovr,hi:battle(high).ovr};
  }
  function branchForecast(pb,r,pe,lineup){
    if(!pb||!integrationOn(RECRUIT_LINK))return'';
    const EV=CS.evolution,options=[];
    for(const side of ['off','def'])for(const root of new Set([...pb[side].base,...pb[side].wrinkles].map(EV.rootOf))){
      if(pb.evolved?.[root])continue;
      for(const [branch] of EV.TREE[root]||[]){
        const n=EV.NEEDS[branch],scout=pe.byTrait[n.trait];
        if(CS.adapter.POS_FALLBACK[n.role]?.[0]!==r.pos||!scout||scout.weight<.5)continue;
        const starter=lineup[side][n.role],rating=Number(starter?.traits?.[n.trait]);
        const gate=n.grade*10,blocked=!Number.isFinite(rating)||rating<gate;
        const shot=scout.high>=gate;
        options.push({branch,n,scout,starter,rating,gate,blocked,shot});
      }
    }
    options.sort((a,b)=>Number(b.blocked&&b.shot)-Number(a.blocked&&a.shot)||Number(b.blocked)-Number(a.blocked)||b.scout.weight-a.scout.weight);
    if(!options.length)return'';
    const {branch,n,scout,starter,rating,gate,blocked,shot}=options[0];
    const current=starter?`${starter.name} has ${rating} ${n.trait}, ${blocked?'below':'meeting'} the ${gate} needed.`:`The ${n.label} requirement is ${gate}.`;
    const forecast=shot?'He could qualify at this spot after signing.':'His current projection falls short.';
    return `<p class="cs-pcard-note" data-branch-forecast><b>${escH(cardName(branch))} branch</b> · ${escH(current)} ${escH(scout.label)} scouting range ${scout.low}–${scout.high} (${escH(scoutingConfidenceLabel(scout.confidence).toLowerCase())} confidence). ${forecast} Confirm his ${escH(n.trait)} in camp.</p>`;

  }
  // One sentence comparing the prospect's possible signature with the deck you run now. Switching decks can change
  // it; the player's projection never does. A preview only: no card is granted until a breakout earns it.
  function prospectDeckFit(bp){
    if(!bp?.role||!universe?.callSheet||!CS.signatures?.deckFit)return null;
    const spec=CS.signatures.specFor(bp),pb=universe.callSheet.playbook;
    return CS.signatures.deckFit(spec,pb?.off||CS.data.DEFAULT_DECKS?.off);
  }
  function prospectDeckFitHTML(bp){
    const f=prospectDeckFit(bp);return f?`<p class="cs-pcard-note" data-deck-fit="${escH(f.fit)}"><b>With your current deck:</b> ${escH(f.text)}</p>`:'';
  }
  function prospectJobsHTML(r,pe){
    if(!integrationOn(RECRUIT_LINK))return '';
    const jobs=CS.program.prospectJobs(universe.callSheet?.playbook,r.pos,pe);
    if(!jobs.length)return '';
    const rows=jobs.map(j=>{
      const details=j.opposingPlay?`against ${j.opposingPlay} · contest “${j.label}”`:j.label;
      return `<li><b>${escH(j.name)}</b> · ${escH(ROLE_NAMES[j.role]||j.role)} · ${escH(details)}
        <br><small>Projected ${j.low}–${j.high}/99 for ${escH(j.traits.map(t=>t==='iq'?'IQ':t).join(' + '))}</small></li>`;
    }).join('');
    return `<div class="cs-pcard-note" data-prospect-jobs><b>Jobs in your playbook</b><ul>${rows}</ul></div>`;
  }
  // The recruiting board's dossier: point at the card that lives in the full profile.
  function recruitDossierCardHTML(id){
    const r=universe?.recruits?.find(x=>String(x.id)===String(id)),u=selected();if(!r||!u||!pagesOn())return'';
    const pe=prospectEstimate(r,u);if(!pe)return'';
    const spec=CS.signatures.specFor(pe.bp),name=CS.signatures.describe(spec)?.def?.name,f=prospectDeckFit(pe.bp);
    return`<div class="rw-card-hint" id="rwCardHint"><span class="eyebrow">CARD PREVIEW · PROSPECT</span><p>${name?`Possible signature <b>${escH(name)}</b> after a breakout. `:''}${f?escH(f.text):''}</p>${prospectJobsHTML(r,pe)}<small>Open Full Profile for the card. Nothing is granted until a breakout earns it.</small></div>`;
  }
  function recruitCardHTML(r,u){
    const AD=CS.adapter,D=CS.data;if(!AD||!D||!r||!u)return'';
    const pe=prospectEstimate(r,u);if(!pe)return'';const {role,conf,bp,strong,lo,hi}=pe;
    const offense=role in (D.OFF_ROLES||{}),pb=universe.callSheet?.playbook;
    const deck=offense&&pb?[...pb.off.base,...pb.off.wrinkles]:[],inPlay=id=>Object.values(D.PLAYS[id]?.duels||{}).some(d=>(d.off||[]).includes(role)||(d.def||[]).includes(role));
    const usage=offense?(deck.length?`In ${deck.filter(inPlay).length} of the ${deck.length} plays in your playbook`:''):(()=>{const all=Object.values(D.PLAYS).filter(p=>!p.signature&&!p.evolvedFrom);return`Fights in ${Math.round(all.filter(p=>inPlay(p.id)).length*100/Math.max(1,all.length))}% of the plays offenses run`})();
    const lineup=gameLineup(u).lineup,starter=lineup[offense?'off':'def'][role];
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
        ${signatureStory({projection:bp})}
        ${prospectJobsHTML(r,pe)}
        ${branchForecast(pb,r,pe,lineup)}
        ${prospectDeckFitHTML(bp)}
        ${peopleOn()?visitPitchHTML(r,u):''}
        ${fit.plays.length?`<p class="cs-pcard-note"><b>Fits your active playbook:</b> ${escH(fit.plays.join(', '))}${fit.bonus?` · +${fit.bonus} to your recruiting pitch`:""}. Based on his archetype, not hidden ratings.</p>`:''}
        ${ability?`<p class="cs-pcard-ability"><b>${escH(bp.archetype)}:</b> ${escH(ability)}</p>`:''}
        ${duels.length?`<p class="cs-pcard-duels">Fights in: ${duels.map(x=>`<span>${escH(x)}</span>`).join('')}</p>`:''}
        <div class="cs-pcard-traits">${D.TRAITS.map(k=>{const a=pe.low[k],b=pe.high[k],g=v=>Math.floor(v/10);return`<div class="${strong.has(k)?'key':''}"><span>${k==='iq'?'IQ':escH(k)}</span><i style="--v:${b}%;--lo:${a}%"></i><b>${g(a)===g(b)?g(a):`${g(a)}–${g(b)}`}</b></div>`}).join('')}</div>
        <div class="cs-pcard-career"><div style="grid-column:1/-1"><span>In your card game</span><b style="font-size:15px">${escH(cmp)}</b>${usage?`<small>${escH(usage)}</small>`:''}</div></div>
        <p class="cs-pcard-note muted">Projected traits use related scouting domains. Scouting narrows those ranges. Card OVR uses the roster formula.</p>
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
    try{applyCardMode()}catch(err){console.error(err)}
    try{paintCardProgram()}catch(err){console.error(err)}
    return out;
  };
  if(typeof document!=='undefined')document.addEventListener('click',e=>{if(e.target.closest('[data-card-settings]'))openCardSettings();const trigger=e.target.closest('[data-card-deck]');if(trigger){const origin=trigger.closest('#cardBinder')?'#cardBinder':'#cardProgram';if(deckEditsLocked()){setStatus('Finish your current card battle before changing the deck.');return}CS.playbookUI.open(syncProgramCapacity(selected(),userPlaybook()),{maxStored:CALL_SHEET_RESERVE_LIMIT,maxUnusedSignatures:CALL_SHEET_UNUSED_SIGNATURE_LIMIT,team:CS.adapter.battleTeam(selected(),null,availabilityFor(selected())),onSave:pb=>{cardMeta().playbook=normalizeCardPlaybook(pb);autosaveAfter('game');paintCardProgram()},onClose:()=>document.querySelector(origin+' [data-card-deck]')?.focus()})}});

  // Replays get a separate iframe and a read-only host. An active weekly game can stay suspended.
  function openClassicDrive(id,trigger){
    const game=universe.gameArchive?.find(row=>row.id===id);
    if(!game?.classicDrive?.battle||!globalThis.CallSheetBundle)return;
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label','Replay the final drive');
    dialog.style.cssText='padding:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;background:#07090f;color:white';
    const back=document.createElement('button');back.type='button';back.textContent='Back to Game Center';back.onclick=()=>dialog.close();
    const frame=document.createElement('iframe');frame.dataset.classicDrive='true';frame.title='Classic game final drive';
    frame.style.cssText='display:block;border:0;width:100%;height:calc(100% - 42px)';
    const finalScore=`${game.away.name} ${game.score.away} · ${game.home.name} ${game.score.home}`;
    const config={classicDrive:game.classicDrive,finalScore,label:`${game.season} · Final drive`,userSide:game.classicDrive.side,seenHelp:true};
    globalThis.__callSheetClassic={launch:()=>config,close:()=>dialog.close()};
    dialog.addEventListener('close',()=>{delete globalThis.__callSheetClassic;dialog.remove();trigger?.focus()},{once:true});
    frame.srcdoc=globalThis.CallSheetBundle;dialog.append(back,frame);document.body.append(dialog);dialog.showModal();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-classic-drive]');
    if(button)openClassicDrive(button.dataset.classicDrive,button);
  });
  let host=null;
  globalThis.__callSheetDynasty={
    launch:buildLaunch,
    committedPlaybook:()=>JSON.parse(JSON.stringify(userPlaybook())),
    rewardContext:()=>({worldTaken:takenLegendaries(),pursuit:pursuit()}),
    record(state,tally,moments,film,classic){
      const key=cardMeta().activeBattle?.seed;
      if(key&&cardMeta().recordedBattleSeed===key)return{ok:true};
      const pg=currentCardGame();
      if(pg?.postseason){if(pg.played)return{ok:true};return globalThis.__callSheetPostseason.record(pg,state,tally,key,moments,film,classic)}
      try{const g=findUserGame(),week=g?.week,me=selected(),userSide=g&&g.home===me.name?'home':'away',opp=g?T(userSide==='home'?g.away:g.home):null,ranks=rankSnapshot(opp);
        const out=recordGameBase({externalState:state});try{addCardCareer(tally,week)}catch(err){console.error(err)}try{if(out?.ok!==false)recordOppFilm(opp?.id,film,week,tally)}catch(err){console.error(err)}if(key)cardMeta().recordedBattleSeed=key;
        try{markArchive(out?.result?.gameId,{coached:true,moments,classic})}catch(err){console.error(err)}
        try{noteUsage(state,userSide)}catch(err){console.error(err)}
        try{const us=Number(state?.score?.[userSide])||0,them=Number(state?.score?.[userSide==='home'?'away':'home'])||0;programAwards({won:us>them,us,them,postseason:false,ranks,oppName:opp?.name,opp})}catch(err){console.error(err)}
        return{ok:true,result:out.result}}
      catch(err){console.error(err);return{ok:false,error:err.message||String(err)}}
    },
    save(data){
      Object.assign(cardMeta(),JSON.parse(JSON.stringify(data)));
      try{autosaveAfter('game')}catch(err){console.error(err)}
    },
    close(message){
      host?.remove();host=null;document.body.classList.remove('cs-open');
      try{render();if(typeof message==='string')setStatus(message)}catch(err){console.error(err)}
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
  globalThis.DynastyRecruitCard={dossierHTML:id=>{try{return recruitDossierCardHTML(id)}catch(err){console.error(err);return''}}};
  if(typeof document!=='undefined'&&document.head&&typeof document.createElement==='function'&&!document.getElementById('rwCardHintStyles')){const st=document.createElement('style');st.id='rwCardHintStyles';st.textContent='.rw-card-hint{margin:12px 0;padding:10px 12px;border:1px dashed #8ea2d6aa;border-radius:10px;background:#141c30}.rw-card-hint p{margin:4px 0;color:#e6ecf7;font-size:14px;line-height:1.4}.rw-card-hint small{color:#9fb0c8}';document.head.appendChild(st)}
  globalThis.DynastyCardGameDay={signingGoals:(season=universe.year)=>{const me=selected();const cls=(me.roster||[]).filter(p=>String(recruitmentOf(p)?.schoolId)===String(me.id)&&Number(recruitmentOf(p)?.season)===season);return signingGoals(cls,me,season)},seasonRecap:()=>CS.battle.seasonRecap(universe.callSheet?.seasonCalls?.[String(universe.year)]),hireFilmEffect,setRivalryPrep,rivalryHistory:()=>{const g=currentCardGame(),me=selected(),opp=g&&me?T(g.home===me.name?g.away:g.home):null;return opp?rivalryHistory(me,opp):null},opponentIdentity:()=>{const g=currentCardGame(),me=selected(),opp=g&&me?T(g.home===me.name?g.away:g.home):null;return opp?opponentIdentityFor(me,opp):null},packStakes:()=>{const g=currentCardGame(),me=selected(),opp=g&&me?T(g.home===me.name?g.away:g.home):null;return opp?CS.packs.packStakes({rivalry:(me.protectedRivalIds||[]).includes(opp.id),stage:g.stage||null}):null},filmNote:()=>{const g=currentCardGame(),me=selected();return g&&me?filmNote(me,T(g.home===me.name?g.away:g.home),g):null},installTip,cardProgramHTML:()=>cardProgramHTML(),recruitDeckFit:id=>{const r=universe?.recruits?.find(x=>String(x.id)===String(id)),pe=r&&selected()?prospectEstimate(r,selected()):null;return pe?{fit:prospectDeckFit(pe.bp),ovr:[pe.lo,pe.hi],archetype:pe.bp.archetype}:null},open:openCardGameDay,blocker:cardGameBlocker,weather:battleWeather,
    syncSignatures:()=>syncSignatures(cardMeta(),selected()),
    meta:()=>universe?.callSheet?JSON.parse(JSON.stringify(universe.callSheet)):null,
    integrations:()=>INTEGRATIONS.map(x=>({id:x.id,label:x.label,about:x.about,on:integrationOn(x)})),
    setIntegration(id,on){cardMeta().settings.integrations[id]=!!on;try{applyCardMode()}catch(err){}},
    connectionsHTML,openDynastyConnection,retrainBranch,offseasonRetools,recruitingFit,trainingFor,syncProgramCapacity,programAwards,takeRewardCard,takeGamePack,miniCard:(id)=>{const h=findPlayer(id);return h?miniCardHTML(h.p,h.team):''},prospectMini:(id)=>prospectMiniHTML(universe.recruits.find(x=>x.id===id),selected()),applyCardMode,cardGameIsDefault,coachableGame,nextLabel,eraFor,wornPlays,setInstallFocus,installable,noteUsage,installWeek,addRingForTest:entry=>{if(!globalThis.__DL_TEST__)return;const pb=userPlaybook();(pb.ringOfHonor??=[]).push({id:`sig_${entry.playerId}`,...entry})},returnBorrowed,albumProgress,trackAlbum,pursuit,checkAlbums,markArchive,trophyCaseHTML,walkOnBreakouts,bowlTheme,honorTiers,trophyEdge,coachDepartures,programMilestones,springGame,isWalkOn,rewards:{booster:boosterPack,signing:signingPack,scheme:schemeCards,legacy:legacyCards,portal:portalCards,potw:potwBreakouts,mentor:mentorCards,snapshot:gradeSnapshot},isNemesis,campAudition,register:registerCardIntegration,openSettings:openCardSettings,paint:paintCardProgram,news:()=>JSON.parse(JSON.stringify(universe?.callSheet?.newsLog||[])),recruitCard:(id)=>recruitCardHTML(universe.recruits.find(x=>x.id===id),selected()),playerCard:(id)=>profileCard(findPlayer(id)),launch:()=>buildLaunch(),enable:()=>{cardMeta();userPlaybook()}};
  document.addEventListener('click',e=>{if(e.target.closest('[data-coach-cards]'))openCardGameDay()});
})();
