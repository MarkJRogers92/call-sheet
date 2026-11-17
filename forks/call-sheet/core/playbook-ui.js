// Shared pregame collection/deck editor for the sandbox and Dynasty Lab.
(function(root){
'use strict';
function open(pb,{onSave=()=>{},onClose=()=>{},lineup=null}={}){
  const {packs:P,data:D}=root.CallSheet,draft=JSON.parse(JSON.stringify(pb));P.ensureCollection(draft);root.CallSheet.signatures?.registerAll(draft);draft.reserveSignatures??=[];
  let side='off',message='';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dialog=document.createElement('dialog');dialog.id='deckEditor';dialog.setAttribute('aria-label','Build your deck');
  document.body.appendChild(dialog);
  const close=()=>{dialog.close();dialog.remove();onClose()};
  dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
  function paint(){
    const deck=draft[side],reserve=draft.reserve[side],table=side==='off'?D.PLAYS:D.CALLS;
    const owned=[...new Set([...deck.base,...deck.wrinkles,...reserve.wrinkles])];
    const info=id=>{const c=P.cardDef(id),traits=c.duels?[...new Set(Object.values(c.duels).flatMap(d=>d.ot))]:[];
      return `<b>${esc(c.name)}</b><small>${c.cost} Command · ${esc(c.family||'Tactic')}${c.trick?' · Once per game':''}</small><p>${esc(c.text||'')}</p>${traits.length?`<small>Uses ${esc(traits.join(', '))}</small>`:''}`};
    const list=(pile,equip)=>{
      const ids=equip?reserve[pile]:deck[pile],counts=new Map();ids.forEach((id,i)=>{const c=counts.get(id);if(c)c.n++;else counts.set(id,{i,n:1})});
      return `<div class="de-cards">${[...counts].map(([id,{i,n}])=>`<article>${info(id)}<footer><span>×${n}</span><button type="button" data-move="${pile}:${i}:${equip?1:0}">${equip?'Equip':'Store'}</button></footer></article>`).join('')||'<p class="de-muted">No cards here.</p>'}</div>`;
    };
    dialog.innerHTML=`<style>
#deckEditor{box-sizing:border-box;width:min(1040px,96vw);max-height:92vh;padding:24px;border:1px solid #66592e;border-radius:16px;background:#10151f;color:#f2efe5;font:16px system-ui;z-index:2147483646;text-align:left}#deckEditor::backdrop{background:#03060bd9}#deckEditor *{box-sizing:border-box}#deckEditor h2{margin:0 0 8px;font-size:28px}#deckEditor h3{font-size:18px;margin:24px 0 10px;color:#ffda63}#deckEditor p{line-height:1.45}#deckEditor button,#deckEditor select{font:inherit;border-radius:7px;border:1px solid #617083;background:#233042;color:#fff;padding:8px 12px;cursor:pointer}#deckEditor button:focus-visible,#deckEditor select:focus-visible{outline:3px solid #7ad4ff}#deckEditor .de-gold{background:#ffda63;color:#17140b;border-color:#ffda63}#deckEditor nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}#deckEditor .de-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}#deckEditor article{padding:13px;border:1px solid #384555;border-radius:10px;background:#18202c}#deckEditor small{display:block;color:#b9c7d3;font-size:12px;margin-top:5px}#deckEditor article p{font-size:13px;min-height:38px}#deckEditor footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px}#deckEditor .de-base{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}#deckEditor label{display:grid;gap:7px;font-size:13px}#deckEditor select{width:100%;min-width:0}#deckEditor .de-muted{color:#b9c7d3}#deckEditor .de-error{color:#ffb097;min-height:24px}#deckEditor summary{cursor:pointer;color:#ffda63}#deckEditor .de-actions{position:sticky;bottom:-24px;background:#10151ff5;padding:14px 0;display:flex;gap:10px;border-top:1px solid #384555}@media(max-width:500px){#deckEditor{padding:16px}.de-cards{grid-template-columns:1fr!important}}
</style><h2>Build your deck</h2><p class="de-muted">Your collection keeps every earned card. Choose four reliable base calls, then shape the plays and tactics you draw. Stored cards can be equipped again any time between games.</p>
<nav><button type="button" data-side="off" class="${side==='off'?'de-gold':''}">Offense</button><button type="button" data-side="def" class="${side==='def'?'de-gold':''}">Defense</button></nav>
<p class="de-error" role="status">${esc(message)}</p>
${(root.CallSheet.evolution?.ready(draft,{lineup})||[]).map(r=>`<section><h3>Ready to evolve · ${esc(P.cardDef(r.rootId).name)}</h3><p class="de-muted">Your practice and game reps earned a permanent upgrade. It takes effect when you save this deck.</p><div class="de-cards">${r.options.map(id=>`<article>${info(id)}${r.locks?.[id]?`<small class="de-lock">🔒 ${esc(r.locks[id])}</small><button type="button" disabled>Locked</button>`:`<button type="button" data-evolve="${r.rootId}:${id}">Choose ${esc(P.cardDef(id).name)}</button>`}</article>`).join('')}</div></section>`).join('')}
<h3>Always available · 4 base calls</h3><p class="de-muted">Keep at least one free, unrestricted call. Trick plays and player signatures stay in the draw pile.</p>
<div class="de-base">${deck.base.map((id,i)=>`<label>Base ${i+1}<select data-base="${i}" aria-label="Base ${i+1}">${owned.filter(x=>!table[x]?.trick&&!table[x]?.signature).map(x=>`<option value="${esc(x)}" ${x===id?'selected':''}>${esc(P.cardDef(x).name)} · ${P.cardDef(x).cost} Command</option>`).join('')}</select></label>`).join('')}</div>
<h3>Active play pile · ${deck.wrinkles.length}/${draft.capacity.wrinkles}</h3><p class="de-muted">Draw 3 each series. Extra copies make a play appear more often.</p>${list('wrinkles',false)}
<h3>Active tactics · ${deck.tactics.length}/${draft.capacity.tactics}</h3><p class="de-muted">Draw 4 each series. Tactics spend Command alongside your play.</p>${list('tactics',false)}
<h3>Stored plays · ${reserve.wrinkles.length}</h3>${list('wrinkles',true)}<h3>Stored tactics · ${reserve.tactics.length}</h3>${list('tactics',true)}
${(draft.signatures||[]).length?`<h3>Player signatures · automatic when their owner plays</h3><div class="de-cards">${draft.signatures.map(sg=>`<article>${info(sg.id)}<small>${esc(sg.name)} · ${esc(sg.role)}</small><button type="button" data-sig-store="${esc(sg.id)}">Store signature</button></article>`).join('')}</div>`:''}
${draft.reserveSignatures.length?`<h3>Stored signatures</h3><p class="de-muted">Three active signatures maximum. Store one to make room; ownership stays with the player.</p><div class="de-cards">${draft.reserveSignatures.map(sg=>`<article>${info(sg.id)}<button type="button" data-sig-equip="${esc(sg.id)}">Equip signature</button></article>`).join('')}</div>`:''}
<details><summary>Achievements · ${draft.achievements.length}/${P.ACHIEVEMENTS.length}</summary>${P.ACHIEVEMENTS.map(a=>`<p><b>${draft.achievements.includes(a.id)?'✓ ':''}${esc(a.name)}</b> — ${esc(a.how)}<small>Reward: ${esc(P.cardDef(a.reward).name)} · added to your collection once</small></p>`).join('')}</details>
<details><summary>More cards to discover</summary><p class="de-muted">Win or lose, every completed game awards a choice pack. Achievements unlock specific cards. Repeated use evolves plays; player breakouts create signatures.</p><div class="de-cards">${P.POOL.filter(c=>c.side===side&&![...deck.base,...deck.wrinkles,...deck.tactics,...reserve.wrinkles,...reserve.tactics].includes(c.id)).map(c=>`<article>${info(c.id)}<small>${esc(c.rarity)} · Pack reward</small></article>`).join('')}</div></details>
<div class="de-actions"><button type="button" class="de-gold" data-save>Save deck</button><button type="button" data-cancel>Cancel</button></div>`;
    dialog.querySelectorAll('[data-side]').forEach(el=>el.onclick=()=>{side=el.dataset.side;message='';paint()});
    const act=fn=>{try{fn();message=''}catch(e){message=e.message}const scroll=dialog.scrollTop;paint();dialog.scrollTop=scroll};
    dialog.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>act(()=>{const [pile,i,equip]=el.dataset.move.split(':');P.moveCard(draft,side,pile,Number(i),equip==='1')}));
    dialog.querySelectorAll('[data-evolve]').forEach(el=>el.onclick=()=>act(()=>{const [rootId,branch]=el.dataset.evolve.split(':');root.CallSheet.evolution.evolve(draft,rootId,branch,{lineup})}));
    dialog.querySelectorAll('[data-base]').forEach(el=>el.onchange=()=>act(()=>P.setBase(draft,side,Number(el.dataset.base),el.value)));
    for(const [attr,from,to] of [['sigStore','signatures','reserveSignatures'],['sigEquip','reserveSignatures','signatures']])dialog.querySelectorAll(attr==='sigStore'?'[data-sig-store]':'[data-sig-equip]').forEach(el=>el.onclick=()=>act(()=>{if(to==='signatures'&&draft.signatures.length>=3)throw new Error('Store an active signature first.');const i=draft[from].findIndex(sg=>sg.id===el.dataset[attr]);if(i>=0)draft[to].push(draft[from].splice(i,1)[0])}));
    dialog.querySelector('[data-save]').onclick=()=>{if(P.overCapacity(draft)){message='Store cards until both decks fit their limits.';paint();return}onSave(draft);close()};
    dialog.querySelector('[data-cancel]').onclick=close;
  }
  paint();dialog.showModal();return dialog;
}
root.CallSheet.playbookUI={open};
})(typeof window==='object'?window:globalThis);
