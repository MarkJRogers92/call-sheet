// Runs inside a fresh Quick Battle page. Only the starting field position/deck is set up;
// all calls, substitutions between paired plays, and hand comparisons use their UI.
module.exports=async function exerciseCoachingChoices(){
  const {battle:B,packs:P,roster:R}=window.CallSheet,slice=window.__slice;
  const find=s=>document.querySelector(s);
  const ensure=(ok,msg)=>{if(!ok)throw new Error(msg)};
  const click=s=>{const e=find(s);ensure(e&&!e.disabled,'Missing or unavailable '+s);e.click()};
  const wait=async check=>{
    const until=Date.now()+12000;
    while(!check()){if(Date.now()>until)throw new Error('Timed out: '+check);await new Promise(r=>setTimeout(r,30))}
  };
  click('[data-team]');
  click('.headset-options summary');
  const readOption='[data-headset="readOption"]';
  ensure(!find(readOption).checked,'QB handles reads by default');
  click(readOption);
  ensure(slice.save().settings.headset.readOption,'Coach opts in before resuming the saved drive');
  click('#pbv');click('[data-hand-test]');
  const summaries=()=>[...document.querySelectorAll('#de-hand-report details')];
  ensure(summaries().length===10,'Ten hands before editing');
  const before=summaries().map(el=>el.textContent);
  click('[data-owned-card="deep_cross"] [data-move="remove"]');
  ensure(summaries().length===10,'Ten paired hands after editing');
  ensure(summaries().some((el,i)=>el.textContent!==before[i]),'Removing a play changes a sample');
  click('#de-hand-report summary');ensure(summaries()[0].open,'Hand details open');
  click('[data-cancel]');

  window.SliceFX.instant=true;
  const start=(down,distance)=>{
    const home=R.preset('ground');home.decks=P.decksOf(P.newPlaybook());
    home.decks.off.openingScript='out_and_up';home.decks.off.base[0]='read_option';
    const b=B.create({home,away:R.preset('tempo'),user:'home',mode:'snap',control:'both',seed:'v21:1'});
    window.DynastyGameEngineV2.startGame(b.game);
    Object.assign(b.game,{down,distance,fieldPosition:25,possession:'home'});B.advance(b);
    slice.save().activeBattle={seed:b.seed,battle:B.save(b)};
    slice.resumeBattle();if(!find('#hand .fan'))click('#sheetToggle');
  };
  const select=id=>click('#hand [data-id="'+id+'"]');
  const finishCall=async()=>{click('#snapBtn');await wait(()=>!slice.busy)};
  start(3,2);select('read_option');await finishCall();
  const mesh=find('dialog[open]');ensure(mesh?.textContent.includes('Read the end'),'Read Option opens the post-snap decision');
  const checkpoint=slice.save().activeBattle.battle;
  ensure(JSON.parse(checkpoint).pending.kind==='mesh','Pending read saves before the choice');
  // Recreate the view from the saved checkpoint through the same action as Resume.
  mesh.close();slice.resumeBattle();
  ensure(find('dialog[open] [data-mesh="keep"]'),'Resume restores both branches');
  click('dialog[open] [data-mesh="give"]');await wait(()=>!slice.busy);
  ensure(slice.b.log.find(e=>e.play==='read_option')?.participants?.carrier==='RB','Give records the back as the carrier');

  start(1,10);
  for(let i=0;i<2;i++){
    select('quick_out');ensure(find('.same-look')?.textContent.includes(i+'/2'),'Count completed boundary routes');
    await finishCall();
  }
  select('quick_out');ensure(find('.same-look')?.textContent.includes('2/2'),'Both completed outs visible');
  click('[data-same-look="out_and_up"]');await finishCall();
  const film=slice.b.log.find(e=>e.play==='out_and_up');
  ensure(film?.cornerStep?.outs===2,'Film preserves both completed outs');
  const protectedQB=film.duelResults[0].won;
  ensure(film.cornerStep.reached===protectedQB,'Film respects the protection duel');
  const cornerRead=/drove on the out|stayed over the top/.test(film.text);
  ensure(protectedQB?cornerRead:!cornerRead&&/before the route developed/i.test(film.text),'Film describes the route only if the pocket holds');
  return film.text;
};
