const {test}=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const {webcrypto,createHash}=require('node:crypto');
// Executes the actual import handler and render path in an in-memory DOM. Image.decode is modeled;
// real image decoding is validated separately using Pillow. No browser process or page is opened.
test('one task-file change loads all previews, budget and stages without page clicks',async()=>{
  let listener,store={},writes=0,clicks=0,decoded=0;
  const worker=vm.createContext({URL,atob,TextEncoder,crypto:webcrypto,console,chrome:{storage:{local:{get:async()=>structuredClone(store),set:async x=>{writes++;store=structuredClone({...store,...x});}}},runtime:{onMessage:{addListener:fn=>listener=fn}}}});
  worker.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),worker));vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),worker);
  const elements={};
  function element(){return {value:'',checked:false,children:[],style:{},listeners:{},textContent:'',get options(){return this.children;},append(x){this.children.push(x);},replaceChildren(){this.children=[];},addEventListener(type,fn){this.listeners[type]=fn;},click(){clicks++;}};}
  const root={set innerHTML(html){for(const match of html.matchAll(/id="([^"]+)"/g))elements[match[1]]=element();elements.variant.value='default';elements.candidate.value='1';elements.stage.value='generate';},getElementById:id=>elements[id]};
  const host=element();host.attachShadow=()=>root;
  const context=vm.createContext({URL,atob,TextEncoder,crypto:webcrypto,console,location:{origin:'https://studio.tripo3d.ai',pathname:'/workspace/generate'},document:{createElement:tag=>tag==='div'?host:element(),documentElement:{append(){}},querySelector(){return null;},querySelectorAll(){return [];}},Image:class {constructor(){this.naturalWidth=this.naturalHeight=1;}async decode(){decoded++;}},chrome:{runtime:{sendMessage:m=>new Promise(resolve=>listener(m,{url:'https://studio.tripo3d.ai/workspace/generate',frameId:0,tab:{id:1}},resolve))}}});
  for(const file of ['studio-context.js','policy.js','bundle.js','dom-adapter.js','content.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const raw={format:'tripo-workflow-task-bundle',version:1,task:{schema:1,id:'preview-fixture',name:'Preview fixture',initialBalance:1005,maximumSpend:1000,variants:['draft-a','draft-b'],authorization:'Offline fixture'},stages:['generate','texture'],assets:[{variant:'draft-a',images:Object.fromEntries(['front','left','back'].map((slot,i)=>{const bytes=Buffer.from([137,80,78,71,13,10,26,10,i]);return [slot,{name:slot+'.png',data:'data:image/png;base64,'+bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')}];}))}]};
  const file={size:JSON.stringify(raw).length,text:async()=>JSON.stringify(raw)};
  await elements.taskfile.listeners.change({target:{files:[file]}});
  assert.equal(decoded,3);assert.equal(writes,1);assert.equal(elements.thumbs.children.length,3);
  assert.equal(elements.variant.value,'draft-a');assert.match(elements.budget.textContent,/1000/);assert.match(elements.inputsummary.textContent,/3/);
  assert.equal(store['tripo-workflow-assistant-v1'].runs['preview-fixture'].stages.join(','),'generate,texture');
  assert.equal(elements.verified.checked,false);assert.equal(clicks,0);assert.equal(store['tripo-workflow-assistant-v1'].runs['preview-fixture'].events.length,0);
});
