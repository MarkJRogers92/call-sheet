// Bridges over existing Dynasty Lab facts; no second recruiting, staff or development simulation.
(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./data'):root.CallSheet.data);if(node)module.exports=api;else root.CallSheet.program=api})(typeof window==='object'?window:globalThis,function(D){
'use strict';
const rootOf=c=>c.evolvedFrom||c.upgradeOf||c.id;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function facilityCapacity(team){const rating=Number(team.facilities)||0;return rating>=90?18:rating>=75?16:14}
function signatureCapacity(team){return (Number(team.facilities)||0)>=90?4:3}
function syncCapacity(pb,team){
  const n=facilityCapacity(team);pb.capacity??={wrinkles:14,tactics:14};
  for(const pile of ['wrinkles','tactics'])pb.capacity[pile]=Math.max(pb.capacity[pile]||14,n);
  const sigs=signatureCapacity(team);
  if(sigs>3||(pb.signatureSlots!=null))pb.signatureSlots=Math.max(pb.signatureSlots||3,sigs);
  return pb.capacity;
}
const fitCache=new WeakMap();
function prospectFit(pb,p){
  if(!pb||!D.STYLE_TRAITS[p.style])return{bonus:0,plays:[],role:null};
  const off=Object.values(D.OFF_ROLES).includes(p.pos),side=off?'off':'def',deck=pb[side];if(!deck)return{bonus:0,plays:[],role:null};
  const fingerprint=[...deck.base,...deck.wrinkles].join('|'),key=`${side}:${p.pos}:${p.style}`;
  let caches=fitCache.get(pb);if(!caches){caches={};fitCache.set(pb,caches)}let cache=caches[side];if(!cache||cache.fingerprint!==fingerprint){cache={fingerprint,values:new Map()};caches[side]=cache}
  if(cache.values.has(key))return cache.values.get(key);
  const roles=Object.keys(off?D.OFF_ROLES:D.DEF_ROLES).filter(r=>(off?D.OFF_ROLES:D.DEF_ROLES)[r]===p.pos),strong=D.STYLE_TRAITS[p.style],matches=[];
  for(const id of new Set([...deck.base,...deck.wrinkles])){
    const c=(off?D.PLAYS:D.CALLS)[id];if(!c)continue;
    let traits=[];
    if(off)traits=Object.values(c.duels).filter(d=>d.off.some(r=>roles.includes(r))).flatMap(d=>d.ot);
    else{
      // Match a recruit's strengths to the assignments this defensive call asks of his position.
      const front=['EDGE','DT'].includes(p.pos),back=['CB','S'].includes(p.pos);
      traits=front?(c.pressure>0?['speed','technique','power']:['power','technique','durability']):back?(c.coverage==='man'?['speed','technique','composure']:['iq','speed','versatility']):(c.pressure>0?['speed','power','technique']:c.box==='loaded'?['power','iq','durability']:['speed','iq','versatility']);
    }
    const unique=[...new Set(traits)];if(!unique.length)continue;
    const fit=strong.filter(t=>unique.includes(t)).length/strong.length;
    matches.push({id,name:c.name,fit,weight:deck.base.includes(id)?2:1});
  }
  const weight=matches.reduce((n,m)=>n+m.weight,0),fit=weight?matches.reduce((n,m)=>n+m.fit*m.weight,0)/weight:0;
  const result={bonus:Math.round(clamp((fit-.45)*5,0,2.5)*10)/10,role:roles[0]||null,plays:matches.filter(m=>m.fit>=2/3).sort((a,b)=>b.fit-a.fit||b.weight-a.weight).slice(0,3).map(m=>m.name)};
  cache.values.set(key,result);return result;
}
// Use the assignments and trait lists the resolver actually contests. The same deck
// picks the same two jobs for every prospect at a position, so their ranges compare.
function prospectJobs(pb,pos,estimate,spot){
  const offense=Object.values(D.OFF_ROLES).includes(pos),side=offense?'off':'def',deck=pb?.[side];
  if(!deck)return [];
  const positions=offense?D.OFF_ROLES:D.DEF_ROLES;
  const active=[...new Set([...deck.base,...deck.wrinkles])];
  const commonPlays=[...new Set([...D.DEFAULT_DECKS.off.base,...D.DEFAULT_DECKS.off.wrinkles])].map(id=>D.PLAYS[id]);
  const jobs=[];
  for(const id of active){
    const card=(offense?D.PLAYS:D.CALLS)[id];
    if(!card||card.signature)continue;
    // A defense's duel also depends on what the offense runs. Show the opposing play explicitly.
    const plays=offense?[card]:commonPlays.filter(p=>card.counters.includes(p.family));
    for(const play of plays)for(const duel of Object.values(play.duels)){
      const role=duel[side].find(r=>positions[r]===pos&&(!spot||r===spot));
      if(!role)continue;
      const traits=offense?duel.ot:duel.dt;
      const job={id,name:card.name,root:rootOf(card),opposingPlay:offense?null:play.name,role,label:duel.label,traits};
      if(estimate){
        const mean=bounds=>traits.reduce((sum,t)=>sum+bounds[t],0)/traits.length;
        job.low=Math.floor(mean(estimate.low));job.high=Math.ceil(mean(estimate.high));
      }
      jobs.push(job);
    }
  }
  const first=jobs[0];if(!first)return [];
  const distinct=j=>j.traits.some(t=>!first.traits.includes(t))||first.traits.some(t=>!j.traits.includes(t));
  const other=jobs.filter(j=>j.root!==first.root);
  const second=other.find(distinct)||other[0]||jobs.find(distinct);
  return second?[first,second]:[first];
}
function trainingRates(team,pb,support={}){
  const out={};for(const side of ['off','def']){
    const coach=team.staff?.[side==='off'?'OC':'DC'],status=String(coach?.status||'ACTIVE').toUpperCase();
    const active=coach&&!['RETIRED','DEPARTED','INACTIVE'].includes(status)&&coach.leftSeason==null&&(coach.schoolId==null||coach.schoolId===team.id);
    const teaching=active?Number(coach.development)||50:50;
    for(const id of [...pb[side].base,...pb[side].wrinkles]){
      const card=(side==='off'?D.PLAYS:D.CALLS)[id];if(!card)continue;
      const roles=side==='off'?[...new Set(Object.values(card.duels).flatMap(d=>d.off))]:Object.keys(D.DEF_ROLES);
      const context=roles.map(r=>support[r]||0),relationship=context.length?context.reduce((a,b)=>a+b,0)/context.length:0;
      out[rootOf(card)]=Math.round(clamp((teaching-60)/200+relationship*.12,0,.3)*1000)/1000;
    }
  }
  return out;
}
function developmentImpact(p,role,pb){
  const receipt=p.campHistory?.at(-1);if(!receipt?.attr||!pb)return null;
  const improvements=Object.entries(receipt.attr).filter(([trait,n])=>D.TRAITS.includes(trait)&&Number(n)>0).sort((a,b)=>b[1]-a[1]);
  if(!improvements.length)return null;
  const plays=[...new Set([...pb.off.base,...pb.off.wrinkles])].map(id=>D.PLAYS[id]).filter(Boolean);
  const trait=improvements[0][0],gain=Number(improvements[0][1]);
  const helps=plays.filter(c=>Object.values(c.duels).some(d=>(d.off.includes(role)&&d.ot.includes(trait))||(d.def.includes(role)&&d.dt.includes(trait)))).slice(0,3).map(c=>c.name);
  return{year:receipt.year,phase:receipt.phase,trait,gain,plays:helps};
}
return{facilityCapacity,signatureCapacity,syncCapacity,prospectFit,prospectJobs,trainingRates,developmentImpact};
});
