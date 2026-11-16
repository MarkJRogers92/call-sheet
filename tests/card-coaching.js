'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const R=require('../forks/call-sheet/core/resolver');
const Ro=require('../forks/call-sheet/core/roster');
const D=require('../forks/call-sheet/core/data');
const A=require('../forks/call-sheet/core/adapter');
const SG=require('../forks/call-sheet/core/signatures');
const clone=x=>JSON.parse(JSON.stringify(x));
function teams(){
  const home=Ro.preset('ground'),away=Ro.preset('aerial'),starter=home.lineup.off.RB;
  starter.traits={...starter.traits,power:98,technique:90,iq:55,versatility:50};
  const backup={...clone(starter),id:'receiving-back',name:'Receiving Back',traits:{...starter.traits,power:50,technique:95,iq:99,versatility:99}};
  home.backfield=[starter,backup];return{home,away};
}
function waiting(){
  const b=B.create({...teams(),seed:'coaching',user:'home',control:'offense',mode:'snap'});
  B.advance(b);assert.equal(b.pending?.role,'off');return b;
}

test('adapter keeps real depth order and excludes injured and already assigned backs',()=>{
  const player=(id,extra={})=>({id,name:id,pos:'RB',style:'Third-Down Weapon',trueNow:70,...Object.fromEntries(D.TRAITS.map(t=>[t,75])),...extra});
  const t=A.battleTeam({name:'Test',roster:[player('starter'),player('slot'),player('hurt',{injuryWeeks:2}),player('reserve')],roleDepth:{RB1:['starter','hurt','reserve'],SLOT:['slot']}});
  assert.deepEqual(t.backfield.map(p=>p.id),['starter','reserve']);assert.equal(t.lineup.off.SLOT.id,'slot');
});

test('packages use the real back and refresh legality without spending Command or RNG',()=>{
  const b=waiting(),rng=clone(b.rng),command=b.pending.options.command,starter=b.teams.home.backfield[0].id;
  B.setBackfield(b,'home','receiving');assert.equal(b.teams.home.lineup.off.RB.id,'receiving-back');
  B.setBackfield(b,'home','power');assert.equal(b.teams.home.lineup.off.RB.id,starter);
  b.box.home.plays=3;B.setBackfield(b,'home','auto');assert.equal(b.teams.home.lineup.off.RB.id,'receiving-back');
  B.setBackfield(b,'home','starter');assert.equal(b.teams.home.lineup.off.RB.id,starter);
  assert.deepEqual(b.rng,rng);assert.equal(b.pending.options.command,command);
  assert.throws(()=>B.setBackfield(b,'away','power'));assert.throws(()=>B.setBackfield(b,'home','constructor'));
});

test('a resting signature owner cannot lend his card to the replacement back',()=>{
  const b=waiting(),p=b.teams.home.lineup.off.RB,spec=SG.specFor(p);SG.register(spec);
  b.hands.home.wrinkles.push(spec.id);
  B.setBackfield(b,'home','receiving');
  assert.match(b.pending.options.plays.find(c=>c.id===spec.id).blocked,/must be on the field/);
  const before=B.save(b);assert.throws(()=>B.submit(b,{type:'call',play:spec.id,tactics:[]}),/must be on the field/);assert.equal(B.save(b),before);
  B.setBackfield(b,'home','starter');assert.equal(b.pending.options.plays.find(c=>c.id===spec.id).blocked,null);
  assert.equal(R.signatureBlocked(D.PLAYS[spec.id],b.teams.home.lineup.off),null);
});

test('rotation credits the actual backs in logs, engine actors, and career duels',()=>{
  const opts={...teams(),seed:'rotation-accounting'},b=B.simulate(opts),starter=b.teams.home.backfield[0].id;
  assert.equal(b.game.status,'final');assert.ok(!b.final.engineError);
  const snaps=b.log.filter(e=>e.type==='snap'&&e.offSide==='home'&&!e.penalty),ids=new Set(snaps.map(e=>e.lineups.off.RB));
  assert.ok(ids.has(starter)&&ids.has('receiving-back'));
  const expected={};let count=0;
  for(const e of snaps){
    assert.equal(e.lineups.off.RB,count++%4===3?'receiving-back':starter);
    for(let i=0;i<e.duels.length;i++){
      if(i>0&&!e.duelResults[0].won)break;
      if(e.duels[i].offRoles.includes('RB')){const t=expected[e.lineups.off.RB]??={w:0,l:0};t[e.duelResults[i].won?'w':'l']++}
    }
  }
  // Current lineup is deliberately different: historical attribution must not follow it.
  b.teams.home.lineup.off.RB=b.teams.home.backfield[1];
  const tally=B.duelTally(b);for(const [id,t] of Object.entries(expected)){assert.equal(tally[id].w,t.w);assert.equal(tally[id].l,t.l)}
  for(const id of [starter,'receiving-back']){
    const runs=b.game.events.filter(e=>e.card?.actors.carrier===id&&e.kind==='rush');
    assert.ok(runs.length>0);assert.equal(b.players[id].rushAtt,runs.length);
  }
  assert.deepEqual(B.duelTally(B.load(B.save(b))),tally);
  const again=B.simulate(opts);assert.deepEqual(again.game.score,b.game.score);assert.deepEqual(again.log,b.log);
});

test('signature breakouts ignore unreached duels and retain a rotated player identity',()=>{
  const b=waiting(),starter=b.teams.home.lineup.off.RB,backup=b.teams.home.backfield[1];
  const duel=(key,role)=>({key,label:key,offRoles:[role],defRoles:['MIKE'],offNames:[role],defNames:['Mike'],mods:[]});
  const e={type:'snap',offSide:'home',defSide:'away',duels:[duel('G','LT'),duel('K','RB'),duel('F','RB')],duelResults:[{won:false},{won:true},{won:true}],events:[],lineups:{off:{LT:b.teams.home.lineup.off.LT.id,RB:starter.id},def:{MIKE:b.teams.away.lineup.def.MIKE.id}}};
  b.log=Array.from({length:20},()=>clone(e));assert.equal(SG.breakouts(b,'home').length,0);
  b.teams.home.lineup.off.RB=backup;
  for(const entry of b.log)entry.duelResults[0].won=true;
  assert.ok(SG.breakouts(b,'home').some(t=>t.p.id===starter.id&&t.wins===40));
  assert.ok(!SG.breakouts(b,'home').some(t=>t.p.id===backup.id));
});

test('fire streaks count only duels reached in the actual snap',()=>{
  const b=B.simulate({...teams(),seed:'fire-accounting'}),streaks={},fire={};
  const skill={off:['QB','RB','X','Z','SLOT','TE'],def:['RUSH','SET','MIKE','WILL','FCB','BCB','NICKEL','FS','BOXS']};
  for(const e of b.log){
    if(e.type!=='snap'||!e.duelResults)continue;
    const outcomes={};
    for(let i=0;i<e.duels.length;i++){
      if(i>0&&!e.duelResults[0].won)break;
      for(const side of ['off','def'])for(const role of e.duels[i][side+'Roles']){
        if(!skill[side].includes(role))continue;
        const id=e.lineups[side][role];if(!id)continue;
        outcomes[id]=(outcomes[id]??true)&&(side==='off'?e.duelResults[i].won:!e.duelResults[i].won);
      }
    }
    for(const [id,won] of Object.entries(outcomes)){streaks[id]=won?(streaks[id]||0)+1:0;if(streaks[id]>=D.RULES.fireStreak)fire[id]=true;else if(!won)delete fire[id]}
  }
  assert.deepEqual(b.streaks,streaks);assert.deepEqual(b.fire,fire);
});

test('coaching cues depend only on visible tells and label uncertain pressure',()=>{
  const b=waiting(),req=b.pending;
  req.look={box:{value:'normal',confirmed:true},shell:{value:2,confirmed:false},pressure:{value:true,confirmed:false},lean:{value:'run',confirmed:false},heat:false};
  const before=B.coachingRead(req,'inside_zone').join(' ');
  assert.match(before,/not confirmed/);assert.doesNotMatch(before,/Two deep|leaning/);
  for(const p of Object.values(b.teams.away.lineup.def))for(const t of D.TRAITS)p.traits[t]=1;
  assert.equal(B.coachingRead(req,'inside_zone').join(' '),before);
  req.look.box={value:'loaded',confirmed:true};assert.match(B.coachingRead(req,'inside_zone').join(' '),/tougher Gate/);
  assert.match(B.coachingRead({kind:'snap',role:'def',offLook:{family:{confirmed:false}},offTendency:{run:5,quick:2}}).join(' '),/not a promise/);
});

test('snap explanations stop at a failed Gate and report no duels for a flag',()=>{
  const d={key:'G',label:'Protection',offNames:['Left Tackle'],defNames:['Edge Rusher'],mods:[{v:-1,src:'Five-man rush'}]};
  const e={duels:[d,{...d,key:'K'},{...d,key:'F'}],duelResults:[{key:'G',won:false},{key:'K',won:true},{key:'F',won:true}]};
  const note=B.explainSnap(e);assert.match(note.summary,/Edge Rusher beat Left Tackle/);assert.match(note.detail,/Key and Finish not reached/);assert.doesNotMatch(note.detail,/K won|F won/);
  assert.match(B.explainSnap({penalty:{},text:'Holding'}).detail,/no duel credit/);
});

test('old battle saves without personnel snapshots still resume',()=>{
  const b=waiting();delete b.personnel;delete b.backfieldMode;
  const restored=B.load(B.save(b));assert.ok(restored.personnel[restored.teams.home.lineup.off.RB.id]);
  assert.doesNotThrow(()=>B.submit(restored,{type:'auto'}));
});
