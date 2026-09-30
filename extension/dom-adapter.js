(function(root){
  'use strict';
  const P=root.TripoWorkflowPolicy;
  const text=e=>(e?.innerText||e?.textContent||'').trim().replace(/\s+/g,' ');
  const visible=e=>!!e?.isConnected && e.getClientRects().length>0 && !['hidden','collapse'].includes(root.getComputedStyle(e).visibility) && root.getComputedStyle(e).display!=='none';
  const isNumber=e=>{try{P.number(text(e));return /^\d[\d,]*$/.test(text(e));}catch{return false;}};
  const leaves=nodes=>nodes.filter(e=>!nodes.some(other=>other!==e && e.contains(other)));
  const words={generate:/^(generate|生成模型|生成)(?:\s|$)/i,retopo:/^(retopology|remesh|重拓扑)(?:\s|$)/i,texture:/^(generate texture|texture|生成纹理|生成贴图|纹理|贴图)(?:\s|$)/i,rig:/^(rig|rigging|绑定)(?:\s|$)/i,animate:/^(animate|animation|动画)(?:\s|$)/i};
  const labels={front:['Front','正面'],left:['Left','左侧','左侧面'],back:['Back','背面','后侧']};
  function multi(doc){
    const found=[...doc.querySelectorAll('button')].filter(b=>visible(b)&&(b.querySelector('[class~="i-tripo:multi-view"]')||/^(multi.?view|多视图)$/i.test(text(b))));
    return {element:found.length===1?found[0]:null,error:found.length===1?null:`多视图模式按钮：找到 ${found.length} 个候选，需要唯一匹配。`};
  }
  function slot(doc,direction){
    const found=new Set();
    for(const label of doc.querySelectorAll('div,span,label')){
      if(!visible(label)||!labels[direction].includes(text(label)))continue;
      let parent=label.parentElement;
      for(let i=0;parent&&i<3;i++,parent=parent.parentElement){const inputs=[...parent.querySelectorAll('input[type="file"]')].filter(e=>!e.disabled);if(inputs.length===1){found.add(inputs[0]);break;}if(inputs.length>1)break;}
    }
    return {element:found.size===1?[...found][0]:null,error:found.size===1?null:`${direction} 上传槽：找到 ${found.size} 个候选，需要可见方向标签及独立 file input。`};
  }
  function uploads(doc,directions){
    const errors=[],elements={};
    if(directions.length===1 && directions[0]==='front'){const single=[...doc.querySelectorAll('input[type="file"]')].filter(e=>!e.disabled&&(!e.accept||/image|png|jpg|jpeg/i.test(e.accept)));if(single.length===1)return {elements:{front:single[0]},errors};}
    for(const direction of directions){const result=slot(doc,direction);if(result.error)errors.push(result.error);else elements[direction]=result.element;}
    if(new Set(Object.values(elements)).size!==Object.keys(elements).length)errors.push('不同方向共用上传槽，停止准备。');
    return {elements,errors};
  }
  function controls(doc,stage){
    const errors=[],buttons=[...doc.querySelectorAll('button,[role="button"]')].filter(b=>visible(b)&&(root.TripoStudioContext?root.TripoStudioContext.matches(stage,text(b)):words[stage]?.test(text(b)))&&!/recharge|subscribe|upgrade|purchase|充值|订阅|购买/i.test(text(b)));
    let button=null,quote=null,balance=null;
    if(buttons.length!==1)errors.push(`${stage} 付费按钮：找到 ${buttons.length} 个候选，需要唯一匹配。`);
    else{
      button=buttons[0];if(button.disabled||button.getAttribute('aria-disabled')==='true')errors.push('付费按钮尚不可用；图片可能仍在上传，请检查网页状态。');
      try{P.number(text(button));quote=button;}catch{const prices=leaves([...button.querySelectorAll('span,div,p')].filter(e=>visible(e)&&isNumber(e)));if(prices.length===1)quote=prices[0];else errors.push(`按钮内积分报价：找到 ${prices.length} 个独立数字，需要唯一匹配。`);}
    }
    const candidates=leaves([...doc.querySelectorAll('span,div,p,button')].filter(e=>{
      if(!visible(e)||!isNumber(e)||button?.contains(e))return false;
      const box=e.getBoundingClientRect();if(box.top<0||box.top>120)return false;
      let ancestor=e;for(let i=0;ancestor&&i<4;i++,ancestor=ancestor.parentElement){if(ancestor.matches('header,[role="banner"]')||/credit|balance|积分|余额/i.test((ancestor.getAttribute('title')||'')+' '+(ancestor.getAttribute('aria-label')||'')))return true;}
      return box.left>(root.innerWidth||1440)*.6;
    }));
    if(candidates.length===1)balance=candidates[0];else errors.push(`页面顶部余额数字：找到 ${candidates.length} 个候选，请标记实际余额。`);
    return {button,quote,balance,errors};
  }
  root.TripoWorkflowDOM={text,visible,multi,slot,uploads,controls};
  if(typeof module!=='undefined')module.exports=root.TripoWorkflowDOM;
})(globalThis);
