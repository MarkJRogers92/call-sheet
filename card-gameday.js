// Call Sheet fork: "Coach with Cards" game day.
// Engine extension (runs inside the app closure). Opens the Call Sheet card battle full-screen for the user's
// scheduled game, gives it the two real teams (rosters, depth charts, schemes, colors, the real forecast), and
// records the finished battle through the same transactional path as every other recorded game
// (recordV2GameLabResult with externalState). The program's card playbook lives in the save at universe.callSheet.
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
  let host=null;
  globalThis.__callSheetDynasty={
    launch(){
      const g=findUserGame(),home=T(g.home),away=T(g.away),me=selected(),meta=cardMeta();
      const opp=home.name===me.name?away:home,conditions=globalThis.DynastyGameConditions?.forGame({home,year:universe.year,week:g.week})||null;
      return{home,away,userSide:home.name===me.name?'home':'away',week:g.week,season:universe.year,
        label:`Week ${g.week} · ${g.conf?'Conference':'Non-conference'}`,record:{w:me.w||0,l:me.l||0},
        weather:battleWeather(conditions),conditions,rivalry:(me.protectedRivalIds||[]).includes(opp.id),
        playbook:meta.playbook,combos:meta.combos,settings:meta.settings,games:meta.games,seenHelp:meta.seenHelp,
        seed:`card:${universe.year}:${g.week}:${me.id}`};
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
  globalThis.DynastyCardGameDay={open:openCardGameDay,blocker:cardGameBlocker,weather:battleWeather,
    meta:()=>universe?.callSheet?JSON.parse(JSON.stringify(universe.callSheet)):null};
  document.addEventListener('click',e=>{if(e.target.closest('[data-coach-cards]'))openCardGameDay()});
})();
