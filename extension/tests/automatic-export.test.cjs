const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const uuid='00000000-0000-4000-8000-000000000001';
const page=`https://studio.tripo3d.ai/workspace/animate/example-${uuid}`;
const source=`https://tripo-data.rg1.data.tripo3d.com/tripo-studio/20260930/${uuid}/tripo_convert_${uuid}.glb?Signature=private-test-token`;
function harness({reject=false,saveFail=false,terminateAfterCall=false,store:previous,nativeDownloads=[]}={}){
  let store=structuredClone(previous||{}),listener,updated,changed=[],apiCalls=0,returns=[],tab={id:5,url:page};
  const runtime={id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onMessage:{addListener:fn=>listener=fn}};
  const chrome={runtime,tabs:{get:async()=>({...tab}),query:async()=>[tab],update:async(id,values)=>{returns.push({id,...values});tab={...tab,...values};},onUpdated:{addListener:fn=>updated=fn}},storage:{local:{get:async key=>({[key]:structuredClone(store[key])}),set:async value=>{if(saveFail||terminateAfterCall&&apiCalls)throw Error('storage failed');store=structuredClone({...store,...value});}}},downloads:{download:async options=>{apiCalls++;assert.equal(options.saveAs,false);assert.equal(options.conflictAction,'uniquify');if(reject)throw Error('Rejected '+source);return 7;},onChanged:{addListener:fn=>changed.push(fn)}}};
  chrome.downloads.search=async query=>{assert.ok(query.filenameRegex&&query.startedAfter&&query.startedBefore);assert.equal(query.limit,10);return nativeDownloads;};
  const ctx=vm.createContext({URL,atob,TextEncoder,crypto:webcrypto,chrome,console});
  ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),ctx));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),ctx);
  const sender={url:page,frameId:0,tab:{id:5}};
  const send=(type,fields={},who=sender)=>new Promise(resolve=>listener({namespace:'TRIPO_AUTO_EXPORT',type,page,...fields},who,resolve));
  const settle=()=>vm.runInContext('queue',ctx);
  return {send,calls:()=>apiCalls,store:()=>store,returns:()=>returns,tab:t=>tab=t,
    navigate:async(url,id=5)=>{if(id===5)tab={id:5,url};updated(id,{url});await settle();},
    changed:async delta=>{changed.forEach(fn=>fn(delta));await settle();}};
}
const fields={filename:'sample-walk.glb',extension:'glb',settings:{filename:'sample-walk.glb',extension:'glb',format:'GLB',skeleton:true,inPlace:true,animationCount:1,resolution:'4k'}};
test('Chinese model page exports through the same guarded journal and restores its original locale',async()=>{
  const h=harness(),chinese=page.replace('/workspace/','/zh/workspace/');
  h.tab({id:5,url:chinese});
  assert.equal((await h.send('arm',{...fields,page:chinese})).ok,true);
  await h.navigate(source);assert.equal(h.calls(),1);assert.deepEqual(h.returns(),[{id:5,url:chinese}]);
  await h.changed({id:7,state:{current:'complete'}});
  assert.equal((await h.send('status',{page:chinese})).value[0].status,'complete');
  h.tab({id:5,url:page});assert.equal((await h.send('arm',fields)).ok,false);
});
test('free export captures one same-tab URL, records Chrome completion, restores model and preserves paid budget',async()=>{
  const budget={schema:1,activeId:'existing',runs:{existing:{initialBalance:1005,maximumSpend:1000,events:[{quote:55}]}}};
  const h=harness({store:{'tripo-workflow-assistant-v1':budget}});
  assert.equal((await h.send('arm',fields)).ok,true);
  await h.navigate(source,9);assert.equal(h.calls(),0);
  await h.navigate(source);assert.equal(h.calls(),1);assert.deepEqual(h.returns(),[{id:5,url:page}]);
  await h.navigate(source);assert.equal(h.calls(),1);h.tab({id:5,url:page});
  await h.changed({id:7,state:{current:'complete'}});
  const status=await h.send('status');assert.equal(status.value[0].status,'complete');assert.equal(status.value[0].settings.animationCount,1);
  assert.equal((await h.send('arm',fields)).ok,false);assert.ok(!JSON.stringify(h.store()).includes('private-test-token'));
  assert.deepEqual(h.store()['tripo-workflow-assistant-v1'],budget);
});
test('source mismatch and stale armed work stop without downloading',async()=>{
  for(const url of ['https://example.com/file.glb',source.replace('.glb?','.zip?')]){
    const h=harness();await h.send('arm',fields);await h.navigate(url);assert.equal(h.calls(),0);h.tab({id:5,url:page});assert.equal((await h.send('status')).value[0].status,'stopped-source-mismatch');
  }
  const stale=harness({store:{'tripo-export-automation-v1':[{id:'stale',tabId:5,modelId:uuid,page,status:'armed',expiresAt:0}]}});
  await stale.navigate(source);assert.equal(stale.calls(),0);
});
test('worker restart cannot replay an uncertain Chrome download; browser rejection is not retried or token-logged',async()=>{
  const h=harness({terminateAfterCall:true});await h.send('arm',fields);await h.navigate(source);assert.equal(h.calls(),1);
  const restarted=harness({store:h.store()});await restarted.navigate(source);assert.equal(restarted.calls(),0);restarted.tab({id:5,url:page});assert.equal((await restarted.send('arm',fields)).ok,false);
  const denied=harness({reject:true});await denied.send('arm',fields);await denied.navigate(source);denied.tab({id:5,url:page});assert.equal((await denied.send('arm',fields)).ok,false);assert.equal(denied.calls(),1);assert.ok(!JSON.stringify(denied.store()).includes('private-test-token'));assert.equal(denied.returns().length,0);
});
test('no arm from another page, changed live model, invalid settings or failed storage',async()=>{
  const h=harness();for(const who of [{url:'https://example.com',frameId:0,tab:{id:5}},{url:page,frameId:1,tab:{id:5}}])assert.equal((await h.send('arm',fields,who)).ok,false);
  h.tab({id:5,url:page.replace(uuid,uuid.slice(0,-1)+'2')});assert.equal((await h.send('arm',fields)).ok,false);
  const wrong=harness();assert.equal((await wrong.send('arm',{...fields,settings:{}})).ok,false);
  const failed=harness({saveFail:true});assert.equal((await failed.send('arm',fields)).ok,false);await failed.navigate(source);assert.equal(failed.calls(),0);
});
test('changed settings can cancel before the public click, without creating a paid task',async()=>{
  const h=harness();const r=await h.send('arm',fields);assert.equal((await h.send('cancel-before-click',{id:r.value.id})).ok,true);await h.navigate(source);assert.equal(h.calls(),0);h.tab({id:5,url:page});assert.equal((await h.send('arm',fields)).ok,true);assert.equal(h.store()['tripo-workflow-assistant-v1'],undefined);
});


test('SPA uses observed current page and records format-specific settings without trusting stale document URL',async()=>{
  const h=harness(),next=page.replace('/animate/','/smart-uv/');h.tab({id:5,url:next});
  const armed=await h.send('arm',{...fields,page:next,settings:{...fields.settings,resolution:'none',fbxPreset:'Blender',vertexColors:true}});
  assert.equal(armed.ok,true);assert.equal(armed.value.page,next);assert.equal(armed.value.settings.vertexColors,true);assert.equal(armed.value.settings.fbxPreset,'Blender');
  assert.equal((await h.send('status',{page:next})).ok,true);
  assert.equal((await h.send('status',{page:'https://example.com/'+uuid})).ok,false);
  assert.equal((await h.send('status')).ok,false);
});


test('native direct download is passively linked once without retry, token persistence or losing other journals',async()=>{
  const before=Date.now()-1000,other={id:'other',modelId:'other-model',status:'complete'},record={id:'native',tabId:5,modelId:uuid,page,filename:fields.filename,extension:'glb',status:'armed',createdAt:new Date(before).toISOString()};
  const item={id:19,filename:'C:/Downloads/'+fields.filename,startTime:new Date(before+500).toISOString(),state:'complete',url:'blob:https://studio.tripo3d.ai/'+uuid};
  const budget={preserved:true},h=harness({store:{'tripo-export-automation-v1':[other,record],'tripo-workflow-assistant-v1':budget},nativeDownloads:[item]});
  const r=await h.send('status');assert.equal(r.value[0].status,'complete');assert.equal(r.value[0].downloadId,19);assert.equal(r.value[0].captureKind,'native-direct-download');assert.equal(h.calls(),0);assert.equal(h.returns().length,0);
  assert.deepEqual(h.store()['tripo-export-automation-v1'][0],other);assert.deepEqual(h.store()['tripo-workflow-assistant-v1'],budget);
  const cdn=harness({store:{'tripo-export-automation-v1':[record]},nativeDownloads:[{...item,url:source,referrer:page}]});assert.equal((await cdn.send('status')).value[0].status,'complete');assert.ok(!JSON.stringify(cdn.store()).includes('private-test-token'));
  for(const items of [[{...item,url:'blob:https://example.com/'+uuid}],[{...item,filename:'C:/Downloads/other.glb'}],[{...item,startTime:new Date(before+130000).toISOString()}],[item,{...item,id:20}]]){
    const stopped=harness({store:{'tripo-export-automation-v1':[record]},nativeDownloads:items});assert.equal((await stopped.send('status')).value[0].status,'armed');assert.equal(stopped.calls(),0);
  }
});
