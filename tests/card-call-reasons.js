'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle'),D=require('../forks/call-sheet/core/data'),Ro=require('../forks/call-sheet/core/roster');
const team=Ro.preset('ground'),b={teams:{home:team},log:[]};
function request(ids,tactics=[],role='off'){
 const catalog=role==='off'?D.PLAYS:D.CALLS;
 return {kind:'snap',role,side:'home',situation:{field:35,down:1,distance:10},look:{box:{confirmed:true,value:'normal'},shell:{confirmed:false,value:1},lean:{confirmed:false,value:null},pressure:{confirmed:false,value:false}},offLook:{family:{confirmed:false}},options:{command:3,plays:ids.map(id=>({id,card:catalog[id],cost:catalog[id].cost})),tactics:tactics.map((id,slot)=>({id,card:D.TACTICS[id],cost:D.TACTICS[id].cost,slot}))}};
}
test('quick choices and full coaching share the selected card’s confirmed reason, not a generic coverage tip',()=>{
 const req=request(['inside_zone','pa_boot']);req.look.box.value='loaded';
 const quick=B.snapDecisions(b,req).choices;
 for(const [id,rule] of [['inside_zone',/loaded box.*Gate/i],['pa_boot',/fake.*help/i]]){
  assert.match(quick.find(c=>c.id===id).detail,rule);
  assert.match(B.coachingRead(req,id).join(' '),rule);
 }
 assert.ok(quick[0].detail.includes(team.lineup.off.RB.name));
 req.look.box.confirmed=false;assert.doesNotMatch(JSON.stringify(B.snapDecisions(b,req).choices),/loaded box|crowded linebackers/i);
});
test('confirmed film links a defensive call to its actual coverage counter; hidden family cannot change choices',()=>{
 const req=request(['cover2_trap'],[],'def');
 req.offLook.family={confirmed:true,value:'quick'};
 assert.match(B.snapDecisions(b,req).choices[0].detail,/quick.*Key/i);
 req.offLook.family.confirmed=false;const before=B.snapDecisions(b,req);
 req.offLook.family.value='run';assert.deepEqual(B.snapDecisions(b,req),before);
});
test('a tactic suggestion fits this play, this hand and this budget; no hidden projection needed',()=>{
 assert.equal(typeof B.tacticRead,'function');
 const req=request(['inside_zone','deep_cross'],['max_protect','hard_count']);
 req.look.pressure={confirmed:true,value:true};
 const read=()=>B.tacticRead(req,'deep_cross',team.lineup.off);
 assert.equal(read().id,'max_protect');assert.match(read().reason,/protection.*fewer/i);
 assert.equal(B.tacticRead(req,'inside_zone',team.lineup.off),null);
 req.options.command=1;assert.equal(read(),null);
 req.options.command=3;req.options.tactics.shift();assert.equal(read(),null);
});
test('information recommendations distinguish shown pressure from confirmed pressure; a no-op route is not recommended',()=>{
 assert.equal(typeof B.tacticRead,'function');
 const req=request(['screen'],['route_adjust','hard_count']);req.look.pressure.value=true;
 const read=()=>B.tacticRead(req,'screen',team.lineup.off);
 assert.equal(read().id,'hard_count');assert.match(read().reason,/bluff|real/i);
 req.look.pressure.confirmed=true;assert.equal(read(),null);
});
test('selected tactics explain a mismatch and never expose an unconfirmed family',()=>{
 assert.equal(typeof B.tacticRead,'function');
 const req=request(['inside_zone'],['max_protect']);
 assert.match(B.tacticRead(req,'inside_zone',team.lineup.off,[0]).reason,/only.*protection/i);
 const def=request(['cover2_trap'],['film_tell','press'],'def');
 const first=B.tacticRead(def,'cover2_trap',team.lineup.def);
 assert.equal(first.id,'film_tell');
 def.offLook.family.value='quick';assert.deepEqual(B.tacticRead(def,'cover2_trap',team.lineup.def),first);
 def.offLook.family.confirmed=true;assert.equal(B.tacticRead(def,'cover2_trap',team.lineup.def).id,'press');
});
test('no confirmed tell still explains the selected play’s first matchup',()=>{
 const req=request(['quick_slant']);
 const cues=B.coachingRead(req,'quick_slant').join(' ');
 assert.match(cues,/Quick Slant.*release/i);assert.doesNotMatch(cues,/confirmed man/i);
});
test('a selected timeout warns about no Key benefit on an early down',()=>{
 const req=request(['inside_zone'],['timeout_settle']);
 assert.match(B.tacticRead(req,'inside_zone',team.lineup.off,[0]).reason,/timeout.*no.*(boost|help|bonus)/i);
});
test('a player-owned line tactic names an actual duel, only with its owner on the field',()=>{
 const S=require('../forks/call-sheet/core/signatures'),spec=S.specFor(team.lineup.off.LT);
 S.register(spec);
 const req=request(['deep_cross'],[spec.id]);
 const note=B.tacticRead(req,'deep_cross',team.lineup.off);assert.ok(note);
 assert.ok(note.name.includes(spec.last));assert.match(note.reason,/protection/i);
 assert.equal(B.tacticRead(req,'deep_cross',{...team.lineup.off,LT:{id:'backup'}}),null);
});
test('do not suggest paying for man/zone information on a run with no coverage matchup',()=>{
 const req=request(['inside_zone','quick_slant'],['motion']);
 assert.equal(B.tacticRead(req,'inside_zone',team.lineup.off),null);
 assert.equal(B.tacticRead(req,'quick_slant',team.lineup.off).id,'motion');
});
test('per-card guidance describes the actually confirmed tell, not a defender reacting before the snap',()=>{
 const req=request(['draw']);req.look.pressure={confirmed:true,value:true};
 assert.match(B.callReason(req,D.PLAYS.draw),/confirmed rush.*find the lane/i);
 req.look.pressure.confirmed=false;assert.equal(B.callReason(req,D.PLAYS.draw),'');
});
test('named play: identify confirmed counters, but never infer that a hidden spy is absent',()=>{
 const S=require('../forks/call-sheet/core/signatures');
 const wr=S.register(S.specFor({id:'guide-x',role:'X',name:'Arlo Miles',archetype:'Route Sculptor'})).def;
 const req=request([wr.id]);req.look.shell={confirmed:true,value:2};
 assert.match(B.callReason(req,wr),/two deep safeties.*−1/i);
 req.look.shell.confirmed=false;assert.match(B.callReason(req,wr),/if/i);
 const keeper=S.register(S.specFor({id:'guide-qb',role:'QB',name:'Sid West',archetype:'Run-First Weapon'})).def;
 req.look.coverage={confirmed:true,value:'man'};
 assert.match(B.callReason(req,keeper),/if.*spy/i);
});
test('named blocking tactic reflects the chosen run and does not recommend playing into its counter',()=>{
 const S=require('../forks/call-sheet/core/signatures'),spec=S.specFor(team.lineup.off.LT);S.register(spec);
 const req=request(['power','outside_zone'],[spec.id]);
 assert.match(B.tacticRead(req,'power',team.lineup.off).reason,/Power.*\+1/i);
 assert.equal(B.tacticRead(req,'outside_zone',team.lineup.off),null);
 assert.match(B.tacticRead(req,'outside_zone',team.lineup.off,[0]).reason,/Outside Zone.*−1/i);
});
test('resume refreshes only stale printed signature definitions in an offered hand, not cost, slot, RNG or selected snap',()=>{
 const S=require('../forks/call-sheet/core/signatures'),spec=S.specFor(team.lineup.off.LT),card=S.register(spec).def;
 const b=B.create({home:team,away:Ro.preset('aerial'),seed:'old-hand',user:'home',control:'offense',mode:'snap'});
 B.advance(b);
 b.pending=request(['power'],[spec.id]);b.pending.options.tactics[0]={id:spec.id,slot:3,cost:0,card:{...card,text:'Old wall',signatureMatchup:undefined,matchupText:undefined}};
 const raw=B.save(b),resumed=B.load(raw);
 assert.equal(resumed.pending.options.tactics[0].card.text,card.text);
 assert.match(B.tacticRead(resumed.pending,'power',team.lineup.off).reason,/Power.*\+1/);
 const copy=JSON.parse(B.save(resumed));copy.pending.options.tactics[0].card=JSON.parse(raw).pending.options.tactics[0].card;
 assert.deepEqual(copy,JSON.parse(raw));
});
test('Flea Flicker can take Max Protect but has no protection duel; it only loses a route',()=>{
 const R=require('../forks/call-sheet/core/resolver');
 const req=request(['flea_flicker'],['max_protect']);req.look.pressure={confirmed:true,value:true};
 const ctx={off:team.lineup.off,def:team.lineup.def,play:D.PLAYS.flea_flicker,call:D.CALLS.zone_pressure,offTactics:['max_protect']};
 const mods=R.buildSnap(ctx).duels.flatMap(d=>d.mods.filter(m=>m.src==='Max protect'||m.src==='One fewer route').map(m=>[d.key,m.v]));
 assert.deepEqual(mods,[['F',-1]]);
 assert.doesNotMatch(B.callReason(req,ctx.play),/less time to protect/i);
 assert.equal(B.tacticRead(req,'flea_flicker',team.lineup.off),null);
 assert.match(B.tacticRead(req,'flea_flicker',team.lineup.off,[0]).reason,/no protection duel.*fewer route/i);
});
test('old pressure on film never overrules a hard count confirming no current rush',()=>{
 const req=request(['quick_slant']);req.look.heat=true;req.look.pressure={confirmed:true,value:false};
 const read=B.coachingRead(req,'quick_slant').join(' ');
 assert.doesNotMatch(read,/Confirmed pressure:/i);assert.match(read,/no pressure|no extra rush/i);
});
test('a selected tactic can be removed after switching to an incompatible play without submitting a snap',()=>{
 const src=require('node:fs').readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
 const fn=src.slice(src.indexOf('function tacticClick('),src.indexOf('function wirePlayCard('));
 const sel={play:'inside_zone',tac:[2]},t={id:'max_protect',slot:2,card:D.TACTICS.max_protect};
 require('node:vm').runInNewContext(fn+";tacticClick(t,'Only on plays with a protection duel')",{
  busy:false,sel,t,document:{activeElement:null},err:'',S:{init(){},error(){},tick(){}},renderHand(){},refresh(){}
 });
 assert.deepEqual(sel.tac,[]);
});
test('quick Heat still helps a screen’s Key after a hard count, but does not imply the current rush is unknown',()=>{
 const req=request(['screen']);req.look.heat=true;req.look.pressure={confirmed:true,value:false};
 const v=B.snapDecisions(b,req);assert.match(v.clue,/no extra rush/i);assert.match(v.choices[0].detail,/Key/i);
 assert.doesNotMatch(v.clue+' '+v.choices[0].detail,/rush is (not confirmed|unknown)/i);
});
