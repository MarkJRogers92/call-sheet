'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core='../forks/call-sheet/core/',D=require(core+'data'),R=require(core+'resolver'),S=require(core+'signatures');
const familyCases=[
  // Template, role, style, affected duel, favorable and counter play/call examples.
  ['qb_audible','QB','Field Architect','K','stick/cover3','stick/zone_pressure'],
  ['qb_keeper','QB','Run-First Weapon','F','_/cover1','_/cover1/spy'],
  ['rb_express','RB','Gap Hammer','K','_/two_high','_/run_fit'],
  ['rb_wheel','RB','Third-Down Weapon','K','_/zone_pressure','_/two_high'],
  ['wr_special','X','Route Sculptor','K','_/cover1','_/two_high'],
  ['wr_special','Z','Space Hunter','K','_/cover3','_/cover1'],
  ['wr_special','X','Catch-Point Ace','F','_/cover1','_/two_high'],
  ['rb_express','RB','One-Cut Burner','K','_/zone_pressure','_/run_fit'],
  ['te_seam','TE','Seam Hunter','K','_/cover3','_/cover1'],
  ['ol_wall','LT','Power Edge','G','power/cover3','outside_zone/cover3'],
  ['dl_unleashed','RUSH','Speed Bender','G','deep_cross/_','screen/_'],
  ['lb_hunt','MIKE','Box Enforcer','K','inside_zone/_','pa_boot/_'],
  ['cb_island','FCB','Mirror Corner','F','vertical_shot/cover3','inside_zone/cover3'],
  ['s_robber','FS','Centerfielder','K','stick/cover3','vertical_shot/cover3']
];
for(const [template,role,archetype,duel,good,bad] of familyCases){
  test(template+' ('+archetype+'): its edge and counter move exactly one real duel',()=>{
    const player={id:'case-'+template,name:'Test Turner',role,archetype};
    const spec=S.specFor(player),{def:card,kind}=S.register(spec);
    assert.equal(spec.template,template);
    for(const [example,value] of [[good,1],[bad,-1]]){
      const [pid,cid,t]=example.split('/'),sign=spec.side==='off'?1:-1;
      const ctx={off:{},def:{},play:pid==='_'?card:D.PLAYS[pid],call:cid==='_'?card:D.CALLS[cid],
        offTactics:[],defTactics:t?[t]:[]};
      ctx[spec.side][role]=player;
      if(kind==='tactic')ctx[spec.side+'Tactics'].push(card.id);
      // Use a competitive lineup (some otherwise cap out at 85% on the base card alone).
      for(const [side,roles] of [['off',D.OFF_ROLES],['def',D.DEF_ROLES]])for(const r of Object.keys(roles)){
        const quality=side==='off'?55:55+(template==='dl_unleashed'&&value===-1?12:template==='lb_hunt'&&value===1?-20:sign*7);
        ctx[side][r]={...ctx[side][r],traits:Object.fromEntries(D.TRAITS.map(t=>[t,quality]))};
      }
      const snap=R.buildSnap(ctx),match=snap.duels.find(d=>d.key===duel);
      assert.deepEqual(snap.duels.flatMap(d=>d.mods.filter(m=>m.src.includes('matchup')).map(m=>[d.key,m.v])),[[duel,value*sign]]);
      const without={...card};delete without.signatureMatchup;
      if(kind==='play')ctx.play=without;else if(kind==='call')ctx.call=without;else D.TACTICS[spec.id]=without;
      const base=R.buildSnap(ctx).duels.find(d=>d.key===duel);
      if(kind==='tactic')D.TACTICS[spec.id]=card;
      assert.equal(match.raw-base.raw,value*sign,'the extra step is measured against the identical underlying card');
      // resolve actually rolls the threshold presented by buildSnap.
      assert.notEqual(match.p,base.p,'a real roll can cross the changed threshold');
      {
        const clock={down:1,distance:10},roll=()=>{let at=0;return {next:()=>at++===snap.duels.indexOf(match)?(match.p+base.p)/2:.01,gauss:()=>0}};
        assert.equal(R.resolve(snap,roll(),clock).wins[snap.duels.indexOf(match)],match.p>base.p);
      }
    }
    assert.match(card.matchupText,/\+1/);assert.match(card.matchupText,/−1/);
    assert.ok(card.text.includes(card.matchupText),'existing deck and gameplay faces render the same scouting copy');
  });
}
test('signature scouting and roster stories use the same rules as the face, without minting a prospect card',async()=>{
  const {loadEngine}=require('../tools/harness');
  globalThis.__DL_TEST__={};const e=loadEngine({seed:970,fullRuntime:true});
  e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay,cs=globalThis.CallSheet;cg.enable();
  const me=e.T('Chicago Metropolitan'),recruit=e.universe.recruits.find(r=>r.pos==='QB');
  recruit.style='Field Architect';const rule=cs.signatures.describe(cs.signatures.specFor(cs.adapter.toBattlePlayer(recruit,'QB'))).def.matchupText;
  const get=()=>cg.recruitCard(recruit.id).match(/<aside class="cs-signature-story"[^]*?<\/aside>/)[0];
  const shown=get();assert.ok(rule&&shown.includes(rule));recruit.trueNow=25;recruit.upside=99;assert.equal(get(),shown);
  assert.equal(cs.packs.cardDef('sig_'+recruit.id),null);
  const bp=cs.adapter.lineupFromTeam(me).lineup.off.QB,spec=cs.signatures.specFor(bp),pb=e.universe.callSheet.playbook;
  const actual=cs.signatures.register(spec).def.matchupText;
  for(const pile of ['reserveSignatures','signatures']){
    pb.signatures=[];pb.reserveSignatures=[];pb[pile]=[spec];assert.ok(cg.playerCard(bp.id).includes(actual));
  }
  require(core+'playbook-ui'); // UI is loaded separately by the browser, not by the engine harness.
  assert.ok(cs.playbookUI.faceHTML(spec.id).includes(actual));
});

test('legacy echoes have a smaller upside, full counter, and never gain an award-sized matchup',()=>{
  const player={id:'legacy-x',role:'X',name:'Lee Cole',archetype:'Space Hunter'};
  for(const tier of [0,3]){
    const spec=S.specFor(player,{tier,legacy:{name:'Joe Lane',last:'Lane',playerId:'old'}});
    const card=S.describe(spec).def;
    assert.match(card.matchupText,/\+0\.5/);assert.match(card.matchupText,/−1/);
    for(const [call,n] of [['cover3',.5],['cover1',-1],['two_high',0]]){
      const snap=R.buildSnap({play:card,call:D.CALLS[call],off:{X:player},def:{}});
      assert.equal(snap.duels[1].mods.find(m=>m.src.includes('matchup'))?.v||0,n);
    }
  }
});
