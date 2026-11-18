'use strict';
// Open each part of a player's card story through the same controls as a coach.
// Seed the two ownership states and a recorded alumnus so neither depends on a random breakout.
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {chromiumPath}=require('./helpers/chromium-path');
const {testPageURL}=require('./helpers/browser-url');
const {startNewDynasty}=require('./helpers/start-new-dynasty');

async function go(page,tab){
  const more=page.locator('.client-mobile-nav [data-client-more]');
  if(await more.isVisible())await more.click();
  await page.locator(`#clientRail [data-client-tab="${tab}"]`).click();
  await page.locator(`#${tab}.active`).waitFor();
}

async function fits(node,label){
  const bounds=await node.evaluate(el=>{
    const r=el.getBoundingClientRect();
    return {left:r.left,right:r.right,width:innerWidth,card:el.scrollWidth-el.clientWidth,doc:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(bounds.left>=-1&&bounds.right<=bounds.width+1&&bounds.card<=1&&bounds.doc<=1,`${label} horizontal overflow: ${JSON.stringify(bounds)}`);
}

async function exercise(browser,width,height){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',isMobile:width<500,hasTouch:width<500});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(testPageURL());await startNewDynasty(page,{cardGame:true});
    const fixture=await page.evaluate(()=>{
      const cg=window.DynastyCardGameDay,cs=window.CallSheet,test=window.__DL_TEST__,team=test.selected();
      cg.enable();
      const pb=window.__callSheetDynasty.committedPlaybook();
      const make=(p,role,info)=>cs.signatures.specFor(cs.adapter.toBattlePlayer(p,role),info);
      const active=make(team.roster.find(p=>p.pos==='QB'),'QB',{earned:'River Bowl',tier:2});
      const stored=make(team.roster.find(p=>p.pos==='WR'),'X',{earned:'Conference Final',legacy:{playerId:'retired-wr',name:'Cole Lane',last:'Lane',number:80}});
      // This existing fixture produces an actual, findable playerArchive record, not just a binder stub.
      test.retiredNumberFixture();
      const alumnus=cs.signatures.specFor({id:'RNFIX',name:'Legend Fixture',role:'QB',pos:'QB',archetype:'Field Architect',number:12},{earned:'Homecoming'});
      pb.signatures=[active,alumnus];pb.reserveSignatures=[stored];
      window.__callSheetDynasty.save({playbook:pb,players:{...cg.meta().players,RNFIX:{w:17,l:9,big:3,games:4}}});
      cg.syncSignatures(); // The regular departure path moves the archived QB into the binder.
      return {school:team.name,players:[active,stored].map(s=>({id:s.playerId,name:cs.signatures.buildAny(s).def.name+(s.tier?' '+'★'.repeat(s.tier):''),earned:s.earned}))};
    });
    await go(page,'recruiting');
    const recruit=page.locator('#prospectCards [data-card-recruit]').first();
    const surname=(await recruit.locator('b').innerText()).trim().split(/\s+/).pop();
    const ownership=()=>page.evaluate(()=>{const p=window.__callSheetDynasty.committedPlaybook();return [...p.signatures,...p.reserveSignatures].map(s=>s.id)});
    const before=await ownership();await recruit.click();
    const prospect=page.locator('#recruitBattleCard .cs-signature-story');await prospect.waitFor({timeout:8000});
    const preview=await prospect.innerText();
    assert.match(preview,/possible|potential|projected/i,'prospect does not already own the signature');
    assert.ok(['Audible','Keeper','Wheel','Express','Special','Seam','Wall','Unleashed','Hunt','Island','Robber'].some(s=>preview.includes(surname+' '+s)),`named signature missing: ${preview}`);
    assert.doesNotMatch(preview,/\bIn (?:deck|collection)\b/i);
    assert.match(await prospect.locator('.cs-signature-matchup').innerText(),/\+1 (?:vs|on) .+; −1 (?:vs|on) .+\./,'projected signature states a real strength and counter');
    assert.deepEqual(await ownership(),before,'viewing a preview does not award a signature');
    await fits(prospect,'prospect story');await page.keyboard.press('Escape');await prospect.waitFor({state:'hidden'});

    await go(page,'roster');
    for(const [i,player] of fixture.players.entries()){
      await page.locator(`#rosterCards [data-card-player="${player.id}"]`).click();
      const story=page.locator('#playerBattleCard .cs-signature-story');await story.waitFor();
      const text=await story.innerText();
      assert.ok(text.includes(player.name),`expected earned card "${player.name}", saw "${text}"`);
      assert.equal(await story.locator('small').innerText(),i===0?'In deck':'In collection');
      assert.ok(text.includes(player.earned),'records where this signature was earned');
      assert.match(await story.locator('.cs-signature-matchup').innerText(),i===1?/\+0\.5 vs .+; −1 vs .+/:/\+1 vs .+; −1 vs .+/);
      await fits(story,'roster story');await page.keyboard.press('Escape');await story.waitFor({state:'hidden'});
    }

    await go(page,'collection');
    const binder=page.locator('#cardBinder');
    await binder.locator('.cpn-ring > summary').click();
    const open=binder.locator('[data-card-alumnus="RNFIX"]');await open.click();
    const alumni=page.locator('#alumniBattleCard');await alumni.waitFor();
    const record=await alumni.innerText();assert.ok(record.includes('Legend Fixture'));
    assert.ok(record.includes(fixture.school),'the archived school is shown');assert.match(record,/17\s*[–-]\s*9/,'recorded duels');
    await fits(alumni,'archived career card');await page.keyboard.press('Escape');await alumni.waitFor({state:'hidden'});
    assert.ok(await open.isVisible(),'returns to the open binder');
    assert.ok(await open.evaluate(el=>el===document.activeElement),'focus returns to the same player in the binder');
    await fits(binder,'collection');
    assert.deepEqual(errors,[]);console.log(`ok  card journey: prospect preview, two signature ownership states, alumni and keyboard return (${width}×${height})`);
  }finally{await page.close()}
}

(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{for(const [width,height] of [[1400,900],[390,844]])await exercise(browser,width,height)}
  finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
