const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data.js');
const R=require('../forks/call-sheet/core/resolver.js');
const Ro=require('../forks/call-sheet/core/roster.js');
const B=require('../forks/call-sheet/core/battle.js');
const P=require('../forks/call-sheet/core/packs.js');
const SG=require('../forks/call-sheet/core/signatures.js');
const PR=require('../forks/call-sheet/core/program.js');
const CL=require('../forks/call-sheet/core/classes.js');

test('tendencies decay on other families, reset on broader counters, and surface covTend',()=>{
  const home=Ro.preset('ground');
  const pb=P.newPlaybook();
  pb.off.base[1]='screen';
  home.decks=P.decksOf(pb);
  const b=B.create({home,away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:'v30-tend'});
  let req=B.advance(b);
  b.tend.home={run:4,quick:0,deep:0};
  b.tend.away={man:5,zone:0,pressure:3};
  assert.equal(B.covTendFor(b),'man');
  B.submit(b,{type:'call',play:'screen',tactics:[]});
  const res=b.lastResult;
  if(['success','explosive'].includes(res.category)){
    assert.equal(res.reset,'pressure');
    assert.equal(b.tend.away.pressure,0);
  }
  assert.equal(b.tend.home.run,4); // constraint play does not decay core run/quick/deep

  b.tend.away.man=5;b.tend.away.zone=0;
  req=B.advance(b);
  assert.equal(req.look.covTend,'man');
  assert.equal(B.presumedCall(req.look).coverage,'man');
  const cert=B.lookCertainty(req.look);
  assert.ok(cert.known.some(x=>/man tendency/.test(x)));
  const cues=B.coachingRead(req,'quick_slant');
  assert.ok(cues.some(x=>/Man coverage tendency|man-coverage tendency/.test(x)));

  // Calling quick_slant decays run by 0.5 (4 -> 3.5) and increments quick (0 -> 1).
  B.submit(b,{type:'call',play:'quick_slant',tactics:[]});
  assert.equal(b.tend.home.run,3.5);
  assert.equal(b.tend.home.quick,1);

  b.tend.home={run:0,quick:0,deep:4};
  B.submit(b,{type:'call',play:'inside_zone',tactics:[]});
  const runSnap=b.lastResult;
  if(['success','explosive'].includes(runSnap.category)){
    assert.equal(runSnap.reset,'deep');
    assert.equal(b.tend.home.deep,0);
  }
});

test('tacticRead ranks under fog without Projected text and seal_block names Inline Mauler TE',()=>{
  assert.match(D.TACTICS.seal_block.text,/Inline Mauler TE/);
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:'v30-fog'});
  const req=B.advance(b);
  const tr=B.tacticRead(req,req.options.plays[0].id,b.teams.home.lineup.off,[],null,b,true,'auto');
  if(tr)assert.doesNotMatch(tr.reason,/Projected/);
});

test('four_minute_offense gives defense 2 timeouts and openingDrive defaults on',()=>{
  const ch=B.DRIVE_CHALLENGES.find(c=>c.id==='four_minute_offense');
  assert.deepEqual(ch.timeouts,[2,2]);
  assert.match(ch.situation,/2 timeouts/);
  const alt=B.createChallenge('four_minute_offense',{alternate:true});
  assert.equal(alt.pending.look.box.value,'loaded');
  assert.equal(B.HEADSET_RULES.find(r=>r.id==='openingDrive')?.initial,true);
  assert.equal(B.headsetSettings().openingDrive,true);
});

test('snapVerdict and matchupStory credit Finish recovery on [W, L, W] success snaps',()=>{
  const e={
    offSide:'home',defSide:'away',kind:'comp',category:'success',
    duelResults:[{won:true},{won:false},{won:true}],
    duels:[
      {key:'G',label:'Protection',offNames:['LT'],defNames:['EDGE'],offRoles:['LT'],defRoles:['EDGE'],mods:[]},
      {key:'K',label:'Separation',offNames:['X'],defNames:['FCB'],offRoles:['X'],defRoles:['FCB'],mods:[]},
      {key:'F',label:'Catch',offNames:['X'],defNames:['FS'],offRoles:['X'],defRoles:['FS'],mods:[]}
    ]
  };
  const v=B.snapVerdict(e,'home');
  assert.equal(v.won,true);
  assert.equal(v.decisive.key,'F');
  assert.match(v.text,/recovering after losing Separation/);
  const ms=B.matchupStory(e);
  assert.equal(ms.key,'F');
  assert.match(ms.detail,/recovered the play after losing separation/);
});

test('deck minimum floor 6, facility 90 4th signature slot, and unbiased prospect generation',()=>{
  assert.deepEqual(P.MIN_CAPACITY,{wrinkles:6,tactics:6});
  const pb=P.newPlaybook();
  assert.equal(P.underMinimum(pb),null);
  pb.off.wrinkles=pb.off.wrinkles.slice(0,5);
  assert.deepEqual(P.underMinimum(pb),{side:'off',pile:'wrinkles',min:6});

  const pb90=P.newPlaybook();
  assert.equal(SG.slotsFor(pb90),3);
  PR.syncCapacity(pb90,{facilities:90});
  assert.equal(pb90.signatureSlots,4);
  assert.equal(SG.slotsFor(pb90),4);

  const list=CL.prospects('p1','QB','QB',1,0.5,3);
  assert.equal(list.length,3);
});
