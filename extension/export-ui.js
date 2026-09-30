(function(){
  'use strict';
  if(location.origin!=='https://studio.tripo3d.ai'||document.getElementById('tripo-auto-export-controls'))return;
  const visible=e=>!!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
  function currentExport(){
    const boxes=[...document.querySelectorAll('[id^="reka-popover-content"]')].filter(e=>visible(e)&&/File Name/.test(e.textContent)&&/Format/.test(e.textContent));
    if(boxes.length!==1)throw Error('先在 Tripo 打开唯一的 Export 设置面板。');
    const box=boxes[0],buttons=[...box.querySelectorAll('button')].filter(e=>visible(e)&&e.textContent.trim()==='Export');
    if(buttons.length!==1||buttons[0].disabled)throw Error('免费 Export 按钮尚未可用。');
    const inputs=[...box.querySelectorAll('input')].filter(e=>visible(e)&&!['hidden','checkbox','radio'].includes(e.type));
    const selects=[...box.querySelectorAll('[role="combobox"]')].filter(visible);
    const textured=/Texture Resolution/.test(box.textContent);
    if(inputs.length!==1||selects.length!==(textured?2:1))throw Error('导出文件名或格式控件已改变，停止并核对页面。');
    const format=selects[0].textContent.trim().toUpperCase();
    if(!['GLB','FBX','OBJ'].includes(format))throw Error('自动接续仅支持已核对的 GLB/FBX/OBJ 原生导出。');
    const extension=format==='GLB'?'glb':'zip';
    const stem=inputs[0].value.trim();if(!stem)throw Error('先填写导出文件名。');
    const filename=stem.toLowerCase().endsWith('.'+extension)?stem:stem+'.'+extension;
    const switches=[...box.querySelectorAll('[role="switch"]')].filter(visible);
    const checked=label=>switches.find(e=>e.parentElement?.textContent.trim()===label)?.getAttribute('aria-checked')==='true';
    const preset=[...box.querySelectorAll('button[aria-pressed="true"]')].filter(visible).map(e=>e.textContent.trim()).filter(t=>['Blender','Mixamo','3dsmax'].includes(t));
    if(preset.length>1)throw Error('FBX 预设有歧义，停止导出。');
    const count=[...box.querySelectorAll('button[aria-haspopup]')].find(e=>visible(e)&&/^\d+$/.test(e.textContent.trim()));
    return {button:buttons[0],settings:{filename,extension,format,resolution:textured?selects[1].textContent.trim():'none',fbxPreset:preset[0]||null,skeleton:checked('Export Skeleton'),animationCount:count?Number(count.textContent.trim()):0,inPlace:checked('Animation stay in Place'),vertexColors:checked('Export Vertex Colors')}};
  }
  async function send(type,fields={}){
    const response=await chrome.runtime.sendMessage({namespace:'TRIPO_AUTO_EXPORT',type,page:location.origin+location.pathname,...fields});
    if(!response?.ok)throw Error(response?.error||'未收到确认，先检查原记录，不重复执行。');return response.value;
  }
  const host=document.createElement('aside');host.id='tripo-auto-export-controls';
  host.style.cssText='position:fixed;left:330px;top:90px;z-index:2147483646;background:#24212c;color:#eee;border:1px solid #706784;border-radius:8px;padding:8px;max-width:360px;font:13px system-ui';
  const run=document.createElement('button');run.textContent='自动导出并保存一次';run.id='tripo-auto-export-once';
  const statusButton=document.createElement('button');statusButton.textContent='查看自动导出记录';
  const inspectButton=document.createElement('button');inspectButton.textContent='检查当前设置';
  const proof=document.createElement('pre');proof.id='tripo-current-settings-proof';proof.hidden=true;proof.style.cssText='white-space:pre-wrap;max-height:160px;overflow:auto;font-size:11px';
  inspectButton.addEventListener('click',()=>{proof.hidden=false;proof.textContent=JSON.stringify({page:location.origin+location.pathname,controls:TripoStudioContext.settings(document,'studio-operation')},null,2);});
  const status=document.createElement('pre');status.id='tripo-auto-export-status';status.style.cssText='white-space:pre-wrap;max-height:160px;overflow:auto;font-size:11px';
  host.append(run,statusButton,inspectButton,status,proof);document.body.append(host);
  let running=false;
  run.addEventListener('click',async()=>{
    if(running)return;running=true;run.disabled=true;
    try{
      const before=currentExport(),record=await send('arm',{...before.settings,settings:before.settings});
      let after;try{after=currentExport();}catch(error){await send('cancel-before-click',{id:record.id});throw error;}
      if(record.page!==location.origin+location.pathname||before.button!==after.button||JSON.stringify(before.settings)!==JSON.stringify(after.settings)){
        await send('cancel-before-click',{id:record.id});throw Error('保存记录后设置已改变，未执行导出。');
      }
      after.button.click();status.textContent='已执行一次免费 Export；扩展将接续本标签页的原生文件地址并记录 Chrome 下载状态。';
    }catch(error){status.textContent=error.message;}finally{running=false;run.disabled=false;}
  });
  async function show(){try{const records=await send('status');status.textContent=JSON.stringify(records,null,2)||'[]';}catch(error){status.textContent=error.message;}}
  statusButton.addEventListener('click',show);
  // Refresh only our own journal; never poll private Studio APIs or automatically click.
  show();setInterval(()=>{if(!running)show();},5000);
})();
