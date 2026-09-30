(function(root){
  'use strict';
  const P=root.TripoWorkflowPolicy;
  const FORMAT='tripo-workflow-task-bundle';
  const MAX_JSON_BYTES=8000000;
  const slots=['front','left','back'];
  function fail(message){throw new Error(`任务包：${message}`);}
  async function image(asset,label){
    if(!asset||typeof asset.data!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.data))fail(`${label} 必须内嵌 PNG/JPEG 字节，不能使用文件路径、网络 URL 或 SVG。`);
    const [header,b64]=asset.data.split(',');const type=header.includes('/png')?'image/png':'image/jpeg';
    let bytes;try{bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}catch{fail(`${label} 的 Base64 无效。`);}
    if(!bytes.length||bytes.length>2500000)fail(`${label} 图片应为 1 字节至 2.5 MB。`);
    if(type==='image/png' && ![137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))fail(`${label} 内容不是 PNG。`);
    if(type==='image/jpeg' && !(bytes[0]===255 && bytes[1]===216 && bytes[2]===255))fail(`${label} 内容不是 JPEG。`);
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(typeof asset.sha256!=='string'||asset.sha256.toLowerCase()!==sha256)fail(`${label} SHA256 不匹配，未导入任何配置或图片。`);
    if(typeof asset.name!=='string'||!asset.name.trim()||asset.name.length>160||/[\\/\x00-\x1f]/.test(asset.name))fail(`${label} 文件名无效，不能包含路径。`);
    if(asset.width!==undefined && (!Number.isInteger(asset.width)||asset.width<1||asset.width>8192||!Number.isInteger(asset.height)||asset.height<1||asset.height>8192))fail(`${label} 声明尺寸无效。`);
    return {name:asset.name,type,size:bytes.length,sha256,data:asset.data,...(asset.width?{width:asset.width,height:asset.height}:{})};
  }
  async function parse(raw){
    if(new TextEncoder().encode(JSON.stringify(raw)).length>MAX_JSON_BYTES)fail('文件超过 8 MB；请减小素材，不增加扩展权限。');
    if(raw?.format!==FORMAT){if(raw?.format)fail('不支持的任务包格式。');return {task:P.task(raw),stages:['generate'],inputs:null,selectedVariant:null,legacy:true};}
    if(raw.version!==1)fail('仅支持 version:1。');
    const task=P.task(raw.task);
    const stages=raw.stages||['generate'];
    if(!Array.isArray(stages)||!stages.length||stages.length>P.stages.length||stages.some(s=>!P.stages.includes(s))||new Set(stages).size!==stages.length)fail('待执行阶段必须是受支持且互不重复的阶段。');
    if(!Array.isArray(raw.assets)||!raw.assets.length||raw.assets.length>task.variants.length)fail('需要至少一组方案图片。');
    const inputs={};
    for(const group of raw.assets){
      if(!task.variants.includes(group.variant)||inputs[group.variant])fail('素材方案名称必须属于任务且不重复。');
      const images=group.images;
      if(!images||!images.front||Object.keys(images).some(s=>!slots.includes(s))||!!images.left!==!!images.back)fail(`${group.variant} 需要正面单图或完整正/左/背三图。`);
      const views={};
      for(const slot of slots)if(images[slot])views[slot]=await image(images[slot],`${group.variant}/${slot}`);
      if(new Set(Object.values(views).map(v=>v.sha256)).size!==Object.keys(views).length)fail(`${group.variant} 不同方向不能是同一份图片字节。`);
      inputs[group.variant]=views;
    }
    return {task,stages:[...stages],inputs,selectedVariant:raw.assets[0].variant,legacy:false};
  }
  root.TripoWorkflowBundle={parse,FORMAT,MAX_JSON_BYTES};
  if(typeof module!=='undefined')module.exports=root.TripoWorkflowBundle;
})(globalThis);
