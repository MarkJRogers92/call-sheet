// Call Sheet card catalog, archetype tables and signatures (rules v0.2).
// Everything a card can do lives here as data plus small condition functions. Numbers are first-pass values
// tuned by tools/sim-report.js; see DESIGN.md §11 for the rules they implement.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else (root.CallSheet=root.CallSheet||{}).data=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';

// Frozen copy of Dynasty Lab's archetype tables (app/01-identity-rng.js, v0.36.0). The fork reads the real
// player objects through an adapter later; the sandbox needs only these.
const STYLES={
  QB:['Rhythm Distributor','Field Architect','Off-Script Creator','Vertical Hunter','Power Creator','Run-First Weapon','Toolsy Project'],
  RB:['Gap Hammer','Space Cutter','Contact Glider','Third-Down Weapon','One-Cut Burner','Patient Slasher'],
  WR:['Boundary Bully','Space Hunter','Route Sculptor','Vertical Glider','Catch-Point Ace','YAC Creator','Motion Weapon'],
  TE:['Seam Hunter','Inline Mauler','Move Chesspiece','Red-Zone Tower','Backfield Hybrid'],
  OT:['Island Protector','Movement Tackle','Power Edge','Long-Frame Project'],
  OG:['Drive Blocker','Phone-Booth Anchor','Pulling Guard','Interior Technician'],
  C:['Protection Quarterback','Leverage Center','Movement Pivot','Power Pivot'],
  EDGE:['Pocket Wrecker','Speed Bender','Power Setter','Chaos Rusher','Run-Side Anchor'],
  DT:['Pocket Crusher','Gap Eater','Penetrator','Two-Gap Anchor','Interior Disruptor'],
  LB:['Range Hunter','Box Enforcer','Coverage Rover','Pressure Backer','Traffic Director'],
  CB:['Mirror Corner','Press Eraser','Ball Hunter','Boundary Fighter','Slot Shadow'],
  S:['Centerfielder','Box Hammer','Coverage Eraser','Hybrid Rover','Trigger Safety']
};
const STYLE_TRAITS={
  'Rhythm Distributor':['technique','iq','composure'],'Field Architect':['iq','technique','composure'],'Off-Script Creator':['speed','versatility','composure'],'Vertical Hunter':['power','technique','composure'],'Power Creator':['power','speed','durability'],'Run-First Weapon':['speed','power','versatility'],'Toolsy Project':['speed','technique','power'],
  'Gap Hammer':['power','durability','technique'],'Space Cutter':['speed','versatility','iq'],'Contact Glider':['power','composure','durability'],'Third-Down Weapon':['technique','versatility','iq'],'One-Cut Burner':['speed','technique','iq'],'Patient Slasher':['iq','technique','composure'],
  'Boundary Bully':['power','technique','composure'],'Space Hunter':['speed','iq','versatility'],'Route Sculptor':['technique','iq','composure'],'Vertical Glider':['speed','power','composure'],'Catch-Point Ace':['technique','power','composure'],'YAC Creator':['speed','power','versatility'],'Motion Weapon':['versatility','speed','iq'],
  'Seam Hunter':['speed','technique','iq'],'Inline Mauler':['power','durability','technique'],'Move Chesspiece':['versatility','technique','iq'],'Red-Zone Tower':['power','technique','composure'],'Backfield Hybrid':['versatility','power','iq'],
  'Island Protector':['technique','iq','composure'],'Movement Tackle':['speed','technique','versatility'],'Power Edge':['power','durability','technique'],'Long-Frame Project':['power','speed','versatility'],
  'Drive Blocker':['power','technique','durability'],'Phone-Booth Anchor':['power','durability','composure'],'Pulling Guard':['speed','versatility','technique'],'Interior Technician':['technique','iq','composure'],
  'Protection Quarterback':['iq','technique','composure'],'Leverage Center':['technique','power','iq'],'Movement Pivot':['speed','versatility','technique'],'Power Pivot':['power','durability','technique'],
  'Pocket Wrecker':['technique','speed','power'],'Speed Bender':['speed','technique','versatility'],'Power Setter':['power','durability','technique'],'Chaos Rusher':['versatility','speed','composure'],'Run-Side Anchor':['power','iq','durability'],
  'Pocket Crusher':['power','technique','composure'],'Gap Eater':['power','durability','iq'],'Penetrator':['speed','technique','composure'],'Two-Gap Anchor':['power','iq','durability'],'Interior Disruptor':['technique','power','speed'],
  'Range Hunter':['speed','iq','technique'],'Box Enforcer':['power','durability','composure'],'Coverage Rover':['versatility','speed','iq'],'Pressure Backer':['speed','power','technique'],'Traffic Director':['iq','composure','technique'],
  'Mirror Corner':['technique','speed','composure'],'Press Eraser':['power','technique','composure'],'Ball Hunter':['iq','technique','speed'],'Boundary Fighter':['power','durability','technique'],'Slot Shadow':['speed','versatility','iq'],
  'Centerfielder':['speed','iq','composure'],'Box Hammer':['power','durability','composure'],'Coverage Eraser':['technique','speed','iq'],'Hybrid Rover':['versatility','speed','power'],'Trigger Safety':['iq','speed','composure']
};
const TRAITS=['speed','power','technique','iq','composure','durability','versatility'];

// Eleven roles per side. Duels name roles; the lineup names the people in them.
const OFF_ROLES={QB:'QB',RB:'RB',X:'WR',Z:'WR',SLOT:'WR',TE:'TE',LT:'OT',LG:'OG',C:'C',RG:'OG',RT:'OT'};
const DEF_ROLES={RUSH:'EDGE',SET:'EDGE',NT:'DT',DT3:'DT',MIKE:'LB',WILL:'LB',FCB:'CB',BCB:'CB',NICKEL:'CB',FS:'S',BOXS:'S'};

// Margin → offense win chance. Shown to the player as chips; exact values on demand.
const WIN_CHANCE={'-3':.15,'-2':.25,'-1':.35,'0':.5,'1':.65,'2':.75,'3':.85};
const chip=m=>m<=-2?'Danger':m<-.25?'Tough':m<=.25?'Even':m<2?'Edge':'Strong';

// Result tables. Each category is a weighted list of results; yards are [mean, sd].
// kind: run | catch | inc | sack | scramble. int: chance an incompletion is intercepted.
const R=(w,kind,yards,extra={})=>({w,kind,yards,...extra});

// --- Offensive plays -------------------------------------------------------------------------------
// duel: off/def role lists, the traits each side uses, a label, and a design bias (a visible modifier).
const PLAYS={
  inside_zone:{id:'inside_zone',side:'off',name:'Inside Zone',family:'run',cost:0,base:true,carrier:'RB',
    text:'Downhill run. The back reads the interior blocks and takes the crease.',
    duels:{
      G:{label:'Point of attack',off:['LG','C','RG'],ot:['power','technique'],def:['NT','DT3'],dt:['power','technique'],bias:1},
      K:{label:'Read the crease',off:['RB'],ot:['iq','technique'],def:['MIKE'],dt:['iq','power'],bias:0},
      F:{label:'Finish',off:['RB'],ot:['power','durability'],def:['BOXS'],dt:['power','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1.5,1.6])],short:[R(1,'run',[2.4,1.2])],success:[R(1,'run',[5.2,1.6])],explosive:[R(1,'run',[10,4],{tail:.1})]}},
  outside_zone:{id:'outside_zone',side:'off',name:'Outside Zone',family:'run',cost:0,base:true,carrier:'RB',
    text:'Stretch the defense sideways and cut up behind the edge.',
    duels:{
      G:{label:'Edge block',off:['TE','RT'],ot:['power','technique'],def:['SET'],dt:['power','technique'],bias:1},
      K:{label:'Beat pursuit',off:['RB'],ot:['speed','iq'],def:['WILL'],dt:['speed','iq'],bias:0},
      F:{label:'Turn the corner',off:['RB'],ot:['speed','versatility'],def:['FCB'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(1,'run',[-2.2,1.6])],short:[R(1,'run',[2,1.3])],success:[R(1,'run',[5.5,2])],explosive:[R(1,'run',[12,5],{tail:.12})]}},
  quick_slant:{id:'quick_slant',side:'off',name:'Quick Slant',family:'quick',cost:0,base:true,target:'SLOT',pass:true,
    text:'Ball out in 1.5 seconds to the slot. Beats pressure, small window.',
    duels:{
      G:{label:'Release',off:['SLOT'],ot:['technique','speed'],def:['NICKEL'],dt:['technique','speed'],bias:1,release:true},
      K:{label:'Timing throw',off:['QB'],ot:['technique','composure'],def:['MIKE'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'After the catch',off:['SLOT'],ot:['speed','versatility'],def:['WILL'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(.85,'inc',[0,0],{int:.04}),R(.15,'catch',[1,1.5])],short:[R(.55,'inc',[0,0],{int:.04}),R(.45,'catch',[3.5,1.5])],success:[R(.85,'catch',[7,2]),R(.15,'inc',[0,0],{int:.03})],explosive:[R(1,'catch',[12,5],{tail:.08})]}},
  stick:{id:'stick',side:'off',name:'Stick',family:'quick',cost:0,base:true,target:'TE',pass:true,
    text:'Tight end sits down at six yards. A dependable chain-mover.',
    duels:{
      G:{label:'Release',off:['TE'],ot:['technique','iq'],def:['WILL'],dt:['technique','iq'],bias:1,release:true},
      K:{label:'Read the flat',off:['QB'],ot:['iq','technique'],def:['BOXS'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'Fall forward',off:['TE'],ot:['power','technique'],def:['MIKE'],dt:['power','technique'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.03}),R(.2,'catch',[2,1.5])],short:[R(.45,'inc',[0,0],{int:.03}),R(.55,'catch',[4,1.2])],success:[R(.88,'catch',[6.5,1.5]),R(.12,'inc',[0,0],{int:.02})],explosive:[R(1,'catch',[10,4],{tail:.05})]}},
  // Wrinkles: drawn from the play pile.
  deep_cross:{id:'deep_cross',side:'off',name:'Deep Cross',family:'deep',cost:1,target:'Z',pass:true,protection:true,
    text:'Z crosses at 18 yards behind the linebackers. Needs time.',
    duels:{
      G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:1,protect:true},
      K:{label:'Separation',off:['Z'],ot:['speed','technique'],def:['FCB'],dt:['speed','technique'],bias:0,separation:true},
      F:{label:'Read the safety',off:['QB'],ot:['iq','composure'],def:['FS'],dt:['iq','speed'],bias:0,qbRead:true}},
    results:{fail:[R(.32,'sack',[-7,2]),R(.43,'inc',[0,0],{int:.05}),R(.25,'catch',[3,1.5])],short:[R(.55,'inc',[0,0],{int:.06}),R(.45,'catch',[5,2])],success:[R(.7,'catch',[14,4]),R(.3,'inc',[0,0],{int:.05})],explosive:[R(1,'catch',[23,7],{tail:.12})]}},
  vertical_shot:{id:'vertical_shot',side:'off',name:'Vertical Shot',family:'deep',cost:2,target:'X',pass:true,protection:true,
    text:'Seven-step drop, X goes deep. Big swing.',
    duels:{
      G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:0,protect:true},
      K:{label:'Get behind',off:['X'],ot:['speed','power'],def:['FS'],dt:['speed','iq'],bias:0,separation:true},
      F:{label:'Catch point',off:['X'],ot:['power','composure'],def:['BCB'],dt:['power','technique'],bias:0}},
    results:{fail:[R(.38,'sack',[-8,2]),R(.5,'inc',[0,0],{int:.07}),R(.12,'scramble',[4,3])],short:[R(.8,'inc',[0,0],{int:.12}),R(.2,'catch',[9,3])],success:[R(.55,'catch',[22,6]),R(.45,'inc',[0,0],{int:.06})],explosive:[R(1,'catch',[33,11],{tail:.25})]}},
  pa_boot:{id:'pa_boot',side:'off',name:'PA Boot',family:'constraint',punishes:'run',cost:1,target:'Z',pass:true,protection:true,
    text:'Fake the run, roll the pocket. Deadly when the linebackers are cheating.',
    duels:{
      G:{label:'Hold the edge',off:['TE'],ot:['power','technique'],def:['SET'],dt:['speed','technique'],bias:1,protect:true},
      K:{label:'Sell the fake',off:['RB'],ot:['iq','technique','power'],def:['MIKE'],dt:['iq','composure'],bias:0,fake:true},
      F:{label:'Separation',off:['Z'],ot:['speed','technique'],def:['FCB'],dt:['speed','technique'],bias:0,separation:true}},
    results:{fail:[R(.3,'sack',[-6,2]),R(.4,'inc',[0,0],{int:.05}),R(.3,'scramble',[2,2])],short:[R(.5,'inc',[0,0],{int:.04}),R(.5,'catch',[5,2])],success:[R(.75,'catch',[11,3]),R(.25,'inc',[0,0],{int:.04})],explosive:[R(1,'catch',[22,8],{tail:.15})]}},
  screen:{id:'screen',side:'off',name:'RB Screen',family:'constraint',punishes:'pressure',cost:1,target:'RB',pass:true,
    text:'Invite the rush, dump it over them, linemen lead the way.',
    duels:{
      G:{label:'Sell it',off:['QB'],ot:['composure','iq'],def:['RUSH'],dt:['iq','speed'],bias:1,qbRead:true},
      K:{label:'Lead block',off:['LG'],ot:['speed','versatility'],def:['WILL'],dt:['speed','power'],bias:0},
      F:{label:'Make a man miss',off:['RB'],ot:['versatility','speed'],def:['NICKEL'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(.4,'catch',[-3,2]),R(.6,'inc',[0,0],{int:.04})],short:[R(.7,'catch',[2,1.5]),R(.3,'inc',[0,0],{int:.02})],success:[R(1,'catch',[8,2])],explosive:[R(1,'catch',[18,8],{tail:.2})]}},
  power:{id:'power',side:'off',name:'Power',family:'run',cost:1,carrier:'RB',
    text:'Pull the guard, kick out the end, hit it downhill.',
    duels:{
      G:{label:'Kick out',off:['LG','TE'],ot:['power','technique'],def:['SET','NT'],dt:['power','technique'],bias:2},
      K:{label:'Downhill',off:['RB'],ot:['power','iq'],def:['MIKE'],dt:['power','iq'],bias:0},
      F:{label:'Finish',off:['RB'],ot:['power','durability'],def:['BOXS'],dt:['power','durability'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[3,1])],success:[R(1,'run',[6,1.5])],explosive:[R(1,'run',[12,5],{tail:.12})]}},
  read_option:{id:'read_option',side:'off',name:'Read Option',family:'run',cost:1,carrier:'QB',needs:{role:'QB',trait:'speed',grade:7},
    text:'Leave the end unblocked and let the quarterback decide. Needs a runner at QB.',
    duels:{
      G:{label:'Read the end',off:['QB'],ot:['iq','speed'],def:['SET'],dt:['iq','speed'],bias:1,qbRead:true,qbRun:true},
      K:{label:'Get to space',off:['QB'],ot:['speed','versatility'],def:['WILL'],dt:['speed','iq'],bias:0,qbRun:true},
      F:{label:'Finish',off:['QB'],ot:['speed','power'],def:['BOXS'],dt:['speed','power'],bias:0}},
    results:{fail:[R(1,'run',[-1.5,1.5])],short:[R(1,'run',[2.5,1.5])],success:[R(1,'run',[7,2])],explosive:[R(1,'run',[15,7],{tail:.22})]}}
};

// --- Defensive calls -------------------------------------------------------------------------------
// box: light | normal | loaded. shell: 0 | 1 | 2 deep safeties. pressure: 0 none, 1 five-man, 2 all-out.
// look: what the offense sees before the snap (pressureShown can be a bluff).
const CALLS={
  two_high:{id:'two_high',side:'def',name:'Quarters',family:'zone',cost:0,base:true,box:'light',shell:2,coverage:'zone',pressure:0,counters:['deep'],look:{pressureShown:false},
    text:'Two deep safeties. Takes away the shot; light box against the run.'},
  cover1:{id:'cover1',side:'def',name:'Cover 1 Man',family:'man',cost:0,base:true,box:'normal',shell:1,coverage:'man',pressure:0,counters:['quick'],look:{pressureShown:true},
    text:'Man across the board with a deep safety. Tight on short throws.'},
  cover3:{id:'cover3',side:'def',name:'Cover 3 Sky',family:'zone',cost:0,base:true,box:'normal',shell:1,coverage:'zone',pressure:0,counters:['run'],look:{pressureShown:false},
    text:'Three-deep zone with a safety rolled down for the run.'},
  run_fit:{id:'run_fit',side:'def',name:'Run Fit Heavy',family:'man',cost:0,base:true,box:'loaded',shell:1,coverage:'man',pressure:0,counters:['run'],look:{pressureShown:false},
    text:'Eight in the box. Built to stop the run; thin behind it.'},
  zone_pressure:{id:'zone_pressure',side:'def',name:'Zone Pressure',family:'pressure',cost:1,box:'normal',shell:1,coverage:'zone',pressure:1,counters:['deep'],look:{pressureShown:true},
    text:'Five rush, three deep, three under. Heat without leaving anyone alone.'},
  cover0:{id:'cover0',side:'def',name:'Cover 0 Blitz',family:'pressure',cost:2,box:'loaded',shell:0,coverage:'man',pressure:2,counters:['run','deep'],look:{pressureShown:true},
    text:'Everyone comes. Wins fast or gives up the house.'},
  sim_pressure:{id:'sim_pressure',side:'def',name:'Sim Pressure',family:'pressure',cost:1,box:'normal',shell:1,coverage:'zone',pressure:1,counters:['quick'],look:{pressureShown:false},
    text:'Show nothing, bring a surprise rusher. The look lies.'},
  two_man:{id:'two_man',side:'def',name:'2-Man Under',family:'man',cost:1,box:'light',shell:2,coverage:'man',pressure:0,counters:['quick','deep'],look:{pressureShown:false},
    text:'Man underneath, two safeties over the top. Smothers passes; soft against the run.'},
  robber:{id:'robber',side:'def',name:'Cover 1 Robber',family:'man',cost:1,box:'normal',shell:1,coverage:'man',pressure:0,counters:['quick','constraint'],look:{pressureShown:true},
    text:'A safety lurks underneath to jump crossers and screens.'},
  bear:{id:'bear',side:'def',name:'Bear Front',family:'pressure',cost:1,box:'loaded',shell:1,coverage:'man',pressure:1,counters:['run'],look:{pressureShown:true},
    text:'Covered guards and center, a linebacker in the gap. Short-yardage hammer.'}
};

// --- Tactics ---------------------------------------------------------------------------------------
// info: resolved immediately when played live, before the call; cannot be scripted.
const TACTICS={
  motion:{id:'motion',side:'off',name:'Motion',cost:1,info:true,icon:'↔',text:'Confirms man or zone. The motioned receiver gets +1 on his release or separation duel.'},
  hard_count:{id:'hard_count',side:'off',name:'Hard Count',cost:1,info:true,icon:'!',text:'Confirms whether the shown pressure is real. A shaky center (composure 5 or less) risks a false start.'},
  max_protect:{id:'max_protect',side:'off',name:'Max Protect',cost:1,icon:'⛨',text:'+2 on a Protection duel. One fewer route: Finish −1.',needs:{protection:true}},
  route_adjust:{id:'route_adjust',side:'off',name:'Route Adjustment',cost:1,icon:'↱',text:'+1 on the target\'s separation or release duel; +1 more if Motion confirmed the coverage this snap.',needs:{pass:true,targetIq:6}},
  seal_block:{id:'seal_block',side:'off',name:'Seal Block',cost:1,icon:'▮',text:'+2 on the Gate of Outside Zone, Read Option or Power.',needs:{plays:['outside_zone','read_option','power']}},
  check_with_me:{id:'check_with_me',side:'off',name:'Check-With-Me',cost:2,info:true,icon:'✓',text:'Confirms every fact in the Look before you call.'},
  film_tell:{id:'film_tell',side:'def',name:'Film Tell',cost:1,info:true,icon:'◉',text:'Confirms the offense\'s play family (run, quick, deep or constraint).'},
  identify_protection:{id:'identify_protection',side:'def',name:'Identify Protection',cost:1,info:true,icon:'⌖',text:'Confirms whether they kept extra blockers in. Your pressure Gate +1 this snap.'},
  disguise:{id:'disguise',side:'def',name:'Disguise',cost:1,icon:'◐',text:'Their Shell fact shows false and cannot be confirmed by the QB. Their QB-read duels −2 (−1 if your FS has iq 5 or less).'},
  bracket:{id:'bracket',side:'def',name:'Bracket',cost:1,icon:'⊐',text:'+2 against their best receiver. Every other receiver duel −1 for you.'},
  spy:{id:'spy',side:'def',name:'Spy',cost:1,icon:'👁',text:'QB-run duels −2 for them. Your pressure Gates −1 (one fewer rusher).'},
  press:{id:'press',side:'def',name:'Press',cost:1,icon:'▼',text:'+1 on release duels. If they still win the release, the result improves one step.'}
};

// --- Signatures: one line of card text per archetype that changes a decision ---------------------------
// duel(ctx, key, duel) → modifier from the offense's point of view (defensive signatures return negatives).
// A duel signature applies only when its player is in that duel, unless scope:'field'.
const SIGNATURES={
  'Field Architect':{text:'Sees the shell: the Look\'s Shell is Confirmed with him at QB.',look:'shell'},
  'Vertical Hunter':{text:'Vertical Shot costs 1 with him at QB.',cost:{vertical_shot:1}},
  'Rhythm Distributor':{text:'Quick passes: +1 on the timing throw.',duel:(c,k,d)=>c.play.family==='quick'&&d.qbRead?1:0},
  'Off-Script Creator':{text:'A lost Protection duel becomes a scramble half the time.',flag:'scramble'},
  'Run-First Weapon':{text:'Read Option costs 0 with him at QB.',cost:{read_option:0}},
  'Toolsy Project':{text:'Raw: Shell is never Confirmed by him alone.',look:'noShell'},
  'Patient Slasher':{text:'Inside Zone: +1 reading the crease.',duel:(c,k)=>c.play.id==='inside_zone'&&k==='K'?1:0},
  'Gap Hammer':{text:'Runs: +1 to finish.',duel:(c,k)=>c.play.family==='run'&&k==='F'?1:0},
  'One-Cut Burner':{text:'Explosive runs go further.',flag:'burner'},
  'Third-Down Weapon':{text:'3rd down passes: a lost Key duel becomes a checkdown to him for +3.',flag:'outlet'},
  'Route Sculptor':{text:'+1 separation against man coverage.',duel:(c,k,d)=>d.separation&&c.call.coverage==='man'?1:0},
  'Space Hunter':{text:'+1 separation or release against zone.',duel:(c,k,d)=>(d.separation||d.release)&&c.call.coverage==='zone'?1:0},
  'Boundary Bully':{text:'Wins at the catch point: +1 on contested catches.',duel:(c,k)=>c.play.id==='vertical_shot'&&k==='F'?1:0},
  'Inline Mauler':{text:'Seal Block also fits Inside Zone.',flag:'mauler'},
  'Backfield Hybrid':{text:'Check-and-Release: with Max Protect against no pressure, a lost Key duel becomes +4 to him.',flag:'checkRelease'},
  'Island Protector':{text:'Protection duels: +1 without a tactic.',duel:(c,k,d)=>d.protect&&!c.offTactics?.length?1:0},
  'Pulling Guard':{text:'Power and Screen: +1 on his block.',duel:(c,k)=>(c.play.id==='power'&&k==='G')||(c.play.id==='screen'&&k==='K')?1:0},
  'Interior Technician':{text:'Hard Count costs 0 and never draws a false start.',cost:{hard_count:0},flag:'noFalseStart'},
  'Protection Quarterback':{text:'Hard Count costs 0 and never draws a false start.',cost:{hard_count:0},flag:'noFalseStart'},
  // Defense
  'Speed Bender':{text:'Pressure calls: +1 on Protection duels.',duel:(c,k,d)=>d.protect&&c.call.pressure>0?-1:0},
  'Pocket Wrecker':{text:'+1 on every Protection duel.',duel:(c,k,d)=>d.protect?-1:0},
  'Gap Eater':{text:'Draws the double: your pressure Gates +1 while he plays.',scope:'field',duel:(c,k,d)=>d.protect&&c.call.pressure>0?-1:0},
  'Two-Gap Anchor':{text:'Inside runs: +1 at the point of attack.',duel:(c,k)=>c.play.family==='run'&&k==='G'&&c.play.id!=='outside_zone'?-1:0},
  'Box Enforcer':{text:'Runs: +1 on the Key duel.',duel:(c,k)=>c.play.family==='run'&&k==='K'?-1:0},
  'Traffic Director':{text:'Film Tell costs 0 once per series.',cost:{film_tell:0},costOnce:true},
  'Press Eraser':{text:'Press costs 0.',cost:{press:0}},
  'Mirror Corner':{text:'Man coverage: +1 against separation.',duel:(c,k,d)=>d.separation&&c.call.coverage==='man'?-1:0},
  'Ball Hunter':{text:'Interception chances +50%.',flag:'ballHawk'},
  'Trigger Safety':{text:'Disguise costs 0 once per series.',cost:{disguise:0},costOnce:true},
  'Centerfielder':{text:'Deep passes: +1 against single-high shots.',duel:(c,k)=>c.play.family==='deep'&&k==='K'&&c.call.shell===1?-1:0}
};

// --- Pack-only cards (rules v0.3) --------------------------------------------------------------------
// matchups: data-driven call-vs-play bonuses. when: pressure | shell1 | shell2 | man | zone | loaded | light.
Object.assign(PLAYS,{
  draw:{id:'draw',side:'off',name:'Draw',family:'run',cost:1,carrier:'RB',
    matchups:[{when:'pressure',duel:'K',v:2,src:'Rushers ran right past it'}],
    text:'Show pass, hand it off. Rushers who fly upfield open the lane.',
    duels:{
      G:{label:'Invite the rush',off:['LG','C','RG'],ot:['technique','iq'],def:['NT','DT3'],dt:['speed','technique'],bias:1},
      K:{label:'Find the lane',off:['RB'],ot:['iq','speed'],def:['MIKE'],dt:['iq','speed'],bias:0},
      F:{label:'Daylight',off:['RB'],ot:['speed','power'],def:['BOXS'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[2.5,1.2])],success:[R(1,'run',[7,2])],explosive:[R(1,'run',[15,6],{tail:.18})]}},
  four_verts:{id:'four_verts',side:'off',name:'Four Verts',family:'deep',cost:1,target:'SLOT',pass:true,protection:true,
    matchups:[{when:'shell1',duel:'K',v:1,src:'Four routes, one safety'}],
    text:'Everybody goes. The slot splits the lone deep safety.',
    duels:{
      G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:1,protect:true},
      K:{label:'Seam',off:['SLOT'],ot:['speed','technique'],def:['FS'],dt:['speed','iq'],bias:0,separation:true},
      F:{label:'Throw the seam',off:['QB'],ot:['iq','composure'],def:['NICKEL'],dt:['iq','technique'],bias:0,qbRead:true}},
    results:{fail:[R(.34,'sack',[-7,2]),R(.46,'inc',[0,0],{int:.06}),R(.2,'catch',[4,2])],short:[R(.6,'inc',[0,0],{int:.06}),R(.4,'catch',[8,3])],success:[R(.65,'catch',[18,4]),R(.35,'inc',[0,0],{int:.04})],explosive:[R(1,'catch',[30,10],{tail:.25})]}},
  statue_left:{id:'statue_left',side:'off',name:'Statue Left',family:'constraint',punishes:'pressure',cost:2,carrier:'RB',trick:true,
    matchups:[{when:'pressure',duel:'G',v:2,src:'The rush bit on the fake throw'}],
    text:'TRICK · The quarterback cocks to throw; the back takes it from behind his hip. Once per game.',
    duels:{
      G:{label:'Sell the throw',off:['QB'],ot:['composure','technique'],def:['RUSH'],dt:['iq','composure'],bias:1,qbRead:true},
      K:{label:'The handoff',off:['RB'],ot:['speed','versatility'],def:['WILL'],dt:['speed','iq'],bias:1},
      F:{label:'Gone',off:['RB'],ot:['speed','composure'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(1,'run',[-4,2])],short:[R(1,'run',[3,2])],success:[R(1,'run',[15,4])],explosive:[R(1,'run',[34,12],{tail:.45})]}}
});
// Upgrades: practiced versions of existing plays. Upgrading a base play replaces it on the sheet.
function upgrade(baseId,id,name,boost,note){
  const c=JSON.parse(JSON.stringify(PLAYS[baseId]));c.id=id;c.name=name;c.upgradeOf=baseId;c.base=PLAYS[baseId].base;
  for(const [k,v] of Object.entries(boost))c.duels[k].bias+=v;c.text=`${note} ${c.text}`;PLAYS[id]=c;
}
upgrade('inside_zone','inside_zone_plus','Inside Zone+',{G:1},'PRACTICED · Gate +1.');
upgrade('quick_slant','quick_slant_plus','Quick Slant+',{K:1},'PRACTICED · Key +1.');
upgrade('pa_boot','pa_boot_plus','PA Boot+',{K:1},'PRACTICED · Key +1.');
Object.assign(CALLS,{
  corner_blitz:{id:'corner_blitz',side:'def',name:'Corner Blitz',family:'pressure',cost:1,box:'normal',shell:1,coverage:'man',pressure:1,counters:['quick'],look:{pressureShown:false},
    text:'The boundary corner comes off the edge. Nobody sees it coming.'},
  cover2_trap:{id:'cover2_trap',side:'def',name:'Cover 2 Trap',family:'zone',cost:1,box:'light',shell:2,coverage:'zone',pressure:0,counters:['quick','constraint'],look:{pressureShown:true},
    text:'Show blitz, bail out, and sit on the quick throw.'},
  midnight_mirage:{id:'midnight_mirage',side:'def',name:'Midnight Mirage',family:'pressure',cost:2,box:'normal',shell:2,coverage:'zone',pressure:1,counters:['deep','quick'],look:{pressureShown:false},trick:true,
    text:'TRICK · Two deep, five rushing, nobody where they look. Once per game.'}
});

// Rarity drives pack odds and card frames. Legendaries exist once per world.
const RARITY={
  deep_cross:'common',pa_boot:'common',screen:'common',power:'common',read_option:'common',draw:'common',four_verts:'common',vertical_shot:'rare',
  motion:'common',max_protect:'common',route_adjust:'common',seal_block:'common',hard_count:'common',check_with_me:'rare',
  inside_zone_plus:'rare',quick_slant_plus:'rare',pa_boot_plus:'rare',statue_left:'legendary',
  zone_pressure:'common',two_man:'common',robber:'common',sim_pressure:'common',bear:'common',corner_blitz:'common',cover2_trap:'common',cover0:'rare',
  film_tell:'common',identify_protection:'common',disguise:'common',bracket:'common',spy:'common',press:'common',midnight_mirage:'legendary'
};
const rarityOf=id=>RARITY[id]||'common';

// Situational specialties for the rest of the roster. Half-edges reward fit without overwhelming talent.
Object.assign(SIGNATURES,{
  'Power Creator':{text:'QB runs: +0.5 through contact.',duel:(c,k,d)=>d.qbRun&&k==='F'?.5:0},
  'Space Cutter':{text:'Outside runs: +0.5 finding space.',duel:(c,k)=>c.play.id==='outside_zone'&&k==='K'?.5:0},
  'Contact Glider':{text:'Runs: +0.5 to finish against a loaded box.',duel:(c,k)=>c.play.family==='run'&&k==='F'&&c.call.box==='loaded'?.5:0},
  'Vertical Glider':{text:'Deep routes: +0.5 separation.',duel:(c,k,d)=>c.play.family==='deep'&&d.separation?.5:0},
  'Catch-Point Ace':{text:'Passes: +0.5 at the catch point.',duel:(c,k)=>c.play.pass&&k==='F'?.5:0},
  'YAC Creator':{text:'Quick passes and screens: +0.5 after the catch.',duel:(c,k)=>c.play.pass&&['quick','constraint'].includes(c.play.family)&&k==='F'?.5:0},
  'Motion Weapon':{text:'Motion: +0.5 on release or separation.',duel:(c,k,d)=>c.offTactics.includes('motion')&&(d.release||d.separation)?.5:0},
  'Seam Hunter':{text:'Two-high coverage: +0.5 release or separation.',duel:(c,k,d)=>c.play.pass&&(d.separation||d.release)&&c.call.shell===2?.5:0},
  'Move Chesspiece':{text:'Route adjustment: +0.5 on release or separation.',duel:(c,k,d)=>c.offTactics.includes('route_adjust')&&(d.release||d.separation)?.5:0},
  'Red-Zone Tower':{text:'Red-zone passes: +0.5 at the catch point.',duel:(c,k)=>c.play.pass&&k==='F'&&c.situation.field>=80?.5:0},
  'Movement Tackle':{text:'Outside runs: +0.5 at the edge.',duel:(c,k)=>c.play.id==='outside_zone'&&k==='G'?.5:0},
  'Power Edge':{text:'Runs: +0.5 at the point of attack.',duel:(c,k)=>c.play.family==='run'&&k==='G'?.5:0},
  'Long-Frame Project':{text:'Max Protect: +0.5 on protection.',duel:(c,k,d)=>d.protect&&c.offTactics.includes('max_protect')?.5:0},
  'Drive Blocker':{text:'Runs: +0.5 at the point of attack.',duel:(c,k)=>c.play.family==='run'&&k==='G'?.5:0},
  'Phone-Booth Anchor':{text:'Run blitzes: +0.5 holding the point.',duel:(c,k)=>c.play.family==='run'&&k==='G'&&c.call.pressure>0?.5:0},
  'Leverage Center':{text:'Loaded boxes: +0.5 on the run Gate.',duel:(c,k)=>c.play.family==='run'&&k==='G'&&c.call.box==='loaded'?.5:0},
  'Movement Pivot':{text:'Light boxes: +0.5 reaching the run block.',duel:(c,k)=>c.play.family==='run'&&k==='G'&&c.call.box==='light'?.5:0},
  'Power Pivot':{text:'Inside runs: +0.5 at the point.',duel:(c,k)=>c.play.family==='run'&&c.play.id!=='outside_zone'&&k==='G'?.5:0},
  'Power Setter':{text:'Outside runs: +0.5 setting the edge.',duel:(c,k)=>c.play.id==='outside_zone'&&k==='G'?-.5:0},
  'Chaos Rusher':{text:'Stunts: +0.5 against protection.',duel:(c,k,d)=>d.protect&&c.defTactics?.includes('stunt')?-.5:0},
  'Run-Side Anchor':{text:'Runs: +0.5 holding the point.',duel:(c,k)=>c.play.family==='run'&&k==='G'?-.5:0},
  'Pocket Crusher':{text:'Pressure: +0.5 collapsing the pocket.',scope:'field',duel:(c,k,d)=>d.protect&&c.call.pressure>0?-.5:0},
  'Penetrator':{text:'Light boxes: +0.5 penetrating the run Gate.',duel:(c,k)=>c.play.family==='run'&&k==='G'&&c.call.box==='light'?-.5:0},
  'Interior Disruptor':{text:'Runs: +0.5 disrupting the Key.',duel:(c,k)=>c.play.family==='run'&&k==='K'?-.5:0},
  'Range Hunter':{text:'Outside runs: +0.5 pursuit.',duel:(c,k)=>c.play.id==='outside_zone'&&k==='K'?-.5:0},
  'Coverage Rover':{text:'Zone: +0.5 against pass separation.',duel:(c,k,d)=>d.separation&&c.call.coverage==='zone'?-.5:0},
  'Pressure Backer':{text:'Blitzes: +0.5 on the quarterback read.',duel:(c,k,d)=>d.qbRead&&c.call.pressure>0?-.5:0},
  'Boundary Fighter':{text:'Man coverage: +0.5 against the release.',duel:(c,k,d)=>d.release&&c.call.coverage==='man'?-.5:0},
  'Slot Shadow':{text:'Quick passes: +0.5 in coverage.',duel:(c,k,d)=>c.play.family==='quick'&&(d.release||d.separation)?-.5:0},
  'Box Hammer':{text:'Runs: +0.5 finishing the tackle.',duel:(c,k)=>c.play.family==='run'&&k==='F'?-.5:0},
  'Coverage Eraser':{text:'Two-high: +0.5 finishing pass coverage.',duel:(c,k)=>c.play.pass&&k==='F'&&c.call.shell===2?-.5:0},
  'Hybrid Rover':{text:'Constraint plays: +0.5 finishing coverage.',duel:(c,k)=>c.play.family==='constraint'&&k==='F'?-.5:0}
});

// --- Pack cards (rules v0.5) ---------------------------------------------------------------------------
Object.assign(PLAYS,{
  rpo_bubble:{id:'rpo_bubble',side:'off',name:'RPO Bubble',family:'constraint',punishes:'run',cost:0,target:'SLOT',pass:true,
    matchups:[{when:'loaded',duel:'G',v:2,src:'Box overloaded, bubble wide open'}],
    text:'Read the overhang: hand it off or flip it to the slot on the bubble.',
    duels:{
      G:{label:'Read the overhang',off:['QB'],ot:['iq','composure'],def:['NICKEL'],dt:['iq','speed'],bias:1,qbRead:true},
      K:{label:'Perimeter block',off:['X'],ot:['power','technique'],def:['FCB'],dt:['power','technique'],bias:0},
      F:{label:'Make him miss',off:['SLOT'],ot:['speed','versatility'],def:['FS'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(.6,'catch',[-1,1.5]),R(.4,'inc',[0,0],{int:.02})],short:[R(1,'catch',[3,1.5])],success:[R(1,'catch',[7,2])],explosive:[R(1,'catch',[16,6],{tail:.15})]}},
  hb_wheel:{id:'hb_wheel',side:'off',name:'HB Wheel',family:'deep',cost:1,target:'RB',pass:true,protection:true,
    matchups:[{when:'man',duel:'K',v:2,src:'Linebacker trailing the wheel'}],
    text:'The back runs the wheel up the sideline. Linebackers in man can\'t keep up.',
    duels:{
      G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:1,protect:true},
      K:{label:'Wheel route',off:['RB'],ot:['speed','versatility'],def:['WILL'],dt:['speed','iq'],bias:0,separation:true},
      F:{label:'Over the shoulder',off:['RB'],ot:['technique','composure'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.3,'sack',[-7,2]),R(.5,'inc',[0,0],{int:.05}),R(.2,'catch',[2,1.5])],short:[R(.6,'inc',[0,0],{int:.04}),R(.4,'catch',[6,2])],success:[R(.75,'catch',[17,4]),R(.25,'inc',[0,0],{int:.03})],explosive:[R(1,'catch',[30,10],{tail:.25})]}},
  qb_draw:{id:'qb_draw',side:'off',name:'QB Draw',family:'run',cost:1,carrier:'QB',
    matchups:[{when:'pressure',duel:'K',v:2,src:'Rushers vacated the middle'},{when:'shell2',duel:'G',v:1,src:'Light box behind two deep'}],
    text:'Drop like it\'s a pass, then the quarterback runs up the vacated middle.',
    duels:{
      G:{label:'Sell the drop',off:['QB'],ot:['composure','iq'],def:['MIKE'],dt:['iq','composure'],bias:1,qbRead:true},
      K:{label:'Find the hole',off:['QB'],ot:['speed','iq'],def:['NT','DT3'],dt:['speed','technique'],bias:0,qbRun:true},
      F:{label:'Slide or score',off:['QB'],ot:['speed','power'],def:['BOXS'],dt:['speed','power'],bias:0,qbRun:true}},
    results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[3,1.5])],success:[R(1,'run',[8,2])],explosive:[R(1,'run',[16,6],{tail:.2})]}},
  hook_ladder:{id:'hook_ladder',side:'off',name:'Hook & Ladder',family:'constraint',punishes:'quick',cost:2,target:'Z',pass:true,trick:true,
    matchups:[{when:'zone',duel:'F',v:2,src:'Zone defenders converged on the hook'}],
    text:'TRICK · Hook route, then a pitch to the trailer at full speed. Once per game.',
    duels:{
      G:{label:'The hook',off:['Z'],ot:['technique','power'],def:['FCB'],dt:['technique','iq'],bias:1,release:true},
      K:{label:'The pitch',off:['Z'],ot:['composure','iq'],def:['WILL'],dt:['speed','iq'],bias:1},
      F:{label:'The trailer',off:['SLOT'],ot:['speed','versatility'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.5,'inc',[0,0],{int:.05}),R(.5,'catch',[4,2])],short:[R(1,'catch',[9,2])],success:[R(1,'catch',[22,5])],explosive:[R(1,'catch',[42,12],{tail:.5})]}}
});
Object.assign(CALLS,{
  tampa2:{id:'tampa2',side:'def',name:'Tampa 2',family:'zone',cost:1,box:'normal',shell:2,coverage:'zone',pressure:0,counters:['quick','deep'],look:{pressureShown:false},
    text:'The middle linebacker runs the deep middle. Two deep, nothing easy anywhere.'},
  ghost_blitz:{id:'ghost_blitz',side:'def',name:'Ghost Blitz',family:'pressure',cost:2,box:'normal',shell:2,coverage:'man',pressure:2,counters:['run','quick','deep'],look:{pressureShown:false},trick:true,
    effects:[{flag:'protect',v:1,src:'Nobody blocked the ghost'}],
    text:'TRICK · Two deep at the snap, then everybody comes. Once per game.'}
});
Object.assign(TACTICS,{
  hurry_up:{id:'hurry_up',side:'off',name:'Hurry-Up',cost:1,icon:'⏩',text:'Snap it before they adjust: their tactics this snap are wasted.'},
  audible:{id:'audible',side:'off',name:'Audible',cost:1,info:true,icon:'📣',reveal:['shell','pressure'],text:'Confirms the shell and the pressure. Cheaper than Check-With-Me; no coverage read.'},
  stunt:{id:'stunt',side:'def',name:'Stunt',cost:1,icon:'⤨',effects:[{flag:'protect',v:1},{flag:'run',duel:'G',v:-1}],text:'Twist the rushers: +1 on pressure, but −1 at the point of attack against the run.'},
  lock:{id:'lock',side:'def',name:'Lockdown',cost:1,icon:'🔒',effects:[{flag:'separation',v:1},{flag:'release',v:1}],text:'Every corner plays tight: +1 against separation and release.'}
});
Object.assign(RARITY,{rpo_bubble:'common',hb_wheel:'common',qb_draw:'common',hook_ladder:'legendary',tampa2:'common',ghost_blitz:'legendary',hurry_up:'rare',audible:'common',stunt:'common',lock:'rare'});

// Game-day decks for the sandbox: base plays are always on the sheet; wrinkles and tactics are drawn.
const DEFAULT_DECKS={
  off:{base:['inside_zone','outside_zone','quick_slant','stick'],
    wrinkles:['deep_cross','deep_cross','pa_boot','pa_boot','screen','screen','power','power','vertical_shot','vertical_shot','read_option','read_option'],
    tactics:['motion','motion','hard_count','hard_count','max_protect','max_protect','route_adjust','route_adjust','seal_block','seal_block','check_with_me','check_with_me']},
  def:{base:['two_high','cover1','cover3','run_fit'],
    wrinkles:['zone_pressure','zone_pressure','cover0','cover0','sim_pressure','sim_pressure','two_man','two_man','robber','robber','bear','bear'],
    tactics:['film_tell','film_tell','identify_protection','identify_protection','disguise','disguise','bracket','bracket','spy','spy','press','press']}
};

const RULES={seriesCommand:5,wrinkleRow:3,tacticHand:4,leanBase:4,redZone:80,twoMinute:120,fireStreak:3};

// --- Program cards (rules v0.6) ------------------------------------------------------------------------
// Not in random packs. Coaching-tree cards arrive with a coordinator's background, trick plays with milestones,
// Giant Killer with an upset. Same duel model as every other card: talent still decides.
Object.assign(PLAYS,{
  counter_trey:{id:'counter_trey',side:'off',name:'Counter Trey',family:'run',cost:1,carrier:'RB',program:'Ground Pressure',
    matchups:[{when:'pressure',duel:'K',v:1,src:'Flow went the wrong way'}],
    text:'COACHING TREE · Step one way, pull the guard and tackle back the other. Punishes fast flow.',
    duels:{
      G:{label:'Guard and tackle pull',off:['RG','TE'],ot:['power','speed'],def:['SET','NT'],dt:['power','technique'],bias:1},
      K:{label:'Counter step',off:['RB'],ot:['iq','speed'],def:['MIKE'],dt:['iq','speed'],bias:1},
      F:{label:'Downhill',off:['RB'],ot:['power','speed'],def:['BOXS'],dt:['power','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1.5,1.5])],short:[R(1,'run',[3,1.2])],success:[R(1,'run',[6.5,1.8])],explosive:[R(1,'run',[14,6],{tail:.16})]}},
  buck_sweep:{id:'buck_sweep',side:'off',name:'Buck Sweep',family:'run',cost:1,carrier:'RB',program:'Heavy Play Action',
    matchups:[{when:'light',duel:'G',v:1,src:'Two guards pulling into a light box'}],
    text:'COACHING TREE · Both guards pull and lead the back around the edge. An old Wing-T staple.',
    duels:{
      G:{label:'Guards on the move',off:['LG','RG'],ot:['speed','power'],def:['SET','WILL'],dt:['speed','power'],bias:1},
      K:{label:'Read the pullers',off:['RB'],ot:['iq','speed'],def:['FCB'],dt:['technique','power'],bias:0},
      F:{label:'Turn it up',off:['RB'],ot:['speed','versatility'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(1,'run',[-2,1.6])],short:[R(1,'run',[2.5,1.3])],success:[R(1,'run',[6,2])],explosive:[R(1,'run',[15,6],{tail:.18})]}},
  midline_option:{id:'midline_option',side:'off',name:'Midline Option',family:'run',cost:1,carrier:'QB',program:'Option Motion',needs:{role:'QB',trait:'speed',grade:6},
    matchups:[{when:'man',duel:'F',v:1,src:'Man defenders turned and ran'}],
    text:'COACHING TREE · Read the three-technique, keep it up the middle. Needs a QB who can run.',
    duels:{
      G:{label:'Read the 3-tech',off:['QB'],ot:['iq','composure'],def:['DT3'],dt:['iq','power'],bias:1,qbRead:true,qbRun:true},
      K:{label:'Squeeze the gap',off:['QB'],ot:['power','iq'],def:['MIKE'],dt:['power','iq'],bias:0,qbRun:true},
      F:{label:'Finish',off:['QB'],ot:['power','speed'],def:['BOXS'],dt:['power','speed'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.4])],short:[R(1,'run',[3,1.3])],success:[R(1,'run',[6.5,2])],explosive:[R(1,'run',[14,6],{tail:.18})]}},
  choice_route:{id:'choice_route',side:'off',name:'Choice Route',family:'quick',cost:1,target:'SLOT',pass:true,program:'Tempo Spread',
    matchups:[{when:'man',duel:'G',v:1,src:'He broke away from the man leverage'}],
    text:'COACHING TREE · The slot reads the defender and breaks in, out or up. A run-and-shoot answer.',
    duels:{
      G:{label:'Read leverage',off:['SLOT'],ot:['iq','technique'],def:['NICKEL'],dt:['iq','technique'],bias:1,release:true},
      K:{label:'See it together',off:['QB'],ot:['iq','composure'],def:['WILL'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'After the catch',off:['SLOT'],ot:['speed','versatility'],def:['FS'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.04}),R(.2,'catch',[2,1.5])],short:[R(.45,'inc',[0,0],{int:.03}),R(.55,'catch',[4.5,1.5])],success:[R(.88,'catch',[8,2]),R(.12,'inc',[0,0],{int:.02})],explosive:[R(1,'catch',[15,6],{tail:.1})]}},
  dagger:{id:'dagger',side:'off',name:'Dagger',family:'deep',cost:1,target:'X',pass:true,protection:true,program:'Vertical Strike',
    matchups:[{when:'shell2',duel:'K',v:1,src:'The seam cleared the dig'}],
    text:'COACHING TREE · The slot clears the safety, X runs the dig underneath him.',
    duels:{
      G:{label:'Protection',off:['LT','RT'],ot:['technique','power'],def:['RUSH','SET'],dt:['speed','technique'],bias:1,protect:true},
      K:{label:'Win the dig',off:['X'],ot:['technique','speed'],def:['BCB'],dt:['technique','speed'],bias:0,separation:true},
      F:{label:'Throw the window',off:['QB'],ot:['iq','composure'],def:['MIKE'],dt:['iq','speed'],bias:0,qbRead:true}},
    results:{fail:[R(.3,'sack',[-7,2]),R(.47,'inc',[0,0],{int:.05}),R(.23,'catch',[4,2])],short:[R(.58,'inc',[0,0],{int:.05}),R(.42,'catch',[7,2])],success:[R(.66,'catch',[14,4]),R(.34,'inc',[0,0],{int:.04})],explosive:[R(1,'catch',[23,8],{tail:.12})]}},
  smash:{id:'smash',side:'off',name:'Smash',family:'quick',cost:1,target:'Z',pass:true,program:'Rhythm Control',
    matchups:[{when:'zone',duel:'K',v:1,src:'High-low on the corner'}],
    text:'COACHING TREE · Hitch underneath, corner route over the top. Puts one zone defender in a bind.',
    duels:{
      G:{label:'Release',off:['Z'],ot:['technique','speed'],def:['FCB'],dt:['technique','speed'],bias:1,release:true},
      K:{label:'Read the corner',off:['QB'],ot:['iq','technique'],def:['FCB'],dt:['iq','technique'],bias:0,qbRead:true},
      F:{label:'Corner route',off:['Z'],ot:['speed','technique'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.04}),R(.2,'catch',[3,1.5])],short:[R(.45,'inc',[0,0],{int:.03}),R(.55,'catch',[5,1.5])],success:[R(.85,'catch',[10,3]),R(.15,'inc',[0,0],{int:.03})],explosive:[R(1,'catch',[19,6],{tail:.1})]}},
  flea_flicker:{id:'flea_flicker',side:'off',name:'Flea Flicker',family:'deep',cost:2,target:'X',pass:true,protection:true,trick:true,
    matchups:[{when:'loaded',duel:'K',v:2,src:'The safeties bit on the handoff'}],
    text:'TRICK · Hand off, pitch it back, throw it deep. Earned with a three-game winning streak. Once per game.',
    duels:{
      G:{label:'Sell the run',off:['RB'],ot:['iq','composure'],def:['MIKE'],dt:['iq','composure'],bias:1,fake:true},
      K:{label:'Behind them',off:['X'],ot:['speed','technique'],def:['FS'],dt:['speed','iq'],bias:1,separation:true},
      F:{label:'Pitch and throw',off:['QB'],ot:['composure','technique'],def:['RUSH'],dt:['speed','technique'],bias:0,qbRead:true}},
    results:{fail:[R(.4,'sack',[-9,2]),R(.45,'inc',[0,0],{int:.08}),R(.15,'catch',[5,2])],short:[R(.6,'inc',[0,0],{int:.08}),R(.4,'catch',[12,3])],success:[R(.75,'catch',[28,6]),R(.25,'inc',[0,0],{int:.05})],explosive:[R(1,'catch',[42,12],{tail:.45})]}},
  jet_reverse:{id:'jet_reverse',side:'off',name:'Jet Reverse',family:'constraint',punishes:'pressure',cost:2,carrier:'Z',trick:true,
    matchups:[{when:'pressure',duel:'K',v:2,src:'Pursuit overran the reverse'}],
    text:'TRICK · Jet motion one way, the receiver takes it back the other. Earned with a postseason win. Once per game.',
    duels:{
      G:{label:'Fake the jet',off:['RB'],ot:['iq','speed'],def:['SET'],dt:['iq','composure'],bias:1},
      K:{label:'The exchange',off:['Z'],ot:['speed','versatility'],def:['WILL'],dt:['speed','iq'],bias:1},
      F:{label:'Beat them to the edge',off:['Z'],ot:['speed','composure'],def:['BCB'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(1,'run',[-5,2])],short:[R(1,'run',[3,2])],success:[R(1,'run',[13,4])],explosive:[R(1,'run',[30,12],{tail:.4})]}}
});
Object.assign(CALLS,{
  cover4_match:{id:'cover4_match',side:'def',name:'Cover 4 Match',family:'zone',cost:1,box:'normal',shell:2,coverage:'zone',pressure:0,counters:['deep','run'],look:{pressureShown:false},program:'Match Quarters',
    text:'COACHING TREE · Four deep, but the safeties fit the run when the receivers stay home.'},
  double_eagle:{id:'double_eagle',side:'def',name:'Double Eagle',family:'pressure',cost:1,box:'loaded',shell:1,coverage:'man',pressure:1,counters:['run','quick'],look:{pressureShown:true},program:'Odd Front Control',
    text:'COACHING TREE · Cover the center and both guards, walk a linebacker down. Suffocates the run.'},
  fire_zone:{id:'fire_zone',side:'def',name:'Fire Zone',family:'pressure',cost:1,box:'normal',shell:1,coverage:'zone',pressure:1,counters:['quick','deep'],look:{pressureShown:false},program:'Pressure Multiple',
    effects:[{flag:'qbRead',v:1,src:'A dropped end in the throwing lane'}],
    text:'COACHING TREE · Five rush from anywhere, an end drops into the passing lane. QB reads −1 for them.'},
  wide_nine:{id:'wide_nine',side:'def',name:'Wide Nine',family:'pressure',cost:1,box:'light',shell:1,coverage:'zone',pressure:1,counters:['deep'],look:{pressureShown:false},program:'Four-Down Attack',
    effects:[{flag:'protect',v:1,src:'Wide-nine rush angles'},{flag:'run',duel:'G',v:-1,src:'Wide ends open the middle'}],
    text:'COACHING TREE · Ends align outside the tight end and fly. Pressure +1, but softer at the point of attack.'},
  man_free:{id:'man_free',side:'def',name:'Man Free Press',family:'man',cost:2,box:'normal',shell:1,coverage:'man',pressure:0,counters:['quick','deep'],look:{pressureShown:true},program:'Aggressive Man',
    effects:[{flag:'separation',v:1,src:'Pressed and squeezed'}],
    text:'COACHING TREE · Everyone pressed, one free safety. +1 against separation.'},
  bluff_zero:{id:'bluff_zero',side:'def',name:'Bluff Zero',family:'zone',cost:2,box:'loaded',shell:2,coverage:'zone',pressure:0,counters:['quick','deep'],look:{pressureShown:true},trick:true,
    effects:[{flag:'qbRead',v:2,src:'Showed zero, dropped eight'}],
    text:'TRICK · Show all-out pressure, drop eight. Earned by holding a winner to 7 points or fewer. Once per game.'}
});
Object.assign(TACTICS,{
  giant_killer:{id:'giant_killer',side:'off',name:'Giant Killer',cost:2,icon:'🪨',effects:[{duel:'K',v:1}],text:'Earned by upsetting a top-10 team. +1 on the Key duel of any play.'}
});
Object.assign(RARITY,{counter_trey:'rare',buck_sweep:'rare',midline_option:'rare',choice_route:'rare',dagger:'rare',smash:'rare',flea_flicker:'rare',jet_reverse:'rare',
  cover4_match:'rare',double_eagle:'rare',fire_zone:'rare',wide_nine:'rare',man_free:'rare',bluff_zero:'rare',giant_killer:'rare'});
// --- Two-minute drill, weather and timeout cards (rules v0.7) ------------------------------------------
// Drill cards are free and appear on their own in the last two minutes of a half; clockStop caps the clock a snap uses.
Object.assign(PLAYS,{
  sideline_out:{id:'sideline_out',side:'off',name:'Sideline Out',family:'quick',cost:0,target:'Z',pass:true,drill:true,clockStop:7,
    text:'TWO-MINUTE DRILL · Throw it outside and get out of bounds. A completion stops the clock.',
    duels:{
      G:{label:'Release outside',off:['Z'],ot:['technique','speed'],def:['FCB'],dt:['technique','speed'],bias:1,release:true},
      K:{label:'Throw it outside',off:['QB'],ot:['technique','composure'],def:['FCB'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'Feet in, out of bounds',off:['Z'],ot:['technique','iq'],def:['FS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.85,'inc',[0,0],{int:.05}),R(.15,'catch',[2,1])],short:[R(.5,'inc',[0,0],{int:.03}),R(.5,'catch',[5,1.5])],success:[R(.9,'catch',[9,2]),R(.1,'inc',[0,0],{int:.02})],explosive:[R(1,'catch',[16,5],{tail:.06})]}},
  spike:{id:'spike',side:'off',name:'Spike',family:'quick',cost:0,target:null,pass:true,drill:true,clockStop:3,
    text:'TWO-MINUTE DRILL · Spike it to stop the clock. Costs a down, never the ball.',
    duels:{
      G:{label:'Line up',off:['QB'],ot:['composure'],def:['MIKE'],dt:['iq'],bias:3},
      K:{label:'Snap',off:['C'],ot:['technique'],def:['NT'],dt:['technique'],bias:3},
      F:{label:'Clock stops',off:['QB'],ot:['iq'],def:['FS'],dt:['iq'],bias:3}},
    results:{fail:[R(1,'inc',[0,0],{int:0})],short:[R(1,'inc',[0,0],{int:0})],success:[R(1,'inc',[0,0],{int:0})],explosive:[R(1,'inc',[0,0],{int:0})]}},
  wishbone_dive:{id:'wishbone_dive',side:'off',name:'Wishbone Dive',family:'run',cost:1,carrier:'RB',
    matchups:[{when:'snow',duel:'G',v:1,src:'Snow game: grind it inside'},{when:'rain',duel:'G',v:1,src:'Wet ball: keep it on the ground'}],
    text:'An old three-back dive straight ahead. Better in rain and snow.',
    duels:{
      G:{label:'Double the nose',off:['C','LG'],ot:['power','technique'],def:['NT'],dt:['power','durability'],bias:1},
      K:{label:'Hit it fast',off:['RB'],ot:['power','iq'],def:['MIKE'],dt:['power','iq'],bias:0},
      F:{label:'Fall forward',off:['RB'],ot:['power','durability'],def:['BOXS'],dt:['power','technique'],bias:0}},
    results:{fail:[R(1,'run',[-.5,1.2])],short:[R(1,'run',[2.8,1])],success:[R(1,'run',[5,1.3])],explosive:[R(1,'run',[10,4],{tail:.08})]}},
  power_lead:{id:'power_lead',side:'off',name:'Power Lead',family:'run',cost:1,carrier:'RB',
    matchups:[{when:'wind',duel:'K',v:1,src:'Wind game: lean on the lead block'},{when:'snow',duel:'K',v:1,src:'Snow game: lean on the lead block'}],
    text:'The tight end leads through the hole. Better when the wind or snow takes the ball out of the air.',
    duels:{
      G:{label:'Down blocks',off:['RG','RT'],ot:['power','technique'],def:['DT3','SET'],dt:['power','technique'],bias:1},
      K:{label:'Lead block',off:['TE'],ot:['power','durability'],def:['MIKE'],dt:['power','composure'],bias:0},
      F:{label:'Finish',off:['RB'],ot:['power','speed'],def:['BOXS'],dt:['power','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.4])],short:[R(1,'run',[3,1.1])],success:[R(1,'run',[6,1.6])],explosive:[R(1,'run',[12,5],{tail:.1})]}}
});
Object.assign(TACTICS,{
  timeout_settle:{id:'timeout_settle',side:'off',name:'Timeout: Settle Down',cost:1,icon:'⏸',effects:[{when:'money',duel:'K',v:1}],text:'Burn a timeout before a big down. 3rd and 4th down only: +1 on the Key duel.'},
  timeout_ice:{id:'timeout_ice',side:'def',name:'Timeout: Ice Them',cost:1,icon:'🧊',effects:[{when:'money',duel:'K',v:1}],text:'Freeze them before a big down. 3rd and 4th down only: their Key duel −1.'}
});
Object.assign(RARITY,{sideline_out:'common',spike:'common',wishbone_dive:'common',power_lead:'common',timeout_settle:'common',timeout_ice:'common'});
const DRILL_CARDS=['sideline_out','spike'];

// --- Special teams and situational cards (rules v0.9) ----------------------------------------------------
// fourthOnly plays appear only on 4th down after choosing to go for it (the defense lined up for a kick).
// special tactics never enter a hand: they act on their own at the right moment (onside kick, two-point try).
Object.assign(PLAYS,{
  fake_punt:{id:'fake_punt',side:'off',name:'Fake Punt',family:'constraint',punishes:'pressure',cost:1,carrier:'RB',trick:true,fourthOnly:true,
    text:'TRICK · Line up to punt, snap it to the up-back. 4th down only. Once per game.',
    duels:{
      G:{label:'Sell the punt',off:['C'],ot:['composure','technique'],def:['RUSH'],dt:['iq','composure'],bias:2},
      K:{label:'Up-back takes it',off:['RB'],ot:['speed','power'],def:['WILL'],dt:['speed','iq'],bias:1},
      F:{label:'Past the sticks',off:['RB'],ot:['power','speed'],def:['BOXS'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(1,'run',[0,1.5])],short:[R(1,'run',[3,1.5])],success:[R(1,'run',[9,3])],explosive:[R(1,'run',[24,10],{tail:.3})]}},
  fake_field_goal:{id:'fake_field_goal',side:'off',name:'Fake Field Goal',family:'constraint',punishes:'pressure',cost:1,target:'TE',pass:true,trick:true,fourthOnly:true,
    text:'TRICK · The holder stands up and throws to the tight end leaking out. 4th down only. Once per game.',
    duels:{
      G:{label:'Hold the kick look',off:['TE'],ot:['iq','technique'],def:['SET'],dt:['iq','composure'],bias:2,release:true},
      K:{label:'Holder throws',off:['QB'],ot:['composure','technique'],def:['MIKE'],dt:['iq','speed'],bias:1,qbRead:true},
      F:{label:'Leaking tight end',off:['TE'],ot:['technique','speed'],def:['BOXS'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.85,'inc',[0,0],{int:.05}),R(.15,'catch',[2,1])],short:[R(.5,'inc',[0,0],{int:.03}),R(.5,'catch',[5,2])],success:[R(.9,'catch',[11,3]),R(.1,'inc',[0,0])],explosive:[R(1,'catch',[25,9],{tail:.25})]}},
  fade_route:{id:'fade_route',side:'off',name:'Fade',family:'quick',cost:1,target:'X',pass:true,
    matchups:[{when:'redzone',duel:'F',v:2,src:'Red zone: back-shoulder space'}],
    text:'Throw it to the back corner and let him go get it. Built for the red zone.',
    duels:{
      G:{label:'Win the release',off:['X'],ot:['power','technique'],def:['BCB'],dt:['power','technique'],bias:1,release:true},
      K:{label:'Ball placement',off:['QB'],ot:['technique','composure'],def:['BCB'],dt:['technique','iq'],bias:0,qbRead:true},
      F:{label:'High point',off:['X'],ot:['power','composure'],def:['BCB'],dt:['power','composure'],bias:0}},
    results:{fail:[R(.85,'inc',[0,0],{int:.05}),R(.15,'catch',[3,2])],short:[R(.6,'inc',[0,0],{int:.04}),R(.4,'catch',[6,2])],success:[R(.75,'catch',[11,3]),R(.25,'inc',[0,0],{int:.03})],explosive:[R(1,'catch',[20,6],{tail:.1})]}}
});
Object.assign(PLAYS,{
  quick_kick:{id:'quick_kick',side:'off',name:'Quick Kick',family:'constraint',cost:1,quickKick:true,thirdOnly:true,
    text:'OLD SCHOOL · Punt on 3rd down from a running formation. Nobody is back to return it, so it rolls. 3rd down only.',
    duels:{
      G:{label:'Line up to run',off:['C'],ot:['technique'],def:['NT'],dt:['technique'],bias:2},
      K:{label:'Direct snap',off:['RB'],ot:['composure'],def:['MIKE'],dt:['iq'],bias:2},
      F:{label:'Boot it',off:['RB'],ot:['power'],def:['FS'],dt:['speed'],bias:2}},
    results:{fail:[R(1,'run',[0,0])],short:[R(1,'run',[0,0])],success:[R(1,'run',[0,0])],explosive:[R(1,'run',[0,0])]}}
});
RARITY.quick_kick='rare';
Object.assign(TACTICS,{
  kill_kill:{id:'kill_kill',side:'off',name:'Kill, Kill',cost:1,icon:'🔁',effects:[{flag:'countered',duel:'K',v:1}],text:'Two plays called in the huddle. If their call is built to stop yours, the QB checks to the other one: +1 on the Key duel.'},
  onside_kick:{id:'onside_kick',side:'off',name:'Onside Kick',cost:0,icon:'🦶',special:'onside',text:'Special teams. Plays itself: late in the 4th, trailing, your next kickoff is an onside try. Recovery depends on your hands team. Once per game.'},
  swinging_gate:{id:'swinging_gate',side:'off',name:'Swinging Gate',cost:0,icon:'🚪',special:'twoPoint',text:'Special teams. Plays itself: in the second half, when the chart says go for two after a touchdown, you shift into the gate. Two-point try +12%. Once per game.'}
});
Object.assign(RARITY,{fake_punt:'rare',fake_field_goal:'rare',fade_route:'common',kill_kill:'rare',onside_kick:'rare',swinging_gate:'rare'});

// --- Eras of football (rules v0.10) --------------------------------------------------------------------
// Single wing, the option, the West Coast and the 46: cards from football's history, collected in albums and favored
// by their era's season.
Object.assign(PLAYS,{
  spinner:{id:'spinner',side:'off',name:'Spinner Series',family:'run',cost:1,carrier:'RB',era:'single_wing',
    matchups:[{when:'man',duel:'K',v:1,src:'The spin hid the ball'}],
    text:'SINGLE WING · Direct snap, the tailback spins and fakes before hitting it. Hides the ball from man defenders.',
    duels:{
      G:{label:'Unbalanced line',off:['LT','LG','C'],ot:['power','technique'],def:['NT','SET'],dt:['power','technique'],bias:1},
      K:{label:'The spin fake',off:['RB'],ot:['iq','versatility'],def:['MIKE'],dt:['iq','composure'],bias:0,fake:true},
      F:{label:'North and south',off:['RB'],ot:['power','speed'],def:['BOXS'],dt:['power','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[3,1.2])],success:[R(1,'run',[6.5,1.8])],explosive:[R(1,'run',[14,6],{tail:.15})]}},
  buck_lateral:{id:'buck_lateral',side:'off',name:'Buck Lateral',family:'constraint',punishes:'run',cost:1,target:'SLOT',pass:true,era:'single_wing',
    matchups:[{when:'loaded',duel:'G',v:1,src:'The fullback buck pulled them in'}],
    text:'SINGLE WING · The fullback bucks into the line, laterals back, and the wingback throws. Punishes a run lean.',
    duels:{
      G:{label:'Sell the buck',off:['RB'],ot:['power','iq'],def:['MIKE'],dt:['iq','composure'],bias:1,fake:true},
      K:{label:'The lateral',off:['QB'],ot:['technique','composure'],def:['WILL'],dt:['speed','iq'],bias:0,qbRead:true},
      F:{label:'Wingback leaks out',off:['SLOT'],ot:['speed','technique'],def:['NICKEL'],dt:['speed','iq'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.05}),R(.2,'catch',[2,1.5])],short:[R(.5,'inc',[0,0],{int:.04}),R(.5,'catch',[6,2])],success:[R(.85,'catch',[13,4]),R(.15,'inc',[0,0])],explosive:[R(1,'catch',[25,9],{tail:.2})]}},
  triple_option:{id:'triple_option',side:'off',name:'Triple Option',family:'run',cost:1,carrier:'QB',era:'option',needs:{role:'QB',trait:'speed',grade:7},
    matchups:[{when:'man',duel:'F',v:1,src:'Nobody took the pitch man'}],
    text:'OPTION ERA · Read the dive, read the keep, pitch it. Three defenders, three decisions. Needs a QB who can run.',
    duels:{
      G:{label:'Dive read',off:['RB'],ot:['power','iq'],def:['DT3'],dt:['power','iq'],bias:1,qbRead:true},
      K:{label:'Keep read',off:['QB'],ot:['iq','speed'],def:['SET'],dt:['iq','speed'],bias:0,qbRun:true},
      F:{label:'The pitch',off:['QB'],ot:['speed','versatility'],def:['FS'],dt:['speed','iq'],bias:0,qbRun:true}},
    results:{fail:[R(1,'run',[-1.5,1.8])],short:[R(1,'run',[3,1.5])],success:[R(1,'run',[7,2.2])],explosive:[R(1,'run',[17,7],{tail:.22})]}},
  split_veer:{id:'split_veer',side:'off',name:'Split Veer',family:'run',cost:1,carrier:'RB',era:'option',
    matchups:[{when:'pressure',duel:'G',v:1,src:'The read left the blitzer unblocked on purpose'}],
    text:'OPTION ERA · Split backs, read the defensive tackle, give or keep. Turns pressure into a running lane.',
    duels:{
      G:{label:'Read the tackle',off:['QB'],ot:['iq','composure'],def:['DT3'],dt:['iq','power'],bias:1,qbRead:true},
      K:{label:'Hit the seam',off:['RB'],ot:['speed','iq'],def:['MIKE'],dt:['speed','iq'],bias:0},
      F:{label:'Finish',off:['RB'],ot:['speed','power'],def:['BOXS'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(1,'run',[-1,1.5])],short:[R(1,'run',[3,1.3])],success:[R(1,'run',[6.5,2])],explosive:[R(1,'run',[15,6],{tail:.18})]}},
  shallow_cross:{id:'shallow_cross',side:'off',name:'Shallow Cross',family:'quick',cost:0,target:'SLOT',pass:true,era:'west_coast',
    matchups:[{when:'zone',duel:'K',v:1,src:'Found the hole underneath the zone'}],
    text:'WEST COAST · A drag route under the linebackers, caught on the run. Timing beats zone.',
    duels:{
      G:{label:'Release',off:['SLOT'],ot:['speed','technique'],def:['NICKEL'],dt:['speed','technique'],bias:1,release:true},
      K:{label:'Throw on rhythm',off:['QB'],ot:['technique','iq'],def:['WILL'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'Run after catch',off:['SLOT'],ot:['speed','versatility'],def:['MIKE'],dt:['speed','technique'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.04}),R(.2,'catch',[2,1.5])],short:[R(.45,'inc',[0,0],{int:.03}),R(.55,'catch',[4,1.5])],success:[R(.88,'catch',[7.5,2]),R(.12,'inc',[0,0],{int:.02})],explosive:[R(1,'catch',[15,6],{tail:.1})]}},
  curl_flat:{id:'curl_flat',side:'off',name:'Curl-Flat',family:'quick',cost:1,target:'Z',pass:true,era:'west_coast',
    matchups:[{when:'shell1',duel:'K',v:1,src:'High-low on the flat defender'}],
    text:'WEST COAST · The receiver curls, the back runs to the flat. Make the flat defender wrong.',
    duels:{
      G:{label:'Push vertical',off:['Z'],ot:['speed','technique'],def:['FCB'],dt:['speed','technique'],bias:1,release:true},
      K:{label:'Read the flat',off:['QB'],ot:['iq','technique'],def:['BOXS'],dt:['iq','speed'],bias:0,qbRead:true},
      F:{label:'Sit it down',off:['Z'],ot:['technique','power'],def:['FCB'],dt:['technique','power'],bias:0}},
    results:{fail:[R(.8,'inc',[0,0],{int:.04}),R(.2,'catch',[3,1.5])],short:[R(.45,'inc',[0,0],{int:.03}),R(.55,'catch',[5,1.5])],success:[R(.85,'catch',[9,2]),R(.15,'inc',[0,0],{int:.02})],explosive:[R(1,'catch',[16,5],{tail:.08})]}}
});
Object.assign(CALLS,{
  forty_six:{id:'forty_six',side:'def',name:'46 Defense',family:'pressure',cost:2,box:'loaded',shell:1,coverage:'man',pressure:1,counters:['run','quick'],look:{pressureShown:true},era:'blitz',
    effects:[{flag:'protect',v:1,src:'Both guards and the center covered'}],
    text:'46 · Eight men up, both guards and the center covered, everyone attacks. Pressure +1; thin behind.'},
  zone_blitz:{id:'zone_blitz',side:'def',name:'Zone Blitz',family:'pressure',cost:1,box:'normal',shell:1,coverage:'zone',pressure:1,counters:['quick','deep'],look:{pressureShown:true},era:'blitz',
    effects:[{flag:'qbRead',v:1,src:'A lineman dropped into the hot throw'}],
    text:'ZONE BLITZ · Send a linebacker, drop a lineman into the hot route. QB reads −1 for them.'}
});
Object.assign(TACTICS,{
  two_way_star:{id:'two_way_star',side:'off',name:'Two-Way Star',cost:1,icon:'♾',effects:[{flag:'versatile',v:1}],text:'IRON MAN · Your most versatile players never leave the field: +1 on any duel where an offensive player with versatility 8+ is in it.'}
});
Object.assign(RARITY,{spinner:'rare',buck_lateral:'rare',triple_option:'rare',split_veer:'common',shallow_cross:'common',curl_flat:'common',forty_six:'rare',zone_blitz:'common',two_way_star:'rare'});

// --- Combos (rules v0.8) -------------------------------------------------------------------------------
// Real sequencing: set something up, then make them pay. Each is checked before a snap from this drive's memory
// (c.fams / c.plays / c.calls / c.results, oldest first) and gives one labeled +1 (v is from the offense's point of
// view, so defensive combos are negative) plus +1 Command to the side that earned it. Each team completes each combo at most once per half.
const lastN=(a,n)=>a.length>=n?a.slice(-n):null;
const COMBOS=[
  {id:'establish',name:'Establish the Run',side:'off',duel:'K',v:1,how:'Run, run, then play-action (PA Boot)',reward:'Key +1 and +1 Command',
    test:c=>c.root==='pa_boot'&&!!lastN(c.fams,2)?.every(f=>f==='run')},
  {id:'shot_after_run',name:'Shot After the Run',side:'off',duel:'F',v:1,how:'Run, run, then a deep pass',reward:'Finish +1 and +1 Command',
    test:c=>c.play.family==='deep'&&!c.play.trick&&!!lastN(c.fams,2)?.every(f=>f==='run')},
  {id:'sell_the_slant',name:'Sell the Slant',side:'off',duel:'K',v:1,how:'Two quick passes, then a deep pass',reward:'Key +1 and +1 Command',
    test:c=>c.play.family==='deep'&&!c.play.trick&&!!lastN(c.fams,2)?.every(f=>f==='quick')},
  {id:'screen_the_heat',name:'Screen the Heat',side:'off',duel:'G',v:1,how:'A screen right after they blitzed',reward:'Gate +1 and +1 Command',
    test:c=>['screen','jailbreak','tunnel','rpo_bubble'].includes(c.root)&&!!c.calls.length&&c.calls.at(-1).pressure>0},
  {id:'counter_the_flow',name:'Counter the Flow',side:'off',duel:'G',v:1,how:'An outside run, then a counter',reward:'Gate +1 and +1 Command',
    test:c=>['counter_trey','counter','split_zone'].includes(c.root)&&['outside_zone','buck_sweep','jet_sweep','toss_crack','jet_reverse'].includes(c.plays.at(-1))},
  {id:'show_and_bail',name:'Show and Bail',side:'def',duel:'K',v:-1,how:'Defense: blitz, then show the same look and drop into a two-deep shell',reward:'Their Key −1 and +1 Command',
    test:c=>!!c.call&&c.call.shell===2&&c.call.pressure===0&&!!c.call.look?.pressureShown&&!!c.calls.length&&c.calls.at(-1).pressure>0},
  {id:'wall_up',name:'Wall Up',side:'def',duel:'G',v:-1,how:'Defense: stuff two runs in a row, then they run again',reward:'Their Gate −1 and +1 Command',
    test:c=>!!c.call&&c.play.family==='run'&&!!lastN(c.results,2)?.every(r=>r.family==='run'&&r.yards<=2)}
];

// Which program card each coordinator background teaches (Dynasty Lab scheme names).
const SCHEME_CARDS={'Ground Pressure':'counter_trey','Heavy Play Action':'buck_sweep','Option Motion':'midline_option','Tempo Spread':'choice_route','Vertical Strike':'dagger','Rhythm Control':'smash','Multiple':'smash',
  'Match Quarters':'cover4_match','Split-Safety Control':'cover4_match','Odd Front Control':'double_eagle','Contain & Rally':'double_eagle','Pressure Multiple':'fire_zone','Four-Down Attack':'wide_nine','Aggressive Man':'man_free'};
const PROGRAM_CARDS=['counter_trey','buck_sweep','midline_option','choice_route','dagger','smash','flea_flicker','jet_reverse','cover4_match','double_eagle','fire_zone','wide_nine','man_free','bluff_zero','giant_killer'];

return{COMBOS,DRILL_CARDS,SCHEME_CARDS,PROGRAM_CARDS,STYLES,STYLE_TRAITS,TRAITS,OFF_ROLES,DEF_ROLES,WIN_CHANCE,chip,PLAYS,CALLS,TACTICS,SIGNATURES,DEFAULT_DECKS,RULES,RARITY,rarityOf};
});
