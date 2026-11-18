// Exercise the real postgame/reward UI from a completed standalone battle. Only the starting save is seeded.
module.exports = async function exerciseGamePack() {
  const C=window.CallSheet,A=window.__slice,assert=(condition,reason)=>{if(!condition)throw new Error(reason)};
  const wait=async (f,why)=>{for(let i=0;i<300;i++){if(f())return;await new Promise(r=>setTimeout(r,15))}throw new Error(why)};
  const $=s=>document.querySelector(s),pb=A.save().playbook;
  const originalReserve=JSON.stringify(pb.reserve);
  for(const side of ['off','def'])for(const pile of ['wrinkles','tactics']){
    while(pb[side][pile].length<pb.capacity[pile])pb[side][pile].push(pb[side][pile][0]);
  }
  const beforeDeck=JSON.stringify([pb.off,pb.def]),opening=pb.packsOpened;
  const b=C.battle.simulate({seed:'owned-deck-postgame-8',home:C.roster.preset('ground'),away:C.roster.preset('aerial')});
  b.user='home';b._recorded=true;b._breakoutResolved=true;b.weather='clear';
  A.save().activeBattle={seed:b.seed,battle:C.battle.save(b)};
  window.SliceFX.skipping=true;A.resumeBattle();$('#openPack').click();$('#pk').click();
  await wait(()=>$('.slot.pickable .front button'),'waiting for revealed cards');
  const faces=Array.from(document.querySelectorAll('.slot.pickable .front button'));assert(faces.length>=3,'eligible pack has at least three choices');
  for(const face of faces){
    face.click();
    if($('[data-pack-destination="collection"]'))break;
  }
  const deck=$('[data-pack-destination="deck"]'),keep=$('[data-pack-destination="collection"]');
  assert(deck?.disabled&&!keep?.disabled,'full active piles must allow collection only');
  assert(!A.b._packPicked&&pb.packsOpened===opening&&JSON.stringify(pb.reserve)===originalReserve,'previewing did not spend the reward');
  assert(!$('.slot.burn')&&document.querySelectorAll('.slot.pickable').length===faces.length,'preview never burns competing faces');
  const title=$('#pkMsg b').textContent,selected=C.packs.POOL.find(c=>C.packs.cardDef(c.id).name===title);
  assert(selected,'selected reward is visible by name');const pile=selected.kind==='tactic'?'tactics':'wrinkles';
  const copies=pb.reserve[selected.side][pile].filter(x=>x===selected.id).length;
  keep.click();keep.click();await wait(()=>A.b._packPicked,'waiting for confirmed reward');
  assert(JSON.stringify([pb.off,pb.def])===beforeDeck,'keeping the reward cannot replace an active call');
  assert(pb.packsOpened===opening+1&&pb.reserve[selected.side][pile].filter(x=>x===selected.id).length===copies+1,'one explicit choice adds exactly one owned copy');
};
