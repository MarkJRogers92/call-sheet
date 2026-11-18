// Run inside a browser with the actual Call Sheet modules loaded, independent of layout and host saves.
module.exports = function exerciseOwnedDeck() {
  const {packs, playbookUI, signatures} = window.CallSheet;
  const eq = (actual, expected, why) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(why + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  };
  const dialog = () => document.querySelector('#deckEditor');
  const all = s => Array.from(dialog().querySelectorAll(s));
  const one = s => {
    const els = all(s);
    if (els.length !== 1) throw new Error('Expected one ' + s + ', found ' + els.length);
    return els[0];
  };
  const attr = (a, v) => '[' + a + '="' + v + '"]';
  const card = id => attr('data-owned-card', id);
  const ids = () => all('[data-owned-card]').map(el => el.dataset.ownedCard);
  const count = (type, n, max) => {
    const el = one(attr('data-type-count', type));
    if (!new RegExp('(?:^|\\D)' + n + '\\s*/\\s*' + max + '(?:\\D|$)').test(el.textContent)) throw new Error(type + ' count: ' + el.textContent);
  };
  const copies = (id, selected, total) => {
    const el = one(card(id) + ' [data-copy-count]');
    if (!new RegExp('(?:^|\\D)' + selected + ' of ' + total + ' in deck\\b','i').test(el.textContent)) throw new Error(id + ' copies: ' + el.textContent);
  };
  const click = selector => {
    const button = one(selector);
    if (button.disabled) throw new Error('Unexpected disabled control: ' + selector);
    button.focus(); button.click();
  };
  const move = (id, direction) => click(card(id) + ' ' + attr('data-move', direction));
  const owned = p => ['off','def'].flatMap(side => ['wrinkles','tactics'].map(pile =>
    [...p[side][pile],...p.reserve[side][pile],...(pile === 'wrinkles' ? p[side].base : [])].sort()));
  const pb = packs.newPlaybook();
  pb.capacity = {wrinkles:12,tactics:18};
  pb.reserve.off.wrinkles = ['draw','draw'];
  pb.reserve.off.tactics = ['motion','motion'];
  const players = ['Red','Blue','Green','Gray'].map((name, i) =>
    signatures.specFor({id:'owned'+i,name:'Test '+name,role:i<2?'RB':'MIKE',pos:i<2?'RB':'LB'}));
  pb.signatures = players.slice(0,3); pb.reserveSignatures = players.slice(3);
  const original = JSON.stringify(pb), before = owned(pb);
  let saved; const open = () => playbookUI.open(pb,{onSave:p=>{saved=p}});
  open();
  eq(one('[data-category="wrinkles"]').getAttribute('aria-pressed'),'true','opens to plays');
  eq(one('[data-side="off"]').getAttribute('aria-pressed'),'true','opens to offense');
  eq(all('[data-category]').map(el=>el.dataset.category).sort(),['base','signatures','tactics','wrinkles'],'four types');
  eq(one('[data-more-options]').open,false,'extras collapsed');
  const order = ids();
  eq([...order].sort(),Array.from(new Set([...pb.off.wrinkles,...pb.reserve.off.wrinkles])).sort(),'one row for each owned play');
  count('wrinkles',12,12);count('tactics',12,18);count('base',4,4);count('signatures',3,3);
  copies('draw',0,2);copies('deep_cross',2,2);
  const blocked=one(card('draw')+' [data-move="add"]');
  eq(blocked.disabled,true,'plays cannot borrow free tactic slots');
  const reason=document.getElementById(blocked.getAttribute('aria-describedby'));
  if(!reason||!/remove one play/i.test(reason.textContent))throw new Error('Explain how to free a play slot for this blocked card');
  move('deep_cross','remove');copies('deep_cross',1,2);count('wrinkles',11,12);
  eq(document.activeElement.closest('[data-owned-card]')?.dataset.ownedCard,'deep_cross','focus stays on the same card');
  move('deep_cross','remove');copies('deep_cross',0,2);
  eq(ids(),order,'the row stays in its original place after its last active copy is removed');
  move('draw','add');move('draw','add');copies('draw',2,2);count('wrinkles',12,12);eq(ids(),order,'reaching the limit never moves rows');
  click('[data-category="tactics"]');copies('motion',2,4);move('motion','add');copies('motion',3,4);count('tactics',13,18);
  click('[data-side="def"]');click('[data-category="wrinkles"]');
  eq([...ids()].sort(),[...new Set(pb.def.wrinkles)].sort(),'defense owns a distinct play list');
  click('[data-category="base"]');eq(all('[data-base]').length,4,'four defensive base calls');
  click('[data-category="signatures"]');count('signatures',3,3);
  eq(one(attr('data-sig-equip',players[3].id)).disabled,true,'signature cap is shared between sides');
  click(attr('data-sig-store',players[0].id));count('signatures',2,3);
  click(attr('data-sig-equip',players[3].id));count('signatures',3,3);
  click('[data-save]');
  eq(owned(saved),before,'saving all changes did not mint or drop any copies');
  eq(saved.signatures.map(x=>x.id).sort(),players.slice(1).map(x=>x.id).sort(),'saved exact signature choices');
  eq(saved.off.wrinkles.filter(x=>x==='draw').length,2,'saved exact play selection');
  eq(saved.off.wrinkles.includes('deep_cross'),false,'last copy was removed from deck only');
  eq(saved.off.tactics.filter(x=>x==='motion').length,3,'duplicate tactic selection persisted');
  eq(JSON.stringify(pb),original,'only the saved draft changed');
  open();move('deep_cross','remove');click('[data-cancel]');eq(JSON.stringify(pb),original,'cancel is non-destructive');
  // With both sides of a pile at capacity, deselecting a copy must still permit a clean exchange.
  const near = packs.newPlaybook();
  near.off.wrinkles.push('pa_boot','screen');near.reserve.off.wrinkles=Array(500).fill('draw');
  const ceilingOwned = owned(near), initial = JSON.stringify(near);let writes = 0;
  playbookUI.open(near,{maxStored:500,onSave:p=>{saved=p;writes++}});
  move('screen','remove');one('[data-save]').click();eq(writes,0,'cannot save 501 stored cards');
  eq(JSON.stringify(near),initial,'unsavable draft leaves source intact');
  if (!one('[data-deck-status]').textContent.trim() && !one('[data-save]').disabled) throw new Error('no explanation for blocked save');
  move('draw','add');click('[data-save]');eq(writes,1,'different owned card can fill the open slot');
  eq(saved.reserve.off.wrinkles.length,500,'storage respects host limit');
  eq(saved.off.wrinkles.includes('draw'),true,'saved the requested exchange');
  eq(owned(saved),ceilingOwned,'all 514 play copies survive');
  // Slots other than the four base calls are upper bounds, not a quota to be filled.
  const light=packs.newPlaybook();
  for(const s of ['off','def'])for(const pile of ['wrinkles','tactics']){
    light.reserve[s][pile]=light[s][pile];light[s][pile]=[];
  }
  playbookUI.open(light,{onSave:p=>{saved=p}});count('wrinkles',0,14);count('tactics',0,14);count('base',4,4);
  click('[data-save]');eq(owned(saved),owned(light),'a base-only deck is playable without discarding any cards');eq(saved.off.wrinkles,[],'optional piles stay empty');
  // Same exchange at the signature archive ceiling: the player-specific cards are never discarded.
  saved=null;playbookUI.open(pb,{maxUnusedSignatures:1,onSave:p=>{saved=p}});click('[data-category="signatures"]');
  click(attr('data-sig-store',players[0].id));one('[data-save]').click();eq(saved,null,'do not normalize away excess inactive signatures');
  click(attr('data-sig-equip',players[3].id));click('[data-save]');
  eq(saved.reserveSignatures.map(x=>x.id),[players[0].id],'different signature safely fills the freed shared slot');
};
