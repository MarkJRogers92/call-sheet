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

test('a playbook saves one compatible combo per unit and reconciles evolved payoff copies',()=>{
  const packs=core('packs.js'),pb=packs.newPlaybook();
  packs.setComboPlan(pb,'off',{id:'establish',play:'pa_boot'});
  packs.setComboPlan(pb,'def',{id:'heat_check',play:'zone_pressure'});
  assert.deepEqual(packs.decksOf(pb).off.comboPlan,{id:'establish',play:'pa_boot'});
  assert.deepEqual(packs.decksOf(pb).def.comboPlan,{id:'heat_check',play:'zone_pressure'});
  assert.throws(()=>packs.setComboPlan(pb,'off',{id:'establish',play:'inside_zone'}),/active deck/);
  assert.throws(()=>packs.setComboPlan(pb,'off',{id:'wall_up',play:'pa_boot'}),/active deck/);
  pb.off.wrinkles=pb.off.wrinkles.map(id=>id==='pa_boot'?'pa_boot_plus':id);
  packs.repairComboPlans(pb);
  assert.equal(pb.off.comboPlan.play,'pa_boot_plus');
  for(let i=pb.off.wrinkles.length-1;i>=0;i--)if(pb.off.wrinkles[i]==='pa_boot_plus')packs.moveCard(pb,'off','wrinkles',i,false);
  assert.equal(pb.off.comboPlan,undefined,'a payoff stored in the collection is not equipped');
});

function installedPayoff(challenge,plan,history,source){
  const b=B.createChallenge(challenge),{side,role}=b.pending,hand=b.hands[side];
  const pile=b.piles[side][role].wrinkle,from=pile[source];
  b.decks[side][role].comboPlan=plan;
  for(const cards of [hand.wrinkles,pile.draw,pile.discard])if(cards!==from){
    for(let i=cards.length-1;i>=0;i--)if(cards[i]===plan.play)from.push(...cards.splice(i,1));
  }
  b.drive={key:`${b.game.drive}:${b.game.possession}`,fams:[],plays:[],calls:[],results:[],firsts:0,...history};
  return B.load(B.save(b));
}
test('an installed payoff moves one physical copy after the real setup, once per possession and across a reload',()=>{
  const plan={id:'establish',play:'pa_boot'};
  let b=installedPayoff('need_six',plan,{fams:['run'],plays:['inside_zone']},'discard');
  assert.equal(b.pending.comboPayoff,undefined);
  const untouched=B.save(b);assert.throws(()=>B.submit(b,{type:'combo_payoff'}),/No installed combo/);assert.equal(B.save(b),untouched);
  b=installedPayoff('need_six',plan,runs,'discard');
  const side=b.user,hand=b.hands[side],pile=b.piles[side].off.wrinkle;
  assert.equal(b.pending.comboPayoff?.id,'establish');assert.equal(b.pending.comboPayoff?.cost,1);
  const all=()=>[...hand.wrinkles,...pile.draw,...pile.discard,...b.exhausted[side]].sort();
  const copies=all(),rng=structuredClone(b.rng),situation=structuredClone(b.game),paid=hand.command;
  const result=B.submit(b,{type:'combo_payoff'});
  assert.equal(result.comboPayoff,undefined);assert.equal(result.situation.down,situation.down);
  assert.equal(B.comboRead(b,result,P(plan.play))?.id,'establish');assert.equal(hand.wrinkles.filter(x=>x===plan.play).length,1);
  assert.equal(hand.command,paid-1);assert.deepEqual(all(),copies);assert.deepEqual(b.rng,rng);assert.deepEqual(b.game,situation);
  pile.discard.push(...hand.wrinkles.splice(hand.wrinkles.indexOf(plan.play),1));
  const resumed=B.load(B.save(b));assert.equal(resumed.pending.comboPayoff,undefined);
  assert.throws(()=>B.submit(resumed,{type:'combo_payoff'}),/No installed combo/);
});

test('defensive combo payoff readiness uses the prior loss and keeps enough Command to call the blitz',()=>{
  const plan={id:'heat_check',play:'zone_pressure'},history={results:[{family:'deep',yards:-4}]};
  const b=installedPayoff('goal_line_stand',plan,history,'draw'),side=b.user;
  assert.equal(b.pending.comboPayoff?.play,plan.play);
  b.hands[side].command=1;
  assert.throws(()=>B.submit(b,{type:'combo_payoff'}),/No installed combo/);
  b.hands[side].command=5;
  const next=B.submit(b,{type:'combo_payoff'});
  assert.ok(next.options.plays.some(c=>c.id===plan.play));assert.equal(next.options.command,4);
});

test('full games: combos are occasional, both sides earn them, and the duel shows the label',()=>{
  const seen={};let labeled=0,defEarned=0,comboSnaps=0,totalSnaps=0;
  for(let i=0;i<60;i++){
    const b=B.simulate({home:Ro.preset(['aerial','tempo','ground'][i%3]),away:Ro.preset(['ground','aerial','tempo'][i%3]),seed:`combo-games-${i}`});
    assert.equal(b.game.status,'final');assert.ok(!b.final.engineError,b.final.engineError);
    for(const e of b.log){
      if(e.type!=='snap')continue;
      totalSnaps++;
      const combos=(e.events||[]).filter(ev=>ev.type==='combo'&&ev.id!=='chain_gang');
      assert.equal(new Set(combos.map(ev=>ev.side)).size,combos.length,'each side can earn at most one combo per snap');
      if(combos.length)comboSnaps++;
      for(const ev of combos){
        seen[ev.id]=(seen[ev.id]||0)+1;
        if(ev.side===e.defSide)defEarned++;
      }
      if(e.duels?.some(d=>(d.mods||[]).some(m=>/^COMBO: /.test(m.src))))labeled++;
    }
  }
  // Both sides can earn one on the same play. Measure how often a snap has a combo.
  const rate=comboSnaps/totalSnaps;
  assert.ok(comboSnaps>=60&&rate<=1/12,`combos on ${(rate*100).toFixed(1)}% of snaps`);
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

test('authored route shapes survive the card, field and recorded snap result',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const window={CallSheet:{data:D}},ctx=vm.createContext({window,D,YD:10,MIDY:266});
  vm.runInContext(fs.readFileSync(require.resolve('../forks/call-sheet/slice/cards.js'),'utf8'),ctx);
  const src=fs.readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
  vm.runInContext(src.slice(src.indexOf('function conceptTracks('),src.indexOf('// ================================================================ broadcast bug')),ctx);
  const origin={'o:QB':{x:450,y:266},'o:RB':{x:425,y:266},'o:SLOT':{x:490,y:412},'o:Z':{x:490,y:462},'d:FS':{x:585,y:266}};
  const frames=[];
  let ball;Object.assign(ctx,{
    S:{whistle(){}},FX:{ease:{inOut:t=>t},async tween(ms,fn){for(const t of [0,.22,.4,.65,1]){fn(t);frames.push({t,ball:{...ball},pos:structuredClone(ctx.pos)})}}},
    formation(){return {dir:1,los:500,dots:Object.fromEntries(Object.keys(origin).map(k=>[k,{role:k.split(':')[1]}]))}},
    placeDot(k,x,y){ctx.pos[k]={x,y}},placeBall(x,y,h=0){ball={x,y,h}}
  });
  const snap=async(play,props)=>{
    frames.length=0;ctx.pos=structuredClone(origin);
    await ctx.animatePlay({play,sit:{},yards:8,...props});
    return frames;
  };
  const bubble=P('rpo_bubble'),cards=window.SliceCards;
  for(const part of cards.pairRoutes(bubble))assert.ok(cards.diagram(bubble.id,'off').includes(part.d)&&cards.routeFor(bubble).includes(part.d));
  await snap('outside_zone',{kind:'run',participants:{carrier:'RB',defender:'FS'}});
  assert.ok(frames[1].pos['o:RB'].y>300&&frames[1].pos['o:RB'].x<435,'stretch outside before cutting upfield');
  assert.equal(ball.x,580);assert.equal(ball.y,ctx.pos['o:RB'].y);
  await snap('outside_zone',{kind:'run',yards:-2,participants:{carrier:'RB'}});
  assert.equal(ball.x,480);
  await snap('pa_boot',{kind:'catch',completed:true,participants:{target:'Z'}});
  assert.deepEqual(frames[1].pos['o:RB'],frames[1].pos['o:QB'],'show the fake at the mesh');
  assert.ok(frames[2].pos['o:QB'].y<250&&frames[2].ball.h===0,'the quarterback keeps it and boots out');
  assert.equal(ball.x,580);assert.equal(ball.y,ctx.pos['o:Z'].y);
  await snap('rpo_bubble',{kind:'catch',completed:true,participants:{target:'SLOT'}});
  assert.ok(frames[1].pos['o:SLOT'].y>420&&frames[1].pos['o:SLOT'].x<490,'receiver bubbles backward toward the sideline');
  assert.deepEqual([frames[3].ball.x,frames[3].ball.y],[frames[3].pos['o:SLOT'].x,frames[3].pos['o:SLOT'].y],'slot owns ball before the final run');
  assert.equal(ball.x,580);
  await snap('pa_boot',{kind:'catch',completed:true,checkdown:{role:'RB'},participants:{target:'RB'}});
  assert.deepEqual([ball.x,ball.y],[580,ctx.pos['o:RB'].y]);
  await snap('pa_boot',{kind:'catch',completed:true,primaryTarget:'SLOT',participants:{target:'SLOT'}});
  assert.deepEqual([ball.x,ball.y],[580,ctx.pos['o:SLOT'].y]);assert.ok(ctx.pos['o:SLOT'].y<origin['o:SLOT'].y);
  const away=ctx.conceptTracks({kind:'run',participants:{carrier:'RB'}},P('outside_zone'),origin,-1,345)['o:RB'];
  assert.equal(away.at(-1).x,345);assert.ok(away[2].x<origin['o:RB'].x);
  await snap('pa_boot',{kind:'sack',yards:-6,participants:{sacker:'FS'}});
  assert.equal(ball.x,440);assert.deepEqual([ball.x,ball.y],[ctx.pos['o:QB'].x,ctx.pos['o:QB'].y]);
  await snap('rpo_bubble',{kind:'inc',turnover:'interception',participants:{target:'SLOT',defender:'FS'}});
  assert.deepEqual([ball.x,ball.y],[ctx.pos['d:FS'].x,ctx.pos['d:FS'].y],'a picked pass ends with its recorded defender');
  await snap('rpo_bubble',{kind:'inc',yards:0,participants:{target:'SLOT'}});
  assert.equal(ball.h,0);assert.ok(ball.x>ctx.pos['o:SLOT'].x,'an ordinary incompletion falls away from the receiver');
});
