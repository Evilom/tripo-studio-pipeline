(function(root){
  'use strict';
  const normalize=value=>String(value||'').trim().replace(/\s+/g,' ');
  const labels={
    filename:['File Name','文件名'],
    format:['Format','格式'],
    resolution:['Texture Resolution','纹理分辨率'],
    export:['Export','导出'],
    switches:{
      skeleton:['Export Skeleton','导出骨骼','导出骨架'],
      inPlace:['Animation stay in Place','动画原地播放','动画保持原地'],
      vertexColors:['Export Vertex Colors','导出顶点颜色','导出顶点色']
    }
  };
  function read(doc){
    const visible=e=>!!e&&e.isConnected!==false&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden';
    const boxes=[...doc.querySelectorAll('[id^="reka-popover-content"],[role="dialog"]')].filter(e=>visible(e)&&labels.filename.some(t=>e.textContent.includes(t))&&labels.format.some(t=>e.textContent.includes(t)));
    if(boxes.length!==1)throw Error('先打开唯一的 Export / 导出设置面板。');
    const box=boxes[0];
    const buttons=[...box.querySelectorAll('button')].filter(e=>visible(e)&&labels.export.includes(normalize(e.textContent)));
    if(buttons.length!==1||buttons[0].disabled||buttons[0].getAttribute('aria-disabled')==='true')throw Error('免费导出按钮尚未可用或存在歧义。');
    const inputs=[...box.querySelectorAll('input')].filter(e=>visible(e)&&['','text','search'].includes(e.type||''));
    const selects=[...box.querySelectorAll('[role="combobox"]')].filter(visible);
    const textured=labels.resolution.some(t=>box.textContent.includes(t));
    if(inputs.length!==1||selects.length!==(textured?2:1))throw Error('导出文件名或格式控件已改变，停止并核对页面。');
    const format=normalize(selects[0].textContent).toUpperCase();
    if(!['GLB','FBX','OBJ'].includes(format))throw Error('自动接续仅支持已核对的 GLB/FBX/OBJ 原生导出。');
    const extension=format==='GLB'?'glb':'zip';
    const stem=String(inputs[0].value||'').trim();
    if(!stem)throw Error('先填写导出文件名。');
    const filename=stem.toLowerCase().endsWith('.'+extension)?stem:stem+'.'+extension;
    const flags={skeleton:false,inPlace:false,vertexColors:false},seen=new Set();
    for(const e of [...box.querySelectorAll('[role="switch"]')].filter(visible)){
      const label=normalize(e.parentElement?.textContent);
      const key=Object.keys(labels.switches).find(k=>labels.switches[k].includes(label));
      const value=e.getAttribute('aria-checked');
      if(!key||seen.has(key)||!['true','false'].includes(value))throw Error('导出开关标签或状态不明确，停止并核对页面。');
      seen.add(key);flags[key]=value==='true';
    }
    const presets=[...box.querySelectorAll('button[aria-pressed="true"]')].filter(visible).map(e=>normalize(e.textContent)).filter(t=>['Blender','Mixamo','3dsmax'].includes(t));
    if(presets.length>1)throw Error('FBX 预设有歧义，停止导出。');
    const counts=[...box.querySelectorAll('button[aria-haspopup]')].filter(e=>visible(e)&&/^\d+$/.test(normalize(e.textContent)));
    if(counts.length>1)throw Error('动画数量有歧义，停止导出。');
    return {button:buttons[0],settings:{filename,extension,format,resolution:textured?normalize(selects[1].textContent):'none',fbxPreset:format==='FBX'?(presets[0]||null):null,...flags,animationCount:counts.length?Number(normalize(counts[0].textContent)):0}};
  }
  root.TripoExportSettings={read};
  if(typeof module!=='undefined')module.exports=root.TripoExportSettings;
})(globalThis);
