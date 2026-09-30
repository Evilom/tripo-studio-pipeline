(function (root) {
  'use strict';
  const C=root.TripoStudioContext||(typeof require==='function'?require('./studio-context.js'):null);
  if(!C)throw Error('缺少页面上下文模块。');
  const stages = Object.keys(C.stages);
  const validVariant = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/[\x00-\x1f]/.test(value) && !['__proto__','constructor','prototype'].includes(value);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function number(text) {
    // More than one numeric field is ambiguous (e.g. model version and price).
    if (/-\s*\d/.test(String(text))) throw new Error('积分不能是负数。');
    const hits = String(text).match(/\d[\d,]*(?:\.\d+)?/g) || [];
    if (hits.length !== 1) throw new Error('该控件不含唯一数字；请重新标记精确的余额/报价控件。');
    const n = Number(hits[0].replaceAll(',', ''));
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('只接受页面可见的非负整数积分。');
    return n;
  }
  function key(p) {
    if (!validVariant(p.variant) || !stages.includes(p.stage) || !Number.isInteger(p.candidate) || p.candidate < 1 || p.candidate > 99) throw new Error('方案、阶段或候选编号无效。');
    if(p.stage==='studio-operation'){
      if(typeof p.operationName!=='string'||!p.operationName.trim()||p.operationName.length>80)throw Error('其他公开阶段需要明确的操作名称。');
      const url=new URL(p.page);C.check(p.stage,p.page);
      return JSON.stringify([p.variant,p.candidate,p.stage,url.pathname.split('/')[2],C.normalize(p.operationName)]);
    }
    return JSON.stringify([p.variant,p.candidate,p.stage]);
  }
  function gate(state, p) {
    if (!state.configured) throw new Error('请先导入已授权预算的任务配置，或创建任务。');
    const k = key(p);
    if (!Number.isSafeInteger(p.balance) || p.balance < 0 || !Number.isSafeInteger(p.quote) || p.quote <= 0) throw new Error('尚未读到有效余额和付费报价。');
    if (state.events.some(e => ['submitting', 'uncertain'].includes(e.status))) throw new Error('存在提交结果未确认的记录。先核对原任务，禁止再次扣费。');
    if (state.events.some(e => e.key === k && e.status !== 'cancelled')) throw new Error('本候选的该阶段已提交；查看原任务，或为明确的新迭代增加候选编号。');
    const reserved = state.events.filter(e => e.status !== 'cancelled').reduce((s, e) => s + e.quote, 0);
    const observed = Math.max(0, state.initialBalance - p.balance);
    const counted = Math.max(reserved, observed, state.observedSpendHighWater || 0);
    if (p.balance < p.quote || counted + p.quote > state.maximumSpend || p.balance - p.quote < state.initialBalance - state.maximumSpend) throw new Error('本阶段将超过余额或此任务已授权的积分总上限。');
    return {key: k, counted, remaining: state.maximumSpend - counted - p.quote};
  }
  function task(config) {
    if (config?.schema !== 1 || typeof config.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(config.id) || ['__proto__','constructor','prototype'].includes(config.id) || typeof config.name !== 'string' || !config.name.trim() || config.name.length > 100) throw new Error('任务配置需包含 schema:1、唯一 id 和名称。');
    if (!Number.isSafeInteger(config.initialBalance) || config.initialBalance < 0 || !Number.isSafeInteger(config.maximumSpend) || config.maximumSpend <= 0 || config.maximumSpend > config.initialBalance) throw new Error('任务需提供实际初始余额与不超过余额的正整数预算。');
    if (!Array.isArray(config.variants) || !config.variants.length || config.variants.length > 30 || config.variants.some(v=>!validVariant(v)) || new Set(config.variants).size!==config.variants.length) throw new Error('任务方案名称需非空、互不重复，至多 30 个；不限制人物、动物或物品。');
    if (typeof config.authorization !== 'string' || !config.authorization.trim() || config.authorization.length > 2000) throw new Error('请注明本任务额度的明确授权。');
    return {schema:1,id:config.id,name:config.name,initialBalance:config.initialBalance,maximumSpend:config.maximumSpend,variants:[...config.variants],authorization:config.authorization};
  }
  const api = {number, key, gate, uuid, stages, validVariant, task};
  root.TripoWorkflowPolicy = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
