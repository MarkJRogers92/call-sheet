// Shared pregame collection/deck editor for the sandbox and Dynasty Lab.
(function(root){
'use strict';
// Card faces shared by the deck editor and the dynasty's reward packs: rarity frame, origin ribbon, cost bubble.
const escF=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function originOf(id,c){const weather=(c.matchups||[]).some(m=>['rain','snow','wind'].includes(m.when));return c.legacy?'legacy':c.program?'coaching tree':c.drill?'two-minute drill':c.trick?'trick':weather?'weather':id==='giant_killer'?'milestone':''}
function faceClass(id){const {packs:P,data:D}=root.CallSheet,c=P.cardDef(id)||{},o=originOf(id,c);return`cs-face r-${D.rarityOf(id)}${c.legacy?' r-legacy':''}${o?' o-'+o.replace(/[^a-z]+/g,'-'):''}`}
function originHTML(id){const c=root.CallSheet.packs.cardDef(id)||{},o=originOf(id,c);return o?`<span class="cs-face-origin">${escF(o)}</span>`:''}
function cleanText(t){return String(t||'').replace(/^(EVOLVED|COACHING TREE|TRICK|TWO-MINUTE DRILL) · /,'').replace(/^LEGACY of #\S* [^·]*· /,'')}
function faceHTML(id,{footer=''}={}){
  const {packs:P,data:D}=root.CallSheet,c=P.cardDef(id)||{},r=D.rarityOf(id);
  const type=c.family?`${c.family}${c.trick?' · once per game':''}`:c.box?`${c.coverage} · ${c.box} box`:'tactic';
  return`<article class="${faceClass(id)}" data-face="${escF(id)}"><span class="cs-face-cost">${c.cost??0}</span>${originHTML(id)}<b class="cs-face-name">${escF(c.name||id)}</b><small class="cs-face-type">${escF(type)}</small><p class="cs-face-text">${escF(cleanText(c.text))}</p>${r!=='common'?`<span class="cs-face-rar">${escF(r)}</span>`:''}${footer}</article>`;
}
const FACE_CSS=`.cs-face{position:relative;display:flex;flex-direction:column;gap:4px;padding:12px 12px 22px;border:1px solid #384555;border-radius:12px;background:linear-gradient(170deg,#1c2533,#121821 70%);color:#f2efe5;text-align:left}
.cs-face.r-rare{border-color:#ffd84d;background:linear-gradient(170deg,#3a2f12,#161a22 70%)}
.cs-face.r-legendary{border:2px solid transparent;background:linear-gradient(170deg,#24123a,#101522 70%) padding-box,linear-gradient(120deg,#ff7a7a,#ffe066,#7af0a0,#7ad0ff,#d09bff) border-box}
.cs-face.r-evolved{border-color:#3cf0c0;background:linear-gradient(170deg,#0f3a33,#101826 70%)}
.cs-face.r-signature{border:2px solid #ffd84d;background:linear-gradient(160deg,#1a1408,#050505 60%,#1a1408)}
.cs-face.r-legacy{border:2px solid #9fc3ff;background:linear-gradient(160deg,#0e1a2e,#05070c 60%,#0e1a2e)}
.cs-face-cost{position:absolute;right:-7px;top:-7px;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#1a1200;background:radial-gradient(circle at 35% 30%,#fff3b0,#e5b53a)}
.cs-face-origin{align-self:flex-start;margin:-12px 0 2px -12px;padding:2px 8px;border-radius:12px 0 10px 0;font:800 10px system-ui;letter-spacing:.1em;text-transform:uppercase;color:#0b0f18;background:#e5c766}
.cs-face.o-legacy .cs-face-origin{background:#9fc3ff}.cs-face.o-coaching-tree .cs-face-origin{background:#7ad0a6}.cs-face.o-two-minute-drill .cs-face-origin{background:#ff9f5a}.cs-face.o-trick .cs-face-origin{background:linear-gradient(90deg,#ff7a7a,#ffe066)}.cs-face.o-weather .cs-face-origin{background:#8fd3ff}.cs-face.o-milestone .cs-face-origin{background:#d09bff}
.cs-face-name{font-size:15px;padding-right:14px}.cs-face-type{color:#aab6e8;text-transform:capitalize;font-size:12px}.cs-face-text{margin:0;color:#c9cfdc;font-size:13px;flex:1}
.cs-face-rar{position:absolute;left:12px;bottom:5px;font:800 10px system-ui;letter-spacing:.16em;text-transform:uppercase;color:#ffd84d}
.cs-face.r-legendary .cs-face-rar{background:linear-gradient(90deg,#ff7a7a,#ffe066,#7af0a0,#7ad0ff,#d09bff);-webkit-background-clip:text;background-clip:text;color:transparent}.cs-face.r-evolved .cs-face-rar{color:#7dffd8}.cs-face.r-legacy .cs-face-rar{color:#cfe0ff}`;
function injectFaceCSS(doc=document){if(doc.getElementById('csFaceStyles'))return;const st=doc.createElement('style');st.id='csFaceStyles';st.textContent=FACE_CSS;doc.head.appendChild(st)}
function open(pb,{onSave=()=>{},onClose=()=>{},lineup=null}={}){
  injectFaceCSS();
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
      return `<b>${esc(c.name)}</b><small>${c.cost} Command · ${esc(c.family||'Tactic')}${c.trick?' · Once per game':''}</small><p>${esc(cleanText(c.text))}</p>${traits.length?`<small>Uses ${esc(traits.join(', '))}</small>`:''}`};
    const list=(pile,equip)=>{
      const ids=equip?reserve[pile]:deck[pile],counts=new Map();ids.forEach((id,i)=>{const c=counts.get(id);if(c)c.n++;else counts.set(id,{i,n:1})});
      return `<div class="de-cards">${[...counts].map(([id,{i,n}])=>`<article class="${faceClass(id)}">${originHTML(id)}${info(id)}<footer><span>×${n}</span><button type="button" data-move="${pile}:${i}:${equip?1:0}">${equip?'Equip':'Store'}</button></footer></article>`).join('')||'<p class="de-muted">No cards here.</p>'}</div>`;
    };
    dialog.innerHTML=`<style>
#deckEditor{box-sizing:border-box;width:min(1040px,96vw);max-height:92vh;padding:24px;border:1px solid #66592e;border-radius:16px;background:#10151f;color:#f2efe5;font:16px system-ui;z-index:2147483646;text-align:left}#deckEditor::backdrop{background:#03060bd9}#deckEditor *{box-sizing:border-box}#deckEditor h2{margin:0 0 8px;font-size:28px}#deckEditor h3{font-size:18px;margin:24px 0 10px;color:#ffda63}#deckEditor p{line-height:1.45}#deckEditor button,#deckEditor select{font:inherit;border-radius:7px;border:1px solid #617083;background:#233042;color:#fff;padding:8px 12px;cursor:pointer}#deckEditor button:focus-visible,#deckEditor select:focus-visible{outline:3px solid #7ad4ff}#deckEditor .de-gold{background:#ffda63;color:#17140b;border-color:#ffda63}#deckEditor nav{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}#deckEditor .de-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}#deckEditor article{padding:13px;border-radius:10px}#deckEditor article:not(.cs-face){border:1px solid #384555;background:#18202c}#deckEditor small{display:block;color:#b9c7d3;font-size:12px;margin-top:5px}#deckEditor article p{font-size:13px;min-height:38px}#deckEditor footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px}#deckEditor .de-base{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}#deckEditor label{display:grid;gap:7px;font-size:13px}#deckEditor select{width:100%;min-width:0}#deckEditor .de-muted{color:#b9c7d3}#deckEditor .de-error{color:#ffb097;min-height:24px}#deckEditor summary{cursor:pointer;color:#ffda63}#deckEditor .de-actions{position:sticky;bottom:-24px;background:#10151ff5;padding:14px 0;display:flex;gap:10px;border-top:1px solid #384555}@media(max-width:500px){#deckEditor{padding:16px}.de-cards{grid-template-columns:1fr!important}}
</style><h2>Build your deck</h2><p class="de-muted">Your collection keeps every earned card. Choose four reliable base calls, then shape the plays and tactics you draw. Stored cards can be equipped again any time between games.</p>
<nav><button type="button" data-side="off" class="${side==='off'?'de-gold':''}">Offense</button><button type="button" data-side="def" class="${side==='def'?'de-gold':''}">Defense</button></nav>
<p class="de-error" role="status">${esc(message)}</p>
${(root.CallSheet.evolution?.ready(draft,{lineup})||[]).map(r=>`<section><h3>Ready to evolve · ${esc(P.cardDef(r.rootId).name)}</h3><p class="de-muted">Your practice and game reps earned a permanent upgrade. It takes effect when you save this deck.</p><div class="de-cards">${r.options.map(id=>`<article class="${faceClass(id)}">${originHTML(id)}${info(id)}${r.locks?.[id]?`<small class="de-lock">🔒 ${esc(r.locks[id])}</small><button type="button" disabled>Locked</button>`:`<button type="button" data-evolve="${r.rootId}:${id}">Choose ${esc(P.cardDef(id).name)}</button>`}</article>`).join('')}</div></section>`).join('')}
<h3>Always available · 4 base calls</h3><p class="de-muted">Keep at least one free, unrestricted call. Trick plays and player signatures stay in the draw pile.</p>
<div class="de-base">${deck.base.map((id,i)=>`<label>Base ${i+1}<select data-base="${i}" aria-label="Base ${i+1}">${owned.filter(x=>!table[x]?.trick&&!table[x]?.signature).map(x=>`<option value="${esc(x)}" ${x===id?'selected':''}>${esc(P.cardDef(x).name)} · ${P.cardDef(x).cost} Command</option>`).join('')}</select></label>`).join('')}</div>
<h3>Active play pile · ${deck.wrinkles.length}/${draft.capacity.wrinkles}</h3><p class="de-muted">Draw 3 each series. Extra copies make a play appear more often.</p>${list('wrinkles',false)}
<h3>Active tactics · ${deck.tactics.length}/${draft.capacity.tactics}</h3><p class="de-muted">Draw 4 each series. Tactics spend Command alongside your play.</p>${list('tactics',false)}
<h3>Stored plays · ${reserve.wrinkles.length}</h3>${list('wrinkles',true)}<h3>Stored tactics · ${reserve.tactics.length}</h3>${list('tactics',true)}
${(draft.signatures||[]).length?`<h3>Player signatures · automatic when their owner plays</h3><div class="de-cards">${draft.signatures.map(sg=>`<article class="${faceClass(sg.id)}">${originHTML(sg.id)}${info(sg.id)}<small>${esc(sg.name)} · ${esc(sg.role)}</small><button type="button" data-sig-store="${esc(sg.id)}">Store signature</button></article>`).join('')}</div>`:''}
${draft.reserveSignatures.length?`<h3>Stored signatures</h3><p class="de-muted">Three active signatures maximum. Store one to make room; ownership stays with the player.</p><div class="de-cards">${draft.reserveSignatures.map(sg=>`<article class="${faceClass(sg.id)}">${originHTML(sg.id)}${info(sg.id)}<button type="button" data-sig-equip="${esc(sg.id)}">Equip signature</button></article>`).join('')}</div>`:''}
<details><summary>Achievements · ${draft.achievements.length}/${P.ACHIEVEMENTS.length}</summary>${P.ACHIEVEMENTS.map(a=>`<p><b>${draft.achievements.includes(a.id)?'✓ ':''}${esc(a.name)}</b> — ${esc(a.how)}<small>Reward: ${esc(P.cardDef(a.reward).name)} · added to your collection once</small></p>`).join('')}</details>
<details><summary>More cards to discover</summary><p class="de-muted">Win or lose, every completed game awards a choice pack. Achievements unlock specific cards. Repeated use evolves plays; player breakouts create signatures.</p><div class="de-cards">${P.POOL.filter(c=>c.side===side&&![...deck.base,...deck.wrinkles,...deck.tactics,...reserve.wrinkles,...reserve.tactics].includes(c.id)).map(c=>`<article class="${faceClass(c.id)}">${originHTML(c.id)}${info(c.id)}<small>${esc(c.rarity)} · Pack reward</small></article>`).join('')}</div></details>
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
root.CallSheet.playbookUI={open,faceHTML,faceClass,injectFaceCSS};
})(typeof window==='object'?window:globalThis);
