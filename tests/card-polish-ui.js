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
 const html=run('takeawayHTML',{B,b:{},esc});assert.match(html,/&lt;edge&gt;/);assert.match(html,/3 plays/);assert.match(html,/Optional adjustment/);assert.match(html,/data-film-deck/);
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
 const context={B:{load:()=>battle},DYN:{},save:{activeBattle:{battle}},setWeather(){},drawField(){},renderBug(){},setMarkers(){},$:()=>({classList:{remove(){}},innerHTML:''}),go:()=>advanced++,decide:()=>decided++};
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
 const html=run('quickSheetHTML',{req,b:{},sel:{play:'screen',tac:[]},selCost:()=>1,blockedSelection:()=>null,tacticNoteHTML:()=>'<p>Pair with a tactic</p>',esc,err:''},[view]);
 assert.match(html,/&lt;Light box&gt;/);assert.match(html,/Alex &lt;West&gt;/);assert.match(html,/aria-pressed="true"/);assert.match(html,/Snap.*Screen/i);
 assert.doesNotMatch(html,/data-quick-call="draw"/);assert.match(html,/Pair with a tactic/);
});
test('standalone signing day previews the named recruit’s possible signature and matchup without awarding a card',()=>{
 const SG=require('../forks/call-sheet/core/signatures'),D=require('../forks/call-sheet/core/data');
 const p={id:'unsigned-wr',name:'Max <Rivers>',role:'X',pos:'WR',archetype:'Route Sculptor',stars:3};
 const def=SG.describe(SG.specFor(p)).def;
 const html=run('recruitCard',{SG,ROLE_NAME:{X:'Receiver'},starStr:()=>'',gameImpact:()=>'Archetype impact',esc},[{role:'X',prospects:[p]},0]);
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
