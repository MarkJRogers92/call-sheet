#!/usr/bin/env node
// Bundle the Call Sheet slice into one self-contained HTML document.
//   node forks/call-sheet/tools/bundle.js <output.html>   → a page to open anywhere or publish
//   require('./bundle.js').bundle({document:true})          → a full document for Dynasty Lab's game-day frame
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sliceDir=path.join(__dirname,'../slice');
const root=path.resolve(sliceDir,'../../..');
const cssAssetMimes={woff2:'font/woff2',webp:'image/webp',png:'image/png',jpg:'image/jpeg'};

function signatureArtManifest({embedded=false}={}){
  const relativeDir='assets/card-art',directory=path.join(root,relativeDir);
  const files=fs.existsSync(directory)?fs.readdirSync(directory).sort():[];
  const sources={};
  const source=file=>embedded?`data:image/webp;base64,${fs.readFileSync(path.join(directory,file)).toString('base64')}`:`${relativeDir}/${file}`;
  for(const file of files){
    const match=/^([a-z-]+)-signature\.webp$/.exec(file);
    if(!match)continue;
    const mask=`${match[1]}-signature-mask.webp`;
    sources[match[1]]={src:source(file),mask:files.includes(mask)?source(mask):null};
  }
  return `<script type="application/json" id="cs-signature-art-assets">${JSON.stringify(sources)}</script>`;
}

function walkoutManifest(){
  const source=(file,mime)=>{
    const media=path.join(root,'assets/walkout',file);
    return fs.existsSync(media)?`data:${mime};base64,${fs.readFileSync(media).toString('base64')}`:null;
  };
  const home=source('tunnel-home.mp4','video/mp4');
  const night=source('tunnel-night.mp4','video/mp4');
  return {home,night,poster:home||night?source('tunnel-poster.webp','image/webp'):null};
}

function bundle(opts={}){
  const html=fs.readFileSync(path.join(sliceDir,'index.html'),'utf8');
  let style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
  // Local fonts and card artwork need to resolve inside the standalone page and the srcdoc frame.
  style=style.replace(/url\('(\.\.\/\.\.\/\.\.\/assets\/[^']+\.(woff2|webp|png|jpg))'\)/g,(m,rel,ext)=>
    `url('data:${cssAssetMimes[ext]};base64,${fs.readFileSync(path.resolve(sliceDir,rel)).toString('base64')}')`);
  let body=html.match(/<body>([\s\S]*?)<\/body>/)[1];
  // Scripts → inline. "</script" inside sources is escaped so it can't close the tag early.
  body=body.replace(/<script src="([^"]+)"><\/script>/g,(m,rel)=>{
    const src=fs.readFileSync(path.resolve(sliceDir,rel),'utf8').replace(/<\/script/gi,'<\\/script');
    return`<script>/* ${path.basename(rel)} */\n${src}\n</script>`;
  });
  // Images → data URIs.
  body=body.replace(/src="([^"]+\.(webp|png|jpg))"/g,(m,rel,ext)=>`src="data:image/${ext==='jpg'?'jpeg':ext};base64,${fs.readFileSync(path.resolve(sliceDir,rel)).toString('base64')}"`);
  body=body.replace(/<script type="application\/json" id="cs-signature-art-assets">[^<]*<\/script>/,()=>signatureArtManifest({embedded:true}));
  body=body.replace(/(<script type="application\/json" id="cs-walkout-assets">)[^<]*/,(_,tag)=>tag+JSON.stringify(walkoutManifest()));
  // Content identity is usable in a source ZIP or a dirty worktree. Both
  // entry points embed the same rules, presentation and Dynasty bridge.
  const hash=crypto.createHash('sha256').update(style).update(body);
  for(const filename of ['card-gameday.js','game-engine-v2-attribution.js','game-engine-v2-lab-integration.js'])hash.update(fs.readFileSync(path.join(root,filename)));
  const id=hash.digest('hex').slice(0,12);
  body=body.replace('<small data-battle-build hidden></small>',`<small data-battle-build>Battle build ${id}</small>`);
  const head=`<meta name="call-sheet-build" content="${id}"><title>Call Sheet</title>\n<meta name="description" content="A college football card battler: call plays, win duels, open packs, evolve your playbook.">\n<style>${style}</style>\n`;
  if(opts.document)return`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`;
  return head+body;
}
module.exports={bundle,signatureArtManifest};

if(require.main===module){
  const out=process.argv[2];if(!out){console.error('Usage: bundle.js <output.html>');process.exit(1)}
  const page=bundle({document:true});fs.writeFileSync(out,page);
  console.log(`Wrote ${out} (${(page.length/1024).toFixed(0)} KB)`);
}
