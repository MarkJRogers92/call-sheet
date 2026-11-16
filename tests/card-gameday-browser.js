'use strict';
// Call Sheet fork: "Coach with Cards" plays this week's real game as a card battle and records it into the season.
// Opens from the next-matchup card, runs the battle in its frame on both real rosters, records the final through the
// transactional path, saves the program's card playbook, and returns to the dynasty.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const shots=process.env.CARD_SHOTS||'';
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page);
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const before=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug());
    await page.evaluate(()=>{const launch=window.__callSheetDynasty.launch;window.__callSheetDynasty.launch=()=>{const cfg=launch();return{...cfg,settings:{...cfg.settings,mode:'snap',control:'offense'},scouting:{confidence:50}}}});
    if(shots)await page.screenshot({path:`${shots}/c0-hub.png`});
    await page.locator('#broadcastFeature [data-coach-cards]').click();
    const frameEl=await page.waitForSelector('#cardGameDay iframe',{timeout:10000});
    const frame=await frameEl.contentFrame();
    // The battle starts on the real teams: the user's real quarterback is on the field.
    await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req),null,{timeout:20000});
    if(await frame.$('#gotIt')){if(shots)await page.screenshot({path:`${shots}/c1-howto.png`});await frame.click('#gotIt',{force:true})}
    await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy,null,{timeout:30000});
    const qb=await frame.evaluate(()=>{const b=window.__slice.b;return b.teams[b.user].lineup.off.QB});
    assert.ok(qb.portraitSeed,'battle players carry their Dynasty Lab portrait');
    const realQb=await page.evaluate(id=>{const t=window.__DL_TEST__.selected();return t.roster.find(p=>String(p.id)===id)?.name},qb.id);
    assert.equal(realQb,qb.name,'the battle quarterback is the real starter');
    // Program wiring: both teams arrive with their scheme edges and staff, labeled by source.
    const prog=await frame.evaluate(()=>{const b=window.__slice.b;return['home','away'].map(sd=>({edges:b.teams[sd].edges,cmd:b.teams[sd].coach.commandBonus}))});
    assert.ok(prog.every(t=>t.edges&&Array.isArray(t.edges.off)&&Array.isArray(t.edges.def)&&t.cmd),'program edges and staff bonuses are attached');
    assert.ok(prog.flatMap(t=>[...t.edges.off,...t.edges.def]).every(e=>/^(Scheme fit|Weekly prep|Crowd noise|Still installing)/.test(e.src)),'every program edge names its source');
    // Every player on the field is a card with his real face; hovering shows his grades and game line.
    const field=await frame.evaluate(()=>({cards:document.querySelectorAll('#field .pl').length,faces:[...document.querySelectorAll('#field .pl .pface')].filter(i=>i.getAttribute('href')).length}));
    assert.equal(field.cards,22,'22 player cards on the field');assert.ok(field.faces>=20,'field cards carry portraits');
    await frame.evaluate(()=>{const el=document.querySelector('#field .pl');el.dispatchEvent(new PointerEvent('pointerenter',{clientX:300,clientY:300,bubbles:false}))});
    assert.match(await frame.locator('#ptip').innerText(),/THIS GAME|This game/i,'hovering a field card shows the player card');
    await frame.evaluate(()=>document.querySelector('#field .pl').dispatchEvent(new PointerEvent('pointerleave')));
    const fog=await frame.evaluate(()=>{
      const b=window.__slice.b,el=[...document.querySelectorAll('#field .pl')].find(x=>x.dataset.side!==b.user);
      el.dispatchEvent(new PointerEvent('pointerenter',{clientX:300,clientY:300}));
      const tip=document.querySelector('#ptip'),rows=[...tip.querySelectorAll('.tt-traits > div')].map(r=>({range:r.querySelector('b').textContent,bar:parseFloat(r.querySelector('i').style.getPropertyValue('--v'))}));
      el.dispatchEvent(new PointerEvent('pointerleave'));return rows;
    });
    assert.ok(fog.length&&fog.every(r=>r.range.includes('–')&&r.bar===Number(r.range.split('–')[0])),'opponent bars use the displayed range, never the exact hidden trait');
    assert.ok(await frame.locator('#coachingRead').isVisible(),'public coaching cues appear before selecting a play');
    assert.ok(await frame.locator('#backfield').isVisible(),'the real roster provides a backfield choice');
    const command=await frame.evaluate(()=>window.__slice.req.options.command);
    for(const mode of ['receiving','power','starter','auto']){
      await frame.selectOption('#backfield',mode);
      const fieldBack=await frame.evaluate(()=>{
        const b=window.__slice.b,p=b.teams[b.user].lineup.off.RB,el=document.querySelector('#field .pl[data-lineup="off"][data-role="RB"]');
        return{mode:b.backfieldMode[b.user],id:p.id,fieldId:el.dataset.pid,command:window.__slice.req.options.command};
      });
      assert.equal(fieldBack.mode,mode);assert.equal(fieldBack.fieldId,fieldBack.id);assert.equal(fieldBack.command,command);
    }
    if(shots)await page.screenshot({path:`${shots}/c2-before-hand.png`});
    if(await frame.evaluate(()=>window.__slice.req?.kind==='snap'&&window.__slice.req.role==='off')){
      await frame.locator('#hand .card.k-play:not(.blocked)').first().click();
      assert.match(await frame.locator('#side').innerText(),/Exact forecasts are unavailable/);
      assert.equal(await frame.locator('#field .edge,#field .risk,#field .threat').count(),0,'fog cannot reveal exact matchup margins through field colors');
    }
    if(shots)await page.screenshot({path:`${shots}/c2-battle.png`});
    await page.setViewportSize({width:390,height:844});
    await frame.selectOption('#backfield','receiving');
    await frame.locator('#hand .card.k-play:not(.blocked)').first().click();
    const phone=await frame.evaluate(()=>{const h=document.querySelector('#hand'),r=h.getBoundingClientRect();return{right:r.right,width:innerWidth,scrolls:h.scrollWidth>h.clientWidth}});
    assert.ok(phone.right<=phone.width+1&&phone.scrolls,'phone hand stays inside the screen and scrolls to all cards');
    if(shots)await page.screenshot({path:`${shots}/c2-phone.png`});
    await page.setViewportSize({width:1400,height:900});
    await frame.selectOption('#backfield','auto');
    // Call one snap by hand, then let the coordinators finish the game.
    // (When the game opens on a 4th-down choice the hand is hidden, so the call goes through the game's own submit path.)
    const called=await frame.evaluate(()=>{const r=window.__slice.req;if(!r||r.kind!=='snap')return false;const p=r.options.plays.find(x=>!x.blocked&&x.cost<=r.options.command);if(!p)return false;window.__slice.go({type:'call',play:p.id,tactics:[]});return true});
    if(called){await page.waitForTimeout(1200);if(shots)await page.screenshot({path:`${shots}/c3-clash.png`})}
    await frame.waitForFunction(()=>!window.__slice.busy,null,{timeout:60000});
    assert.ok(await frame.locator('#lastSnap').isVisible(),'the next decision keeps a short explanation of the last snap');
    await frame.locator('#hand').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    if(shots)await page.screenshot({path:`${shots}/c3-coaching.png`});
    await frame.evaluate(()=>{document.getElementById('modal').classList.remove('on')});
    const rewardsBefore=await page.evaluate(()=>window.DynastyCardGameDay.meta());
    await page.evaluate(()=>{const record=window.__callSheetDynasty.record;let first=true;window.__callSheetDynasty.record=(...args)=>{if(first){first=false;return{ok:false,error:'Temporary recorder failure'}}return record(...args)}});
    await frame.click('#bSim',{force:true});
    for(let i=0;i<400;i++){if(await frame.$('#retryRecord'))break;const f=await frame.$('#modal [data-o]');if(f)await f.click({force:true}).catch(()=>{});await page.waitForTimeout(150)}
    await frame.waitForSelector('#retryRecord');
    assert.equal(await frame.locator('#openPack').count(),0,'failed recording offers no rewards');
    const failed=await page.evaluate(()=>window.DynastyCardGameDay.meta());
    for(const key of ['playbook','games','players','moments'])assert.deepEqual(failed[key],rewardsBefore[key],`failed recording leaves ${key} unchanged`);
    assert.equal((await page.evaluate(()=>window.__DL_TEST__.preseasonDebug())).played,before.played,'failed recording leaves the schedule unchanged');
    await frame.click('#retryRecord');await frame.waitForSelector('#openPack');
    await page.waitForTimeout(600);
    const finalText=await frame.locator('#modal').innerText();
    if(shots)await page.screenshot({path:`${shots}/c4-final.png`});
    assert.match(finalText,/SAVED TO YOUR SEASON/,`the final is recorded: ${finalText.slice(0,200)}`);
    const after=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug());
    assert.ok(after.played>before.played,'the scheduled game is now played');
    // Pack, then home.
    await frame.click('#openPack',{force:true});
    for(let i=0;i<60;i++){if(await frame.$('#pk'))break;const tp=await frame.$('#toPack');if(tp){await tp.click({force:true});await page.waitForTimeout(300);continue}await page.waitForTimeout(150)}
    await frame.click('#pk',{force:true});
    for(let i=0;i<80;i++){if(await frame.$('.slot.pickable'))break;await page.waitForTimeout(150)}
    if(shots)await page.screenshot({path:`${shots}/c5-pack.png`});
    await (await frame.$$('.slot.pickable'))[0].click({force:true});
    for(let i=0;i<80;i++){const cut=await frame.$('.cutme');if(cut){await cut.click({force:true});await page.waitForTimeout(900);continue}const br=await frame.$('.branch');if(br){await br.click({force:true});await page.waitForTimeout(2000);continue}if(await frame.$('#home'))break;await page.waitForTimeout(200)}
    await frame.click('#home',{force:true});
    await page.waitForFunction(()=>!document.querySelector('#cardGameDay'),null,{timeout:10000});
    const meta=await page.evaluate(()=>window.DynastyCardGameDay.meta());
    assert.ok(meta&&meta.playbook&&meta.playbook.packsOpened===1,'the pack pick is saved in the dynasty');
    assert.equal(meta.games,1);assert.equal(meta.playbook.record.w+meta.playbook.record.l,1,'retry grants game progression exactly once');
    if(shots)await page.screenshot({path:`${shots}/c6-back.png`});
    // The Card Program panel appears on This Week, under the next-matchup card.
    await page.waitForSelector('#cardProgram',{timeout:5000});
    assert.match(await page.locator('#cardProgram .cpn-stats').innerText(),/Packs\s*1/,'the panel shows the opened pack');
    // Card Settings: switch scouting fog off and the mode to key downs; the dynasty keeps the choice.
    await page.locator('#cardProgram [data-card-settings]').click();
    await page.waitForSelector('#cardSettings form');
    if(shots)await page.screenshot({path:`${shots}/c7-settings.png`});
    await page.locator('#cardSettings input[name="int:scouting-fog"]').uncheck();
    await page.locator('#cardSettings input[name="mode"][value="key"]').check();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#cardSettings').count(),0,'Escape closes settings');
    assert.equal((await page.evaluate(()=>window.DynastyCardGameDay.meta())).settings.mode,'snap','cancel keeps the old settings');
    await page.locator('#cardProgram [data-card-settings]').click();
    await page.locator('#cardSettings input[name="int:scouting-fog"]').uncheck();
    await page.locator('#cardSettings input[name="mode"][value="key"]').check();
    await page.locator('#cardSettings button[type="submit"]').click();
    const saved=await page.evaluate(()=>window.DynastyCardGameDay.meta().settings);
    assert.equal(saved.integrations['scouting-fog'],false,'scouting fog is switched off');assert.equal(saved.mode,'key');
    assert.match(await page.locator('#cardProgram .cpn-foot').innerText(),/Key downs/);
    // Advance the week: opponents open packs and the news shows Around the League.
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    await page.locator('#hubAdvance').click();
    await page.waitForFunction(()=>document.querySelectorAll('#cardProgram .cpn-news').length>0,null,{timeout:10000});
    const news=await page.evaluate(()=>window.DynastyCardGameDay.news());
    assert.ok(news.length>0&&news.every(n=>n.year&&n.week),'news is saved with the week it happened');
    // Every player has a card: his player page shows the battle card with his card career.
    const pid=await page.evaluate(()=>{const me=window.__DL_TEST__.selected(),c=window.DynastyCardGameDay.meta().players;return Object.keys(c).find(id=>me.roster.some(p=>String(p.id)===id))});
    assert.ok(pid,'card careers are saved for your players');
    await page.locator('[data-client-tab="roster"]:visible, [data-tab="roster"]:visible').first().click();
    await page.waitForTimeout(400);
    // Selecting a roster row opens his player page.
    const seen=await page.evaluate(()=>{const c=window.DynastyCardGameDay.meta().players;const el=[...document.querySelectorAll('[data-rd-player]')].find(e=>e.offsetParent&&c[e.dataset.rdPlayer]);if(el){el.id='csCareerRow';return el.dataset.rdPlayer}return null});
    assert.ok(seen,'a roster player with a card career is listed');
    await page.locator('#csCareerRow').click();await page.waitForSelector('#playerBattleCard',{timeout:5000});
    assert.match(await page.locator('#playerBattleCard').innerText(),/Duels[\s\S]*Card games/,'the player page shows his card career from the coached game');
    if(shots)await page.locator('#playerBattleCard').screenshot({path:`${shots}/c9-playercard.png`});
    await page.keyboard.press('Escape');await page.locator('[data-client-tab="dashboard"]:visible, [data-tab="dashboard"]:visible').first().click();
    if(shots){await page.locator('#cardProgram').scrollIntoViewIfNeeded();await page.locator('#cardProgram').screenshot({path:`${shots}/c8-news.png`})}
    // The weekly newsletter carries the card battle notes for the week.
    await page.evaluate(()=>document.querySelector('[data-tab="newsletter"]').click());
    await page.waitForSelector('#newsCallSheet',{timeout:8000});
    assert.match(await page.locator('#newsCallSheet').innerText(),/Card Player of the Game|Opponents' packs/);
    if(shots)await page.locator('#newsCallSheet').screenshot({path:`${shots}/c10-news.png`});
    // Recruits have prospect cards: scouted ranges, projected role, and how they compare with your starter.
    await page.evaluate(()=>document.querySelector('[data-tab="recruiting"]').click());
    await page.evaluate(()=>document.querySelector('[data-recruit]').click());
    await page.waitForSelector('#recruitBattleCard',{timeout:5000});
    const rc=await page.locator('#recruitBattleCard').innerText();
    assert.match(rc,/SCOUTING \d+%/i);assert.match(rc,/Projects as/);assert.match(rc,/starter|no starter/i);
    if(shots)await page.locator('#recruitBattleCard').screenshot({path:`${shots}/c11-recruit.png`});
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[],'no console errors');
    console.log('ok  Coach with Cards plays the real game, records it, saves the playbook and returns to the dynasty');
    console.log('ok  the Card Program panel shows your playbook and Around the League news; Card Settings save with the dynasty');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
