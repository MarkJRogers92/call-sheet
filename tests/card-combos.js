'use strict';
// Combos: each recipe fires on its real sequence and not otherwise (including the Establish the Run fix: it needs two
// actual runs), defensive combos credit the defense, and combos stay occasional in full games.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),Ro=core('roster.js'),D=core('data.js');
const P=id=>D.PLAYS[id],C=id=>D.CALLS[id];
function battleAt(drive){
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),user:'home',mode:'snap',seed:'combos'});B.advance(b);
  b.drive={key:`${b.game.drive}:${b.game.possession}`,fams:[],plays:[],calls:[],results:[],firsts:0,...drive};return b;
}
const runs={fams:['run','run'],plays:['inside_zone','power'],results:[{family:'run',yards:5},{family:'run',yards:4}]};

test('Establish the Run needs two actual runs before play-action',()=>{
  assert.equal(B.comboFor(battleAt(runs),P('pa_boot'))?.id,'establish');
  assert.equal(B.comboFor(battleAt({fams:['quick','deep'],plays:['quick_slant','deep_cross']}),P('pa_boot')),null,'two passes do not set it up');
  assert.equal(B.comboFor(battleAt({fams:['run'],plays:['power']}),P('pa_boot')),null,'one run is not enough');
});

test('every offensive recipe fires on its sequence only',()=>{
  assert.equal(B.comboFor(battleAt(runs),P('vertical_shot'))?.id,'shot_after_run');
  assert.equal(B.comboFor(battleAt({fams:['quick','quick'],plays:['quick_slant','stick']}),P('four_verts'))?.id,'sell_the_slant');
  assert.equal(B.comboFor(battleAt({fams:['quick','run'],plays:['quick_slant','power']}),P('four_verts')),null);
  assert.equal(B.comboFor(battleAt({fams:['quick'],plays:['stick'],calls:[{pressure:1,shell:1,shown:true}]}),P('screen'))?.id,'screen_the_heat');
  assert.equal(B.comboFor(battleAt({fams:['quick'],plays:['stick'],calls:[{pressure:0,shell:2,shown:false}]}),P('screen')),null);
  assert.equal(B.comboFor(battleAt({fams:['run'],plays:['outside_zone']}),P('counter_trey'))?.id,'counter_the_flow');
  assert.equal(B.comboFor(battleAt({fams:['run'],plays:['inside_zone']}),P('counter_trey')),null);
  assert.equal(B.comboFor(battleAt(runs),P('statue_left')),null,'trick plays are their own surprise');
});

test('defensive recipes need the call and help the defense',()=>{
  const shown={fams:['quick'],plays:['stick'],calls:[{pressure:1,shell:1,shown:true}]};
  const bail=B.comboFor(battleAt(shown),P('quick_slant'),C('cover2_trap'));
  assert.equal(bail?.id,'show_and_bail');assert.equal(bail.side,'def');assert.ok(bail.v<0);
  assert.equal(B.comboFor(battleAt(shown),P('quick_slant')),null,'without the call, no defensive combo');
  const stuffed={fams:['run','run'],plays:['inside_zone','power'],results:[{family:'run',yards:1},{family:'run',yards:-2}]};
  assert.equal(B.comboFor(battleAt(stuffed),P('inside_zone'),C('run_fit'))?.id,'wall_up');
  assert.equal(B.comboFor(battleAt(runs),P('inside_zone'),C('run_fit')),null,'runs that gained ground do not');
});

test('full games: combos are occasional, both sides earn them, and the duel shows the label',()=>{
  const seen={},perGame=[];let labeled=0,defEarned=0;
  for(let i=0;i<60;i++){
    const b=B.simulate({home:Ro.preset(['aerial','tempo','ground'][i%3]),away:Ro.preset(['ground','aerial','tempo'][i%3]),seed:`combo-games-${i}`});
    assert.equal(b.game.status,'final');assert.ok(!b.final.engineError,b.final.engineError);
    let n=0;
    for(const e of b.log)if(e.type==='snap'){for(const ev of e.events||[])if(ev.type==='combo'&&ev.id!=='chain_gang'){seen[ev.id]=(seen[ev.id]||0)+1;n++;if(ev.side===e.defSide)defEarned++}
      if(e.duels?.some(d=>(d.mods||[]).some(m=>/^COMBO: /.test(m.src))))labeled++}
    perGame.push(n);
  }
  const avg=perGame.reduce((a,x)=>a+x,0)/perGame.length;
  assert.ok(avg>=1&&avg<=12,`combos per game ${avg.toFixed(1)}`);
  assert.ok(Object.keys(seen).length>=5,`recipes seen: ${JSON.stringify(seen)}`);
  assert.ok(defEarned>0,'the defense earns its combos');assert.ok(labeled>0,'combo edges are labeled on the duel');
});

test('zone and boot share the live backfield, price the actual mate and respect public reads',()=>{
  const b=battleAt(runs),side=b.game.possession,opponent=side==='home'?'away':'home';
  const req={kind:'snap',role:'off',side,look:{lean:{value:'run',confirmed:false}},options:{
    command:1,plays:[{id:'inside_zone',cost:0},{id:'pa_boot_plus',cost:1}]
  }};
  const line=b.teams[side].lineup.off,def=b.teams[opponent].lineup.def;
  const read=B.sameLookPair(b,req,'inside_zone');
  for(const p of [line.QB,line.RB,line.TE,def.MIKE,def.SET])assert.ok(read.read.includes(p.name));
  assert.equal(read.mate.id,'pa_boot_plus');assert.equal(read.mate.reason,'');assert.equal(read.mate.cost,1);
  assert.match(read.setup,/next boot/);assert.doesNotMatch(read.setup,/leaning run/);
  req.look.lean.confirmed=true;assert.match(B.sameLookPair(b,req,'inside_zone').setup,/leaning run/);
  assert.equal(B.sameLookPair(b,req,'pa_boot_plus').mate.id,'inside_zone');
  req.options.command=0;assert.match(B.sameLookPair(b,req,'inside_zone').mate.reason,/Command/);
  const fourWide={...line,TE:{...line.TE,pos:'WR'}};
  req.options.plays[1].blocked=core('resolver.js').playBlocked(P('pa_boot_plus'),fourWide);
  assert.match(B.sameLookPair(b,req,'inside_zone').mate.reason,/inline tight end/);
  req.options.plays.pop();assert.match(B.sameLookPair(b,req,'inside_zone').mate.reason,/Outside this hand/);
  assert.equal(B.sameLookPair(b,req,'power'),null);
  b.comboLog={[side]:{1:['establish']}};
  assert.match(B.sameLookPair(b,req,'inside_zone').setup,/used this half/);
  const defense={...req,role:'def',side:opponent};
  const contain=B.sameLookPair(b,defense,'run_fit');
  assert.ok(contain.read.includes(def.SET.name));assert.equal(contain.mate,undefined);
  b.drive.fams=['quick','run'];assert.equal(B.sameLookPair(b,defense,'run_fit'),null);
});

test('the zone and boot chalk diagrams start at the same mesh and end on different paths',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),window={CallSheet:{data:D}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../forks/call-sheet/slice/cards.js'),'utf8'),{window});
  const cards=window.SliceCards,run=cards.pairRoutes(P('inside_zone')),boot=cards.pairRoutes(P('pa_boot_plus'));
  assert.equal(run[0].d,boot[0].d);assert.equal(run[0].mesh,true);assert.notEqual(run[1].d,boot[1].d);
  assert.equal(boot[2].receiver,true);assert.equal(run.length,2);
  for(const id of ['inside_zone','pa_boot_plus']){
    assert.ok(cards.diagram(id,'off').includes(run[0].d));assert.ok(cards.routeFor(P(id)).includes(run[0].d));
  }
});
