const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {webcrypto}=require('node:crypto');
function harness(failSave=false){
  let store={}, listener;
  const context=vm.createContext({URL,atob,TextEncoder,crypto:webcrypto,console,chrome:{storage:{local:{get:async()=>structuredClone(store),set:async x=>{if(failSave)throw Error('storage failed');store=structuredClone({...store,...x});}}},runtime:{onMessage:{addListener:fn=>listener=fn}}}});
  context.importScripts=(...files)=>{for(const file of files)vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  const rawSend=(type,fields={},tab=1,url='https://studio.tripo3d.ai/workspace/generate')=>new Promise(resolve=>listener({namespace:'TRIPO_WORKFLOW',type,...fields},{url,frameId:0,tab:{id:tab}},resolve));
  const ready=rawSend('import-task',{config:{schema:1,id:'fixture-run',name:'Fixture',initialBalance:1005,maximumSpend:1000,variants:['draft-a','draft-b'],authorization:'Test fixture only'}});
  const send=async(...args)=>{await ready;return rawSend(...args);};
  return {send,store:()=>structuredClone(store),current:()=>Object.values(store)[0]?.runs?.['fixture-run']};
}
const proof={variant:'draft-a',candidate:1,stage:'generate',quote:65,balance:1005,label:'Generate 65'};
test('parallel tabs only claim one paid operation',async()=>{const h=harness();const r=await Promise.all([h.send('claim',{proof}),h.send('claim',{proof:{...proof,variant:'draft-b'}},2)]);assert.equal(r.filter(x=>x.ok).length,1);assert.match(r.find(x=>!x.ok).error,/未确认/);});
test('saved claim blocks resubmit even if caller never receives clicked acknowledgement',async()=>{const h=harness();await h.send('claim',{proof});const r=await h.send('claim',{proof});assert.equal(r.ok,false);assert.equal(h.current().events[0].status,'submitting');});
test('storage failure returns no authorization to click',async()=>{const h=harness(true);const r=await h.send('claim',{proof});assert.equal(r.ok,false);assert.equal(Object.keys(h.store()).length,0);});
test('reject other websites',async()=>{const h=harness();assert.equal((await h.send('read',{},1,'https://example.com')).ok,false);});
test('cannot cancel a clicked uncertain stage',async()=>{const h=harness();const {value:e}=await h.send('claim',{proof});await h.send('clicked',{id:e.id});assert.equal((await h.send('cancel-before-click',{id:e.id})).ok,false);});
test('accept only visible ID plus sufficient balance delta, preserve model/task distinction',async()=>{const h=harness();const {value:e}=await h.send('claim',{proof});await h.send('clicked',{id:e.id});const taskId='00000000-0000-4000-8000-000000000001';assert.equal((await h.send('resolve',{id:e.id,taskId,idKind:'task',balance:1005})).ok,false);const r=await h.send('resolve',{id:e.id,taskId,idKind:'task',balance:940});assert.equal(r.ok,true);assert.equal(r.value.events[0].referenceKind,'task');assert.equal(r.value.observedSpendHighWater,65);});
const config={schema:1,id:'fixture-run',name:'Fixture',initialBalance:1005,maximumSpend:1000,variants:['draft-a','draft-b'],authorization:'Test fixture only'};
test('reimport identical task preserves a pending submission',async()=>{const h=harness();await h.send('claim',{proof});const r=await h.send('import-task',{config});assert.equal(r.ok,true);assert.equal(r.value.events.length,1);assert.equal(r.value.events[0].status,'submitting');});
test('reimport cannot increase frozen budget or reset baseline',async()=>{const h=harness();assert.equal((await h.send('import-task',{config:{...config,initialBalance:2005,maximumSpend:2000}})).ok,false);});
test('cannot switch to a new task around an uncertain submission',async()=>{const h=harness();await h.send('claim',{proof});assert.equal((await h.send('import-task',{config:{...config,id:'new-run'}})).ok,false);});
test('existing model can be registered without spend',async()=>{const h=harness();const r=await h.send('adopt-model',{modelId:'00000000-0000-4000-8000-000000000002',variant:'generic-prop',candidate:1});assert.equal(r.ok,true);assert.equal(r.value.events[0].quote,0);assert.equal(r.value.events[0].status,'source-model');});
