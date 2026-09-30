(function(root){
  'use strict';
  const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const pathRE=new RegExp('^/tripo-studio/[0-9]{8}/('+UUID+')/tripo_convert_\\1\\.(glb|zip)$','i');
  function source(raw){
    const url=new URL(raw);
    // This allowlist is based on observed native Studio export URLs, not arbitrary pasted links.
    if(url.protocol!=='https:'||url.hostname!=='tripo-data.rg1.data.tripo3d.com'||url.port||url.username||url.password||url.hash)throw Error('当前页不是已支持的 Tripo 原生导出地址。');
    const match=url.pathname.match(pathRE);
    if(!match)throw Error('仅支持实际观察到的 tripo_convert GLB/ZIP 文件；不要提交网页、脚本或其他下载地址。');
    return {url:url.href,publicSource:url.origin+url.pathname,extension:match[2].toLowerCase()};
  }
  function filename(raw,extension){
    if(typeof raw!=='string'||raw.length>120||raw.trim()!==raw||!raw||/[\\/:*?"<>|\x00-\x1f]/.test(raw)||raw.includes('..')||/[. ]$/.test(raw)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(raw))throw Error('文件名必须是普通文件名，不含路径或 Windows 保留名称。');
    if(!raw.toLowerCase().endsWith('.'+extension))throw Error('文件名扩展名必须与当前导出文件一致（'+extension+'）。');
    return raw;
  }
  function duplicate(downloads,key){return downloads.some(d=>d.key===key&&d.status!=='failed-before-start');}
  root.TripoDownloadPolicy={source,filename,duplicate};
  if(typeof module!=='undefined')module.exports=root.TripoDownloadPolicy;
})(globalThis);
