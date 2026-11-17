(function(root) {
  'use strict';
  function normalizeNotebook(data) {
    const result = {...data, articles: Array.isArray(data?.articles) ? data.articles : [], groups: Array.isArray(data?.groups) ? data.groups : [], revision: Number.isInteger(data?.revision) ? data.revision : 0, updatedAt: Number(data?.updatedAt) || 0};
    const groups = new Set(result.groups.map(g=>g.id));
    result.articles = result.articles.map(a=>({...a, groupId: groups.has(a.groupId) ? a.groupId : '', annotations: a.annotations || []}));
    return result;
  }
  function validNotebook(data) {
    if(!data || !Array.isArray(data.articles)) return false;
    if(data.groups !== undefined && (!Array.isArray(data.groups) || data.groups.some(g=>!g || typeof g.id!=='string' || typeof g.name!=='string' || !g.name.trim()) || new Set(data.groups.map(g=>g.id)).size!==data.groups.length)) return false;
    const ids=new Set();
    return data.articles.every(a=>{
      if(!a || typeof a.id!=='string' || ids.has(a.id) || typeof a.title!=='string' || !Array.isArray(a.blocks) || !Array.isArray(a.annotations)) return false;
      ids.add(a.id);
      if(a.url) {try {if(!['http:','https:'].includes(new URL(a.url).protocol))return false;}catch{return false;}}
      const blocks=new Map(a.blocks.map(b=>[b?.id,b]));
      return a.blocks.every(b=>b && typeof b.id==='string' && typeof b.text==='string') && a.annotations.every(n=>n && typeof n.id==='string' && typeof n.quote==='string' && typeof n.comment==='string' && Array.isArray(n.spans) && n.spans.every(s=>blocks.has(s.blockId) && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start>=0 && s.end>s.start && s.end<=blocks.get(s.blockId).text.length));
    });
  }
  function visibleArticles(state, groupId, query='') {
    const q=query.trim().toLocaleLowerCase();
    return state.articles.filter(a=>(groupId==='all' || (groupId==='ungrouped' ? !a.groupId : a.groupId===groupId)) && (!q || [a.title,a.author,a.url,...a.blocks.map(b=>b.text),...a.annotations.map(n=>n.comment)].join(' ').toLocaleLowerCase().includes(q))).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
  }
  function removeGroup(state, id) {
    return {...state,groups:state.groups.filter(g=>g.id!==id),articles:state.articles.map(a=>a.groupId===id ? {...a,groupId:''} : a)};
  }
  function formatDate(value, year=false) {
    const date=new Date(value);
    return Number(value)>0 && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString(undefined,{month:'short',day:'numeric',...(year?{year:'numeric'}:{})}) : 'Date unavailable';
  }
  function publicUrl(value) {
    let url; try {url=new URL(value);} catch {throw new Error('Enter a valid article URL.');}
    const host=url.hostname.toLowerCase();
    if(!['http:','https:'].includes(url.protocol) || url.username || url.password || host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.includes(':') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error('Use a public http or https article URL. For private pages, paste the text instead.');
    url.hash=''; return url.href;
  }
  function plainMarkdown(text) {
    return text.replace(/!\[[^\]]*\]\([^\n]*?\)/g,'').replace(/\[([^\]]+)\]\([^\n]*?\)/g,'$1').replace(/\[([^\]]+)\]\[\d+\]/g,'$1').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/<[^>]+>/g,'').trim();
  }
  function readerArticle(payload, url) {
    const data=payload?.data || payload;
    if(!data || typeof data.content!=='string') throw new Error('This page could not be imported. Use Text instead.');
    const title=(data.title || new URL(url).hostname).trim().slice(0,500);
    const blocks=[]; let paragraph=[], code=[], inCode=false;
    const add=(type,text)=>{if(text.trim())blocks.push({id:'b'+blocks.length,type,text:text.trim()});};
    const flush=()=>{add('p',plainMarkdown(paragraph.join(' ')));paragraph=[];};
    for(const raw of data.content.replace(/\r\n/g,'\n').split('\n')) {
      const line=raw.trim();
      if(/^```/.test(line)){flush();if(inCode){add('pre',code.join('\n'));code=[];}inCode=!inCode;continue;}
      if(inCode){code.push(raw);continue;}
      if(!line){flush();continue;}
      if(/^!\[/.test(line) || /^\[\d+\]:/.test(line) || /^[-*_]{3,}$/.test(line) || /^[=]{3,}$/.test(line)){flush();continue;}
      const heading=line.match(/^(#{1,6})\s+(.+)/);
      if(heading){flush();const text=plainMarkdown(heading[2]);if(text.toLowerCase()!==title.toLowerCase())add(heading[1].length>2?'h3':'h2',text);continue;}
      if(/^>\s?/.test(line)){flush();add('blockquote',plainMarkdown(line.replace(/^>\s?/,'')));continue;}
      if(/^(?:[-*+]\s+|\d+[.)]\s+)/.test(line)){flush();add('li',plainMarkdown(line.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/,'')));continue;}
      paragraph.push(line);
    }
    flush(); if(code.length)add('pre',code.join('\n'));
    if(!blocks.length || blocks.reduce((n,b)=>n+b.text.length,0)<30) throw new Error('The page did not include readable article text. Use Text instead.');
    return {title,url,author:'',blocks};
  }
  const api={normalizeNotebook,validNotebook,visibleArticles,removeGroup,formatDate,publicUrl,readerArticle};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.MarginCore=api;
})(typeof window!=='undefined'?window:globalThis);
