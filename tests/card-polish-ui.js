'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
function run(name,context,args=[]){
 const begin=source.indexOf('function '+name+'(');assert.notEqual(begin,-1,`${name} exists`);
 const end=source.indexOf('\nfunction ',begin+1);const code=source.slice(begin,end<0?undefined:end);
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
test('field story withholds rating explanations under scouting fog',()=>{
 const note={summary:'Tackle beat edge',detail:'player-rating edge'};
 const B={matchupStory:()=>note};
 assert.doesNotMatch(run('matchupStoryHTML',{B,setupReceipt:()=>'',fogSpread:()=>2,esc},[{}]),/player-rating/);
 assert.match(run('matchupStoryHTML',{B,setupReceipt:()=>'',fogSpread:()=>0,esc},[{}]),/player-rating/);
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
test('quick sheet shows only offered calls, escaped public read, costs and optional full-sheet access',()=>{
 const req={role:'off',options:{command:2,plays:[{id:'screen',cost:1,card:{name:'Screen'}},{id:'draw',cost:0,card:{name:'Draw'}}]}};
 const view={clue:'<Light box>',choices:[{id:'screen',label:'Screen',detail:'Look for Alex <West>.'}]};
 const html=run('quickSheetHTML',{req,b:{},sel:{play:'screen',tac:[]},selCost:()=>1,blockedSelection:()=>null,assignmentHTML:()=>'',pinnedCallHTML:()=>'<p>Your last call</p>',matchupHTML:()=>'<b>Featured duel</b>',guidedDriveHTML:()=>'<button>Finish guided drive</button>',tacticNoteHTML:()=>'<p>Pair with a tactic</p>',esc,err:''},[view]);
 assert.match(html,/&lt;Light box&gt;/);assert.match(html,/Alex &lt;West&gt;/);assert.match(html,/aria-pressed="true"/);assert.match(html,/Snap.*Screen/i);
 assert.match(html,/Your last call/);assert.match(html,/Featured duel/);assert.match(html,/Finish guided drive/);assert.doesNotMatch(html,/data-quick-call="draw"/);assert.match(html,/Pair with a tactic/);
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
