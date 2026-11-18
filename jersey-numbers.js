// Shared by the full dynasty and the standalone Call Sheet. These are traditional
// uniform styles, not a claim about today's eligibility rules.
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DynastyJerseys=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const skill=[[1,19]],backs=[[20,39],[40,49]],line=[[90,99],[70,79],[60,69],[50,59]];
 const bands={QB:skill,K:skill,P:skill,RB:backs,CB:backs,S:backs,WR:[[80,89],[10,19],[1,9]],TE:[[80,89],[40,49]],
  OT:[[70,79],[60,69],[50,59]],OG:[[60,69],[70,79],[50,59]],C:[[50,59],[60,69],[70,79]],
  EDGE:line,DT:line,LB:[[50,59],[40,49],[90,99]]};
 const ranges=pos=>bands[pos]||[[1,99]];
 const legal=(pos,n)=>Number.isInteger(n)&&ranges(pos).some(([a,b])=>n>=a&&n<=b);
 const unit=pos=>['K','P'].includes(pos)?'special':['EDGE','DT','LB','CB','S'].includes(pos)?'def':'off';
 function hash(s){let h=0;for(const c of String(s))h=(31*h+c.charCodeAt(0))>>>0;return h}
 function first(pos,seed){const [a,b]=ranges(pos)[0];return a+hash(seed)%(b-a+1)}
 // Players are supplied in incumbent priority order. Keep good numbers first;
 // resolve clashes by the shortest chain of moves to an unused legal number.
 function assign(players,key,retired=new Set()){
  const owner=new Map(),pending=[];
  for(const p of players){
   const n=p[key];
   if(legal(p.pos,n)&&!owner.has(n))owner.set(n,p);else pending.push(p);
  }
  if(!pending.length)return;
  const options=new Map();
  function choices(p){
   if(!options.has(p)){
    const seed=hash(p.portraitSeed??p.id),list=[];
    for(const [lo,hi] of ranges(p.pos)){const span=hi-lo+1;for(let i=0;i<span;i++){const n=lo+(seed+i)%span;if(!retired.has(n))list.push(n)}}
    options.set(p,list);
   }
   return options.get(p);
  }
  const excess=[];
  for(const start of pending){
   const queue=[start],via=new Map([[start,null]]),seen=new Set();let matched=false;
   for(let i=0;i<queue.length&&!matched;i++){
    const p=queue[i];
    for(const n of choices(p)){
     if(seen.has(n))continue;seen.add(n);
     const other=owner.get(n);
     if(!other){
      let move=p,to=n;
      while(move){const prev=via.get(move);owner.set(to,move);move[key]=to;if(!prev)break;to=prev.from;move=prev.player}
      matched=true;break;
     }
     if(!via.has(other)){via.set(other,{from:n,player:p});queue.push(other)}
    }
   }
   if(!matched)excess.push(start);
  }
  // Too many players for the available bands (e.g. 20 QBs): never jump
  // position groups. Prefer sharing across units; spread unavoidable repeats.
  const wearers=new Map([...owner].map(([n,p])=>[n,[unit(p.pos)]]));
  for(const p of excess){
   const side=unit(p.pos),opts=choices(p);let best=null,low=Infinity;
   for(const n of opts){const used=wearers.get(n)||[],cost=used.filter(s=>s===side).length*(players.length+1)+used.length;
    if(cost<low||(cost===low&&n===p[key])){best=n;low=cost}}
   p[key]=best;if(best!==null){if(!wearers.has(best))wearers.set(best,[]);wearers.get(best).push(side)}
  }
 }
 return {assign,first,legal};
});
