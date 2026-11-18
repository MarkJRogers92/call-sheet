'use strict';
// Run browser suites test by test instead of `a && b && c`, so one failure cannot hide the rest.
//
//   node tools/browser-run.js                      every browser suite plus every test:card-*-browser script
//   node tools/browser-run.js test:browser --cards one npm script, plus the card browser scripts
//   node tools/browser-run.js --report out.json    also write a JSON report
//
// Known timing flakes get one retry; the retry and the first failure are both reported, never hidden. Anything that
// still fails after its retry fails the run. A test listed below is retried only for timeouts, not assertion errors.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'..');
const scripts=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).scripts;
// Observed intermittent timeouts on a loaded machine (passed on immediate rerun). Keep this list short and explained.
const FLAKY={
  'tests/signing-day-stop-browser.js':'Signing-day stop waits on a 60s phase change; timed out once, passed 3/3 on rerun.',
  'tests/card-deck-browser.js':'Battle reopen checkpoint compare raced once under load; passed on rerun and on earlier commits.'
};
const TIMEOUT_MS=Number(process.env.BROWSER_TEST_TIMEOUT_MS)||15*60*1000;

function testsOf(name){
  const cmd=scripts[name];if(!cmd)throw new Error(`No npm script named ${name}`);
  return cmd.split('&&').map(s=>s.trim()).map(s=>s.match(/^node\s+(tests\/[\w.-]+\.js)$/)?.[1]).filter(Boolean);
}
function plan(argv){
  const names=argv.filter(a=>!a.startsWith('--')&&!/\.json$/.test(a));
  const cards=argv.includes('--cards')||!names.length;
  const chosen=names.length?names:['test:browser','test:browser-extended','test:browser-storage'];
  const list=chosen.flatMap(testsOf);
  if(cards)for(const [k,v] of Object.entries(scripts))if(/^test:card-[\w-]+-browser$/.test(k)){const m=v.match(/^node\s+(tests\/[\w.-]+\.js)$/);if(m)list.push(m[1])}
  return [...new Set(list)];
}
function runOne(file){
  const start=Date.now(),r=spawnSync(process.execPath,[file],{cwd:ROOT,encoding:'utf8',timeout:TIMEOUT_MS,maxBuffer:64*1024*1024,env:process.env});
  const out=`${r.stdout||''}${r.stderr||''}`,timedOut=r.error?.code==='ETIMEDOUT'||/TimeoutError|Timeout \d+ms exceeded/.test(out);
  const last=out.split('\n').filter(l=>l.trim()&&!/^\s+at /.test(l)).slice(-1)[0]||'';
  return{file,ok:r.status===0&&!r.error,status:r.status,ms:Date.now()-start,timedOut,last:last.slice(0,240)};
}
function main(argv=process.argv.slice(2)){
  const reportAt=(()=>{const i=argv.indexOf('--report');return i>=0?argv[i+1]:null})();
  const files=plan(argv.filter((a,i)=>argv[i-1]!=='--report'));
  console.log(`Running ${files.length} browser tests one by one.`);
  const results=[];
  for(const file of files){
    let r=runOne(file);
    if(!r.ok&&FLAKY[file]&&r.timedOut){console.log(`RETRY ${file} (${FLAKY[file]})`);const again=runOne(file);again.retriedAfter=r;r=again}
    results.push(r);console.log(`${r.ok?'PASS':'FAIL'} ${(r.ms/1000).toFixed(0).padStart(4)}s ${file}${r.retriedAfter?' (after one retry)':''}${r.ok?'':` | ${r.last}`}`);
  }
  const failed=results.filter(r=>!r.ok),retried=results.filter(r=>r.retriedAfter);
  console.log(`\n${results.length-failed.length} passed, ${failed.length} failed${retried.length?`, ${retried.length} needed a retry`:''}.`);
  for(const r of failed)console.log(`  FAILED ${r.file}: ${r.last}`);
  for(const r of retried)console.log(`  RETRIED ${r.file}: first run ${r.retriedAfter.timedOut?'timed out':'failed'} (${r.retriedAfter.last})`);
  if(reportAt)fs.writeFileSync(reportAt,JSON.stringify({results},null,2));
  return failed.length?1:0;
}
module.exports={plan,testsOf,FLAKY};
if(require.main===module)process.exit(main());
