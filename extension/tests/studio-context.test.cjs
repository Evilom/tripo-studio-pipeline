const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../studio-context.js');const P=require('../policy.js');
test('same Generate label cannot confuse model and text-motion routes',()=>{assert.doesNotThrow(()=>C.check('text-motion','https://studio.tripo3d.ai/workspace/animate/example'));assert.throws(()=>C.check('generate','https://studio.tripo3d.ai/workspace/animate/example'));assert.equal(C.matches('rig','Auto Rig 20'),true);assert.equal(C.matches('text-motion','Generate 20'),true);assert.equal(C.matches('studio-operation','Upgrade 20','Upgrade'),false);});
test('manual public operations use route and operation identity while legacy keys remain intact',()=>{
  const p={variant:'A',candidate:1,stage:'studio-operation',operationName:'Generate',page:'https://studio.tripo3d.ai/workspace/texture-edit/fixture'};
  assert.notEqual(P.key(p),P.key({...p,page:'https://studio.tripo3d.ai/workspace/texture-pbr/fixture'}));assert.equal(P.key({...p,stage:'rig'}),'["A",1,"rig"]');assert.throws(()=>P.key({...p,operationName:''}));
});
test('model version/privacy combobox and native data-state mode changes invalidate the settings snapshot',()=>{
  const version={tagName:'BUTTON',innerText:'H3.1 Best Quality',value:'',isConnected:true,getClientRects:()=>[{}],getAttribute:n=>n==='role'?'combobox':null};
  let selected='on';const mode={tagName:'BUTTON',innerText:'Gen Mode',value:'',isConnected:true,getClientRects:()=>[{}],getAttribute:n=>n==='data-state'?selected:null};
  const doc={querySelectorAll:s=>s.includes('[role="combobox"]')&&s.includes('button[data-state]')?[version,mode]:[]};
  const before=JSON.stringify(C.settings(doc,'studio-operation'));assert.ok(before.includes('H3.1'));
  version.innerText='H3.0';assert.notEqual(before,JSON.stringify(C.settings(doc,'studio-operation')));version.innerText='H3.1 Best Quality';selected='off';assert.notEqual(before,JSON.stringify(C.settings(doc,'studio-operation')));
});
test('prompt, duration, selected modes and disabled controls are captured; files/passwords excluded',()=>{
  function el(tag,value,attrs={},type=''){return {tagName:tag,value,type,isConnected:true,getClientRects:()=>[{}],getAttribute:n=>attrs[n]||null,innerText:'',disabled:false};}
  const text=el('TEXTAREA','Walk slowly',{placeholder:'Describe a motion…'}),duration=el('INPUT','5',{'aria-label':'Duration'}),tab=el('BUTTON','',{'role':'tab','aria-label':'Text to Motion','aria-selected':'true'}),file=el('INPUT','private',{type:'file'},'file'),password=el('INPUT','secret',{},'password');
  const doc={querySelectorAll:selector=>selector==='textarea'?[text]:selector==='[role="tab"]'?[tab]:[text,duration,tab,file,password]};
  const before=JSON.stringify(C.settings(doc,'text-motion'));duration.value='10';assert.notEqual(before,JSON.stringify(C.settings(doc,'text-motion')));assert.ok(!before.includes('secret'));assert.ok(!before.includes('private'));text.value='';assert.throws(()=>C.settings(doc,'text-motion'));
});
