#!/usr/bin/env node
// Balance report for the Call Sheet battle.
//   node forks/call-sheet/tools/balance-report.js [games=200] [--json] [--only=talent|cards|moments] [--cards=id,id]
// 1. Talent: win rate by rating gap (every player shifted). Talent should decide, never guarantee.
// 2. Cards: the same two teams with and without one card in the deck. No card should swing games much.
// 3. Moments: checkdown, momentum and drill frequencies.
'use strict';
const path=require('path');
const B=require(path.join(__dirname,'../core/battle.js'));
const Ro=require(path.join(__dirname,'../core/roster.js'));
const D=require(path.join(__dirname,'../core/data.js'));
const N=Number(process.argv[2])||200,asJson=process.argv.includes('--json');
const arg=k=>(process.argv.find(a=>a.startsWith(`--${k}=`))||'').split('=')[1]||'';const only=arg('only'),pick=arg('cards').split(',').filter(Boolean);
const clone=v=>JSON.parse(JSON.stringify(v));

// Shift every trait of a team by d rating points (clamped to the 25–99 scale).
function shifted(preset,d){
  const t=Ro.preset(preset);
  const players=new Set([...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.packageDepth||[]),...(t.backfield||[])]);
  for(const p of players)for(const k of Object.keys(p.traits))p.traits[k]=Math.max(25,Math.min(99,p.traits[k]+d));
  return t;
}
function play(home,away,seed){const b=B.simulate({home,away,seed});return{b,winner:b.game.score.home>b.game.score.away?'home':b.game.score.home<b.game.score.away?'away':null}}

function talent(){
  const out=[];
  for(const gap of [0,4,8,12,20]){
    let wins=0,games=0,margin=0;
    for(let i=0;i<N;i++){
      const p=['aerial','tempo','ground'][i%3],q=['aerial','tempo','ground'][(i+1)%3];
      // Alternate home/away so home field cancels out.
      const flip=i%2===1,strong=shifted(p,gap/2),weak=shifted(q,-gap/2);
      const r=play(flip?weak:strong,flip?strong:weak,`talent-${gap}-${i}`),sSide=flip?'away':'home';
      games++;if(r.winner===sSide)wins++;else if(!r.winner)wins+=.5;
      margin+=r.b.game.score[sSide]-r.b.game.score[sSide==='home'?'away':'home'];
    }
    out.push({gap,winRate:wins/games,avgMargin:margin/games});
  }
  return out;
}

// Same matchup with and without a card (two copies), sides alternated.
const CARDS=[
  ['giant_killer','off','tactics'],['timeout_settle','off','tactics'],['timeout_ice','def','tactics'],
  ['flea_flicker','off','wrinkles'],['jet_reverse','off','wrinkles'],['counter_trey','off','wrinkles'],['buck_sweep','off','wrinkles'],
  ['midline_option','off','wrinkles'],['choice_route','off','wrinkles'],['dagger','off','wrinkles'],['smash','off','wrinkles'],
  ['wishbone_dive','off','wrinkles'],['power_lead','off','wrinkles'],
  ['fade_route','off','wrinkles'],['kill_kill','off','tactics'],['two_way_star','off','tactics'],
  ['spinner','off','wrinkles'],['buck_lateral','off','wrinkles'],['triple_option','off','wrinkles'],['split_veer','off','wrinkles'],['shallow_cross','off','wrinkles'],['curl_flat','off','wrinkles'],
  ['forty_six','def','wrinkles'],['zone_blitz','def','wrinkles'],
  ['cover4_match','def','wrinkles'],['double_eagle','def','wrinkles'],['fire_zone','def','wrinkles'],['wide_nine','def','wrinkles'],['man_free','def','wrinkles'],['bluff_zero','def','wrinkles']
];
function cards(){
  const out=[];
  for(const [id,side,pile] of CARDS.filter(c=>!pick.length||pick.includes(c[0]))){
    let wins=0,games=0,used=0;
    for(let i=0;i<N;i++){
      const p=['aerial','tempo','ground'][i%3],with_=Ro.preset(p),without=Ro.preset(p);
      const deck=clone(D.DEFAULT_DECKS);deck[side][pile]=deck[side][pile].concat([id,id]);with_.decks=deck;
      const flip=i%2===1,r=play(flip?without:with_,flip?with_:without,`card-${id}-${i}`),wSide=flip?'away':'home';
      games++;if(r.winner===wSide)wins++;else if(!r.winner)wins+=.5;
      used+=r.b.log.filter(e=>e.type==='snap'&&(e.offSide===wSide&&(e.play===id||(e.offTactics||[]).includes(id))||e.defSide===wSide&&(e.call===id||(e.defTactics||[]).includes(id)))).length;
    }
    out.push({id,winRate:wins/games,usesPerGame:used/games});
  }
  return out;
}

function moments(){
  let passes=0,checkdowns=0,turnovers=0,momentumSnaps=0,momentumWins=0,drill=0,games=0;
  for(let i=0;i<N;i++){
    const r=play(Ro.preset(['aerial','tempo','ground'][i%3]),Ro.preset(['ground','aerial','tempo'][i%3]),`moments-${i}`);games++;
    const snaps=r.b.log.filter(e=>e.type==='snap'&&e.duels);
    for(const s of snaps){
      if(D.PLAYS[s.play]?.pass&&!D.PLAYS[s.play]?.drill)passes++;if(/checks down/.test(s.text))checkdowns++;if(s.turnover)turnovers++;if(D.PLAYS[s.play]?.drill)drill++;
      if(s.duels[0].mods?.some(m=>m.src==='Momentum: takeaway')){momentumSnaps++;if(s.duelResults?.[0]?.won)momentumWins++}
    }
  }
  return{checkdownRate:checkdowns/passes,turnoversPerGame:turnovers/games,momentumSnapsPerGame:momentumSnaps/games,momentumGateWinRate:momentumSnaps?momentumWins/momentumSnaps:null,drillSnapsPerGame:drill/games};
}

const report={games:N,talent:!only||only==='talent'?talent():[],cards:!only||only==='cards'?cards():[],moments:!only||only==='moments'?moments():null};
if(asJson){console.log(JSON.stringify(report,null,1));process.exit(0)}
const pct=v=>`${(v*100).toFixed(1)}%`;
console.log(`Call Sheet balance report — ${N} games per row\n\nTalent (every player shifted; sides alternated)\n  gap   win rate   avg margin`);
for(const t of report.talent)console.log(`  ${String(t.gap).padStart(3)}   ${pct(t.winRate).padStart(7)}   ${t.avgMargin.toFixed(1).padStart(6)}`);
console.log('\nCards (two copies added to one side, same teams otherwise)\n  card               win rate   uses/game');
for(const c of report.cards.sort((a,b)=>b.winRate-a.winRate))console.log(`  ${c.id.padEnd(17)} ${pct(c.winRate).padStart(8)}   ${c.usesPerGame.toFixed(1).padStart(6)}`);
const m=report.moments;
if(m)console.log(`\nMoments\n  checkdowns per pass        ${pct(m.checkdownRate)}\n  turnovers per game         ${m.turnoversPerGame.toFixed(2)}\n  momentum snaps per game    ${m.momentumSnapsPerGame.toFixed(2)} (gate won ${m.momentumGateWinRate==null?'—':pct(m.momentumGateWinRate)})\n  drill snaps per game       ${m.drillSnapsPerGame.toFixed(2)}`);
