'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const B=require('../forks/call-sheet/core/battle');
const D=require('../forks/call-sheet/core/data');
const R=require('../forks/call-sheet/core/resolver');
const Ro=require('../forks/call-sheet/core/roster');
const Engine=require('../game-engine-v2');
const RNG=require('../rng');
const source=fs.readFileSync(require.resolve('../forks/call-sheet/slice/slice.js'),'utf8');
const noop=()=>{};

// Exercise the real call-sheet handlers against a real battle. Only the browser's paint, sound and storage are stubbed.
function handlerSource(name){
  const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
  assert.notEqual(start,-1,`Missing ${name}`);
  const lines=source.slice(start).split('\n');
  const last=lines[0].endsWith('}')?0:lines.findIndex(line=>line==='}');
  assert.ok(last>=0,`Incomplete ${name}`);
  return lines.slice(0,last+1).join('\n');
}
function sheet(role,tactics,command=5){
  const home=Ro.preset('ground'),away=Ro.preset('tempo');
  home.lineup.off.C.archetype='Anchor';
  home.lineup.off.C.traits.composure=40;
  const b=B.create({home,away,user:'home',control:'both',mode:'snap',seed:'v24-sideline'});
  Engine.startGame(b.game);
  b.game.possession=role==='off'?'home':'away';
  B.advance(b);
  assert.equal(b.pending.role,role);
  b.hands.home.tactics=tactics.slice();
  b.hands.home.command=command;
  b.pending.options=(role==='off'?B.offOptions:B.defOptions)(b,'home');
  const el={classList:{add:noop,remove:noop}};
  const ctx=vm.createContext({B,D,R,b,req:b.pending,sel:{play:null,tac:[]},busy:false,err:'',
    readMode:'auto',S:{init:noop,chime:noop,tick:noop,error:noop},FX:{shake:noop},
    document:{activeElement:null},$:()=>el,teamOf:side=>b.teams[side],refresh:noop,renderHand:noop,
    writeSave:noop,clearGlow:noop,wideCamera:noop,scoutLabels:{coverage:'coverage',pressure:'rush',shell:'safety shell',family:'play family',protection:'extra blockers'},present:async()=>{},decide:noop});
  const names=['choosePlay','selectedTactics','tacticBlock','retainCallTactics','snapChoice','selCost','tacticClick','beginPlayback','go'];
  vm.runInContext(names.map(handlerSource).join('\n'),ctx);
  return ctx;
}
function click(ctx,slot){
  const t=ctx.req.options.tactics.find(card=>card.slot===slot);
  assert.ok(t,`No tactic at slot ${slot}`);
  const play=ctx.req.options.plays.find(p=>p.id===ctx.sel.play);
  ctx.tacticClick(t,ctx.tacticBlock(t,play));
}
function call(ctx){return ctx.snapChoice(ctx.selectedTactics())}

test('Motion keeps the affordable paired tactic after its hand slot shifts',()=>{
  const ctx=sheet('off',['motion','seal_block','seal_block','route_adjust']);
  ctx.sel.play='outside_zone';
  click(ctx,2);
  click(ctx,0);
  assert.equal(ctx.req.look.coverage.confirmed,true);
  assert.equal(ctx.sel.play,'outside_zone');
  assert.deepEqual(Array.from(ctx.selectedTactics()),['seal_block']);
  assert.equal(ctx.selCost(),1);
  const earlier=ctx.b.log.length;
  B.submit(ctx.b,{type:'call',...call(ctx)});
  const result=ctx.b.log.slice(earlier).find(e=>e.type==='snap');
  assert.deepEqual(result.offTactics,['seal_block']);
  assert.deepEqual(result.offInfo,['motion']);
});

test('Identify Protection keeps the bracket target and option edge assignment on defense',()=>{
  const ctx=sheet('def',['identify_protection','bracket','press']);
  ctx.sel.play='cover3';
  click(ctx,1);
  ctx.sel.bracketRole='X';
  ctx.sel.edgeAssignment='contain';
  click(ctx,0);
  assert.equal(ctx.req.offLook.protection.confirmed,true);
  const selection=call(ctx);
  assert.deepEqual(Array.from(selection.tactics),['bracket']);
  assert.equal(selection.bracketRole,'X');
  assert.equal(selection.edgeAssignment,'contain');
});

test('an information card releases a pairing when the remaining Command cannot fund it',()=>{
  const ctx=sheet('off',['motion','seal_block'],1);
  ctx.sel.play='outside_zone';
  click(ctx,1);
  click(ctx,0);
  assert.equal(ctx.sel.play,'outside_zone');
  assert.equal(ctx.req.options.command,0);
  assert.deepEqual(Array.from(ctx.selectedTactics()),[]);
  assert.match(ctx.err,/Seal Block/i,'tell the coach which tactic was removed');
});

test('a Hard Count false start clears selections and assignments for the new snap',async()=>{
  const ctx=sheet('off',['hard_count','max_protect']);
  ctx.sel.play='quick_slant';
  ctx.sel.target='SLOT';
  click(ctx,1);
  for(let i=0;i<100;i++){
    const rng=RNG.create('dead-ball-'+i),snapshot=rng.snapshot();
    if(rng.next()<.15){ctx.b.rng=snapshot;break}
  }
  click(ctx,0);
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(ctx.b.log.some(entry=>entry.type==='penalty'&&/false start/i.test(entry.text)));
  assert.equal(ctx.sel.play,null);
  assert.equal(ctx.sel.target,undefined);
  assert.deepEqual(Array.from(ctx.sel.tac),[]);
});

test('selecting two copies of a tactic can commit at most one and shows its actual cost',()=>{
  const ctx=sheet('off',['seal_block','seal_block','motion']);
  ctx.sel.play='outside_zone';
  click(ctx,0);
  click(ctx,1);
  assert.deepEqual(Array.from(ctx.selectedTactics()),['seal_block']);
  assert.equal(ctx.selCost(),1);
});

test('playing the later copy of Motion shifts cards from the copy actually spent',()=>{
  const ctx=sheet('off',['motion','seal_block','motion','route_adjust']);
  ctx.sel.play='outside_zone';
  click(ctx,1);
  click(ctx,2);
  assert.equal(ctx.req.look.coverage.confirmed,true);
  assert.deepEqual(Array.from(ctx.sel.tac),[0]);
  assert.deepEqual(Array.from(ctx.selectedTactics()),['seal_block']);
});

test('recent snaps show the last five completed calls for the requested offense and their recorded results',()=>{
  function snap(play,changes={}){
    return {type:'snap',offSide:'home',defSide:'away',play,call:'cover3',yards:2,
      sit:{down:3,distance:2,period:1,clock:479,field:35,score:{home:0,away:0}},...changes};
  }
  const b={log:[
    snap('read_option'),
    snap('inside_zone',{yards:4}),
    snap('outside_zone',{penalty:{label:'Holding'}}),
    snap('quick_slant',{turnover:'interception'}),
    snap('stick',{kind:'inc'}),
    snap('pa_boot',{kind:'sack',yards:-7,call:'cover1'}),
    snap('vertical_shot',{offSide:'away',defSide:'home'}),
    {type:'kick',offSide:'home',play:'Unrelated kick'}
  ],snap:{def:{play:'Hidden pressure'},off:{play:'Unresolved play'}}};
  const ctx=vm.createContext({b,D,teamOf:side=>({short:side==='home'?'GND':'AIR'}),esc:String});
  vm.runInContext(handlerSource('recentSnapsHTML'),ctx);
  const before=JSON.stringify(b);
  const html=ctx.recentSnapsHTML('home'),rows=html.match(/<li>.*?<\/li>/gs)||[];
  assert.equal(rows.length,5);
  for(const [row,play,call,result] of [
    [0,'pa_boot','cover1',/Sack.*-7 yd/i],
    [1,'stick','cover3',/Incomplete/i],
    [2,'quick_slant','cover3',/Intercepted/i],
    [3,'outside_zone','cover3',/Holding/],
    [4,'inside_zone','cover3',/\+4 yd/]
  ]){
    assert.ok(rows[row].includes(D.PLAYS[play].name));
    assert.ok(rows[row].includes(D.CALLS[call].name));
    assert.match(rows[row],/3rd &amp; 2/);
    assert.match(rows[row],result);
  }
  assert.doesNotMatch(html,/Read Option|Vertical Shot|Unrelated kick|Hidden pressure|Unresolved play/);
  const awayFilm=ctx.recentSnapsHTML('away');
  assert.ok(awayFilm.includes(D.PLAYS.vertical_shot.name));
  assert.doesNotMatch(awayFilm,/Holding/);
  assert.equal(JSON.stringify(b),before);
});

test('switching from Outside Zone to Quick Slant removes Seal Block and keeps the new call playable',()=>{
  const ctx=sheet('off',['seal_block','motion'],1);
  ctx.choosePlay('outside_zone');click(ctx,0);
  ctx.choosePlay('quick_slant');
  assert.equal(ctx.sel.play,'quick_slant');assert.deepEqual(Array.from(ctx.selectedTactics()),[]);
  assert.match(ctx.err,/Seal Block/);
  const start=ctx.b.log.length;
  B.submit(ctx.b,{type:'call',...call(ctx)});
  const snap=ctx.b.log.slice(start).find(e=>e.type==='snap');
  assert.equal(snap.play,'quick_slant');assert.deepEqual(snap.offTactics,[]);
});

test('an unaffordable tactic leaves the call playable and explains the Command cost',()=>{
  const ctx=sheet('off',['seal_block','seal_block','hurry_up'],1);
  ctx.choosePlay('outside_zone');click(ctx,0);click(ctx,1);
  assert.deepEqual(Array.from(ctx.sel.tac),[1],'the second copy moves the selection at the same cost');
  click(ctx,2);
  assert.deepEqual(Array.from(ctx.sel.tac),[1]);
  assert.equal(ctx.selCost(),1);assert.match(ctx.err,/Command/i);
  assert.doesNotThrow(()=>B.submit(ctx.b,{type:'call',...call(ctx)}));
});

test('switching to a pricier play prunes the over-budget pairing and rejects a play that is unaffordable on its own',()=>{
  const ctx=sheet('off',['hurry_up'],1);
  ctx.b.hands.home.wrinkles=['deep_cross'];
  ctx.req.options=B.offOptions(ctx.b,'home');
  assert.equal(ctx.req.options.plays.find(p=>p.id==='deep_cross').cost,1);
  ctx.choosePlay('quick_slant');click(ctx,0);
  assert.equal(ctx.choosePlay('deep_cross'),true);
  assert.deepEqual(Array.from(ctx.sel.tac),[]);assert.match(ctx.err,/Hurry-Up/);
  ctx.choosePlay('quick_slant');ctx.req.options.command=0;
  assert.equal(ctx.choosePlay('deep_cross'),false);
  assert.equal(ctx.sel.play,'quick_slant');assert.match(ctx.err,/Deep Cross.*1 Command.*0/);
});


test('staff playback gives the field the viewport and releases it before the next decision',async()=>{
  for(const fullSheet of [true,false]){
    const ctx=sheet('off',[]),classes=new Set(),fallback=ctx.$;
    const root={scrollTop:540,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
    ctx.$=selector=>selector==='#root'?root:fallback(selector);
    ctx.fullSheet=fullSheet;
    ctx.save={settings:{sheetView:fullSheet?'full':'quick'}};
    const before=JSON.stringify(ctx.save.settings);
    let presentations=0,decisions=0,wideShots=0;
    ctx.wideCamera=()=>wideShots++;
    ctx.present=async()=>{
      presentations++;
      assert.ok(classes.has('playback'),'field expands while the staff play runs');
      assert.equal(wideShots,1,'staff play uses the full-field camera');
      assert.equal(root.scrollTop,0,'a coach who selected a card lower on a phone can see the play');
      assert.equal(ctx.busy,true);
    };
    ctx.decide=()=>{
      decisions++;
      assert.equal(classes.has('playback'),false,'the decision can draw its call sheet');
      assert.equal(ctx.busy,false);
    };
    await ctx.go({type:'auto'});
    assert.equal(presentations,1);
    assert.equal(decisions,1);
    assert.equal(ctx.fullSheet,fullSheet);
    assert.equal(JSON.stringify(ctx.save.settings),before);

    assert.equal(ctx.req.kind,'snap');
    root.scrollTop=200;
    let refreshed=false;
    ctx.refresh=()=>{refreshed=true};
    await ctx.go({type:'info',tactic:'missing_tactic'});
    assert.equal(refreshed,true);
    assert.match(ctx.err,/not an information card/);
    assert.equal(presentations,1,'rejected input never starts another playback');
    assert.equal(decisions,1);
    assert.equal(classes.has('playback'),false);
    assert.equal(root.scrollTop,200,'validation stays at the original control');
    assert.equal(ctx.fullSheet,fullSheet);
    assert.equal(JSON.stringify(ctx.save.settings),before);
  }
});

test('a new staff snap or kick clears the earlier matchup, and a final coached snap keeps its recap',async()=>{
  const coached={type:'snap',userCalled:true};
  for(const following of [null,{type:'snap'},{type:'kick'}]){
    const log=following?[coached,following]:[coached],story={hidden:true},staff=[];
    const showStaff=()=>staff.push(story.hidden);
    const ctx=vm.createContext({
      b:{log},seen:0,FX:{instant:true},renderBug:noop,clearGlow:noop,
      $:selector=>selector==='#matchupStory'?story:{classList:{add:noop}},
      quick:e=>{if(e.userCalled)story.hidden=false;else showStaff()},quickKick:showStaff
    });
    vm.runInContext(handlerSource('present'),ctx);
    await ctx.present();
    assert.deepEqual(staff,following?[true]:[],'the current scoring play can show its own ticker');
    assert.equal(story.hidden,Boolean(following));
  }
});
