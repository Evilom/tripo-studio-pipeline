document.querySelector('#open').addEventListener('click', async () => {
  const status = document.querySelector('#status');
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id || new URL(tab.url).origin !== 'https://studio.tripo3d.ai') throw new Error('请先切换到 https://studio.tripo3d.ai 的标签页。');
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['studio-context.js','policy.js', 'bundle.js', 'dom-adapter.js', 'content.js'], world: 'ISOLATED'});
    status.textContent = '助手已打开。页面刷新后再次点击此按钮即可恢复记录。';
  } catch (e) { status.textContent = e.message; }
});
async function downloadMessage(type,fields={}){
  const reply=await chrome.runtime.sendMessage({namespace:'TRIPO_DOWNLOAD',type,...fields});
  if(!reply?.ok)throw Error(reply?.error||'未收到下载确认；先查原记录。');return reply.value;
}
document.querySelector('#download').addEventListener('click',async()=>{
  const button=document.querySelector('#download'),status=document.querySelector('#download-status');button.disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const result=await downloadMessage('start',{tabId:tab?.id,filename:document.querySelector('#filename').value,modelId:document.querySelector('#modelid').value.trim(),confirmed:document.querySelector('#confirmed').checked});
    status.textContent=JSON.stringify(result,null,2)+'\nChrome 已接收。仍需检查最终文件、贴图和动画。';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
});
document.querySelector('#read-downloads').addEventListener('click',async()=>{
  try{const result=await downloadMessage('status');document.querySelector('#download-status').textContent=JSON.stringify(result.downloads||[],null,2);}
  catch(error){document.querySelector('#download-status').textContent=error.message;}
});
