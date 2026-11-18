// Call Sheet fork: the card playbook in the save (universe.callSheet) is versioned and repaired on every load.
const assert=require('assert');
const {loadEngine}=require('../tools/harness');
const P=require('../forks/call-sheet/core/packs.js');
(async()=>{
  const e=loadEngine({seed:31,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const n=e.normalizeCallSheet;assert.equal(typeof n,'function');
  // A healthy playbook survives a JSON round trip and normalization unchanged in substance.
  const pb=P.newPlaybook();pb.off.wrinkles.push('draw');pb.off.openingScript='draw';pb.mastery={inside_zone:12};pb.signatures=[{id:'sig_x',playerId:'p1',name:'A B'}];
  let u={callSheet:{version:1,playbook:pb,combos:['establish'],settings:{mode:'snap',control:'both',fast:true,sound:false},games:3,seenHelp:true}};
  u=JSON.parse(JSON.stringify(u));n(u);
  assert.deepEqual(u.callSheet.playbook.off.wrinkles,pb.off.wrinkles);assert.equal(u.callSheet.playbook.mastery.inside_zone,12);
  assert.deepEqual(u.callSheet.settings,{mode:'snap',control:'both',fast:true,sound:false,integrations:{},replays:'all',headset:{fourth:true,inside25:false,defendLead:false,restStarters:true,readOption:false}});assert.equal(u.callSheet.games,3);
  const headsetSave={callSheet:{settings:{headset:{fourth:false,inside25:true,defendLead:'true',extra:true}}}};
  n(headsetSave);assert.deepEqual(headsetSave.callSheet.settings.headset,{fourth:false,inside25:true,defendLead:false,restStarters:true,readOption:false});
  assert.equal(u.callSheet.playbook.off.openingScript,'draw');
  for(const stale of ['inside_zone','fake_punt','unknown',{},'__proto__']){
    const badScript=JSON.parse(JSON.stringify(u));badScript.callSheet.playbook.off.openingScript=stale;n(badScript);
    assert.equal(badScript.callSheet.playbook.off.openingScript,undefined);assert.deepEqual(badScript.callSheet.playbook.off.base,pb.off.base);
  }
  const guided={callSheet:{version:1,playbook:P.newPlaybook(),settings:{guidedDrivePending:true,guidedDriveDone:true,motion:'reduced',readMode:'primary'}}};
  n(guided);assert.equal(guided.callSheet.settings.guidedDrivePending,true);assert.equal(guided.callSheet.settings.guidedDriveDone,true);assert.equal(guided.callSheet.settings.motion,'reduced');assert.equal(guided.callSheet.settings.readMode,'primary');
  const near=P.newPlaybook();near.reserve.off.wrinkles=Array(494).fill('draw');
  require('../forks/call-sheet/core/playbook-ui');
  const ui=globalThis.CallSheet.playbookUI,plan=ui.previewPlan(near,'off','ground',500);assert.equal(plan.storageBlock,null);
  const packed={callSheet:{version:1,playbook:{...near,off:plan.deck,reserve:{...near.reserve,off:plan.reserve}}}},round=JSON.parse(JSON.stringify(packed));
  n(round);assert.deepEqual(round.callSheet.playbook.off,packed.callSheet.playbook.off);assert.deepEqual(round.callSheet.playbook.reserve,packed.callSheet.playbook.reserve);
  // Damage is repaired or reset, never fatal.
  const bad={callSheet:{version:1,playbook:{off:{base:['inside_zone'],wrinkles:[3,'x']},def:{}},combos:'nope',settings:{mode:'warp'},games:-5}};
  n(bad);assert.equal(bad.callSheet.playbook,null,'a broken call sheet resets');assert.deepEqual(bad.callSheet.combos,[]);
  assert.equal(bad.callSheet.settings.mode,'key');assert.equal(bad.callSheet.games,0);
  const junk={callSheet:'garbage'};n(junk);assert.equal(junk.callSheet,undefined,'a non-object is removed');
  const capped={callSheet:{version:1,playbook:{...P.newPlaybook(),capacity:{wrinkles:999,tactics:-3}}}};n(capped);
  assert.deepEqual(capped.callSheet.playbook.capacity,{wrinkles:30,tactics:10});
  // The Around the League log keeps the last 40 valid items, stamped with year and week.
  const log=Array.from({length:50},(_,i)=>({team:'T'+i,card:'draw',rarity:'common',year:2027,week:i}));
  const nl={callSheet:{version:1,newsLog:[...log,{team:5},'x',null,{team:'Z',evolved:'inside_zone_plus',week:'3',junk:{a:1}}]}};n(nl);
  assert.equal(nl.callSheet.newsLog.length,40);assert.deepEqual(nl.callSheet.newsLog.at(-1),{team:'Z',evolved:'inside_zone_plus',week:3});
  assert.equal(nl.callSheet.newsLog[0].team,'T11');
  const pl={callSheet:{version:1,players:{p1:{w:'7',l:3,big:-2,games:1,junk:1},p2:'x'},moments:[{year:2027,week:2,kind:'pog',text:'X',playerId:'p1'},{text:5}]}};n(pl);
  assert.deepEqual(pl.callSheet.players,{p1:{w:7,l:3,big:0,games:1}});assert.equal(pl.callSheet.moments.length,1);
  // A playbook from a newer version refuses to load rather than being silently damaged.
  assert.throws(()=>n({callSheet:{version:99}}),/newer version/);
  // It runs as part of every load.
  e.universe.callSheet={version:1,playbook:{off:{base:[]},def:{base:[]}}};e.normalizeUniverse();assert.equal(e.universe.callSheet.playbook,null);
  console.log('ok  card playbook saves are versioned, repaired and validated on load');
})().then(()=>second()).catch(err=>{console.error('not ok',err.stack);process.exit(1)});
// Signature cards follow their players: a graduate retires to the Ring of Honor, a transfer takes his card with him.
async function second(){
  const e=loadEngine({seed:47,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const u=e.universe,me=u.teams.find(t=>t.name==='Chicago Metropolitan'),other=u.teams.find(t=>t.name!==me.name);
  const [grad,mover,stays]=me.roster.slice(0,3),sig=p=>({id:`sig_${p.id}`,playerId:String(p.id),name:p.name,side:'off',pile:'wrinkles',template:'rb_express'});
  u.callSheet={version:1,playbook:{...P.newPlaybook(),signatures:[sig(grad),sig(mover),sig(stays)],ringOfHonor:[]}};
  e.addToArchive(grad,me,'Graduated');me.roster=me.roster.filter(p=>p!==grad);
  me.roster=me.roster.filter(p=>p!==mover);other.roster.push(mover);
  const moves=globalThis.DynastyCardGameDay.syncSignatures();
  assert.deepEqual(moves.map(m=>m.how).sort(),['ring','transfer']);
  const pb=u.callSheet.playbook;
  assert.deepEqual(pb.signatures.map(s=>s.playerId),[String(stays.id)]);
  assert.equal(pb.ringOfHonor.length,1);assert.equal(pb.ringOfHonor[0].playerId,String(grad.id));assert.equal(pb.ringOfHonor[0].exit,'Graduated');
  assert.ok(pb.history.some(h=>h.kind==='departed'&&h.to===other.name));
  console.log('ok  signature cards retire to the Ring of Honor with graduates and leave with transfers');
}

