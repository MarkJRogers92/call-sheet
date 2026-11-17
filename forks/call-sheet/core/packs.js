// Call Sheet packs and the persistent playbook (rules v0.3).
// After every game you open a pack and pick ONE card. Win: pick 1 of 4. Loss: a Film Study pack, 1 of 3,
// weighted toward counters to whatever beat you. The playbook has limited slots, so a pick can force a cut;
// legendaries exist once per world. No currency, no duplicates of people.
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const deps=node?[require('./data.js'),require('../../../rng.js')]:[root.CallSheet.data,root.DynastyRng];
  const api=factory(...deps);
  if(node)module.exports=api;else root.CallSheet.packs=api;
})(typeof window==='object'?window:globalThis,function(D,DynastyRng){
'use strict';
const clone=v=>JSON.parse(JSON.stringify(v));

// Every card a pack can hold. kind: play (offense wrinkle) | call (defense wrinkle) | tactic | upgrade.
const POOL=[
  ...['deep_cross','pa_boot','screen','power','read_option','draw','four_verts','vertical_shot','statue_left','rpo_bubble','hb_wheel','qb_draw','hook_ladder','wishbone_dive','power_lead'].map(id=>({id,kind:'play',side:'off'})),
  ...['motion','max_protect','route_adjust','seal_block','hard_count','check_with_me','hurry_up','audible','timeout_settle'].map(id=>({id,kind:'tactic',side:'off'})),
  ...[['inside_zone_plus','inside_zone'],['quick_slant_plus','quick_slant'],['pa_boot_plus','pa_boot']].map(([id,replaces])=>({id,kind:'upgrade',side:'off',replaces})),
  ...['zone_pressure','two_man','robber','sim_pressure','bear','corner_blitz','cover2_trap','cover0','midnight_mirage','tampa2','ghost_blitz'].map(id=>({id,kind:'call',side:'def'})),
  ...['film_tell','identify_protection','disguise','bracket','spy','press','stunt','lock','timeout_ice'].map(id=>({id,kind:'tactic',side:'def'}))
].map(c=>({...c,rarity:D.rarityOf(c.id)}));
// Defensive answers to each offensive family, for Film Study packs.
const COUNTERS={run:['bear','robber','two_man','spy','stunt'],quick:['cover2_trap','corner_blitz','robber','press','lock','tampa2'],deep:['two_man','zone_pressure','bracket','disguise','tampa2'],constraint:['robber','cover2_trap','film_tell','spy']};

const CAPACITY={wrinkles:14,tactics:14};
function newPlaybook(){
  return{version:1,reserve:{off:{wrinkles:[],tactics:[]},def:{wrinkles:[],tactics:[]}},achievements:[],off:clone(D.DEFAULT_DECKS.off),def:clone(D.DEFAULT_DECKS.def),capacity:clone(CAPACITY),legendaries:[],record:{w:0,l:0},history:[],packsOpened:0,mastery:{},signatures:[]};
}
// Signature cards ride along outside the capacity limits: one copy each, in the pile their kind belongs to.
function decksOf(pb){const d={off:clone(pb.off),def:clone(pb.def)};for(const sg of pb.signatures||[])d[sg.side][sg.pile].push(sg.id);return d}
function owns(pb,c){
  if(c.kind==='upgrade'){const d=pb[c.side];return d.base.includes(c.id)||d.wrinkles.includes(c.id)||(pb.reserve?.[c.side]?.wrinkles||[]).includes(c.id)}
  return false;
}
function eligible(pb,c,worldTaken=[]){
  if(c.rarity==='legendary'&&(pb.legendaries.includes(c.id)||worldTaken.includes(c.id)))return false;
  if(c.kind==='upgrade'){const d=pb[c.side];if(owns(pb,c))return false;return d.base.includes(c.replaces)||d.wrinkles.includes(c.replaces)||(pb.reserve?.[c.side]?.wrinkles||[]).includes(c.replaces)}
  return true;
}
function rollRarity(rng,won){
  const r=rng.next();
  if(r<(won?.045:.02))return'legendary';
  if(r<(won?.27:.17))return'rare';
  return'common';
}
// opts: {won, seed, oppTendency:{run,quick,deep,constraint}, worldTaken:[legendary ids owned by AI programs]}
// Postseason wins open bigger packs: five cards, with a legendary chance on the last one (best for the national title).
const STAGE_PACKS={
  conference:{type:'conference',title:'Championship Pack',subtitle:'Pick 1 of 5 · conference champions',wrap:'CONF<br>CHAMPS',legendary:.25},
  bowl:{type:'bowl',title:'Bowl Pack',subtitle:'Pick 1 of 5 · bowl champions',wrap:'BOWL',legendary:.25},
  playoff:{type:'playoff',title:'Playoff Pack',subtitle:'Pick 1 of 5 · still alive',wrap:'PLAYOFF',legendary:.3},
  title:{type:'title',title:'National Title Pack',subtitle:'Pick 1 of 5 · national champions',wrap:'NATIONAL<br>TITLE',legendary:.6}
};
function openPack(pb,opts){
  const rng=DynastyRng.create(`pack:${opts.seed}:${pb.packsOpened}`);
  const rivalWin=opts.rivalry&&opts.won,post=opts.won&&STAGE_PACKS[opts.stage]||null,n=rivalWin||post?5:opts.won?4:3,cards=[],used=new Set();
  const lastLegendary=post?Math.max(post.legendary,rivalWin?.35:0):rivalWin?.35:0;
  let focus=null;
  if(!opts.won&&opts.oppTendency){focus=Object.entries(opts.oppTendency).filter(([k])=>COUNTERS[k]).sort((a,b)=>b[1]-a[1])[0]?.[0]||null}
  for(let i=0;i<n;i++){
    let pick=null;
    // Film Study: the first two slots come from the counters to what beat you.
    if(focus&&i<2){
      const ids=COUNTERS[focus].filter(id=>!used.has(id)),want=ids.length?ids[rng.int(0,ids.length-1)]:null,c=want?POOL.find(p=>p.id===want):null;
      if(c&&eligible(pb,c,opts.worldTaken))pick={...c,why:`Counters their ${focus} game`};
    }
    for(let tries=0;!pick&&tries<40;tries++){
      const rarity=lastLegendary&&i===n-1&&rng.next()<lastLegendary?'legendary':rollRarity(rng,opts.won),list=POOL.filter(c=>c.rarity===rarity&&!used.has(c.id)&&eligible(pb,c,opts.worldTaken));
      if(list.length)pick={...list[rng.int(0,list.length-1)]};
    }
    if(!pick)break;
    used.add(pick.id);cards.push({...pick,uid:`${pb.packsOpened}-${i}`});
  }
  // Show the best card last: reveal order escalates.
  const order={common:0,rare:1,legendary:2};cards.sort((a,b)=>order[a.rarity]-order[b.rarity]);
  if(post)return{type:post.type,title:post.title,subtitle:post.subtitle,cards};
  if(rivalWin)return{type:'rivalry',title:'Rivalry Pack',subtitle:'Pick 1 of 5 · the trophy stays home',cards};
  return{type:opts.won?'victory':'film',title:opts.won?'Victory Pack':'Film Study Pack',subtitle:opts.won?'Pick 1 of 4':`Pick 1 of 3 · built around stopping their ${focus||'offense'}`,cards};
}
// Apply a pick. Returns {over:null} or {over:{side,pile}} when a cut is required.
function applyPick(pb,card){
  pb.packsOpened++;
  const d=pb[card.side];
  if(card.kind==='upgrade'){
    const bi=d.base.indexOf(card.replaces);
    if(bi>=0)d.base[bi]=card.id;else{const wi=d.wrinkles.indexOf(card.replaces);if(wi>=0)d.wrinkles[wi]=card.id;else{const reserve=ensureCollection(pb)[card.side].wrinkles,ri=reserve.indexOf(card.replaces);if(ri>=0)reserve[ri]=card.id}}
  }else if(card.kind==='tactic')d.tactics.push(card.id);
  else d.wrinkles.push(card.id);
  if(card.rarity==='legendary')pb.legendaries.push(card.id);
  pb.history.push({id:card.id,kind:card.kind,side:card.side,rarity:card.rarity});
  return{over:overCapacity(pb)};
}
function overCapacity(pb){
  for(const side of ['off','def']){
    if(pb[side].wrinkles.length>pb.capacity.wrinkles)return{side,pile:'wrinkles'};
    if(pb[side].tactics.length>pb.capacity.tactics)return{side,pile:'tactics'};
  }
  return null;
}
function cut(pb,side,pile,index){
  const list=pb[side][pile];if(index<0||index>=list.length)throw new Error('No card at that slot.');
  const [id]=list.splice(index,1);
  ensureCollection(pb)[side][pile].push(id);
  return id;
}
// Owned cards stay in the collection when removed from the active deck.
function ensureCollection(pb){
  pb.reserve??={};for(const side of ['off','def']){pb.reserve[side]??={};for(const pile of ['wrinkles','tactics'])pb.reserve[side][pile]??=[]}
  pb.achievements??=[];return pb.reserve;
}
function moveCard(pb,side,pile,index,equip){
  if(!['off','def'].includes(side)||!['wrinkles','tactics'].includes(pile))throw new Error('Invalid deck.');
  const reserve=ensureCollection(pb),from=equip?reserve[side][pile]:pb[side][pile],to=equip?pb[side][pile]:reserve[side][pile];
  if(!Number.isInteger(index)||!from[index])throw new Error('No card at that slot.');
  if(equip&&to.length>=pb.capacity[pile])throw new Error('Move a card to the collection to make room first.');
  to.push(from.splice(index,1)[0]);
}
function setBase(pb,side,slot,id){
  if(!['off','def'].includes(side)||!Number.isInteger(slot)||slot<0||slot>3)throw new Error('Invalid base slot.');
  const c=(side==='off'?D.PLAYS:D.CALLS)[id],deck=pb[side];
  if(!c||c.trick||c.signature)throw new Error('Trick and signature cards stay in the draw pile.');
  if(deck.base[slot]===id)return;
  if(deck.base.includes(id))throw new Error('Choose four different base cards.');
  const reserve=ensureCollection(pb)[side].wrinkles,from=deck.wrinkles.includes(id)?deck.wrinkles:reserve,index=from.indexOf(id);
  if(index<0)throw new Error('Unlock this card first.');
  const proposed=deck.base.map((old,i)=>i===slot?id:old);
  if(!proposed.some(x=>{const c=cardDef(x);return c.cost===0&&!c.needs}))throw new Error('Keep at least one free, unrestricted base play so you can always call a snap.');
  from[index]=deck.base[slot];deck.base[slot]=id;
}
const ACHIEVEMENTS=[
  {id:'first_game',name:'First Whistle',how:'Finish a card battle',reward:'rpo_bubble'},
  {id:'first_win',name:'Winning Formula',how:'Win a card battle',reward:'hurry_up'},
  {id:'balanced',name:'Keep Them Guessing',how:'Call all four offensive families in one game',reward:'hb_wheel'},
  {id:'combo',name:'Set Them Up',how:'Trigger Establish the Run',reward:'draw'},
  {id:'pressure',name:'Bring the Heat',how:'Record three sacks in one game',reward:'stunt'}
];
function awardAchievements(pb,b,side){
  if(!b.final)return[];
  const reserve=ensureCollection(pb),snaps=b.log.filter(e=>e.type==='snap'&&!e.penalty&&e.offSide===side);
  const families=new Set(snaps.map(e=>D.PLAYS[e.play]?.family));
  const met={first_game:true,first_win:b.final.winner===side,balanced:['run','quick','deep','constraint'].every(f=>families.has(f)),
    combo:snaps.some(e=>e.events?.some(x=>x.type==='combo'&&x.id==='establish')),pressure:Object.values(b.players||{}).filter(p=>p.side===side).reduce((n,p)=>n+(p.sacks||0),0)>=3};
  const gained=[];
  for(const a of ACHIEVEMENTS){if(!met[a.id]||pb.achievements.includes(a.id))continue;
    const c=POOL.find(c=>c.id===a.reward),pile=c.kind==='tactic'?'tactics':'wrinkles';
    reserve[c.side][pile].push(c.id);pb.achievements.push(a.id);pb.history.push({id:c.id,kind:'achievement',side:c.side,achievement:a.id});gained.push(a);
  }
  return gained;
}
// Packs earned away from a game (signing day, boosters). Cards are drawn when the pack is earned and stored with it,
// so reopening never rerolls. weights: {category: weight}; categories are a play's family, a call's family, or
// offTactic / defTactic. bonusRare raises the rare odds. The pick goes to the collection, never over the deck limits.
function categoryOf(c){const d=cardDef(c.id)||{};return c.kind==='tactic'?(c.side==='off'?'offTactic':'defTactic'):d.family||'other'}
function rewardPack(pb,{seed,weights={},n=4,bonusRare=0,worldTaken=[],title='Reward Pack',subtitle='',type='reward'}={}){
  const rng=DynastyRng.create(`reward:${seed}`),used=new Set(),cards=[];
  for(let i=0;i<n;i++){
    const roll=rng.next(),rarity=roll<.03+bonusRare/4?'legendary':roll<.22+bonusRare?'rare':'common';
    let list=POOL.filter(c=>c.kind!=='upgrade'&&!used.has(c.id)&&eligible(pb,c,worldTaken));
    const exact=list.filter(c=>c.rarity===rarity);if(exact.length)list=exact;
    if(!list.length)break;
    const w=list.map(c=>.25+(weights[categoryOf(c)]||0)),total=w.reduce((a,b)=>a+b,0);let r=rng.next()*total,pick=list[list.length-1];
    for(let j=0;j<list.length;j++){r-=w[j];if(r<=0){pick=list[j];break}}
    used.add(pick.id);cards.push(pick.id);
  }
  return{type,title,subtitle,cards};
}
// Put an earned card straight into the collection (stored, ready to equip).
function grantCard(pb,id,how={}){
  const c=cardDef(id);if(!c)throw new Error(`Unknown card ${id}`);
  const side=c.side,pile=D.TACTICS[id]?'tactics':'wrinkles';
  ensureCollection(pb)[side][pile].push(id);
  if(D.rarityOf(id)==='legendary'&&!pb.legendaries.includes(id))pb.legendaries.push(id);
  (pb.history??=[]).push({id,kind:how.kind||'program',side,...(how.why?{why:String(how.why).slice(0,80)}:{})});
  return{side,pile};
}
function cardDef(id){return D.PLAYS[id]||D.CALLS[id]||D.TACTICS[id]||null}

return{rewardPack,grantCard,categoryOf,STAGE_PACKS,ensureCollection,moveCard,setBase,ACHIEVEMENTS,awardAchievements,POOL,COUNTERS,CAPACITY,newPlaybook,decksOf,openPack,applyPick,overCapacity,cut,cardDef};
});
