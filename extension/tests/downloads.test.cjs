const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const {webcrypto}=require('node:crypto');
const D=require('../download-policy.js');
const uuid='00000000-0000-4000-8000-000000000001';
const source=`https://tripo-data.rg1.data.tripo3d.com/tripo-studio/20260930/${uuid}/tripo_convert_${uuid}.glb?Policy=temporary&Signature=temporary`;
test('only observed native export host/path allowed; signed query is removed from records',()=>{
  const p=D.source(source);assert.equal(p.extension,'glb');assert.ok(!p.publicSource.includes('?'));
  for(const url of [source.replace('https:','http:'),source.replace('rg1.data.tripo3d.com','evil.example'),source.replace('.glb?','.exe?'),source.replace(`tripo_convert_${uuid}`,`tripo_convert_${uuid.slice(0,-1)}2`),'https://studio.tripo3d.ai/workspace/generate'])assert.throws(()=>D.source(url));
});
test('download filenames cannot escape Downloads or change file type',()=>{
  assert.equal(D.filename('sample-walk.glb','glb'),'sample-walk.glb');
  for(const name of ['../sample.glb','D:/sample.glb','sample.exe','con.glb','sample.glb ','sample..glb'])assert.throws(()=>D.filename(name,'glb'));
});
function harness({reject=false,saveFail=false,rejectionMessage='API rejected'}={}){
  let store={},listener,changed=[],apiCalls=0,tab={id:5,url:source};
  const runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onMessage:{addListener:fn=>listener=fn}};
  const chrome={runtime,tabs:{query:async()=>[tab]},storage:{local:{get:async()=>structuredClone(store),set:async value=>{if(saveFail)throw Error('storage failed');store=structuredClone({...store,...value});}}},downloads:{download:async options=>{apiCalls++;assert.equal(options.saveAs,false);assert.equal(options.conflictAction,'uniquify');if(reject)throw Error(rejectionMessage);return 7;},onChanged:{addListener:fn=>changed.push(fn)}}};
  const ctx=vm.createContext({URL,atob,TextEncoder,crypto:webcrypto,chrome,console});
  ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),ctx);
  const sender={id:'fixture',url:runtime.getURL('popup.html')};
  const send=(namespace,type,fields={},who=sender)=>new Promise(resolve=>listener({namespace,type,...fields},who,resolve));
  return {send,changed:delta=>changed.forEach(fn=>fn(delta)),calls:()=>apiCalls,store:()=>store,tab:t=>tab=t};
}
const config={schema:1,id:'fixture',name:'Fixture',initialBalance:1005,maximumSpend:1000,variants:['A'],authorization:'Test only'};
async function ready(h){await h.send('TRIPO_WORKFLOW','import-task',{config},{url:'https://studio.tripo3d.ai/workspace/generate',frameId:0,tab:{id:5}});}
const fields={tabId:5,modelId:uuid,filename:'sample-walk.glb',confirmed:true};
test('one Chrome download request; no navigation, duplicate blocked and token not persisted',async()=>{
  const h=harness();await ready(h);assert.equal((await h.send('TRIPO_DOWNLOAD','start',fields)).ok,true);assert.equal((await h.send('TRIPO_DOWNLOAD','start',fields)).ok,false);assert.equal(h.calls(),1);assert.ok(!JSON.stringify(h.store()).includes('Signature'));h.changed({id:7,state:{current:'complete'}});const s=await h.send('TRIPO_DOWNLOAD','status');assert.equal(s.value.downloads[0].status,'complete');
});
test('no download on wrong tab/source, page message, missing confirmation or storage failure',async()=>{
  for(const change of [{tabId:9},{confirmed:false},{modelId:'invalid'}]){const h=harness();await ready(h);assert.equal((await h.send('TRIPO_DOWNLOAD','start',{...fields,...change})).ok,false);assert.equal(h.calls(),0);}
  const h=harness();await ready(h);h.tab({id:5,url:'https://example.com/file.glb'});assert.equal((await h.send('TRIPO_DOWNLOAD','start',fields)).ok,false);assert.equal(h.calls(),0);
  assert.equal((await h.send('TRIPO_DOWNLOAD','start',fields,{url:'https://studio.tripo3d.ai/workspace/generate',tab:{id:5}})).ok,false);
  const broken=harness({saveFail:true});assert.equal((await broken.send('TRIPO_DOWNLOAD','start',fields)).ok,false);assert.equal(broken.calls(),0);
});
test('Chrome rejection is recorded without an automatic retry',async()=>{const h=harness({reject:true});await ready(h);assert.equal((await h.send('TRIPO_DOWNLOAD','start',fields)).ok,false);assert.equal(h.calls(),1);const s=await h.send('TRIPO_DOWNLOAD','status');assert.equal(s.value.downloads[0].status,'failed-before-start');});
test('Chrome rejection cannot leak a signed URL through the journal or response',async()=>{const h=harness({reject:true,rejectionMessage:'Rejected '+source});await ready(h);const result=await h.send('TRIPO_DOWNLOAD','start',fields);assert.equal(result.ok,false);assert.ok(!JSON.stringify(result).includes('Signature'));assert.ok(!JSON.stringify(h.store()).includes('Signature'));});
