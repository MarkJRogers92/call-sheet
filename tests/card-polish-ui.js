'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
function handlerSource(name){
 const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
 assert.notEqual(start,-1,`${name} exists`);
 const lines=source.slice(start).split('\n');
 const end=lines[0].endsWith('}')?0:lines.findIndex(line=>line==='}');
 assert.ok(end>=0,`${name} closes`);
 return lines.slice(0,end+1).join('\n');
}
function run(name,context,args=[],helpers=[]){
 const code=[...helpers,name].map(handlerSource).join('\n');
 return vm.runInNewContext(code+`\n;${name}(...args)`,{...context,args});
}
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('guided drive panel offers an explicit exit and optional help',()=>{
 const html=run('guidedDriveHTML',{b:{guidedDrive:{active:true}},req:{},sel:{play:null},O:{hint:()=>'<run>'},esc});
 assert.match(html,/Finish guided drive/);assert.match(html,/&lt;run&gt;/);assert.match(html,/<details/);
 assert.equal(run('guidedDriveHTML',{b:{},esc}), '');
});
test('postgame takeaway is optional, escapes evidence and never silently edits the deck',()=>{
 const B={postgameTakeaway:()=>({summary:'<edge>',evidence:'3 plays',recommendation:'Try draw',playId:'draw'})};
 const swap={removeName:'Short Pass',addName:'Draw'};
 const html=run('takeawayHTML',{B,b:{},esc,lossSwapFor:()=>swap});assert.match(html,/data-film-swap/);assert.match(html,/&lt;edge&gt;/);assert.match(html,/3 plays/);assert.match(html,/Optional adjustment/);assert.match(html,/data-film-deck/);
 assert.equal(run('takeawayHTML',{B:{postgameTakeaway:()=>null},b:{},esc}), '');
});
test('adaptation panel makes clues readable without declaring a guaranteed counter',()=>{
 const html=run('adaptationHTML',{B:{adaptationRead:()=>({summary:'They show <pressure>',detail:'A screen may punish it.',counterPlay:'screen'})},D:{PLAYS:{screen:{name:'HB Screen'}}},b:{},req:{},esc});
 assert.match(html,/Opponent adjustment/);assert.match(html,/&lt;pressure&gt;/);assert.match(html,/may/);assert.match(html,/Try HB Screen/);
});
test('field story leads with the recorded play outcome and keeps the duel secondary and fog-safe',()=>{
 const B=require('../forks/call-sheet/core/battle'),D=require('../forks/call-sheet/core/data');
 const e={play:'power',offSide:'home',defSide:'away',yards:3,kind:'run',sit:{down:2,distance:5,score:{home:0,away:0}},
  after:{down:3,possession:'home'},score:{home:0,away:0},duelResults:[{won:true}],
  duels:[{key:'G',label:'Block',offNames:['Tackle'],defNames:['Edge'],mods:[]}]};
 const html=(extra={},fog=2)=>{
  const event={...e,...extra},note={...B.matchupStory(event),detail:'player-rating edge'};
  return run('matchupStoryHTML',{B,D,setupReceipt:()=>'',sequenceReceipts:()=>'',fogSpread:()=>fog,esc},[event,note]);
 };
 assert.match(html(),/^<strong>Power · \+3 yards<\/strong><span>Block: Tackle beat Edge/);
 assert.doesNotMatch(html(),/player-rating/);assert.match(html({},0),/player-rating/);
 assert.match(html({yards:6,after:{down:1,possession:'home'}}),/\+6 yards · First down<\/strong>/);
 assert.match(html({score:{home:7,away:0}}),/Touchdown · \+3 yards<\/strong>/);
 assert.match(html({kind:'inc',yards:0}),/Incomplete · 0 yards<\/strong>/);
 assert.match(html({kind:'sack',yards:-5,turnover:'fumble'}),/Fumble lost · −5 yards<\/strong>/);
 assert.match(html({kind:'inc',turnover:'interception'}),/Interception<\/strong>/);
});
test('field highlights require a completed scoring swing, clutch stop or reached combo',()=>{
 const e={offSide:'home',defSide:'away',yards:1,sit:{down:4,distance:2,period:4,score:{home:17,away:20}},
  after:{possession:'home'},score:{home:17,away:20},duelResults:[{won:true},{won:true}],
  duels:[{key:'G',mods:[]},{key:'K',mods:[{src:'COMBO: Timed Throw'}]}]};
 const highlight=(extra={})=>run('completedFieldMoment',{},[{...e,...extra}])?.label;
 assert.equal(highlight(),undefined,'an ordinary snap never gets a label');
 assert.equal(highlight({score:{home:23,away:20}}),'Lead change');
 assert.equal(highlight({score:{home:20,away:20}}),'Game tied');
 assert.equal(highlight({after:{possession:'away'}}),'Fourth-down stop');
 assert.equal(highlight({turnover:'fumble'}),'Clutch takeaway');
 const events=[{type:'combo',id:'timing',name:'Timed Throw',duel:'K'}];
 assert.equal(highlight({events}),'Combo completed · Timed Throw');
 assert.equal(highlight({events,duelResults:[{won:false},{won:true}]}),undefined,'the Key boost was never reached');
 assert.equal(highlight({events,duelResults:null}),undefined,'the pre-snap look cannot trigger a cue');
 assert.equal(highlight({events,penalty:{label:'Holding'}}),undefined);
});
test('an optional staff highlight uses recorded names and rings the decisive player',()=>{
 const B=require('../forks/call-sheet/core/battle'),D=require('../forks/call-sheet/core/data');
 const e={play:'power',offSide:'home',defSide:'away',yards:-1,kind:'run',sit:{down:4,distance:2,period:4,score:{home:17,away:20}},
  after:{possession:'away'},score:{home:17,away:20},duelResults:[{won:false}],
  duels:[{key:'G',label:'Point of attack',offNames:['Tackle'],defNames:['Edge <Drew>'],offRoles:['LT'],defRoles:['RUSH'],mods:[]}]};
 const panel={dataset:{},innerHTML:'',hidden:true},marked=[];
 const mark={classList:{add:key=>marked.push(key)}};
 const ctx={B,D,$:()=>panel,save:{settings:{fieldHighlights:false}},setupReceipt:()=>'',sequenceReceipts:()=>'',fogSpread:()=>2,esc,
  layer:{dots:{'d:RUSH':mark},players:{appendChild:dot=>assert.equal(dot,mark)}}};
 const draw=()=>run('showMatchupStory',ctx,[e],['completedFieldMoment','matchupStoryHTML']);
 draw();assert.equal(panel.hidden,true);assert.deepEqual(marked,[]);
 ctx.save.settings.fieldHighlights=true;
 draw();assert.equal(panel.hidden,false);assert.equal(panel.dataset.moment,'stop');
 assert.match(panel.innerHTML,/Fourth-down stop[\s\S]+Edge &lt;Drew&gt; beat Tackle/);
 assert.deepEqual(marked,['decisive']);
});
test('the last coaching review compares the shown estimate, result and matchup on either side',()=>{
 const B=require('../forks/call-sheet/core/battle');
 for(const [challenge,play,otherTactic,estimate] of [
   ['need_six','vertical_shot','max_protect','4.2 yd gain · 1st down 32% · Shown look'],
   ['goal_line_stand','two_high','bracket','0–4 yd allowed · Opp. TD 10–55% · Play tendencies']
 ]){
  const b=B.createChallenge(challenge);
  assert.equal(B.coachedSnapReview(b),null);
  B.submit(b,{type:'call',play,tactics:[],coachingReview:{estimate}});
  const e=b.log[b.coachedSnap.index],saved=B.save(b),review=B.coachedSnapReview(b);
  assert.equal(review.estimate,estimate);
  assert.equal(review.actual,B.snapVerdict(e,b.user).result);
  assert.equal(review.detail,B.snapVerdict(e,b.user).detail);
  assert.ok(review.alternatives.includes(otherTactic));
  const practice=B.practiceCoachedSnap(b,otherTactic);
  assert.ok(practice.actual&&practice.detail);
  assert.deepEqual(B.practiceCoachedSnap(B.load(saved),otherTactic),practice);
  assert.equal(B.practiceCoachedSnap(b,'unknown'),null);
  assert.equal(B.save(b),saved,'practice leaves the entire battle intact, including its score and RNG');
  const html=run('coachedSnapReviewHTML',{B,b,esc});
  assert.ok(html.includes(estimate));
  assert.ok(html.includes(esc(review.actual))&&html.includes(esc(review.detail)));
  assert.match(html,/Practice the same look/);
 }
});
test('a flag review shows the game’s enforcement and offers no alternate tactic',()=>{
 const B=require('../forks/call-sheet/core/battle');
 const b={user:'home',coachedSnap:{index:0,role:'off',estimate:'<3 yd gain'},
  log:[{userCalled:true,play:'deep_cross',penalty:{label:'Holding'},text:'Flag: Holding on Home, 10 yards.'}]};
 const html=run('coachedSnapReviewHTML',{B,b,esc});
 assert.match(html,/&lt;3 yd gain.*Flag: Holding/s);
 assert.doesNotMatch(html,/Practice the same look/);
 assert.equal(B.practiceCoachedSnap(b,'max_protect'),null);
});
test('resume advances an unfinished checkpoint instead of awarding a premature final',()=>{
 let advanced=0,decided=0;
 const battle={pending:null,log:[],game:{status:'playing',score:{home:0,away:0}}};
 const context={B:{load:()=>battle,headsetSettings:require('../forks/call-sheet/core/battle').headsetSettings},DYN:{},save:{activeBattle:{battle},settings:{}},setWeather(){},drawField(){},renderBug(){},setMarkers(){},$:()=>({classList:{remove(){}},innerHTML:''}),go:()=>advanced++,decide:()=>decided++};
 run('resumeBattle',context);assert.equal(advanced,1);assert.equal(decided,0);
 battle.game.status='final';run('resumeBattle',context);assert.equal(decided,1);
});
test('a resumed offensive look drops an unknown opening-script badge without hiding the rest of the look',()=>{
 const el={innerHTML:''},req={kind:'snap',role:'off',options:{openingScript:'unknown'},look:{box:{value:'normal'},shell:{value:1},pressure:{value:false},coverage:{confirmed:false},lean:{value:null}}};
 const ctx={$:()=>el,req,D:{PLAYS:{screen:{name:'Screen'}}},esc,lastLook:{}};
 run('renderLook',ctx);assert.match(el.innerHTML,/BOX: normal/);assert.doesNotMatch(el.innerHTML,/Opening script/);
 req.options.openingScript='screen';run('renderLook',ctx);assert.match(el.innerHTML,/Opening script: Screen/);
});
test('setup receipt names the actual players and result only for an adjustment that reached its duel',()=>{
 const e={duelResults:[{won:true},{won:false},{won:true}],duels:[{key:'G',label:'Protection',mods:[]},{key:'K',label:'Boot read',mods:[{src:'Punish the lean',v:2}],offNames:['Cal <Reed>'],defNames:['Max Neal']},{key:'F',mods:[]}],lean:'run'};
 assert.match(run('setupReceipt',{esc},[e]),/run.*Cal <Reed>.*Max Neal.*lost/i);
 e.duelResults[0].won=false;assert.equal(run('setupReceipt',{esc},[e]),'');
 e.duelResults[0].won=true;e.penalty={label:'Holding'};assert.equal(run('setupReceipt',{esc},[e]),'');
});
test('quick sheet compares offered calls and keeps the selected call, estimate and snap together',()=>{
 const req={role:'off',situation:{down:1},options:{command:2,plays:[{id:'screen',cost:1,card:{name:'Screen'}},{id:'draw',cost:0,card:{name:'Draw'}}]}};
 const forecast={yards:[1.5,5.2],first:[12,24],goal:'first',confidence:'Limited film'};
 const view={clue:'<Light box>',choices:[{id:'screen',label:'Screen',detail:'Look for Alex <West>.',aim:'Dependable gain',forecast}]};
 const html=run('quickSheetHTML',{req,b:{},B:{comboRead:()=>null,sidelineOptions:()=>null},callForecastHTML:(compact,estimate)=>{
   assert.equal(compact,true);assert.equal(estimate,forecast);return '<div id="callForecast">Forecast</div>';
 },sel:{play:'screen',tac:[]},selCost:()=>1,selectedTactics:()=>[],blockedSelection:()=>null,assignmentHTML:()=>'',pinnedCallHTML:()=>'<p>Your last call</p>',matchupHTML:()=>'<b>Featured duel</b>',guidedDriveHTML:()=>'<button>Finish guided drive</button>',quickTacticsHTML:()=>'<p>Pair with a tactic</p>',forecastReadHTML:()=>'',redrawButton:()=>'',redrawText:()=>'',esc,err:''},[view],['rangeText','forecastNumbers','forecastObjective','quickEstimateHTML','comboReceiptHTML','equippedComboHTML','quickFeatureHTML']);
 assert.match(html,/&lt;Light box&gt;/);assert.match(html,/Alex &lt;West&gt;/);assert.match(html,/aria-pressed="true"/);
 assert.match(html,/Dependable gain.*<b>1–6 yd<\/b>.*<b>10–25%<\/b>.*Limited film/);
 assert.match(html,/class="quick-footer">\s*<div class="quick-receipt"><strong>Screen<\/strong>[\s\S]*id="callForecast"[\s\S]*Snap · 1 CMD/);
 assert.match(html,/<details class="quick-details" data-play="screen"\s*>/);
 assert.match(html,/Your last call/);assert.match(html,/Featured duel/);assert.match(html,/id="callForecast"/);assert.match(html,/Finish guided drive/);assert.doesNotMatch(html,/data-quick-call="draw"/);assert.match(html,/Pair with a tactic/);
});
test('standalone signing day previews the named recruit’s possible signature and matchup without awarding a card',()=>{
 const SG=require('../forks/call-sheet/core/signatures'),D=require('../forks/call-sheet/core/data');
 const p={id:'unsigned-wr',name:'Max <Rivers>',role:'X',pos:'WR',archetype:'Route Sculptor',stars:3};
 const def=SG.describe(SG.specFor(p)).def;
 const program=require('../forks/call-sheet/core/program'),save={playbook:{off:{base:['quick_slant'],wrinkles:['vertical_shot']}}};
 const html=run('recruitCard',{SG,D,window:{CallSheet:{program}},save,ROLE_NAME:{X:'Receiver'},starStr:()=>'',gameImpact:()=>'Archetype impact',esc},[{role:'X',prospects:[p]},0]);
 assert.match(html,/data-prospect-job.*Vertical Shot/s);assert.doesNotMatch(html,/Quick Slant/,'the slot has that assignment, not the X vacancy');
 assert.ok(html.includes('Archetype impact'));
 assert.ok(html.includes('Possible signature')&&html.includes(esc(def.name)),'clearly a projected card for the recruit on screen');
 assert.ok(typeof def.matchupText==='string'&&html.includes(esc(def.matchupText)),'same matchup rule as the actual earned card');
 assert.equal(D.PLAYS['sig_unsigned-wr'],undefined,'reading a prospect does not register or grant a card');
});
test('field player tooltip only explains an earned card in the coach’s active deck, not a passive or opponent tell',()=>{
 const SG=require('../forks/call-sheet/core/signatures'),P=require('../forks/call-sheet/core/packs');
 const spec=SG.specFor({id:'field-fixture',name:'Jay <Lane>',role:'X',pos:'WR',archetype:'Route Sculptor'}),def=SG.register(spec).def;
 const pb=P.newPlaybook(),ctx={save:{playbook:pb},b:{user:'home'},P,esc};
 const tell=(side,role)=>run('equippedSignatureHTML',ctx,[side,role,spec.playerId]);
 pb.reserveSignatures=[spec];assert.equal(tell('home','X'),'');
 pb.signatures=[spec];pb.reserveSignatures=[];
 const html=tell('home','X');assert.ok(html.includes(esc(def.name))&&html.includes(esc(def.matchupText)));assert.match(html,/When you play/);
 assert.equal(tell('away','X'),'');assert.equal(tell('home','Z'),'');
});

test('the defensive call sheet names both option assignments alongside an active bracket',()=>{
 const teams={home:{lineup:{def:{SET:{name:'End <Hill>'},WILL:{name:'Luke West'}}}},away:{lineup:{off:{}}}};
 const html=run('assignmentHTML',{req:{role:'def',side:'home',options:{}},sel:{play:'cover3',edgeAssignment:'contain'},teamOf:s=>teams[s],
   selectedTactics:()=>['bracket'],B:{bracketOptions:()=>[{role:'X',name:'Lee'},{role:'Z',name:'Morgan'}]},esc});
 assert.match(html,/data-assignment="edgeAssignment"/);assert.match(html,/value="contain" selected/);
 assert.match(html,/End &lt;Hill&gt; takes RB, Luke West takes QB/);
 assert.match(html,/End &lt;Hill&gt; takes QB, Luke West takes RB/);
 assert.match(html,/data-assignment="bracketRole"/);
});

test('a coach can switch paired calls with legal tactics and cannot select an unavailable mate',()=>{
 const sel={play:'inside_zone',tac:[3,1,2]},ctx={sel,b:{},busy:false,err:'',
  req:{kind:'snap',options:{command:2,plays:[{id:'pa_boot',cost:1}],tactics:[
   {slot:1,cost:1,card:{name:'Protection'}},{slot:2,cost:1,card:{name:'Extra'}},{slot:3,cost:0,card:{name:'Run tactic'}}]}},
  B:{sameLookPair:()=>({mate:{id:'pa_boot'}})},tacticBlock:t=>t.slot===3,
  S:{tick(){}},refresh(){},document:{querySelector:()=>null}};
 ctx.retainCallTactics=play=>run('retainCallTactics',ctx,[play]);
 ctx.choosePlay=id=>run('choosePlay',ctx,[id]);
 ctx.selectedTactics=()=>run('selectedTactics',ctx);
 const event={target:{closest:()=>({dataset:{sameLook:'pa_boot'}})}};
 run('switchSameLook',ctx,[event]);assert.equal(sel.play,'pa_boot');assert.deepEqual(sel.tac,[1]);
 sel.play='inside_zone';ctx.B.sameLookPair=()=>({mate:{id:'pa_boot',reason:'Needs an inline tight end'}});
 run('switchSameLook',ctx,[event]);assert.equal(sel.play,'inside_zone');
});

test('third-down play intent has a keyboard-accessible state and can be switched off without submitting the play',()=>{
 const b={snap:{twoDown:true}},el={focus(){}},h={querySelector:()=>el},req={kind:'snap'};
 const markup=run('twoDownButton',{b});
 assert.match(markup,/type="button"/);assert.match(markup,/aria-pressed="true"/);assert.match(markup,/fourth-and-short/);
 let submitted,saved=false,painted=false;
 run('bindTwoDown',{b,req,busy:false,B:{submit:(_,action)=>{submitted=action;return req}},writeSave(){saved=true},refresh(){painted=true}},[h]);
 el.onclick();
 assert.equal(submitted.type,'two_down');assert.equal(submitted.active,false);assert.ok(saved&&painted);
});

test('rapid postgame cuts move one chosen card per prompt and finish once',async()=>{
 const P=require('../forks/call-sheet/core/packs'),pb=P.newPlaybook();
 pb.capacity.wrinkles=2;pb.off.wrinkles=['screen','pa_boot','deep_cross','power'];pb.def.wrinkles=[];
 let grid,saves=0,finishes=0;
 const waits=[],noop=()=>{};
 const modal={set innerHTML(markup){grid={inert:false,choices:[],appendChild(choice){this.choices.push(choice)}}}};
 const start=source.indexOf('async function cutScreen('),end=source.indexOf('\n}',start)+2;
 const cutScreen=vm.runInNewContext('('+source.slice(start,end)+')',{
  save:{playbook:pb},P,$:id=>id==='#modal'?modal:grid,
  document:{createElement:()=>({appendChild:noop})},card:()=>({style:{},getBoundingClientRect:()=>({})}),
  PT:{embers:noop},S:{burn:noop},FX:{wait:()=>new Promise(resolve=>waits.push(resolve))},
  writeSave:()=>saves++,afterPack:()=>finishes++
 });
 await cutScreen(P.overCapacity(pb));
 const first=grid.choices,playing=first[1].onclick();
 first[1].onclick();first[0].onclick();
 assert.deepEqual(pb.reserve.off.wrinkles,['pa_boot']);
 assert.equal(saves,1);
 waits.shift()();await playing;
 assert.equal(grid.choices.length,3,'a still-overfull deck gets a fresh prompt');
 first[0].onclick();
 const second=grid.choices[2].onclick();
 assert.deepEqual(pb.off.wrinkles,['screen','deep_cross']);
 assert.deepEqual(pb.reserve.off.wrinkles,['pa_boot','power']);
 waits.shift()();await second;
 assert.equal(saves,2);assert.equal(finishes,1);
});

test('featured matchup follows the tactic to its duel and reads odds from the coach’s side',()=>{
 const D=require('../forks/call-sheet/core/data'),B=require('../forks/call-sheet/core/battle');
 const render=(b,play,tactics,fog=0)=>run('matchupHTML',{b,req:b.pending,D,B,sel:{play},selectedTactics:()=>tactics,
  snapChoice:ids=>({play,tactics:ids}),fogSpread:()=>fog,fieldGlow(){assert.equal(fog,0,'fogged players use neutral field markers')},clearGlow(){},drawPlayRoute(){},
  layer:{dots:{}},sameLookHTML:()=>'',esc});
 const offense=B.createChallenge('four_minute_offense');
 assert.match(render(offense,'outside_zone',[]),/Gate · Edge block[\s\S]*37% estimated duel win/);
 const sealed=render(offense,'outside_zone',['seal_block']);
 assert.match(sealed,/Gate · Edge block[\s\S]*37% → 67% · \+30 pts/);
 const fogged=render(offense,'outside_zone',['seal_block'],2);
 assert.match(fogged,/Gate · Edge block[\s\S]*Seal Block helps this block/);
 assert.doesNotMatch(fogged,/%|\d+ pts/);
 const defense=B.createChallenge('goal_line_stand');
 defense.snap.offLook.family={confirmed:true,value:'quick'};
 assert.match(render(defense,'cover1',['disguise']),/Timing throw vs quick[\s\S]*77% → 85% · \+8 pts/);
 assert.match(render(defense,'cover1',['bracket']),/Release vs quick[\s\S]*66% → 52% · -14 pts/);
});

test('defensive Quick Calls and the selected forecast show the same opposing odds and yards allowed',()=>{
 const forecast={yards:[1.5,4.6],first:[22,44],goal:'first',confidence:'Partial film'};
 const ctx={req:{role:'def',side:'away',situation:{field:45,distance:3,down:3},options:{plays:[{id:'cover1',card:{id:'cover1'}}]}},
   sel:{play:'cover1'},b:{},DYN:{scouting:{confidence:70}},selectedTactics:()=>[],snapChoice:()=>({play:'cover1'}),
   B:{filmFog:()=>({spread:1}),quickForecast:()=>forecast,preview:()=>assert.fail('fogged calls must use only the scouting model')},esc};
 const helpers=['rangeText','forecastNumbers','forecastObjective'];
 const html=run('callForecastHTML',ctx,[],[...helpers,'forecastReadHTML']);
 assert.match(html,/Selected defensive call forecast/);
 assert.match(html,/Partial film.*yards allowed <b>1–5 yd.*Opp\. Convert <b>20–45%.*past calls/);
 ctx.req.situation={field:97,distance:3,down:3};
 Object.assign(forecast,{yards:[-1.2,3],goal:'touchdown'});
 const goal=run('callForecastHTML',ctx,[],[...helpers,'forecastReadHTML']);
 assert.match(goal,/yards allowed <b>-2–3 yd.*Opp\. TD <b>20–45%/);
 const quick=run('quickEstimateHTML',ctx,[forecast],helpers);
 assert.match(quick,/Est\. allowed <b>-2–3 yd.*Opp\. TD <b>20–45%.*Partial film/);
 ctx.req.role='off';ctx.req.options.plays=[{id:'spike',card:{id:'spike'}}];ctx.sel.play='spike';
 assert.match(run('callForecastHTML',ctx),/0 yards.*stop the clock/);
});
