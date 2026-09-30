importScripts('studio-context.js','policy.js','bundle.js','download-policy.js');
'use strict';
const STORE = 'tripo-workflow-assistant-v1';
let queue = Promise.resolve();
async function database() { return (await chrome.storage.local.get(STORE))[STORE] || {schema:1,activeId:null,runs:{}}; }
async function load() {
  const db=await database();
  return {...(db.runs[db.activeId] || {configured:false,events:[],settings:{},inputs:{}}),knownRuns:Object.values(db.runs).map(s=>({id:s.run,name:s.task.name}))};
}
async function save(s) {const db=await database();if(!s.configured)throw new Error('先配置任务。');const {knownRuns,...record}=s;db.activeId=s.run;db.runs[s.run]=record;await chrome.storage.local.set({[STORE]:db});}
function originOK(sender) { try { return new URL(sender.url).origin === 'https://studio.tripo3d.ai' && sender.frameId === 0; } catch { return false; } }
async function operation(m, sender) {
  if (!originOK(sender)) throw new Error('仅接受当前 Tripo 主页面的助手消息。');
  if (m.type === 'import-task' || m.type === 'import-bundle' || m.type === 'switch-task') {
    const bundle=m.type==='import-bundle'?await TripoWorkflowBundle.parse(m.bundle):null;
    const db=await database();
    const config=bundle?bundle.task:m.type==='import-task'?TripoWorkflowPolicy.task(m.config):db.runs[m.id]?.task;
    if(!config)throw new Error('任务不存在。');
    if(Object.values(db.runs).some(s=>s.run!==config.id && s.events.some(e=>['submitting','uncertain'].includes(e.status))))throw new Error('另一任务有未确认提交，先回到原任务核对，不能换任务重复扣费。');
    const previous=db.runs[config.id];
    if(previous && (previous.initialBalance!==config.initialBalance || previous.maximumSpend!==config.maximumSpend))throw new Error('同一任务的预算与初始余额已冻结，不允许通过重新导入重置账本或提高额度。');
    if(bundle?.inputs && previous?.events.some(e=>['submitting','uncertain'].includes(e.status)))throw new Error('原提交结果未确认，禁止任务包替换素材；先核对原任务。');
    if(!previous)db.runs[config.id]={schema:1,configured:true,run:config.id,task:config,initialBalance:config.initialBalance,maximumSpend:config.maximumSpend,events:[],settings:{},inputs:{},observedSpendHighWater:0};
    if(bundle?.inputs){
      // Atomic replacement: no clear/save gap. Failed quota write leaves the old ledger and inputs intact.
      for(const run of Object.values(db.runs))run.inputs={};
      db.runs[config.id].inputs=bundle.inputs;
      db.runs[config.id].bundleImport={version:1,at:new Date().toISOString(),selectedVariant:bundle.selectedVariant,stages:bundle.stages,views:Object.fromEntries(Object.entries(bundle.inputs).map(([v,images])=>[v,Object.fromEntries(Object.entries(images).map(([slot,{data,...meta}])=>[slot,meta]))]))};
      db.runs[config.id].stages=bundle.stages;
    }
    db.activeId=config.id;await chrome.storage.local.set({[STORE]:db});return load();
  }
  const s = await load();
  if (m.type === 'read') return s;
  if (!s.configured) throw new Error('请先导入或创建已授权预算的任务。');
  if (m.type === 'settings') { s.settings = m.value; await save(s); return s; }
  if (m.type === 'inputs') {
    if (!TripoWorkflowPolicy.validVariant(m.variant)) throw new Error('无效方案名称');
    if (JSON.stringify(m.value).length > 3500000) throw new Error('这组三视图过大，请缩小后再选（总计约 2.5 MB 原始 PNG）。');
    const db=await database();for(const run of Object.values(db.runs))run.inputs={};await chrome.storage.local.set({[STORE]:db});
    s.inputs = {[m.variant]: m.value}; // Keep only the current selected set; every task ledger survives.
    await save(s); return s;
  }
  if (m.type === 'claim') {
    const p = m.proof;
    const db=await database();if(Object.values(db.runs).some(run=>run.events.some(e=>['submitting','uncertain'].includes(e.status))))throw new Error('存在未确认提交，不得开启另一付费操作。');
    const result = TripoWorkflowPolicy.gate(s, p);
    s.observedSpendHighWater = Math.max(s.observedSpendHighWater || 0, s.initialBalance - p.balance);
    const e = {...p, ...result, id: crypto.randomUUID(), tabId: sender.tab.id, status: 'submitting', createdAt: new Date().toISOString()};
    s.events.push(e); await save(s); return e;
  }
  if (m.type === 'clicked' || m.type === 'cancel-before-click') {
    const e = s.events.find(x => x.id === m.id);
    if (!e || e.tabId !== sender.tab.id || e.status !== 'submitting') throw new Error('提交记录已变更，停止操作。');
    e.status = m.type === 'clicked' ? 'uncertain' : 'cancelled';
    e.clickedAt = m.type === 'clicked' ? new Date().toISOString() : null;
    e.note = m.type === 'clicked' ? 'UI clicked once; inspect original task and credit change. Never auto retry.' : 'Target changed before click; no click executed.';
    await save(s); return s;
  }
  if (m.type === 'resolve') {
    const e = s.events.find(x => x.id === m.id);
    if (!e || !['submitting', 'uncertain'].includes(e.status)) throw new Error('无待确认记录。');
    if (!TripoWorkflowPolicy.uuid.test(m.taskId)) throw new Error('请输入原任务或资产页面可见的完整 UUID。');
    if (!['task', 'model'].includes(m.idKind)) throw new Error('请选择编号来源；资产 ID 不冒充任务 ID。');
    if (!Number.isSafeInteger(m.balance) || e.balance - m.balance < e.quote) throw new Error('当前余额尚不能确认本次报价已扣除。继续核对原任务，不重复点击。');
    e.status = 'accepted'; e.referenceId = m.taskId; e.referenceKind = m.idKind;
    e.balanceAfter = m.balance; e.balanceDelta = e.balance - m.balance;
    e.evidence = '用户已核对原页面可见编号与实时余额；余额差额可能包含同账户其他操作。';
    s.observedSpendHighWater = Math.max(s.observedSpendHighWater || 0, s.initialBalance - m.balance);
    e.resolvedAt = new Date().toISOString(); await save(s); return s;
  }
  if (m.type === 'complete') {
    const e = s.events.find(x => x.id === m.id);
    if (!e || e.status !== 'accepted') throw new Error('只能标记已核对编号的任务。');
    e.status = 'completed-unreviewed'; e.note = '用户已在原页面观察到完成；外形、绑定、动画尚待验收。';
    e.completedAt = new Date().toISOString(); await save(s); return s;
  }
  if (m.type === 'link-model') {
    const e = s.events.find(x => x.id === m.id);
    if (!e || !['accepted','completed-unreviewed'].includes(e.status) || !TripoWorkflowPolicy.uuid.test(m.modelId)) throw new Error('只能为已核对的记录关联页面可见模型 UUID。');
    e.modelId = m.modelId; e.modelIdEvidence = '用户核对当前模型页面与原提交记录后关联。';
    await save(s); return s;
  }
  if(m.type==='adopt-model') {
    if(!s.configured || !TripoWorkflowPolicy.uuid.test(m.modelId) || !TripoWorkflowPolicy.validVariant(m.variant) || !Number.isInteger(m.candidate) || m.candidate<1 || m.candidate>99)throw new Error('请先配置任务并打开要处理的模型页面。');
    if(s.events.some(e=>e.modelId===m.modelId && e.variant===m.variant && e.candidate===m.candidate))throw new Error('此模型已经属于当前候选。');
    s.events.push({id:crypto.randomUUID(),key:JSON.stringify([m.variant,m.candidate,'source-model']),variant:m.variant,candidate:m.candidate,stage:'source-model',quote:0,status:'source-model',modelId:m.modelId,referenceKind:'model',referenceId:m.modelId,createdAt:new Date().toISOString(),note:'用户明确登记已有模型用于本任务；未点击付费按钮。'});
    await save(s);return s;
  }
  throw new Error('未知操作');
}
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!['TRIPO_WORKFLOW','TRIPO_DOWNLOAD','TRIPO_AUTO_EXPORT'].includes(m?.namespace)) return;
  // Serialize budget claims across tabs; saved before page click, survives worker restart.
  queue = queue.catch(() => {}).then(() => m.namespace==='TRIPO_AUTO_EXPORT'?automaticExportOperation(m,sender):m.namespace==='TRIPO_DOWNLOAD'?downloadOperation(m,sender):operation(m, sender));
  queue.then(value => reply({ok: true, value}), e => reply({ok: false, error: e.message}));
  return true;
});
importScripts('downloads.js');
importScripts('automatic-export.js');
