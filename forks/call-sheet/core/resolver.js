// Call Sheet snap resolver: three named duels per play, call-vs-call modifiers, tactics and signatures.
// One function (buildSnap) computes every modifier; the AI's evaluation, the pre-snap chips and the real
// resolution all use it, so what the player is shown is exactly what is rolled.
(function(root,factory){
  const data=(typeof module==='object'&&module.exports)?require('./data.js'):root.CallSheet.data;
  const api=factory(data);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CallSheet.resolver=api;
})(typeof window==='object'?window:globalThis,function(D){
'use strict';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const RECEIVER_ROLES=['X','Z','SLOT','TE','RB'];

function playerAvg(p,traits){return traits.reduce((s,t)=>s+(p?.traits?.[t]??50),0)/traits.length}
function grade(lineup,roles,traits){
  const ps=roles.map(r=>lineup[r]).filter(Boolean);
  if(!ps.length)return 5;
  return Math.floor(ps.reduce((s,p)=>s+playerAvg(p,traits),0)/ps.length/10);
}
function traitGrade(p,trait){return Math.floor((p?.traits?.[trait]??50)/10)}
function winChance(m){
  const x=clamp(m,-3,3),lo=Math.floor(x),hi=Math.ceil(x);
  return D.WIN_CHANCE[lo]+(D.WIN_CHANCE[hi]-D.WIN_CHANCE[lo])*(x-lo);
}
// A persistent talent advantage is tested three times a snap, on both sides of the ball.
// Center weighted matchup grades on 7 without rounding away development. Cards still grant their full printed edge.
function ability(lineup,roles,traits,key){
  const ps=roles.map(r=>lineup[r]).filter(Boolean);
  const rating=ps.length?ps.reduce((s,p)=>s+playerAvg(p,traits),0)/ps.length:50;
  // The Gate decides whether either later duel is reached. Do not pay the full roster edge twice.
  return 7+(key==='G'?.03:.055)*(rating-70);
}
const rootPlay=p=>p.evolvedFrom||p.upgradeOf||p.id;

// The end commits to one runner. The weak-side linebacker must fit the other.
const keepTraits=['speed','versatility'],giveTraits=['power','technique'];
const scrapeTraits=['speed','iq'],fillTraits=['power','technique'];
const spyPenalty=2;
function defaultEdgeAssignment(off,def,hasSpy){
  const keep=ability(off,['QB'],keepTraits,'K')-ability(def,['WILL'],scrapeTraits,'K')-(hasSpy?spyPenalty:0);
  const give=ability(off,['RB'],giveTraits,'K')-ability(def,['WILL'],fillTraits,'K');
  return keep>give?'contain':'crash';
}
function readOptionPlay(card,assignment){
  const keep=assignment==='crash',carrier=keep?'QB':'RB';
  const {G,K,F}=card.duels;
  return {...card,carrier,duels:{
    G:{...G,label:keep?'Read the crashing end':'Read the containing end',qbRun:keep,dt:keep?['power','technique']:['speed','iq']},
    K:{...K,label:keep?'Keep outside vs scrape':'Give inside vs fill',off:[carrier],ot:keep?keepTraits:giveTraits,dt:keep?scrapeTraits:fillTraits,qbRun:keep},
    F:{...F,off:[carrier]}
  }};
}

// Is a play legal for this lineup? Returns null or a reason.
function playBlocked(play,lineup,sit=null){
  const sig=signatureBlocked(play,lineup);if(sig)return sig;
  if(play.fourthOnly&&sit&&sit.down!==4)return'4th down only';
  if(play.thirdOnly&&sit&&sit.down!==3)return'3rd down only';
  // The inline player sells the edge block on these wrinkles. Four-wide
  // personnel can still call the base runs or throw to the fourth receiver.
  if(['power','pa_boot'].includes(rootPlay(play))&&lineup.TE?.pos==='WR')return 'Needs an inline tight end. Change personnel to run this play.';
  const n=play.needs;
  if(n&&traitGrade(lineup[n.role],n.trait)<n.grade)return`Needs a ${n.role} with ${n.trait} ${n.grade}+`;
  return null;
}
function signatureBlocked(card,lineup){
  const s=card?.signature;
  return s&&String(lineup[s.role]?.id)!==String(s.playerId)?`${s.name} must be on the field`:null;
}
function hasSig(lineup,roles,flag){return roles.some(r=>D.SIGNATURES[lineup[r]?.archetype]?.flag===flag)}
function offFlag(lineup,flag){return hasSig(lineup,Object.keys(D.OFF_ROLES),flag)}
function defFlag(lineup,flag){return hasSig(lineup,Object.keys(D.DEF_ROLES),flag)}

// Tactic legality for a given play. Returns null or a reason.
function tacticBlocked(tac,play,offLineup){
  const sig=signatureBlocked(tac,offLineup);if(sig)return sig;
  const n=tac.needs;if(!n)return null;
  if(n.protection&&!play.protection)return'Only on plays with a protection duel';
  if(n.pass&&!play.pass)return'Only on pass plays';
  if(n.targetIq){
    const t=offLineup[play.target],sig=t?.archetype;
    if(traitGrade(t,'iq')<n.targetIq&&!['Route Sculptor','Space Hunter','Motion Weapon'].includes(sig))return`Target needs iq ${n.targetIq}+ or a route signature`;
  }
  if(n.plays){
    const ok=n.plays.includes(rootPlay(play))||(rootPlay(play)==='inside_zone'&&D.SIGNATURES[offLineup.TE?.archetype]?.flag==='mauler');
    if(!ok)return'Only on '+n.plays.map(id=>D.PLAYS[id].name).join(', ')+(offFlag(offLineup,'mauler')?', Inside Zone':'');
  }
  return null;
}

// A limited second primary read, using the same play identity and result table.
const TARGETS={deep_cross:['Z','TE'],quick_slant:['SLOT','X']};
function targetOptions(play,off){
  if(!play||play.signature)return [];
  const roles=TARGETS[rootPlay(play)];
  if(!roles||play.target!==roles[0]||!roles.every(r=>off[r]))return [];
  return roles.map(role=>{
    const p=off[role];
    const defRole=role==='X'?'BCB':role==='Z'?'FCB':role==='TE'&&p.pos==='TE'?'WILL':'NICKEL';
    return{role,name:p.name,defRole};
  });
}
function targetedPlay(play,target,off){
  if(target==null||target==='')return play;
  const option=targetOptions(play,off).find(x=>x.role===target);
  if(!option)throw new Error('That player cannot be the primary on this play.');
  if(target===play.target)return play;
  const duels={...play.duels};
  for(const [key,d] of Object.entries(duels)){
    if(!d.off.includes(play.target))continue;
    duels[key]={...d,off:d.off.map(role=>role===play.target?target:role),
      def:d.release||d.separation?[option.defRole]:d.def};
  }
  return{...play,target,duels};
}
function bracketOptions(off){
  return ['X','Z','SLOT','TE'].filter(r=>['WR','TE'].includes(off[r]?.pos))
    .map(role=>({role,name:off[role].name}));
}
function validateBracketRole(role,off){
  if(!bracketOptions(off).some(option=>option.role===role))throw new Error('Bracket an eligible receiver on the field.');
  return role;
}

// The best receiver a Bracket would take away: highest grade among the eligible targets.
function bracketRole(offLineup){
  let best='X',bg=-1;
  for(const {role:r} of bracketOptions(offLineup)){const p=offLineup[r];const g=playerAvg(p,['speed','technique','power']);if(g>bg){bg=g;best=r}}
  return best;
}

// ctx: {off, def (lineups), play, call, offTactics[], defTactics[], situation{down,distance,field},
//       lean (defense leaning family or null), heat (bool), motionConfirmed (bool)}
function buildSnap(ctx){
  const {off,def,call}=ctx,ot=new Set(ctx.offTactics||[]),dt=new Set(ctx.defTactics||[]);
  const edgeAssignment=rootPlay(ctx.play)==='read_option'?(ctx.edgeAssignment||defaultEdgeAssignment(off,def,dt.has('spy'))):null;
  const play=edgeAssignment?readOptionPlay(ctx.play,edgeAssignment):ctx.play;
  const sit=ctx.situation||{down:1,distance:10,field:25};
  // when: rain | snow | wind | clear | late (4th quarter) | money (3rd/4th down). Used by effects, edges and matchups.
  const whenOn=w=>!w||(w==='late'?(sit.period||1)>=4:w==='money'?sit.down>=3:w==='redzone'?(sit.field||0)>=80:w==='fourth'?sit.down===4:['rain','snow','wind'].includes(w)?ctx.weather===w:w==='clear'?!['rain','snow','wind'].includes(ctx.weather):false);
  const brRole=dt.has('bracket')?(ctx.bracketRole||bracketRole(off)):null;
  const flags={},origin=rootPlay(play),abilityContext={play:{...play,id:origin},call,offTactics:[...ot],defTactics:[...dt],situation:sit};
  const duels=['G','K','F'].map(key=>{
    let d=play.duels[key];
    // In heavy personnel the second TE/back takes part in the blocking duel.
    // His grades, active abilities and fatigue enter through the normal path.
    const extraBlocker=ctx.grouping==='12'&&off.SLOT?.pos==='TE'||ctx.grouping==='21'&&off.SLOT?.pos==='RB';
    if(extraBlocker&&play.family==='run'&&key==='G'&&!d.off.includes('SLOT'))d={...d,off:[...d.off,'SLOT']};
    const mods=[];
    const add=(v,src)=>{if(v)mods.push({v,src})};
    add(d.bias,'Play design');
    // Call vs call: the Football Strategy matrix, as duel modifiers.
    if(play.family==='run'){
      if(key==='G'){if(call.box==='loaded')add(-2,'Loaded box');if(call.box==='light')add(1,'Light box');if(call.pressure>0)add(-1,'Run blitz')}
      if(key==='K'&&call.pressure>0)add(1,'Blitzers vacate');
      if(key==='K'&&call.counters.includes('run'))add(-1,'Built for the run');
    }
    if(d.protect){if(call.pressure===1)add(-1,'Five-man rush');if(call.pressure===2)add(-2,'All-out blitz')}
    if(play.family==='quick'){
      if(key==='G'&&call.coverage==='man')add(-1,'Tight man');
      if(key==='K'&&call.pressure>0)add(-1,'Pressure speeds the clock');
      if(key==='F'&&call.pressure===2)add(1,'No help behind');
    }
    if(play.family==='deep'&&key==='K'){if(call.shell===2)add(-1,'Two deep');if(call.shell===0)add(2,'No safety')}
    if(play.pass&&key==='K'&&call.counters.includes(play.family))add(-1,'Coverage built for it');
    if(origin==='screen'&&key==='G'&&call.pressure>0)add(2,'They rushed into it');
    if(origin==='pa_boot'&&key==='K'&&call.box==='loaded')add(1,'Linebackers crowding');
    if(play.family==='constraint'&&key==='K'&&call.counters.includes('constraint'))add(-1,'Robber lurking');
    // Tendency: the defense leans, constraint plays punish it.
    if(ctx.lean){
      if(key==='K'&&play.family===ctx.lean&&call.counters.includes(ctx.lean))add(-1,'Sitting on it');
      if(key==='K'&&play.punishes===ctx.lean)add(2,'Punish the lean');
      if(key==='K'&&play.id==='vertical_shot'&&ctx.lean==='quick')add(1,'Punish the lean');
    }
    if(ctx.heat&&origin==='screen'&&key==='K')add(1,'Blitz-happy defense');
    // Offensive tactics.
    const targetDuel=d.release||d.separation;
    if(ot.has('motion')&&targetDuel&&d.off.includes(play.target))add(1,'Motion');
    if(ot.has('route_adjust')&&targetDuel&&d.off.includes(play.target)){add(1,'Route adjustment');if(ctx.motionConfirmed)add(1,'Adjusted to confirmed coverage')}
    if(ot.has('max_protect')){if(d.protect)add(2,'Max protect');if(key==='F')add(-1,'One fewer route')}
    if(ot.has('seal_block')&&key==='G')add(2,'Seal block');
    // Defensive tactics.
    if(dt.has('disguise')&&d.qbRead)add(traitGrade(def.FS,'iq')<=5?-1:-2,'Disguised coverage');
    if(brRole&&d.off.some(r=>RECEIVER_ROLES.includes(r))&&(d.release||d.separation||key==='F'&&play.pass)){
      if(d.off.includes(brRole))add(-2,'Bracketed');else if(d.off.some(r=>['X','Z','SLOT','TE'].includes(r)))add(1,'Bracket left him alone');
    }
    if(dt.has('spy')){if(d.qbRun)add(-spyPenalty,'QB spy');if(d.protect)add(1,'One fewer rusher')}
    if(dt.has('press')&&d.release){add(-1,'Press');flags.press=true}
    if(dt.has('identify_protection')&&d.protect&&call.pressure>0)add(-1,'Aimed pressure');
    // Generic card effects (new tactics, signature cards, calls with duel mods). Each names which duels it touches.
    const hits=e=>whenOn(e.when)&&(e.duel==null||e.duel===key)&&(!e.flag||(e.flag==='run'?play.family==='run':e.flag==='pass'?!!play.pass:e.flag==='countered'?(call.counters||[]).includes(play.family):e.flag==='versatile'?d.off.some(r=>(off[r]?.traits?.versatility??0)>=80):!!d[e.flag]))&&(!e.role||d.off.includes(e.role)||d.def.includes(e.role));
    // Card-specific matchup is separate from a player's passive ability. Counters win ties.
    let facts;
    const matchup=(card,sign)=>{
      const m=card?.signatureMatchup;if(!m||m.duel!==key)return;
      facts??={origin,family:play.family,shell:call.shell,box:call.box,coverage:call.coverage,pressure:call.pressure>0,spy:dt.has('spy'),qbRead:!!d.qbRead};
      const matches=when=>Object.entries(when).every(([k,v])=>facts[k]===v);
      if(!matches(m.scope))return;
      const counter=matches(m.counter.when);
      if(counter||matches(m.edge.when))add(sign*(counter?-1:m.gain),`${card.name} matchup: ${(counter?m.counter:m.edge).label}`);
    };
    for(const id of ot){const T=D.TACTICS[id]||{};for(const e of T.effects||[])if(hits(e))add(e.v,T.name);matchup(T,1)}
    for(const id of dt){const T=D.TACTICS[id]||{};for(const e of T.effects||[])if(hits(e))add(-e.v,T.name);matchup(T,-1)}
    // Program edges from the dynasty: scheme fit, weekly prep, crowd. Extra conditions: family, pressureCall, thirdDown.
    // play: one card (or anything evolved/upgraded from it).
    const edgeHits=e=>hits(e)&&(!e.play||[play.id,play.evolvedFrom,play.upgradeOf].includes(e.play))&&(!e.family||play.family===e.family)&&(!e.pressureCall||call.pressure>0)&&(!e.thirdDown||sit.down===3);
    for(const e of ctx.offEdges||[])if(edgeHits(e))add(e.v,e.src);
    for(const e of ctx.defEdges||[])if(edgeHits(e))add(-e.v,e.src);
    for(const e of play.effects||[])if(hits(e))add(e.v,e.src||play.name);
    for(const e of call.effects||[])if(hits(e))add(-e.v,e.src||call.name);
    matchup(play,1);matchup(call,-1);
    // Weather.
    const wx=ctx.weather;
    if(wx==='rain'){if(play.pass&&key==='F')add(-1,'Wet ball');}
    if(wx==='wind'){if(play.family==='deep'&&key==='K')add(-1,'Swirling wind');}
    if(wx==='snow'){if(key==='F')add(-1,'Footing in the snow');if(play.family==='run'&&key==='G')add(1,'Snow slows the rush');}
    // Data-driven matchups on newer cards.
    for(const m of play.matchups||[]){
      if(m.duel!==key)continue;
      const hit={pressure:call.pressure>0,shell1:call.shell===1,shell2:call.shell===2,man:call.coverage==='man',zone:call.coverage==='zone',loaded:call.box==='loaded',light:call.box==='light'}[m.when]??whenOn(m.when);
      if(hit)add(m.v,m.src);
    }
    // Red zone: the field shrinks, so deep routes have nowhere to go.
    if((sit.field||0)>=80&&play.family==='deep'&&key==='K')add(-1,'Red zone: no room deep');
    // Personnel grouping (the offense's choice each series), answered by the defense's box and shell.
    const grp=ctx.grouping;
    if(grp==='12'||grp==='21'){if(play.family==='run'&&key===(grp==='12'?'G':'K')&&call.box!=='loaded')add(.5,`Personnel ${grp}: extra blocker`);if(play.pass&&(d.separation||d.release))add(-.5,`Personnel ${grp}: fewer receivers`)}
    if(grp==='10'){if(play.pass&&(d.separation||d.release)&&call.shell!==2)add(.5,'Personnel 10: four receivers');if(play.family==='run'&&key==='G')add(-.5,'Personnel 10: light up front')}
    // Momentum: the offense that just took the ball away gets one snap's push at the point of attack.
    if(ctx.momentum&&key==='G')add(1,'Momentum: takeaway');
    // Combos and hot players.
    if(ctx.combo&&ctx.combo.duel===key)add(ctx.combo.v,`COMBO: ${ctx.combo.name}`);
    if(ctx.fire){
      const hotO=d.off.map(r=>off[r]).find(p=>p&&ctx.fire[p.id]),hotD=d.def.map(r=>def[r]).find(p=>p&&ctx.fire[p.id]);
      if(hotO)add(.5,`${hotO.name} ON FIRE`);if(hotD)add(-.5,`${hotD.name} ON FIRE`);
    }
    // The coach's featured player (battle.js featuredEdge): labeled, only on duels he is actually in.
    const ft=ctx.featured;
    if(ft&&ft.role===(play.pass?play.target:play.carrier)&&d.off.includes(ft.role)&&off[ft.role]?.id===ft.id)add(ft.v,`Featured: ${off[ft.role].name}`);
    // Signatures (offense positive, defense negative).
    for(const [roles,lineup] of [[d.off,off],[d.def,def]]){
      for(const r of roles){const s=D.SIGNATURES[lineup[r]?.archetype];if(s?.duel&&s.scope!=='field')add(s.duel(abilityContext,key,d),`${lineup[r].name} (${lineup[r].archetype})`)}
    }
    // Player conditions from the dynasty (fatigue, composure, morale, playing out of position). Labeled, ±1 each.
    const condOn=c=>c.when==='any'||c.when==='late'&&(sit.period||1)>=4||c.when==='money'&&sit.down>=3;
    for(const [roles,lineup,sign] of [[d.off,off,1],[d.def,def,-1]])for(const r of roles){const pl=lineup[r];for(const c of pl?.cond||[])if(condOn(c))add(sign*c.v,`${pl.name}: ${c.src}`)}
    for(const r of Object.keys(D.DEF_ROLES)){const p=def[r],s=D.SIGNATURES[p?.archetype];if(s?.duel&&s.scope==='field')add(s.duel(abilityContext,key,d),`${p.name} (${p.archetype})`)}
    // Today's workload is separate from existing health/wear. Durable players retain their edge longer.
    for(const [roles,lineup,sign] of [[d.off,off,1],[d.def,def,-1]]){
      let tired=null,penalty=0;
      for(const role of roles){const p=lineup[role];if(!p)continue;
        const loss=clamp(((ctx.workload?.[p.id]||0)-(20+(p.traits?.durability??50)/2))/20,0,1);
        if(loss>penalty){penalty=loss;tired=p}}
      if(tired)add(-sign*Math.round(penalty*10)/10,`${tired.name}: Game fatigue`);
    }
    const throwing=play.pass&&key==='F'&&!d.off.includes('QB')&&off.QB;
    const qbTraits=play.family==='deep'?['power','technique','composure']:['technique','iq','composure'];
    const receiverGrade=ability(off,d.off,d.ot,key),offGrade=throwing?.7*receiverGrade+.3*ability(off,['QB'],qbTraits,key):receiverGrade,defGrade=ability(def,d.def,d.dt,key);
    const offRoles=throwing?[...d.off,'QB']:d.off;
    const raw=offGrade-defGrade+mods.reduce((s,m)=>s+m.v,0),margin=clamp(raw,-3,3);
    return{key,label:d.label,offRoles,defRoles:d.def,offTraits:d.ot,defTraits:d.dt,qbTraits:throwing?qbTraits:null,offNames:offRoles.map(r=>off[r]?.name),defNames:d.def.map(r=>def[r]?.name),offGrade,defGrade,mods,raw,margin,p:winChance(margin),chip:D.chip(margin)};
  });
  // Result conversions that come from people.
  if(play.pass&&sit.down===3&&offFlag(off,'outlet')&&off.RB&&D.SIGNATURES[off.RB.archetype]?.flag==='outlet')flags.outlet=3;
  if(ot.has('max_protect')&&call.pressure===0&&D.SIGNATURES[off.TE?.archetype]?.flag==='checkRelease')flags.checkRelease=4;
  if(D.SIGNATURES[off.QB?.archetype]?.flag==='scramble')flags.scramble=true;
  if(play.carrier==='RB'&&D.SIGNATURES[off.RB?.archetype]?.flag==='burner')flags.burner=true;
  if(defFlag(def,'ballHawk'))flags.ballHawk=true;
  // Progression read: if the first read falls incomplete, the QB looks for the back or the tight end (whichever has the
  // better matchup on his linebacker). Zone and all-out pressure leave the checkdown open; max protect keeps a man in.
  let checkdown=null;
  if(play.pass&&!play.trick&&!play.signature&&!play.drill&&ctx.read!=='primary'){
    for(const [r,dr] of [['RB','WILL'],['TE','MIKE']]){
      const o=off[r],dd=def[dr];if(r===play.target||!o||!dd)continue;
      const og=((o.traits?.speed??50)+(o.traits?.technique??50))/20,dg=((dd.traits?.speed??50)+(dd.traits?.iq??50))/20;
      const m=clamp(Math.round(og-dg)+(call.coverage==='zone'?1:0)+(call.pressure>=2?1:0)-(ot.has('max_protect')?1:0),-3,3),p=D.WIN_CHANCE[String(m)]*CHECKDOWN_RATE;
      if(!checkdown||p>checkdown.p)checkdown={role:r,name:o.name,defRole:dr,p,margin:m,yards:4+Math.max(0,m)};
    }
  }
  return{play,call,duels,flags,checkdown,...(edgeAssignment?{edgeAssignment}:{}),offTactics:[...ot],defTactics:[...dt],bracketRole:brRole};
}

// Share of matchup win chance a checkdown converts (the QB still has to find him). Tuned with tools/sim-report.js.
const CHECKDOWN_RATE=Number(globalThis.__CS_CHECKDOWN_RATE)||.3;
function categoryProbs(snap){
  const [g,k,f]=snap.duels.map(d=>d.p);
  let fail=1-g,expl=g*k*f,succ=g*(k*(1-f)+(1-k)*f),short=g*(1-k)*(1-f);
  if(snap.flags.press){ // a release won through press is a bust: one step better
    expl=g*(k*f+k*(1-f)+(1-k)*f);succ=g*(1-k)*(1-f);short=0;
  }
  return{fail,short,success:succ,explosive:expl};
}

// Normal CDF for first-down odds.
function phi(x){const t=1/(1+.2316419*Math.abs(x)),d=.3989423*Math.exp(-x*x/2),p=d*t*(.3193815+t*(-.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p}
function resultList(snap,cat){
  let list=snap.play.results[cat];
  if(cat==='short'&&(snap.flags.outlet||snap.flags.checkRelease))list=[{w:1,kind:'catch',yards:[snap.flags.outlet||snap.flags.checkRelease,1]}];
  return list;
}
const TAIL_FLOOR=8,TAIL_MEAN=16;
function branchChances(snap,r,cat){
  return {pick:r.kind==='inc'?(r.int||0)*(snap.flags.ballHawk?1.5:1):0,
    check:r.kind==='inc'&&cat!=='fail'?(snap.checkdown?.p||0):0,
    escape:r.kind==='sack'&&snap.flags.scramble ? .5 : 0,
    fumble:r.kind==='sack'?.07:r.kind==='run'&&['fail','short'].includes(cat)?.022:0};
}
function gainOdds(threshold,mean,sd,tail){
  const normal=sd?1-phi((threshold-mean)/sd):Number(mean>=threshold);
  if(!tail)return normal;
  const x=threshold-mean-TAIL_FLOOR;
  const long=sd?1-phi(x/sd)+Math.exp(-x/TAIL_MEAN+sd*sd/(2*TAIL_MEAN*TAIL_MEAN))*phi(x/sd-sd/TAIL_MEAN):Math.exp(-Math.max(0,x)/TAIL_MEAN);
  return normal*(1-tail)+clamp(long,0,1)*tail;
}
// Expected value used by the AI and the "projection" line in the sandbox.
function evaluate(snap,situation){
  const probs=categoryProbs(snap),need=situation?.distance??10;
  let yards=0,first=0,to=0,sack=0;
  for(const [cat,pc] of Object.entries(probs)){
    if(!pc)continue;const list=resultList(snap,cat),wsum=list.reduce((s,r)=>s+r.w,0);
    for(const r of list){
      const pr=pc*r.w/wsum,chance=branchChances(snap,r,cat);
      const scale=snap.flags.burner&&cat==='explosive'?1.25:1;
      const mean=(r.yards[0]+(r.tail||0)*(TAIL_FLOOR+TAIL_MEAN))*scale;
      const escape=chance.escape,cd=(1-chance.pick)*chance.check;
      const fumble=(1-escape)*chance.fumble;
      to+=pr*(chance.pick+fumble);
      if(r.kind==='inc'){
        if(cd){yards+=pr*cd*snap.checkdown.yards;first+=pr*cd*gainOdds(need-.5,snap.checkdown.yards,1.5,0)}
      }else if(r.kind==='sack'){
        sack+=pr*(1-escape);yards+=pr*((1-escape)*Math.min(-1,mean)+escape*4.5);
        first+=pr*escape*clamp((7-(need-.5))/5,0,1);
      }else{
        // Scrambles have a 2–7 yard minimum. Most printed scramble results
        // already cluster around that range, so their expectation is approximate.
        yards+=pr*(r.kind==='scramble'?Math.max(mean,4.5):mean);
        first+=pr*(1-fumble)*gainOdds((need-.5)/scale,r.yards[0],r.yards[1],r.tail||0);
      }
    }
  }
  return{yards,first,turnover:to,sack,probs};
}

// Roll the snap. rng: DynastyRng instance. Returns an engine outcome plus the story of the snap.
function resolve(snap,rng,situation){
  const wins=snap.duels.map(d=>rng.next()<d.p);
  let cat;
  if(!wins[0])cat='fail';else{const n=(wins[1]?1:0)+(wins[2]?1:0);cat=n===2?'explosive':n===1?'success':'short'}
  if(snap.flags.press&&wins[0]&&cat!=='explosive')cat=cat==='short'?'success':'explosive';
  const list=resultList(snap,cat),wsum=list.reduce((s,r)=>s+r.w,0);
  let pick=rng.next()*wsum,r=list[0];for(const x of list){pick-=x.w;if(pick<=0){r=x;break}}
  let kind=r.kind;const chance=branchChances(snap,r,cat);
  if(chance.escape&&rng.next()<chance.escape)kind='scramble';
  let yards=r.yards[0]+r.yards[1]*rng.gauss();
  if(r.tail&&rng.next()<r.tail)yards+=TAIL_FLOOR+(-Math.log(1-rng.next()))*TAIL_MEAN;
  if(snap.flags.burner&&cat==='explosive')yards*=1.25;
  if(kind==='scramble')yards=Math.max(yards,2+rng.next()*5);
  const intRoll=rng.next(),fumRoll=rng.next(),clockRoll=rng.next();
  yards=Math.round(yards);
  // An interception on the first read ends it; only a pass that simply fell incomplete can become a checkdown.
  let checkdown=null;const firstReadPicked=kind==='inc'&&intRoll<chance.pick;
  // Only when the protection held (the first duel won): a pressured QB has no time to come back to the back.
  if(chance.check&&!firstReadPicked&&rng.next()<chance.check){kind='catch';yards=Math.max(0,Math.round(snap.checkdown.yards+1.5*rng.gauss()));checkdown=snap.checkdown}
  const play=snap.play,out={category:cat,kind,wins,duels:snap.duels.map((d,i)=>({key:d.key,label:d.label,won:wins[i],margin:d.margin,offNames:d.offNames,defNames:d.defNames}))};
  if(kind==='inc'){
    if(firstReadPicked){out.turnover='interception';out.yards=clamp(Math.round(6+rng.gauss()*6),-2,30);out.clock=6}
    else{out.yards=0;out.clock=6}
    out.completed=false;
  }else if(kind==='sack'){
    out.yards=Math.min(-1,yards);out.clock=28;if(fumRoll<chance.fumble)out.turnover='fumble';
  }else{
    out.yards=yards;out.completed=kind==='catch';
    out.clock=Math.round(23+clockRoll*11);
    if(kind==='run'&&fumRoll<chance.fumble)out.turnover='fumble';
  }
  if(play.clockStop&&!out.turnover)out.clock=Math.min(out.clock,play.clockStop);
  if(checkdown)out.checkdown={role:checkdown.role,name:checkdown.name};
  out.engineKind=play.pass&&kind!=='scramble'?'pass':'rush';
  // Who did it, for the box score.
  const losing=!wins[0]?0:(!wins[1]?1:2);
  out.participants={
    passer:play.pass?'QB':null,
    target:checkdown?checkdown.role:play.pass&&kind!=='sack'&&kind!=='scramble'?(cat==='short'&&(snap.flags.outlet||snap.flags.checkRelease)?(snap.flags.outlet?'RB':'TE'):play.target):null,
    carrier:!play.pass?play.carrier:(kind==='scramble'?'QB':null),
    sacker:kind==='sack'?snap.duels[0].defRoles[0]:null,
    defender:checkdown?checkdown.defRole:snap.duels[kind==='inc'||kind==='sack'?Math.min(losing,2):Math.min(2,losing)].defRoles[0]
  };
  return out;
}

return{grade,traitGrade,signatureBlocked,playBlocked,tacticBlocked,bracketRole,bracketOptions,validateBracketRole,targetOptions,targetedPlay,buildSnap,categoryProbs,evaluate,resolve,winChance};
});
