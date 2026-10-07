'use strict';
// A separate free-export journal never creates or resets a paid task/budget.
const AUTO_EXPORT_STORE='tripo-export-automation-v1';
async function exportJournal(){return (await chrome.storage.local.get(AUTO_EXPORT_STORE))[AUTO_EXPORT_STORE]||[];}
async function saveExportJournal(records){await chrome.storage.local.set({[AUTO_EXPORT_STORE]:records});}
async function reconcileNativeDownloads(records,tab,modelId){
  if(!chrome.downloads.search)return;
  let dirty=false;
  for(const r of records){
    if(r.tabId!==tab.id||r.modelId!==modelId||!['armed','expired-before-capture','stopped-source-mismatch'].includes(r.status))continue;
    const started=Date.parse(r.createdAt);if(!Number.isFinite(started))continue;
    const escaped=r.filename.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const found=await chrome.downloads.search({filenameRegex:escaped+'$',startedAfter:r.createdAt,startedBefore:new Date(started+120000).toISOString(),limit:10});
    const matches=found.filter(d=>{
      const name=String(d.filename||'').split(/[\\/]/).pop(),time=Date.parse(d.startTime);
      if(name!==r.filename||!Number.isInteger(d.id)||!Number.isFinite(time)||time<started||time>started+120000)return false;
      try{
        const source=TripoDownloadPolicy.source(d.finalUrl||d.url);
        return source.extension===r.extension&&new URL(d.referrer).origin==='https://studio.tripo3d.ai';
      }catch{
        try{return new URL(d.url).protocol==='blob:'&&new URL(d.url).origin==='https://studio.tripo3d.ai';}catch{return false;}
      }
    });
    // Observe one existing browser download only; never create a download or retry Export.
    if(matches.length!==1)continue;
    const d=matches[0];r.downloadId=d.id;r.savedFilename=d.filename;r.status=d.state||'uncertain';r.captureKind='native-direct-download';
    try{r.source=TripoDownloadPolicy.source(d.finalUrl||d.url).publicSource;}catch{r.source='blob:https://studio.tripo3d.ai';}
    if(d.error)r.error=String(d.error).slice(0,200);else delete r.error;
    if(d.danger)r.danger=d.danger;r.updatedAt=new Date().toISOString();dirty=true;
  }
  if(dirty)await saveExportJournal(records);
}
function exportModelPage(raw){
  const context=TripoStudioContext.workspace(raw);
  if(!context.modelId)throw Error('自动导出只接受当前模型独立页面。');
  return {modelId:context.modelId,page:context.page};
}
async function automaticExportOperation(m,sender){
  if(!originOK(sender)||!Number.isInteger(sender.tab?.id))throw Error('自动导出仅接受原 Tripo 主页面的扩展控件。');
  const tab=await chrome.tabs.get(sender.tab.id),model=exportModelPage(tab.url);
  // sender.url is the document's initial URL and can remain stale after SPA routing.
  if(model.page!==exportModelPage(m.page).page)throw Error('原模型页已变化，未执行导出。');
  const records=await exportJournal();
  if(m.type==='status'){await reconcileNativeDownloads(records,tab,model.modelId);return records.filter(r=>r.modelId===model.modelId);}
  if(m.type==='cancel-before-click'){
    const record=records.find(r=>r.id===m.id&&r.tabId===tab.id&&r.status==='armed');
    if(!record)throw Error('导出状态已变化，不能取消。');
    record.status='cancelled-before-click';await saveExportJournal(records);return record;
  }
  if(m.type!=='arm')throw Error('未知自动导出操作。');
  if(!chrome.downloads||!chrome.tabs.onUpdated)throw Error('实际加载版本或下载权限尚未就绪。');
  if(!['glb','zip'].includes(m.extension))throw Error('仅支持当前原生 GLB/ZIP 导出。');
  const filename=TripoDownloadPolicy.filename(m.filename,m.extension);
  const key=JSON.stringify([model.modelId,filename]);
  const now=Date.now();
  for(const r of records){if(r.status==='armed'&&r.expiresAt<now)r.status='expired-before-capture';}
  const unresolved=records.some(r=>['armed','calling','queued','in_progress','uncertain','interrupted'].includes(r.status));
  if(unresolved){await saveExportJournal(records);throw Error('已有导出未完成或结果不明，先核对原记录，不重复执行。');}
  if(records.some(r=>r.key===key&&!['cancelled-before-click','expired-before-capture'].includes(r.status)))throw Error('同一模型文件已尝试导出，请先核对原文件和记录。');
  if(!m.settings||m.settings.filename!==filename||m.settings.extension!==m.extension)throw Error('导出设置证据不完整。');
  // Never persist arbitrary page data supplied in a message or signed URL queries.
  const settings={filename,extension:m.extension,format:String(m.settings.format||'').slice(0,10),skeleton:!!m.settings.skeleton,inPlace:!!m.settings.inPlace,vertexColors:!!m.settings.vertexColors,fbxPreset:['Blender','Mixamo','3dsmax'].includes(m.settings.fbxPreset)?m.settings.fbxPreset:null,animationCount:Number(m.settings.animationCount)||0,resolution:String(m.settings.resolution||'').slice(0,30)};
  const record={id:crypto.randomUUID(),key,...model,tabId:tab.id,filename,extension:m.extension,settings,status:'armed',createdAt:new Date().toISOString(),expiresAt:now+120000};
  records.push(record);await saveExportJournal(records);return record;
}
async function restoreExportPage(record){
  try{
    const tab=await chrome.tabs.get(record.tabId);
    const current=TripoDownloadPolicy.source(tab.url);
    if(current.publicSource!==record.source)return 'skipped-page-changed';
    await chrome.tabs.update(record.tabId,{url:record.page});return 'returned-to-original-model';
  }catch{return 'not-returned';}
}
async function captureAutomaticExport(tabId,raw){
  const records=await exportJournal();
  const record=records.find(r=>r.tabId===tabId&&r.status==='armed');
  if(!record)return;
  if(Date.now()>record.expiresAt){record.status='expired-before-capture';await saveExportJournal(records);return;}
  // Same model route updates are harmless. Any other navigation stops this arm.
  try{if(exportModelPage(raw).page===record.page)return;}catch{}
  let source;
  try{source=TripoDownloadPolicy.source(raw);if(source.extension!==record.extension)throw Error('导出文件类型与设置不同。');}
  catch{record.status='stopped-source-mismatch';record.error='原标签页转向未支持的地址或文件类型，未启动下载。';await saveExportJournal(records);return;}
  record.status='calling';record.source=source.publicSource;await saveExportJournal(records);
  try{
    const id=await chrome.downloads.download({url:source.url,filename:record.filename,conflictAction:'uniquify',saveAs:false});
    if(!Number.isInteger(id)){record.status='uncertain';record.error='Chrome 未返回编号，不自动重试。';}
    else{record.downloadId=id;record.status='queued';}
  }catch{record.status='interrupted';record.error='Chrome 下载接口拒绝本次请求，未自动重试；在正常下载列表核对原因。';}
  await saveExportJournal(records);
  if(record.status==='queued'){
    record.pageRecovery=await restoreExportPage(record);await saveExportJournal(records);
  }
}
if(chrome.tabs?.onUpdated)chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(!change.url)return;
  queue=queue.catch(()=>{}).then(()=>captureAutomaticExport(tabId,change.url)).catch(()=>{});
});
if(chrome.downloads)chrome.downloads.onChanged.addListener(delta=>{
  queue=queue.catch(()=>{}).then(async()=>{
    const records=await exportJournal();const r=records.find(r=>r.downloadId===delta.id);if(!r)return;
    if(delta.state)r.status=delta.state.current;
    if(delta.error)r.error=String(delta.error.current).slice(0,200);
    if(delta.filename)r.savedFilename=delta.filename.current;
    if(delta.danger)r.danger=delta.danger.current;
    if(delta.bytesReceived)r.bytesReceived=delta.bytesReceived.current;
    if(delta.totalBytes)r.totalBytes=delta.totalBytes.current;
    r.updatedAt=new Date().toISOString();await saveExportJournal(records);
  });
});
