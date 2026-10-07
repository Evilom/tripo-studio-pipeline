const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../export-settings.js');
global.getComputedStyle=()=>({visibility:'visible'});
function element(text='',attrs={}){
  return {textContent:text,isConnected:true,disabled:false,type:'text',getBoundingClientRect:()=>({width:100,height:30}),getAttribute:key=>attrs[key]??null};
}
function panel({zh=false,format='GLB',textured=true,switches=[]}={}){
  const button=element(zh?'导出':'Export'),input={...element(),value:'sample'},selects=[element(format),...(textured?[element('2k')]:[])],presets=format==='FBX'?[element('Blender')]:[];
  const box={...element((zh?'文件名 格式':'File Name Format')+(textured?(zh?' 纹理分辨率':' Texture Resolution'):'')),querySelectorAll:selector=>({'button':[button],'input':[input],'[role="combobox"]':selects,'[role="switch"]':switches,'button[aria-pressed="true"]':presets,'button[aria-haspopup]':[]}[selector]||[])};
  return {button,input,selects,box,doc:{querySelectorAll:()=>[box]}};
}
function flag(label,checked){return {...element('',{'aria-checked':checked}),parentElement:{textContent:label}};}
test('English and observed Chinese static GLB/FBX/OBJ settings produce equivalent evidence',()=>{
  for(const format of ['GLB','FBX','OBJ']){
    const english=E.read(panel({format}).doc),chinese=E.read(panel({format,zh:true}).doc);
    assert.deepEqual(chinese.settings,english.settings);assert.equal(chinese.settings.resolution,'2k');
    assert.equal(chinese.settings.extension,format==='GLB'?'glb':'zip');
  }
  assert.equal(E.read(panel({zh:true,textured:false}).doc).settings.resolution,'none');
});
test('known skeleton, in-place and vertex color labels are recorded; unknown or duplicate switches cannot silently become false',()=>{
  for(const label of ['Export Skeleton','导出骨骼'])assert.equal(E.read(panel({switches:[flag(label,'true')]}).doc).settings.skeleton,true);
  assert.equal(E.read(panel({format:'OBJ',switches:[flag('Export Vertex Colors','false')]}).doc).settings.vertexColors,false);
  for(const switches of [[flag('Unknown option','true')],[flag('Export Skeleton',null)],[flag('Export Skeleton','true'),flag('Export Skeleton','false')]])assert.throws(()=>E.read(panel({switches}).doc));
});
test('ambiguous panel, disabled export, changed controls and unsupported format stop without a click',()=>{
  const p=panel();let clicks=0;p.button.click=()=>clicks++;
  assert.throws(()=>E.read({querySelectorAll:()=>[p.box,p.box]}));
  p.button.disabled=true;assert.throws(()=>E.read(p.doc));p.button.disabled=false;
  p.selects.push(element('unexpected'));assert.throws(()=>E.read(p.doc));
  assert.throws(()=>E.read(panel({format:'STL'}).doc));
  assert.equal(clicks,0);
});
