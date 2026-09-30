'use strict';
// Only the extension popup can invoke the normal Chrome download API.
function popupSender(sender){return sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('popup.html')&&!sender.tab;}
async function downloadOperation(m,sender){
  if(!popupSender(sender))throw Error('下载只接受用户打开的原扩展弹窗请求。');
  if(!chrome.downloads)throw Error('原扩展尚未获得 downloads 权限，请检查实际加载版本。');
  const s=await load();
  if(!s.configured)throw Error('先在原 Tripo 页导入任务；下载沿用已有账本。');
  if(m.type==='status')return {...s,inputs:undefined};
  if(m.type!=='start')throw Error('未知下载操作。');
  if(m.confirmed!==true||!TripoWorkflowPolicy.uuid.test(m.modelId))throw Error('需确认当前下载来自本轮模型，并填写原 Tripo 模型 UUID。');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||tab.id!==m.tabId)throw Error('活动标签页已变化，请重新检查。');
  const source=TripoDownloadPolicy.source(tab.url);
  const filename=TripoDownloadPolicy.filename(m.filename,source.extension);
  const key=JSON.stringify([m.modelId,source.publicSource,filename]);
  s.downloads??=[];
  if(TripoDownloadPolicy.duplicate(s.downloads,key))throw Error('此导出已开始或完成。先查原下载记录和落盘文件，不重复下载。');
  const record={id:crypto.randomUUID(),key,modelId:m.modelId,filename,source:source.publicSource,tabId:tab.id,status:'calling',createdAt:new Date().toISOString()};
  s.downloads.push(record);await save(s);
  let downloadId;
  try{downloadId=await chrome.downloads.download({url:source.url,filename,conflictAction:'uniquify',saveAs:false});}
  catch{record.status='failed-before-start';record.error='Chrome 下载接口拒绝本次请求；在正常下载列表核对原因，不保存可能含签名地址的异常。';await save(s);throw Error(record.error);}
  if(!Number.isInteger(downloadId)){record.status='uncertain';await save(s);throw Error('Chrome 未返回下载编号；先检查下载列表，不重复点击。');}
  record.downloadId=downloadId;record.status='queued';record.startedAt=new Date().toISOString();await save(s);
  return {id:record.id,downloadId,filename,status:record.status};
}
if(chrome.downloads)chrome.downloads.onChanged.addListener(delta=>{
  queue=queue.catch(()=>{}).then(async()=>{
    const db=await database();
    for(const s of Object.values(db.runs)){
      const record=s.downloads?.find(d=>d.downloadId===delta.id);if(!record)continue;
      if(delta.state)record.status=delta.state.current;
      if(delta.error)record.error=delta.error.current;
      if(delta.filename)record.savedFilename=delta.filename.current;
      if(delta.danger)record.danger=delta.danger.current;
      record.updatedAt=new Date().toISOString();
    }
    await chrome.storage.local.set({[STORE]:db});
  });
});
