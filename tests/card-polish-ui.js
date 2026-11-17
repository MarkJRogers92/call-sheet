'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
function run(name,context,args=[]){
 const begin=source.indexOf('function '+name+'(');assert.notEqual(begin,-1,`${name} exists`);
 const end=source.indexOf('\nfunction ',begin+1);const code=source.slice(begin,end<0?undefined:end);
 return vm.runInNewContext(code+`;${name}(...args)`,{...context,args});
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
 assert.doesNotMatch(run('matchupStoryHTML',{B,fogSpread:()=>2,esc},[{}]),/player-rating/);
 assert.match(run('matchupStoryHTML',{B,fogSpread:()=>0,esc},[{}]),/player-rating/);
});
test('resume advances an unfinished checkpoint instead of awarding a premature final',()=>{
 let advanced=0,decided=0;
 const battle={pending:null,log:[],game:{status:'playing',score:{home:0,away:0}}};
 const context={B:{load:()=>battle},save:{activeBattle:{battle}},setWeather(){},drawField(){},renderBug(){},setMarkers(){},$:()=>({classList:{remove(){}},innerHTML:''}),go:()=>advanced++,decide:()=>decided++};
 run('resumeBattle',context);assert.equal(advanced,1);assert.equal(decided,0);
 battle.game.status='final';run('resumeBattle',context);assert.equal(decided,1);
});
