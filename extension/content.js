(function () {
  'use strict';
  if (location.origin !== 'https://studio.tripo3d.ai') return;
  if (globalThis.TripoWorkflowAssistant) { globalThis.TripoWorkflowAssistant.open(); return; }
  const P = globalThis.TripoWorkflowPolicy;
  const B = globalThis.TripoWorkflowBundle;
  const DOM = globalThis.TripoWorkflowDOM;
  const C = globalThis.TripoStudioContext;
  const host = document.createElement('div'); host.id = 'tripo-workflow-assistant';
  host.style.cssText = 'position:fixed;right:16px;top:72px;z-index:2147483647;width:355px;';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>
    :host{font:13px/1.55 system-ui;color:#eee}*{box-sizing:border-box}aside{background:#24212c;border:1px solid #706784;border-radius:12px;box-shadow:0 10px 40px #0008;max-height:85vh;overflow:auto;padding:15px}h3{margin:0 0 8px;font-size:17px}p{margin:8px 0;color:#cac2d8}button,select,input{font:inherit;color:#eee;background:#393240;border:1px solid #736981;border-radius:6px;padding:7px;max-width:100%}button{cursor:pointer}button:hover{background:#554469}button:disabled{opacity:.5;cursor:wait}.row{display:flex;gap:6px;margin:7px 0;align-items:center}.row>*{min-width:0}select{flex:1}input[type=number]{width:65px}.primary{background:#7455a0}label{display:block;margin:5px 0}details{border-top:1px solid #5c5369;margin-top:12px;padding-top:8px}summary{cursor:pointer}#log,#records{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}#log{background:#141219;border-radius:6px;padding:9px;max-height:175px;overflow:auto}.thumbs{display:flex;gap:7px}.thumbs img{width:96px;height:96px;object-fit:contain;background:#eee}.mini{font-size:11px;color:#bcb0cb}#close{float:right}input[type=checkbox]{margin-right:5px}.preview{border:1px solid #786889;padding:8px;white-space:pre-wrap;font-size:12px}.slot{width:110px}#idvalue{width:100%}
    </style><aside>
    <button id="close" title="隐藏助手">×</button><h3>Tripo 工作流助手</h3>
    <p>用户，助手在这个标签页操作。每次付费先读实时报价，结果不明就停住。</p>
    <details open><summary>任务 · 导入或新建</summary>
    <select id="taskselect"><option value="">尚未配置任务</option></select>
    <label>导入任务包 / 旧 JSON <input id="taskfile" type="file" accept=".json,application/json"></label><p class="mini">自包含任务包一次载入配置和全部图片，不读取任意本机路径。导入不会提交生成。</p>
    <label>新任务名称 <input id="taskname" maxlength="100" placeholder="例如：道具模型候选"></label>
    <div class="row"><input id="initialbalance" type="number" min="0" placeholder="初始余额" style="width:140px"><input id="cap" type="number" min="1" placeholder="预算上限" style="width:140px"></div>
    <label><input id="budgetauthorized" type="checkbox">用户明确授权此任务使用上面填写的积分预算</label>
    <button id="newtask">创建预算任务</button><p id="taskinfo" class="mini">工具没有默认项目、模型类型或付费预算。</p></details>
    <div class="row"><input id="variant" value="默认方案" list="variants"><datalist id="variants"></datalist><span>候选</span><input id="candidate" type="number" value="1" min="1" max="99"></div>
    <div class="row"><select id="stage"><option value="generate">新建模型</option><option value="retopo">重拓扑</option><option value="texture">贴图</option><option value="rig">绑定</option><option value="animate">动画（旧记录）</option><option value="text-motion">文本动作</option><option value="studio-operation">其他公开阶段（手动标记）</option></select></div>
    <label>新建模型输入 <select id="sourcemode"><option value="images">图片</option><option value="text">网页文字提示词</option></select></label>
    <label>其他阶段按钮名称 <input id="operationname" maxlength="80" placeholder="按当前页面填写，例如 Generate"></label>
    <p class="mini">其他公开阶段用于当前可用的分割、UV、贴图编辑、多阶段动作等。先在网页配置，再标记唯一按钮；这不代表这些功能已经实测通过。</p>
    <details open><summary>1 · 选择模型图片与上传</summary>
    <p class="mini">单图只选正面；多视图选择同一物体的正、左、背视图。人物、动物和物品均可。</p>
    <label>正面 / 单图 <input id="front" type="file" accept="image/png,image/jpeg"></label>
    <label>左侧（多视图） <input id="left" type="file" accept="image/png,image/jpeg"></label>
    <label>背面（多视图） <input id="back" type="file" accept="image/png,image/jpeg"></label>
    <div id="inputsummary" class="mini"></div><div class="thumbs" id="thumbs"></div><div class="row"><button id="prepare" class="primary">准备输入（不生成）</button><button id="diagnose">检查页面控件</button></div><div id="diagnostics" class="preview">尚未检查网站控件</div><div class="row"><button id="multiview">打开多视图</button><button id="upload">上传所选图片</button></div>
    <p class="mini">单图使用唯一图片上传槽；多视图匹配明确的 Front / Left / Back 上传槽；匹配失败时可直接在网页手动上传。</p>
    <p class="mini">已有 GLB/FBX/OBJ 可在网页正常上传；打开其模型独立页面后登记到任务。</p><button id="adoptmodel">登记当前已有模型到任务</button>
    </details>
    <details open><summary>2 · 标记页面控件</summary><p class="mini">点击“标记”，再点网页上的对应控件。这次选择会拦截点击，不触发生成。</p>
    <div class="row"><button id="pickbalance">标记余额数字</button><button id="pickbutton">标记付费按钮</button></div>
    <div class="row"><button id="pickquote">标记按钮内报价</button><button id="preview">读取预览</button></div>
    <div id="previewtext" class="preview">尚未读取</div>
    <label><input id="verified" type="checkbox">用户已检查网页输入预览、方向和本阶段设置</label>
    <button id="execute" class="primary">执行本阶段一次</button>
    </details>
    <details><summary>3 · 核对原任务与导出</summary>
    <p class="mini">点击后不会自动重试。到原任务页查看编号与扣费，再核对。资产编号与任务编号分别记录。</p>
    <select id="event"></select><div class="row"><select id="idkind"><option value="task">任务 ID</option><option value="model">模型资产 ID</option></select><button id="currentid">读当前地址编号</button></div>
    <input id="idvalue" placeholder="原页面可见 UUID"><div class="row"><button id="resolve">核对编号与实时扣费</button><button id="complete">记录页面已完成</button></div><button id="linkmodel">关联当前模型资产编号</button>
    <div class="row"><button id="pickdownload">标记网页下载按钮</button><button id="download">点一次下载</button></div>
    <p class="mini">导出格式、骨骼和动画选项在 Tripo 网页选择。记录“已完成”不表示视觉或动画验收通过。</p>
    </details>
    <details><summary>预算与记录</summary><div id="budget"></div><div id="records"></div><button id="export">下载任务记录 JSON</button></details>
    <p id="log">就绪。没有自动付费队列。</p>
    </aside>`;
  document.documentElement.append(host);
  const $ = id => root.getElementById(id);
  let state, previewProof = null, busy = false, settings = {}, files = {};
  const stageNames = Object.fromEntries(Object.entries(C.stages).map(([key,value])=>[key,value.name]));
  function log(text) { $('log').textContent = `${new Date().toLocaleTimeString()} ${text}`; }
  function visible(e) { return !!e?.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; }
  function text(e) { return (e?.innerText || e?.textContent || '').trim().replace(/\s+/g, ' '); }
  function query(selector) { try { const all = document.querySelectorAll(selector); return all.length === 1 ? all[0] : null; } catch { return null; } }
  function cssPath(e) {
    if (e.id && document.querySelectorAll('#' + CSS.escape(e.id)).length === 1) return '#' + CSS.escape(e.id);
    const parts = [];
    while (e && e !== document.documentElement) {
      const name = e.tagName.toLowerCase();
      const siblings = [...e.parentElement.children].filter(x => x.tagName === e.tagName);
      parts.unshift(`${name}:nth-of-type(${siblings.indexOf(e) + 1})`); e = e.parentElement;
    }
    return 'html > ' + parts.join(' > ');
  }
  async function send(type, fields = {}) {
    const r = await chrome.runtime.sendMessage({namespace: 'TRIPO_WORKFLOW', type, ...fields});
    if (!r?.ok) throw new Error(r?.error || '扩展后台未返回确认，停止操作。');
    return r.value;
  }
  function configKey() { return $('stage').value+':'+C.workspace(publicURL()).selectorScope; }
  function cfg() { return settings[configKey()] || {}; }
  function invalidate() { previewProof = null; $('verified').checked = false; $('previewtext').textContent = '设置已变更，请重新读取预览。'; }
  function publicURL() { return location.origin + location.pathname; }
  function pageId() { return (location.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig) || []).at(-1) || ''; }
  function checkPage() {
    C.workspace(publicURL());
    if (document.querySelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="recaptcha"], input[type="password"]') || /verify you are human|checking your browser|验证您是人类|just a moment/i.test(document.title)) throw new Error('页面需要登录或真人验证，请用户在正常网页完成；助手暂停。');
  }
  function balance() {
    const e = query(cfg().balance);
    if (!visible(e)) throw new Error('余额控件不存在，请重新标记。');
    return P.number(text(e));
  }
  function proof() {
    checkPage();
    C.check($('stage').value,publicURL());
    const c = cfg(), button = query(c.button), price = query(c.quote || c.button);
    if (!visible(button) || !button.matches('button,[role="button"]') || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('付费按钮不可用或页面结构已变化，请重新标记。');
    if (!visible(price) || !button.contains(price)) throw new Error('报价必须来自当前付费按钮内部。');
    const label = text(button);
    if (!C.matches($('stage').value,label,$('operationname').value)) throw new Error('按钮与本阶段不匹配，或属于购买/充值。');
    const stage = $('stage').value;
    if (stage === 'generate' && pageId()) throw new Error('新建模型请使用空白生成页，避免操作旧模型。');
    if (stage !== 'generate' && !pageId()) throw new Error('先打开本轮模型的独立页面；此阶段必须保留模型资产编号。');
    if (stage !== 'generate' && !state.events.some(e => e.variant === $('variant').value && e.candidate === Number($('candidate').value) && (e.modelId === pageId() || (e.referenceId === pageId() && e.referenceKind === 'model')) && ['accepted', 'completed-unreviewed','source-model'].includes(e.status))) throw new Error('当前模型资产编号尚未关联本轮候选。先在原生成记录中核对资产 ID，避免处理旧模型。');
    const pageSettings=C.settings(document,stage);
    if(stage==='generate'&&$('sourcemode').value==='text'&&!pageSettings.some(x=>x.tag==='TEXTAREA'&&x.value?.trim()))throw new Error('文字生成需要网页中实际填写的提示词。');
    return {variant: $('variant').value, candidate: Number($('candidate').value), stage, operationName:$('operationname').value.trim(),sourceMode:$('sourcemode').value,quote: P.number(text(price)), balance: balance(), label, buttonSelector: c.button, quoteSelector: c.quote || c.button, balanceSelector: c.balance, page: publicURL(), modelId: pageId(), pageSettings,inputHashes: Object.fromEntries(Object.entries(files).map(([k,v]) => [k,v.sha256]))};
  }
  async function refresh() {
    state = await send('read'); settings = state.settings;
    $('taskselect').replaceChildren();
    if(!state.configured){const o=document.createElement('option');o.value='';o.textContent='尚未配置任务';$('taskselect').append(o);}
    for(const task of state.knownRuns||[]){const o=document.createElement('option');o.value=task.id;o.textContent=task.name;$('taskselect').append(o);}
    if(state.configured)$('taskselect').value=state.run;
    $('taskinfo').textContent=state.configured?`${state.task.name} · 预算 ${state.maximumSpend} · 初始余额 ${state.initialBalance}`:'尚未配置任务：先导入任务 JSON 或创建已授权预算任务。';
    $('variants').replaceChildren();for(const name of state.task?.variants||[]){const o=document.createElement('option');o.value=name;$('variants').append(o);}
    if(state.configured && !state.task.variants.includes($('variant').value))$('variant').value=state.bundleImport?.selectedVariant||state.task.variants[0];
    files = state.inputs[$('variant').value] || {};
    $('inputsummary').textContent=`已载入 ${Object.keys(files).length} 张图片；待执行阶段：${(state.stages||['generate']).map(s=>stageNames[s]).join(' → ')}。导入与准备输入均不提交生成。`;
    const keep = $('event').value; $('event').replaceChildren();
    for (const e of state.events) { const o = document.createElement('option'); o.value = e.id; o.textContent = `${e.key} · ${e.status}`; $('event').append(o); }
    if ([...$('event').options].some(o => o.value === keep)) $('event').value = keep; else if (state.events.length) $('event').value = state.events.at(-1).id;
    const reserved = state.events.filter(e => e.status !== 'cancelled').reduce((n,e) => n + e.quote, 0);
    $('budget').textContent = state.configured?`总上限 ${state.maximumSpend} 积分；初始读数 ${state.initialBalance}；已预留/报价合计 ${reserved}。每次执行还将核对当前余额。`:'未配置任务；付费操作不可执行。';
    $('records').textContent = state.events.map(e => `${e.key}: ${e.status}; 报价 ${e.quote}; ${e.referenceKind || '待核对'} ${e.referenceId || ''}`).join('\n') || '没有提交记录';
    $('thumbs').replaceChildren();
    for (const direction of ['front', 'left', 'back']) if (files[direction]) { const img = document.createElement('img'); img.src = files[direction].data; img.alt = direction; img.title = `${direction}: ${files[direction].name}\nSHA256 ${files[direction].sha256}`; $('thumbs').append(img); }
  }
  function action(id, fn) {
    $(id).addEventListener('click', async () => {
      if (busy) return; busy = true; $(id).disabled = true;
      try { await fn(); } catch (e) { log(e.message); }
      finally { busy = false; $(id).disabled = false; }
    });
  }
  function pick(kind) {
    log('请点击网页对应控件；按 Esc 取消。此次标记会拦截页面点击。');
    host.style.display = 'none';
    const intercept = e => { if (!e.composedPath().includes(host)) {e.preventDefault();e.stopImmediatePropagation();} };
    const stop = () => { host.style.display='block';window.removeEventListener('click', handler, true); window.removeEventListener('keydown', key, true); window.removeEventListener('pointerdown',intercept,true);window.removeEventListener('mousedown',intercept,true); };
    const key = e => { if (e.key === 'Escape') { stop(); log('已取消标记。'); } };
    const handler = async e => {
      if (e.composedPath().includes(host)) return;
      e.preventDefault(); e.stopImmediatePropagation(); stop();
      try {
        const target = ['button', 'download'].includes(kind) ? e.target.closest('button,[role="button"],a') : e.target;
        if (!visible(target) || (kind === 'button' && !target.matches('button,[role="button"]'))) throw new Error('请标记实际按钮。');
        if (['balance', 'quote'].includes(kind)) P.number(text(target));
        if (kind === 'quote') { const b = query(cfg().button); if (!b || !b.contains(target)) throw new Error('先标记付费按钮，再标记它内部的报价。'); }
        if (kind === 'download' && !/export|download|导出|下载/i.test(text(target))) throw new Error('只接受网页可见的 Export / Download 按钮。');
        settings[configKey()] = {...cfg(), [kind]: cssPath(target)};
        state = await send('settings', {value: settings}); invalidate(); log(`已标记：${text(target).slice(0,140)}`);
      } catch (err) { log(err.message); }
    };
    window.addEventListener('click', handler, true); window.addEventListener('keydown', key, true);window.addEventListener('pointerdown',intercept,true);window.addEventListener('mousedown',intercept,true);
  }
  for (const [id, kind] of Object.entries({pickbalance:'balance',pickbutton:'button',pickquote:'quote',pickdownload:'download'})) action(id, () => pick(kind));
  async function imported(next,variant){state=next;$('variant').value=variant||next.bundleImport?.selectedVariant||next.task.variants[0];invalidate();await refresh();log(`已载入 ${next.task.name}；预算账本保留，未提交生成。`);}
  $('taskfile').addEventListener('change',async e=>{
    try{
      const file=e.target.files[0];if(!file)return;if(file.size>B.MAX_JSON_BYTES)throw new Error('任务包应不超过 8 MB。');
      const raw=JSON.parse(await file.text()),bundle=await B.parse(raw);
      if(bundle.inputs)for(const [variant,images] of Object.entries(bundle.inputs))for(const [slot,asset] of Object.entries(images)){const img=new Image();img.src=asset.data;try{await img.decode();}catch{throw new Error(`${variant}/${slot} 无法解码，整包未导入。`);}if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth>8192||img.naturalHeight>8192)throw new Error(`${variant}/${slot} 尺寸无效或超过 8192，整包未导入。`);if(asset.width && (asset.width!==img.naturalWidth||asset.height!==img.naturalHeight))throw new Error(`${variant}/${slot} 声明尺寸与实际图片不符，整包未导入。`);const original=raw.assets.find(group=>group.variant===variant).images[slot];original.width=img.naturalWidth;original.height=img.naturalHeight;}
      await imported(await send('import-bundle',{bundle:raw}),bundle.selectedVariant);
      $('diagnostics').textContent='素材已在扩展载入。点击“准备输入（不生成）”处理网页上传与控件识别。';
    }catch(err){log(err.message);}
  });
  $('taskselect').addEventListener('change',async()=>{try{await imported(await send('switch-task',{id:$('taskselect').value}));}catch(err){log(err.message);await refresh();}});
  action('newtask',async()=>{if(!$('budgetauthorized').checked)throw new Error('此任务预算尚未明确授权。');const config=P.task({schema:1,id:crypto.randomUUID(),name:$('taskname').value.trim(),initialBalance:Number($('initialbalance').value),maximumSpend:Number($('cap').value),variants:[$('variant').value.trim()||'默认方案'],authorization:'用户通过新任务表单明确授权填写的预算；每次付费须再读取实时余额与报价。'});await imported(await send('import-task',{config}));});
  action('adoptmodel',async()=>{checkPage();const modelId=pageId();if(!modelId)throw new Error('先在网页正常上传或打开模型独立页面；此处只登记可见资产编号。');await send('adopt-model',{modelId,variant:$('variant').value,candidate:Number($('candidate').value)});await refresh();log('用户选择的现有模型已登记到任务，不收取或提交任何阶段费用。');});
  for (const id of ['variant', 'candidate', 'stage','sourcemode','operationname']) $(id).addEventListener('change', async () => { invalidate(); try { await refresh(); } catch(e) {log(e.message);} });
  $('close').onclick = () => { host.style.display = 'none'; };
  for (const direction of ['front','left','back']) $(direction).addEventListener('change', async e => {
    try {
      const file = e.target.files[0]; if (!file) return;
      if (!['image/png','image/jpeg'].includes(file.type) || file.size > 2500000) throw new Error('请选择不超过 2.5 MB 的 PNG/JPEG；三张图合计也需低于约 2.5 MB。');
      const bytes = await file.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
      const data = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
      const img = new Image(); img.src=data; await img.decode();
      const next = {...files, [direction]: {name:file.name, type:file.type, size:file.size, width:img.naturalWidth, height:img.naturalHeight, sha256,data}};
      await send('inputs', {variant:$('variant').value,value:next}); invalidate(); await refresh(); log(`已保存 ${direction}：${img.naturalWidth}×${img.naturalHeight}。`);
    } catch(err) {log(err.message);}
  });
  action('multiview', () => {
    checkPage();const result=DOM.multi(document);if(result.error)throw new Error(result.error);result.element.click();invalidate();log('已点击多视图模式；未提交生成。');
  });
  async function uploadInputs() {
    checkPage();
    await refresh();if(!state.configured)throw new Error('先导入任务包。');
    if(state.events.some(e=>['submitting','uncertain'].includes(e.status)))throw new Error('原提交结果未确认，保留原输入先核对任务，禁止重新准备。');
    if ($('stage').value !== 'generate' || pageId()) throw new Error('只在空白新模型页上传模型图片。');
    if (!files.front || (!!files.left !== !!files.back)) throw new Error('请先选择一张正面图；多视图需同时选择左侧和背面。');
    const directions=files.left&&files.back?['front','left','back']:['front'];
    const initial=DOM.uploads(document,directions);if(initial.errors.length)throw new Error(initial.errors.join('\n'));
    for (const direction of directions) {
      const f=files[direction], bytes=Uint8Array.from(atob(f.data.split(',')[1]),c=>c.charCodeAt(0));
      const current=DOM.uploads(document,[direction]);if(current.errors.length)throw new Error(current.errors.join('\n'));const input=current.elements[direction], dt=new DataTransfer(); dt.items.add(new File([bytes],f.name,{type:f.type})); input.files=dt.files;
      input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(r=>setTimeout(r,1400));
    }
    invalidate(); log('选中的图片已交给网页上传控件。请检查网页缩略图、上传完成状态和方向；尚未生成。');
  }
  action('upload',uploadInputs);
  async function diagnoseControls(){
    checkPage();const result=DOM.controls(document,$('stage').value);
    $('diagnostics').textContent=result.errors.length?result.errors.join('\n'):'已找到唯一余额、付费按钮和按钮内报价；未提交生成。';
    if(result.errors.length)return false;
    settings[configKey()]={...cfg(),balance:cssPath(result.balance),button:cssPath(result.button),quote:cssPath(result.quote)};
    state=await send('settings',{value:settings});invalidate();
    const p=proof(),g=P.gate(state,p);previewProof=p;
    $('previewtext').textContent=`${p.variant} · 候选 ${p.candidate} · ${stageNames[p.stage]}\n实时余额 ${p.balance} · 本阶段报价 ${p.quote}\n此任务剩余预算至多 ${g.remaining}\n未执行生成；检查网页缩略图后才可勾选并执行。`;
    log('控件检查及只读预览完成；未点击付费按钮。');return true;
  }
  action('diagnose',async()=>{await refresh();await diagnoseControls();});
  action('prepare',async()=>{
    checkPage();await refresh();if(!state.configured)throw new Error('先导入任务包。');
    if(state.events.some(e=>['submitting','uncertain'].includes(e.status)))throw new Error('原提交结果未确认，先核对原任务，禁止重复准备。');
    if($('stage').value!=='generate'){await diagnoseControls();return;}
    if(pageId())throw new Error('准备新模型输入必须位于空白生成页，不能覆盖已有模型。');
    if($('sourcemode').value==='text'){
      if(!C.settings(document,'generate').some(x=>x.tag==='TEXTAREA'&&x.value?.trim()))throw new Error('先在网页填写文字提示词，再检查控件。');
      await diagnoseControls();return;
    }
    if(!files.front)throw new Error('当前方案缺少正面图片；任务包可能只含其他方案素材。');
    const directions=files.left&&files.back?['front','left','back']:['front'];
    let mapping=DOM.uploads(document,directions);
    if(directions.length===3 && mapping.errors.length){const multi=DOM.multi(document);if(multi.error)throw new Error(mapping.errors.concat(multi.error).join('\n'));multi.element.click();await new Promise(r=>setTimeout(r,1000));mapping=DOM.uploads(document,directions);}
    if(mapping.errors.length){$('diagnostics').textContent=mapping.errors.join('\n');throw new Error(mapping.errors.join('\n'));}
    await uploadInputs();await diagnoseControls();
  });
  action('preview', async () => {
    await refresh(); previewProof=proof(); const g=P.gate(state,previewProof);
    $('previewtext').textContent=`${previewProof.variant} · 候选 ${previewProof.candidate} · ${stageNames[previewProof.stage]}\n页面按钮：${previewProof.label}\n实时余额：${previewProof.balance}\n本阶段报价：${previewProof.quote}\n执行后本轮预算剩余至多：${g.remaining}\n模型资产编号：${previewProof.modelId || '新模型'}\n${previewProof.page}`;
    $('verified').checked=false; log('已读取；检查网页设置后勾选，才能执行一次。');
  });
  action('execute', async () => {
    if (!previewProof || !$('verified').checked) throw new Error('先读取预览并检查网页设置。');
    await refresh(); const p=proof();
    if (JSON.stringify(p)!==JSON.stringify(previewProof)) {invalidate();throw new Error('页面、报价、余额或输入已变化，请重新读取。');}
    if (p.stage==='generate' && p.sourceMode==='images' && !p.inputHashes.front) throw new Error('请在助手中保留所用图片及 SHA256，便于后续复核。');
    const claimed=await send('claim',{proof:p});
    const button=query(p.buttonSelector);
    let verified=false;
    try { verified=JSON.stringify(proof())===JSON.stringify(p) && visible(button); } catch {}
    if (!verified) {await send('cancel-before-click',{id:claimed.id});invalidate();throw new Error('记录保存后页面发生变化，未点击付费按钮。');}
    // Exactly one public UI click. There is intentionally no retry path.
    try { button.click(); } finally { previewProof=null; $('verified').checked=false; }
    await send('clicked',{id:claimed.id}); await refresh();
    log(`已点击一次 ${p.label}；报价 ${p.quote} 已预留。结果待核对，记录 ${claimed.id}。请到原任务页查看，不再次提交。`);
  });
  action('currentid',()=> { const id=pageId(); if(!id)throw new Error('当前地址没有 UUID，请从原任务/资产页面复制。'); $('idvalue').value=id; $('idkind').value='model'; log('已读地址中的资产候选编号；请核对它属于原提交。'); });
  action('resolve',async()=> { checkPage(); const id=$('event').value; if(!id)throw new Error('没有提交记录。'); await send('resolve',{id,taskId:$('idvalue').value.trim(),idKind:$('idkind').value,balance:balance()}); await refresh(); log('原编号与可见扣费已记录。此记录可跨刷新恢复，不自动重复提交。'); });
  action('complete',async()=> {await send('complete',{id:$('event').value});await refresh();log('已记录用户在原页面观察到完成；模型、骨骼与动画仍待实际验收。');});
  action('linkmodel',async()=> {checkPage();const modelId=pageId();if(!modelId)throw new Error('当前页面没有模型 UUID。');await send('link-model',{id:$('event').value,modelId});await refresh();log('当前模型资产编号已关联所选记录；任务编号单独保留。');});
  action('download',()=> {
    checkPage(); const b=query(cfg().download), e=state.events.find(e=>e.id===$('event').value);
    if(!e || !['accepted','completed-unreviewed','source-model'].includes(e.status) || !pageId() || !(e.modelId===pageId() || (e.referenceKind==='model' && e.referenceId===pageId())))throw new Error('请打开已核对的本轮模型原页面并选择对应记录。');
    if(!visible(b)||b.disabled||! /^(export|download|导出|下载)(\s|$)/i.test(text(b)) || /\d/.test(text(b)))throw new Error('标记的下载按钮不可用或包含费用；请在网页检查。');
    b.click();log('已点击网页下载按钮一次；格式选项及浏览器文件保存由正常网页处理。');
  });
  action('export',async()=> {
    await refresh(); const {inputs,...record}=state;
    record.inputMetadata=Object.fromEntries(Object.entries(inputs).map(([variant,views])=>[variant,Object.fromEntries(Object.entries(views).map(([direction,{data,...meta}])=>[direction,meta]))]));
    record.exportedAt=new Date().toISOString(); const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`Tripo-workflow-${state.run}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);log('任务记录已交给浏览器下载，不含图片内容、凭据或查询参数。');
  });
  globalThis.TripoWorkflowAssistant={open(){host.style.display='block';refresh().catch(e=>log(e.message));}};
  refresh().catch(e=>log(e.message));
})();
