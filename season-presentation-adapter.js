function makeSeasonPresentationModel(){
 'use strict';
 function gameResult(game,userName){if(!game?.played)return null;const isHome=game.home===userName,userScore=isHome?game.score?.[1]:game.score?.[0],oppScore=isHome?game.score?.[0]:game.score?.[1];return{result:game.winner===userName?'W':'L',userScore:Number(userScore)||0,oppScore:Number(oppScore)||0,opponent:isHome?game.away:game.home,location:isHome?'vs':'@',week:game.week,detailed:!!game.detailed}}
 function streak(schedule=[],userName){const played=schedule.filter(g=>g.played).slice().sort((a,b)=>(b.week||0)-(a.week||0));if(!played.length)return'—';const first=gameResult(played[0],userName)?.result;if(!first)return'—';let n=0;for(const g of played){if(gameResult(g,userName)?.result!==first)break;n++}return`${first}${n}`}
 function summary(raw={}){return{teamId:Number(raw.teamId)||null,teamName:raw.teamName??'Program',record:raw.record??'0-0',conferenceRecord:raw.conferenceRecord??'0-0',rank:raw.rank??'NR',conference:raw.conference??'—',conferencePlace:Number(raw.conferencePlace)||null,year:Number(raw.year)||null,phase:raw.phase??'—',stage:raw.stage??'',week:Number(raw.week)||0,completed:Number(raw.completed)||0,remaining:Number(raw.remaining)||0,streak:raw.streak??'—',latest:raw.latest?{...raw.latest}:null,next:raw.next?{...raw.next}:null,afterRegular:raw.afterRegular?{...raw.afterRegular}:null}}

 // The championship takes the top two in conference wins, overall wins, then ranking score.
 // Wins can be resolved without guessing scores, opponent ratings, or future ranking tiebreaks.
 const compareRecord=(a,b)=>a.cw-b.cw||a.w-b.w;
 const CHAMPIONSHIP_SPOTS=2, MAX_SCENARIO_GAMES=12, PLAYOFF_SIZE=16, AT_LARGE_SPOTS=6;
 function titlePaths(standings,games,userName,fixed=new Map()){
  const teams=new Map(standings.map(t=>[t.name,{cw:t.cw,w:t.w,maxCw:0,maxW:0}]));
  const user=teams.get(userName),remaining=[];
  if(!user)return{state:'open',canSecure:false,canMiss:false};
  for(const game of games){
   const home=teams.get(game.home),away=teams.get(game.away);
   if(!home&&!away)continue;
   if(fixed.has(game)){
    const winner=teams.get(fixed.get(game));
    if(winner){winner.w++;if(game.conf)winner.cw++}
   }else{
    remaining.push({home,away,conf:!!game.conf});
    for(const team of [home,away])if(team){team.maxW++;if(game.conf)team.maxCw++}
   }
  }
  const upper=t=>({cw:t.cw+t.maxCw,w:t.w+t.maxW});
  const userUpper=upper(user),rivals=new Set();
  let lockedAhead=0;
  for(const team of teams.values()){
   if(team===user)continue;
   if(compareRecord(team,userUpper)>0){lockedAhead++;continue}
   if(compareRecord(upper(team),user)>=0)rivals.add(team);
  }
  if(lockedAhead>=CHAMPIONSHIP_SPOTS)return{state:'out',canSecure:false,canMiss:true};
  if(lockedAhead+rivals.size<CHAMPIONSHIP_SPOTS)return{state:'in',canSecure:true,canMiss:false};

  const relevant=team=>team===user||rivals.has(team);
  const outcomes=remaining.filter(g=>relevant(g.home)||relevant(g.away));
  if(outcomes.length>MAX_SCENARIO_GAMES)return{state:'open',canSecure:false,canMiss:false};
  let canSecure=false,canMiss=false,tiebreak=false;
  function visit(i){
   if(canSecure&&canMiss)return;
   if(i===outcomes.length){
    let ahead=lockedAhead,possiblyAhead=lockedAhead;
    for(const rival of rivals){
     const diff=compareRecord(rival,user);
     if(diff>0)ahead++;
     if(diff>=0)possiblyAhead++;
    }
    if(ahead>=CHAMPIONSHIP_SPOTS)canMiss=true;
    else if(possiblyAhead<CHAMPIONSHIP_SPOTS)canSecure=true;
    else tiebreak=true;
    return;
   }
   const game=outcomes[i],conferenceWin=Number(game.conf);
   for(const winner of [game.home,game.away]){
    if(winner){winner.w++;winner.cw+=conferenceWin}
    visit(i+1);
    if(winner){winner.w--;winner.cw-=conferenceWin}
   }
  }
  visit(0);
  return{state:canSecure&&!canMiss&&!tiebreak?'in':canMiss&&!canSecure&&!tiebreak?'out':'open',canSecure,canMiss};
 }
 function conferenceRace({standings=[],schedule=[],userName,week,phase,scheduleReady=false}){
  const place=standings.findIndex(t=>t.name===userName)+1,user=standings[place-1];
  if(!user||standings.length<CHAMPIONSHIP_SPOTS)return null;
  const members=new Map(standings.map((t,i)=>[t.name,{team:t,place:i+1}]));
  const leagueGames=schedule.filter(g=>members.has(g.home)||members.has(g.away));
  const remaining=leagueGames.filter(g=>g.played===false),mine=remaining.filter(g=>g.home===userName||g.away===userName);
  const winOut=new Map(mine.map(g=>[g,userName]));
  let status=place<=CHAMPIONSHIP_SPOTS?'in-position':'chasing';
  if(phase==='confReady')status=place<=CHAMPIONSHIP_SPOTS?'clinched':'out';
  else if(scheduleReady){
   if(!remaining.length)status=place<=CHAMPIONSHIP_SPOTS?'clinched':'out';
   else{
    const any=titlePaths(standings,remaining,userName);
    const winning=mine.length?titlePaths(standings,remaining,userName,winOut):any;
    // Losing our own game gives the win to our opponent. It can only make our record comparison worse.
    if(any.state==='in')status='clinched';
    else if(winning.state==='out')status='out';
    else if(mine.length&&winning.state==='in')status='win-out';
    else if(winning.canSecure&&winning.canMiss)status='needs-help';
   }
  }

  // Keep nearby contenders and the user's own game on one scoreboard. A result alone is never
  // presented as proof that it moved the race, and directional advice requires an outcome proof.
  const aroundCut=standings[CHAMPIONSHIP_SPOTS-1];
  const relevant=t=>!!t&&(t.place<=CHAMPIONSHIP_SPOTS||Math.abs(t.team.cw-aroundCut.cw)<=1);
  const myGame=g=>g.home===userName||g.away===userName;
  const weight=g=>g.week*12+(myGame(g)?8:0)+(g.conf?4:0)+Number(relevant(members.get(g.home)))+Number(relevant(members.get(g.away)));
  const watchable=g=>myGame(g)||!!(relevant(members.get(g.home))||relevant(members.get(g.away)));
  const finals=leagueGames.filter(g=>g.played&&g.week>=week-1&&g.week<=week&&watchable(g)).sort((a,b)=>weight(b)-weight(a)).slice(0,2);
  const upcoming=remaining.filter(g=>g.week===week&&watchable(g)).sort((a,b)=>weight(b)-weight(a)).slice(0,3);
  const games=[...upcoming,...finals].map(g=>{
   let rootFor=null;
   if(scheduleReady&&!g.played&&!myGame(g)&&status==='needs-help'){
    const withWinner=name=>titlePaths(standings,remaining,userName,new Map([...winOut,[g,name]]));
    const home=withWinner(g.home),away=withWinner(g.away);
    if(home.canSecure&&away.state==='out')rootFor=g.home;
    if(away.canSecure&&home.state==='out')rootFor=g.away;
   }
   return{week:g.week,home:g.home,away:g.away,played:!!g.played,conf:!!g.conf,yours:myGame(g),id:g.gameId??null,score:Array.isArray(g.score)?g.score.slice(0,2):null,rootFor};
  });
  return{place,status,record:`${user.cw}–${user.cl}`,games,remaining:mine.length};
 }
 function playoffRace({teams=[],userId,phase,frozenIds=[],championIds=[],unavailable=false}){
  const teamId=String(userId),champions=new Set(championIds.map(String));
  const fieldRow=(t,i,automatic)=>({name:t.name,seed:i+1,route:automatic.has(String(t.id))?'champion':'at-large'});
  if(frozenIds.length===PLAYOFF_SIZE){
   const place=frozenIds.map(String).indexOf(teamId)+1;
   const byId=new Map(teams.map(t=>[String(t.id),t]));
   const field=frozenIds.map(id=>byId.get(String(id)));
   if(!field.every(Boolean))return{state:'unavailable'};
   return{state:place?'qualified':'out',seed:place||null,route:champions.has(teamId)?'champion':'at-large',field:field.map((t,i)=>fieldRow(t,i,champions))};
  }
  if(unavailable)return{state:'unavailable'};
  if(phase!=='regular'&&phase!=='confReady')return null;
  const national=teams.slice().sort((a,b)=>a.rank-b.rank);
  if(national.length<PLAYOFF_SIZE||!national.every(t=>Number.isInteger(t.rank)&&t.rank>0)||new Set(national.map(t=>t.rank)).size!==national.length)return null;
  const leagues=new Map();
  for(const team of national){
   const group=leagues.get(team.conference)||[];
   group.push(team);leagues.set(team.conference,group);
  }
  const leaders=new Set();
  for(const members of leagues.values()){
   if(members.length<CHAMPIONSHIP_SPOTS)continue;
   const leader=members.slice().sort((a,b)=>compareRecord(b,a)||a.rank-b.rank)[0];
   leaders.add(String(leader.id));
  }
  if(leaders.size!==PLAYOFF_SIZE-AT_LARGE_SPOTS)return null;
  const atLarge=new Set(national.filter(t=>!leaders.has(String(t.id))).slice(0,AT_LARGE_SPOTS).map(t=>String(t.id)));
  const field=national.filter(t=>leaders.has(String(t.id))||atLarge.has(String(t.id)));
  const place=field.findIndex(t=>String(t.id)===teamId)+1;
  return{state:place?'projected-in':'projected-out',seed:place||null,route:leaders.has(teamId)?'champion':'at-large',field:field.map((t,i)=>fieldRow(t,i,leaders))};
 }
 return{gameResult,streak,summary,conferenceRace,playoffRace};
}

if(typeof module==='object'&&module.exports){module.exports={makeSeasonPresentationModel};}
else{
 const seasonPresentationModel=makeSeasonPresentationModel();
 function rankText(t){return t?.rank<=25?`#${t.rank}`:'NR'}
 function archiveTeamName(record,side){const x=record?.[side];return typeof x==='string'?x:(x?.name||'')}
 function archiveTeamId(record,side){const x=record?.[side];return Number(x?.id)||T(archiveTeamName(record,side))?.id||null}
 function archiveScore(record,side){const score=record?.score;if(Number.isFinite(Number(score?.[side])))return Number(score[side]);if(Array.isArray(score))return Number(score[side==='home'?0:1])||0;return 0}
 function performerImpact(line){const s=line?.stats||{};return (s.passYds||0)*.035+(s.passTD||0)*5-(s.int||0)*3+(s.rushYds||0)*.08+(s.rushTD||0)*5+(s.recYds||0)*.08+(s.recTD||0)*5+(s.tackles||0)*.8+(s.tfl||0)*1.6+(s.sacks||0)*3.5+(s.intDef||0)*4.5+(s.forcedFumbles||0)*3}
 function performerSummary(line){const s=line?.stats||{},parts=[];if(s.passYds)parts.push(`${s.passYds} pass yds`);if(s.passTD)parts.push(`${s.passTD} pass TD`);if(s.rushYds)parts.push(`${s.rushYds} rush yds`);if(s.rushTD)parts.push(`${s.rushTD} rush TD`);if(s.recYds)parts.push(`${s.recYds} rec yds`);if(s.recTD)parts.push(`${s.recTD} rec TD`);if(s.tackles)parts.push(`${s.tackles} tackle${s.tackles===1?'':'s'}`);if(s.sacks)parts.push(`${s.sacks} sack${s.sacks===1?'':'s'}`);if(s.intDef)parts.push(`${s.intDef} INT`);return parts.slice(0,2).join(' · ')||'Contributed in the win/loss'}
 function latestShowcase(u){
  const records=(universe.gameArchive||[]).filter(r=>{const h=archiveTeamName(r,'home'),a=archiveTeamName(r,'away');return h===u.name||a===u.name}).slice().sort((a,b)=>(b.season||universe.year)-(a.season||universe.year)||(b.week||0)-(a.week||0));const r=records[0];if(!r)return null;
  const userSide=archiveTeamName(r,'home')===u.name?'home':'away',oppSide=userSide==='home'?'away':'home',oppName=archiveTeamName(r,oppSide),userScore=archiveScore(r,userSide),oppScore=archiveScore(r,oppSide),lines=(r.playerStats?.[userSide]||[]).slice().sort((a,b)=>performerImpact(b)-performerImpact(a)).slice(0,3);
  return{id:r.id||null,hasReplay:!!(r.id&&universe.playLogs?.[r.id]),week:r.week??null,season:r.season??universe.year,result:userScore>oppScore?'W':'L',userScore,oppScore,opponent:oppName||'Opponent',opponentId:archiveTeamId(r,oppSide),location:userSide==='home'?'vs':'@',engine:r.engine||null,drives:(r.drives||[]).map(d=>({side:d.side,points:Number(d.points)||0})).slice(-18),performers:lines.map(x=>({id:x.id,name:x.name,pos:x.pos,summary:performerSummary(x)}))};
 }
 function seasonStorySnapshot(){
  if(!universe?.teams)return null;const t=selected?.();if(!t)return null;const stories=[],games=(t.schedule||[]).slice().sort((a,b)=>(a.week||0)-(b.week||0)),teamStreak=seasonPresentationModel.streak(games,t.name);
  if(/^W[3-9]\d*$/.test(teamStreak))stories.push({type:'team',tone:'good',kicker:'MOMENTUM',title:`${teamStreak} winning streak`,summary:`${t.name} has won ${teamStreak.slice(1)} straight games.`,tab:'season'});
  const standing=confStand(t.conference).findIndex(x=>x.id===t.id);if(standing===0&&t.cw+t.cl>=2)stories.push({type:'team',tone:'good',kicker:'CONFERENCE RACE',title:'First in the conference',summary:`${t.name} currently sits atop the ${t.conference} standings at ${t.cw}-${t.cl} in league play.`,tab:'season'});
  for(const s of (typeof v0102PlayerStories==='function'?v0102PlayerStories(t):[]).slice(0,2))stories.push({type:'player',tone:s.tone||'neutral',kicker:String(s.type||'PLAYER').replaceAll('_',' '),title:s.name,summary:s.summary,playerId:s.playerId,tab:'roster'});
  const dev=globalThis.DynastyLabDevelopmentTendencies?.summary?.(t)?.notable||[];for(const row of dev.slice(0,2)){const c=row.clue,p=row.p;if(!p||!c)continue;stories.push({type:'development',tone:c.tone||'neutral',kicker:'DEVELOPMENT',title:`${p.pos} ${p.name} · ${c.label}`,summary:c.summary,playerId:p.id,tab:'development'})}
  const battleApi=globalThis.DynastyLabRecruitingBattles;const battles=(universe.recruits||[]).filter(r=>r.targeted&&!r.committed).map(r=>({r,s:battleApi?.summary?.(r)||null})).filter(x=>x.s?.rank&&x.s.rank<=2&&x.s.gap!=null&&x.s.gap>=-7).sort((a,b)=>(b.r.interest||0)-(a.r.interest||0));for(const x of battles.slice(0,2)){const trend=Math.round(x.r.trend||0),momentum=trend>=2?`gaining +${trend}`:trend<=-2?`cooling ${trend}`:'steady';stories.push({type:'recruiting',tone:x.s.rank===1?'good':'alert',kicker:'RECRUITING BATTLE',title:`${x.r.name} · ${x.s.label}`,summary:`You are #${x.s.rank}, ${x.s.gap===0?'even with':`${Math.abs(x.s.gap)} points behind`} ${x.s.leader||'the leader'} · ${Math.round(x.r.interest||0)}% interest · ${momentum}.`,recruitId:x.r.id,tab:'recruiting'})}
  return{year:universe.year,week:universe.week,teamId:t.id,stories:stories.slice(0,6)};
 }
 function teamRead(t){const p=profiles(t);return{id:t.id,name:t.name,record:`${t.w}-${t.l}`,rank:rankText(t),conference:t.conference,offense:grade(p.offense),defense:grade(p.defense)}}
 function gameDaySnapshot(){
  if(!universe?.teams)return null;const u=selected?.();if(!u)return null;const last=latestShowcase(u),g=findUserGame?.();
  if(!g){if(!last)return null;const opp=T(last.opponent);if(!opp)return null;const isHome=last.location==='vs',homeTeam=isHome?u:opp;return{postgame:true,week:last.week,location:last.location,isHome,isRival:false,sameConference:u.conference===opp.conference,stakesTone:'postgame',user:teamRead(u),opponent:teamRead(opp),venue:[homeTeam.city,homeTeam.state].filter(Boolean).join(', '),stakes:'Postgame review',homeEdge:'Final result recorded',userOut:0,opponentOut:0,opponentPassMix:Math.round((OFF_SCHEMES[opp.offScheme]?.pass??.5)*100),activePlan:'Final',recommendedPlan:'Review',recommendation:'Review the result and key performers before advancing the week.',lastShowcase:last}}
  const opp=T(g.home===u.name?g.away:g.home);if(!opp)return null;
  const m=gameMatchup(u,opp),P=m.teamProfile||profiles(u),O=m.opponentProfile||profiles(opp),plan=teamGameplanFor(u,opp.name),tier=GAMEPLAN_TIERS[plan?.prep]||GAMEPLAN_TIERS.standard,rec=gameplanRecommendation(u,opp,m),recommended=GAMEPLAN_TIERS[rec?.id]||GAMEPLAN_TIERS.balance||tier;
  const isHome=g.home===u.name,homeTeam=isHome?u:opp,rival=rivalOf(u),isRival=rival?.name===opp.name,sameConference=u.conference===opp.conference;
  const stakes=isRival?`${u.rivalry?.trophy||'Rivalry game'} · ${rivalrySeriesText(u)}`:sameConference?`${u.conference} Conference game`:'Nonconference game';
  const passMix=Math.round((OFF_SCHEMES[opp.offScheme]?.pass??.5)*100);
  return{
   postgame:false,week:g.week??universe.week+1,location:isHome?'vs':'@',isHome,isRival,sameConference,stakesTone:isRival?'rivalry':sameConference?'conference':'standard',
   user:{id:u.id,name:u.name,record:`${u.w}-${u.l}`,rank:rankText(u),conference:u.conference,offense:grade(P.offense),defense:grade(P.defense)},
   opponent:{id:opp.id,name:opp.name,record:`${opp.w}-${opp.l}`,rank:rankText(opp),conference:opp.conference,offense:grade(O.offense),defense:grade(O.defense)},
   venue:[homeTeam.city,homeTeam.state].filter(Boolean).join(', '),stakes,
   homeEdge:isHome?`Home field +${homeFieldFor(u).toFixed(1)} pts`:`Road game · ${opp.name} receives home field`,
   forecast:v2ConditionsLine(v2ForecastFor(g))?.headline||'',
   userOut:(u.roster||[]).filter(p=>!gameAvailable(p)).length,opponentOut:(opp.roster||[]).filter(p=>!gameAvailable(p)).length,
   opponentPassMix:passMix,activePlan:tier?.label||'Standard',recommendedPlan:recommended?.label||tier?.label||'Standard',recommendation:rec?.reason||'Current staff recommendation.',lastShowcase:last
  };
 }
 // Postseason games (conference title games, bowls, playoff rounds) are archived but never added
 // to the team schedule, so the Season card used to report the Week 12 result and streak even
 // after a national title. Read them back from the season's game archive in schedule shape. Title games and bowls share
 // week 13, so a bowl sorts half a week later (the label, not the week, is what is displayed).
 // Postseason games are played at neutral sites, so the card reads 'vs' rather than '@'.
 function postseasonGames(u){const out=[];for(const r of universe.gameArchive||[]){if((r?.season??universe.year)!==universe.year||!r?.label||!(Number(r.week)>12))continue;const h=archiveTeamName(r,'home'),a=archiveTeamName(r,'away');if(h!==u.name&&a!==u.name)continue;const hs=archiveScore(r,'home'),as=archiveScore(r,'away');out.push({week:Number(r.week)+(/\bBowl\b/.test(r.label)?.5:0),label:String(r.label),home:h,away:a,played:true,score:[as,hs],winner:hs>as?h:a,gameId:r.id})}return out}
 function postseasonOutlook(u,postseason){const last=postseason.slice().sort((a,b)=>b.week-a.week)[0],won=last?.winner===u.name,phase=universe.phase;
  if(phase==='complete'){if(universe.champion===u.name)return{title:'National champions',detail:`${u.name} finished ${u.w}-${u.l} and won the ${universe.year} title.`,tone:'gold'};return{title:'Season complete',detail:last?`Final game: ${won?'won':'lost'} the ${last.label}. Final record ${u.w}-${u.l}.`:`Final record ${u.w}-${u.l}. The offseason is next.`,tone:'done'}}
  if(phase==='confReady')return{title:'Championship weekend',detail:'Conference title games are next. Use the phase controls below.',tone:'next'};
  if(phase==='bowlReady')return{title:'Bowl season',detail:last?`${won?'Won':'Lost'} the ${last.label}. Bowl games are next.`:'Bowl games are next. Use the phase controls below.',tone:'next'};
  if(phase==='playoffReady')return{title:'Playoff next',detail:last?`${won?'Won':'Lost'} the ${last.label}. The 16-team playoff is next.`:'The 16-team playoff is next.',tone:'next'};
  return null}
 function postseasonRaceSnapshot(){
  if(!universe?.teams||universe.phase==='preseason')return null;
  const user=selected?.();if(!user)return null;
  const phase=universe.phase,week=phase==='regular'?universe.week+1:12;
  const schedule=Array.isArray(universe.schedule)?universe.schedule.flat():[],standings=confStand(user.conference);
  // Legacy or incomplete schedule data can still show position and recorded results. Only
  // analyze future outcomes when all conference members' store records agree with that schedule.
  const counts=new Map(standings.map(t=>[t.name,{games:0,played:0,w:0,cw:0,conf:0,bad:false}]));
  if(phase==='regular')for(const g of schedule){
   for(const name of [g.home,g.away]){
    const row=counts.get(name);
    if(!row)continue;
    row.games++;
    if(g.conf)row.conf++;
    if(typeof g.played!=='boolean'||(g.played&&g.winner!==g.home&&g.winner!==g.away))row.bad=true;
    if(g.played){row.played++;if(g.winner===name){row.w++;if(g.conf)row.cw++}}
   }
  }
  const scheduleReady=phase==='regular'&&standings.every(t=>{
   const row=counts.get(t.name);
   return!row.bad&&row.games===SCHEDULE_GAMES&&row.conf===SCHEDULE_CONF_GAMES&&row.played===t.w+t.l&&row.w===t.w&&row.cw===t.cw;
  });
  const conference=(phase==='regular'||phase==='confReady')?seasonPresentationModel.conferenceRace({standings,schedule,userName:user.name,week,phase,scheduleReady}):null;
  const champions=typeof conferenceChampionIdsFor==='function'?conferenceChampionIdsFor(universe):[];
  const frozenIds=typeof playoffFieldIdsFor==='function'?playoffFieldIdsFor(universe):[];
  const playoff=(week>=6||frozenIds.length||universe.playoffFieldUnavailable)?seasonPresentationModel.playoffRace({teams:universe.teams,userId:user.id,phase,frozenIds,championIds:champions,unavailable:universe.playoffFieldUnavailable}):null;
  // After the championship, the original top two can't be inferred from the live standings:
  // postseason games add an overall win or loss, which is itself a conference tiebreak.
  const champion=universe.teams.find(t=>t.conference===user.conference&&champions.some(id=>String(id)===String(t.id)));
  const titleGame=champion?(universe.gameArchive||[]).findLast(g=>g.season===universe.year&&g.label===user.conference+' Championship'):null;
  const championship=champion?{name:champion.name,yours:champion.id===user.id,game:titleGame?{
   id:titleGame.id,week:titleGame.week,home:archiveTeamName(titleGame,'home'),away:archiveTeamName(titleGame,'away'),
   score:[archiveScore(titleGame,'away'),archiveScore(titleGame,'home')],played:true
  }:null}:null;
  return conference||playoff||championship?{year:universe.year,userId:user.id,week,conference,playoff,championship}:null;
 }
 globalThis.DynastyLabGameDayPresentation={snapshot:gameDaySnapshot,note:'Read-only Game Day presentation derived from the same current matchup, roster availability, staff recommendation, schedule, archived game results and home-field inputs used by the live game.'};
 globalThis.DynastyLabSeasonStories={snapshot:seasonStorySnapshot,note:'Factual season stories derived from current records, standings, existing Player Stories, observed development tendencies and live recruiting battle state. No hidden ratings or invented events are exposed.'};
 globalThis.DynastyLabSeasonPresentation={snapshot:()=>{if(!universe?.teams)return null;const u=selected?.();if(!u)return null;const games=(u.schedule||[]).slice().sort((a,b)=>(a.week||0)-(b.week||0)),played=games.filter(g=>g.played),nextGame=games.find(g=>!g.played)||null,postseason=postseasonGames(u),allPlayed=[...played,...postseason],latestGame=allPlayed.slice().sort((a,b)=>(b.week||0)-(a.week||0))[0]||null;const makeOpponent=g=>{if(!g)return null;const name=g.home===u.name?g.away:g.home,t=T(name);return{id:t?.id??null,name,record:t?`${t.w}-${t.l}`:'—',rank:rankText(t),conference:t?.conference??null,location:g.home===u.name?'vs':'@',week:g.week,venue:t&&g.home!==u.name?`${t.city}, ${t.state}`:`${u.city}, ${u.state}`}};const standing=confStand(u.conference).findIndex(t=>t.id===u.id);return seasonPresentationModel.summary({teamId:u.id,teamName:u.name,record:`${u.w}-${u.l}`,conferenceRecord:`${u.cw}-${u.cl}`,rank:rankText(u),conference:u.conference,conferencePlace:standing>=0?standing+1:null,year:universe.year,phase:universe.phase,stage:seasonStageLabel(),week:universe.week,completed:played.length,remaining:games.length-played.length,streak:seasonPresentationModel.streak(allPlayed,u.name),latest:latestGame?{...seasonPresentationModel.gameResult(latestGame,u.name),...(latestGame.label?{location:'vs'}:{}),label:latestGame.label||null,opponentId:T(latestGame.home===u.name?latestGame.away:latestGame.home)?.id??null}:null,next:nextGame?makeOpponent(nextGame):null,afterRegular:nextGame?null:postseasonOutlook(u,postseason)})},race:postseasonRaceSnapshot,note:'Season presentation derives only from the public schedule, results, standings, team records and current phase.'};
}
