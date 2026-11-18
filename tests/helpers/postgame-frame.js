'use strict';
// Run the unmodified game-day iframe against the real host bridge in Node. Only paint, audio and
// animation are inert. A serialized finished battle enters through the same resume path as a reload.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../forks/call-sheet/slice/slice.js'),'utf8');
function postgameFrame(host){
  const nodes=new Map(),noop=()=>{},effects=new Proxy({},{get:()=>noop}),get=s=>{
    if(!nodes.has(s))nodes.set(s,{style:{},dataset:{},classList:{add:noop,remove:noop,contains:()=>false},
      innerHTML:'',appendChild:noop,addEventListener:noop,setAttribute:noop,getContext:()=>({clearRect:noop}),querySelector:()=>null,querySelectorAll:()=>[]});
    return nodes.get(s);
  };
  const doc={querySelector:get,createElement:get,createElementNS:(_,s)=>get(s),addEventListener:noop};
  const window={parent:{__callSheetDynasty:host},CallSheet:{...globalThis.CallSheet,onboarding:require('../../forks/call-sheet/core/onboarding')},
    SliceCards:{esc:String,card:get,paintPortrait:noop},SliceFX:{reduce:true,sfx:effects,particles:effects,wait:async()=>{},anim:async()=>{}}};
  vm.runInNewContext(source,{window,document:doc,console,cancelAnimationFrame:noop});
  return{get,api:window.__slice};
}
module.exports={postgameFrame};
