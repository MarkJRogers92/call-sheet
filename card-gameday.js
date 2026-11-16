// Call Sheet fork: "Coach with Cards" game day.
// Engine extension (runs inside the app closure). Opens the Call Sheet card battle full-screen for the user's
// scheduled game, gives it the two real teams (rosters, depth charts, schemes, colors, the real forecast), and
// records the finished battle through the same transactional path as every other recorded game
// (recordV2GameLabResult with externalState). The program's card playbook lives in the save at universe.callSheet.
// Save format for the card playbook (universe.callSheet, version 1). Runs on every load (normalizeUniverse):
// repairs what it can and resets what it can't, so a damaged playbook never breaks a game day. Card ids are checked
// again inside the battle, against the card catalog.
const CALL_SHEET_SAVE_VERSION=1;
function normalizeCallSheet(u){
  const cs=u?.callSheet;if(cs===undefined)return;
  if(!cs||typeof cs!=='object'||Array.isArray(cs)){delete u.callSheet;return}
  if(Number(cs.version)>CALL_SHEET_SAVE_VERSION)throw new Error('This dynasty’s card playbook needs a newer version of Call Sheet.');
  const ids=(a,max)=>Array.isArray(a)?a.filter(x=>typeof x==='string'&&x.length>0&&x.length<80).slice(0,max):[];
  const int=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Math.round(Number(v)))):d;
  const intMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([k,v])=>typeof k==='string'&&Number.isFinite(Number(v))).map(([k,v])=>[k,int(v,0,100000,0)]));
  const strMap=o=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([k,v])=>typeof v==='string'));
  const objs=(a,max)=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'&&typeof x.id==='string').slice(-max):[];
  cs.version=CALL_SHEET_SAVE_VERSION;
  const pb=cs.playbook;
  if(pb&&typeof pb==='object'){
    const deck=d=>({base:ids(d?.base,4),wrinkles:ids(d?.wrinkles,40),tactics:ids(d?.tactics,40)});
    pb.off=deck(pb.off);pb.def=deck(pb.def);
    if(pb.off.base.length!==4||pb.def.base.length!==4)cs.playbook=null; // a call sheet must hold four base calls
    else{
      pb.capacity={wrinkles:int(pb.capacity?.wrinkles,10,30,14),tactics:int(pb.capacity?.tactics,10,30,14)};
      pb.legendaries=ids(pb.legendaries,20);pb.record={w:int(pb.record?.w,0,9999,0),l:int(pb.record?.l,0,9999,0)};
      pb.packsOpened=int(pb.packsOpened,0,99999,0);pb.gamesPlayed=int(pb.gamesPlayed,0,99999,0);
      if(pb.lastSignatureGame!==undefined)pb.lastSignatureGame=int(pb.lastSignatureGame,0,99999,0);
      pb.mastery=intMap(pb.mastery);pb.evolved=strMap(pb.evolved);pb.history=objs(pb.history,300);
      pb.signatures=objs(pb.signatures,3).filter(x=>typeof x.playerId==='string'||typeof x.playerId==='number');pb.ringOfHonor=objs(pb.ringOfHonor,200);
    }
  }else cs.playbook=null;
  cs.combos=ids(cs.combos,20);
  const st=cs.settings&&typeof cs.settings==='object'?cs.settings:{};
  cs.settings={mode:['key','snap','sim'].includes(st.mode)?st.mode:'key',control:['offense','both','defense'].includes(st.control)?st.control:'offense',fast:!!st.fast,sound:st.sound!==false};
  cs.games=int(cs.games,0,99999,0);cs.seenHelp=!!cs.seenHelp;
}
(function(){
  const DEFAULT_SETTINGS={mode:'key',control:'offense',fast:false,sound:true};
  function cardMeta(){
    universe.callSheet??={version:1,playbook:null,combos:[],settings:{...DEFAULT_SETTINGS},games:0,seenHelp:false};
    return universe.callSheet;
  }
  // Why the user can't coach this week's game with cards, or null when they can.
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
  // Dynasty Lab's own forecast, translated to the battle's weather.
  function battleWeather(c){
    if(!c||c.roof==='dome')return'clear';
    if(Number(c.precip)>0)return Number(c.temp)<=34?'snow':'rain';
    if(Number(c.wind)>=16)return'wind';
    return'clear';
  }
  // What the battle needs from each program that only Dynasty Lab knows: scheme installation and this week's prep.
  function programInfo(team,opp,home){
    let familiarity=100;try{const f=schemeFamiliarity(team);if(Number.isFinite(Number(f)))familiarity=Number(f)}catch(err){}
    const prep=team.weeklyPrep&&team.weeklyPrep.opponent===opp.name&&team.weeklyPrep.year===universe.year&&team.weeklyPrep.week===universe.week?[...(team.weeklyPrep.focuses||[])]:[];
    return{familiarity,prep,home};
  }
  // Signature cards follow their players. Graduated or drafted (in the player archive): the card retires to the
  // Ring of Honor with his career line. On another roster (transfer) or gone otherwise: the card leaves the program.
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
  let host=null;
  globalThis.__callSheetDynasty={
    launch(){
      const g=findUserGame(),home=T(g.home),away=T(g.away),me=selected(),meta=cardMeta();
      const moves=syncSignatures(meta,me);if(moves.length)try{autosaveAfter('game')}catch(err){}
      const opp=home.name===me.name?away:home,conditions=globalThis.DynastyGameConditions?.forGame({home,year:universe.year,week:g.week})||null;
      return{home,away,userSide:home.name===me.name?'home':'away',week:g.week,season:universe.year,
        label:`Week ${g.week} · ${g.conf?'Conference':'Non-conference'}`,record:{w:me.w||0,l:me.l||0},
        weather:battleWeather(conditions),conditions,rivalry:(me.protectedRivalIds||[]).includes(opp.id),
        playbook:meta.playbook,combos:meta.combos,settings:meta.settings,games:meta.games,seenHelp:meta.seenHelp,
        seed:`card:${universe.year}:${g.week}:${me.id}`,
        program:{home:programInfo(home,away,true),away:programInfo(away,home,false)},moves};
    },
    // Called once, the moment the battle is final. Everything rolls back if any check fails.
    record(state){
      try{const out=recordV2GameLabResult({externalState:state});return{ok:true,result:out.result}}
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
  globalThis.DynastyCardGameDay={open:openCardGameDay,blocker:cardGameBlocker,weather:battleWeather,syncSignatures:()=>syncSignatures(cardMeta(),selected()),
    meta:()=>universe?.callSheet?JSON.parse(JSON.stringify(universe.callSheet)):null};
  document.addEventListener('click',e=>{if(e.target.closest('[data-coach-cards]'))openCardGameDay()});
})();
