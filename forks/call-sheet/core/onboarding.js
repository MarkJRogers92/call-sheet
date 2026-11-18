// A short, optional first offensive drive. Only presentation controls change, never the football or RNG.
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./battle.js'):root.CallSheet.battle);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CallSheet.onboarding=api;
})(typeof window==='object'?window:globalThis,function(B){
'use strict';
function eligible(save){return !save?.seenHelp&&!(save?.games>0)&&!save?.settings?.guidedDriveDone}
function start(b){
  if(!b?.user||b.guidedDrive)return false;
  b.guidedDrive={active:true,done:false,mode:b.mode,control:b.control,drive:null};
  b.mode='snap';b.control='offense';
  return true;
}
function skip(b){
  const guide=b?.guidedDrive;if(!guide?.active)return false;
  b.mode=guide.mode;b.control=guide.control;guide.active=false;guide.done=true;
  return true;
}
// Call after advance/submit and on resume. The engine may already have simulated the opposing possession;
// its monotonically increasing drive number still tells us the guided possession ended.
function update(b){
  const guide=b?.guidedDrive;if(!guide?.active)return false;
  if(b.game.status==='final')return skip(b);
  if(guide.drive==null){
    if(b.pending?.side===b.user&&(b.pending.role==='off'||b.pending.kind==='fourth')&&b.game.possession===b.user)guide.drive=b.game.drive;
    return false;
  }
  return b.game.drive!==guide.drive||b.game.possession!==b.user?skip(b):false;
}
function hint(req,playId){
  if(req?.kind!=='snap'||req.role!=='off')return'';
  if(!playId){
    const box=req.look?.box;
    const cue=box?.confirmed&&box.value==='loaded'?' They have loaded the box: runs face a tougher Gate, so compare a pass.':box?.confirmed&&box.value==='light'?' The light box gives runs help at the Gate.':'';
    return 'Pick a play card, then read the matchup before you snap.'+cue;
  }
  // Use the offered card itself, including evolved/custom cards; never inspect the hidden defensive call.
  const play=req.options?.plays?.find(p=>p.id===playId)?.card;
  const cues=[];
  if(play){
    cues.push(play.name+': '+(play.text||'Read its Gate, Key and Finish matchups.'));
    const fit=B.callReason(req,play);if(fit)cues.push(fit);
    if(cues.length===1&&play.duels?.G)cues.push('Start with '+play.duels.G.label.toLowerCase()+' at the Gate; compare those players before committing.');
  }
  cues.push('Add a tactic if it helps and fits your Command budget, or snap without one. Good odds are not a guarantee.');
  return cues.join(' ');
}
return{eligible,start,update,skip,hint};
});
