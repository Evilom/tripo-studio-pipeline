(function(root){
  'use strict';
  const stages={
    generate:{name:'新建模型',route:'generate',words:/^(generate|生成模型|生成)(?:\s|$)/i},
    retopo:{name:'重拓扑',route:'retopology',words:/^(retopology|remesh|重拓扑)(?:\s|$)/i},
    texture:{name:'贴图',route:'texture',words:/^(generate texture|texture|生成纹理|生成贴图|纹理|贴图)(?:\s|$)/i},
    rig:{name:'绑定',route:'rigging',words:/^(auto rig|rig|rigging|自动绑定|绑定)(?:\s|$)/i},
    animate:{name:'动画（旧记录）',route:'animate',words:/^(animate|animation|动画)(?:\s|$)/i},
    'text-motion':{name:'文本动作',route:'animate',words:/^(generate|生成)(?:\s|$)/i},
    'studio-operation':{name:'其他公开阶段（手动标记）',route:null}
  };
  const normalize=value=>String(value||'').trim().replace(/\s+/g,' ');
  const purchase=/upgrade|subscribe|purchase|recharge|充值|购买|订阅/i;
  function matches(stage,label,operationName=''){
    label=normalize(label);
    if(purchase.test(label))return false;
    if(stage==='studio-operation'){
      const name=normalize(operationName);
      return name.length>0 && name.length<=80 && !purchase.test(name)
        && (label===name || label.startsWith(name+' '));
    }
    return !!stages[stage]?.words.test(label);
  }
  function workspace(page){
    const url=new URL(page);
    const match=url.pathname.match(/^\/(zh\/)?workspace\/([a-z][a-z0-9-]*)(?:\/([^/]+))?\/?$/);
    if(url.origin!=='https://studio.tripo3d.ai'||url.username||url.password||!match)throw Error('必须确认当前 Tripo workspace URL；支持原路径及 /zh/workspace。');
    const id=match[3]?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
    return {route:match[2],locale:match[1]?'zh':'',modelId:id?.toLowerCase()||null,page:url.origin+url.pathname,selectorScope:'/'+(match[1]||'')+'workspace/'+match[2]};
  }
  function check(stage,page){
    const context=workspace(page);
    if(!stages[stage])throw Error('未知阶段。');
    const route=stages[stage].route;
    if(route&&context.route!==route)throw Error('当前页面与所选阶段不匹配；不要只凭 Generate 按钮文字判断。');
  }
  function settings(doc,stage){
    const values=[];
    for(const e of doc.querySelectorAll('input,textarea,select,[role="radio"],[role="switch"],[role="tab"],[role="combobox"],button[aria-pressed],button[data-state]')){
      if(!e.isConnected||!e.getClientRects().length)continue;
      if(['password','file','hidden'].includes(e.type))continue;
      const label=normalize(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.name);
      if(/^(search|搜索)$/i.test(label))continue;
      values.push({tag:e.tagName,role:e.getAttribute('role'),label,value:typeof e.value==='string'?e.value:null,checked:e.getAttribute('aria-checked'),selected:e.getAttribute('aria-selected'),pressed:e.getAttribute('aria-pressed'),state:e.getAttribute('data-state'),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true'});
    }
    if(stage==='text-motion'){
      const selected=[...doc.querySelectorAll('[role="tab"]')].find(e=>e.getAttribute('aria-selected')==='true'&&e.getAttribute('aria-label')==='Text to Motion');
      const prompt=[...doc.querySelectorAll('textarea')].find(e=>e.getAttribute('placeholder')?.startsWith('Describe a motion'));
      if(!selected||!prompt?.value.trim())throw Error('文本动作需要选中 Text to Motion 并填写动作描述。');
    }
    return values;
  }
  root.TripoStudioContext={stages,matches,workspace,check,settings,normalize};
  if(typeof module!=='undefined')module.exports=root.TripoStudioContext;
})(globalThis);
