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
  function upgradeArticle(original, fresh) {
    const normalized=text=>text.replace(/\s+/g,' ').trim();
    const used=new Set(),reserved=new Set(original.blocks.map(b=>b.id));
    const blocks=fresh.blocks.map((block,index)=>{
      const existing=original.blocks.find(b=>!used.has(b.id) && normalized(b.text)===normalized(block.text));
      if(existing){used.add(existing.id);return {...existing};}
      let id='expanded-'+index;while(reserved.has(id)||used.has(id))id+='-new';used.add(id);
      return {...block,id};
    });
    for(const note of original.annotations)for(const span of note.spans) {
      if(!blocks.some(b=>b.id===span.blockId))throw new Error('The source changed a highlighted passage. Your saved copy and notes were kept.');
    }
    return {...original,blocks,author:original.author||fresh.author||''};
  }
  function readerOptions(url) {
    const host=new URL(url).hostname;
    if(host!=='fastcompany.com'&&host!=='www.fastcompany.com')return null;
    return {url,targetSelector:'article.article-container',engine:'curl'};
  }
  function mergeNotebooks(base,local,remote) {
    const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const mergeList=(before,left,right,combine)=>{
      const b=new Map(before.map(x=>[x.id,x])),l=new Map(left.map(x=>[x.id,x])),r=new Map(right.map(x=>[x.id,x]));
      const result=[];
      for(const id of new Set([...l.keys(),...r.keys(),...b.keys()])) {
        const old=b.get(id),a=l.get(id),z=r.get(id);
        if(!a&&!z)continue;
        if(!a){if(!old||!equal(old,z))result.push(z);continue;}
        if(!z){if(!old||!equal(old,a))result.push(a);continue;}
        if(equal(a,z)||equal(old,z))result.push(a);
        else if(equal(old,a))result.push(z);
        else result.push(...combine(old,a,z));
      }
      return result;
    };
    const combineNotes=(old,a,z)=>{
      // Two edits to the same comment are both retained instead of overwriting.
      if(a.comment===z.comment)return [{...z,...a}];
      let hash=2166136261;for(const c of z.comment)hash=Math.imul(hash^c.charCodeAt(0),16777619);
      return [a,{...z,id:z.id+'-conflict-'+(hash>>>0).toString(16)}];
    };
    const result={...remote,groups:mergeList(base.groups||[],local.groups||[],remote.groups||[],(old,a,z)=>[a]),articles:mergeList(base.articles||[],local.articles||[],remote.articles||[],(old,a,z)=>[{...z,...a,annotations:mergeList(old?.annotations||[],a.annotations,z.annotations,combineNotes)}])};
    return normalizeNotebook(result);
  }
  const api={normalizeNotebook,validNotebook,visibleArticles,removeGroup,formatDate,publicUrl,readerArticle,mergeNotebooks,upgradeArticle,readerOptions};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.MarginCore=api;
})(typeof window!=='undefined'?window:globalThis);


(function(){
if(typeof document === 'undefined') return;
'use strict';
const $ = id => document.getElementById(id);
const uid = () => crypto.randomUUID();
const {normalizeNotebook, validNotebook, visibleArticles, removeGroup, formatDate, publicUrl, readerArticle, mergeNotebooks, upgradeArticle, readerOptions} = MarginCore;
const cloudMode=['lucasgravina.com','www.lucasgravina.com'].includes(location.hostname);
const CLOUD='https://margin-cloud-lucas.lucasgravina180.chatgpt.site';
let cloudToken='',cloudBase=normalizeNotebook({articles:[]}),cloudConfig=null;
let state = normalizeNotebook({articles: []});
let activeId = null, editingId = null, selection = null, importMode = 'link';
let dirty = false, saving = false, saveTimer, generation = 0, desktopHandle = null, nativeDesktop = false, nativeServer = false, dataDir = '';
let activeGroup = 'all', editingGroup = null, notebookDB = null, saveBlocked = false;
const PENDING = 'margin-pending-v1';
const getPref = key => {try{return localStorage.getItem(key);}catch{return null;}};
const setPref = (key,value) => {try{localStorage.setItem(key,value);}catch{}};
const folderIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5h7l2 2h9v13H3z"/></svg>';

async function database() {
  if(notebookDB) return notebookDB;
  notebookDB = await new Promise((resolve,reject)=>{
    const request=indexedDB.open('margin-notebook',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('notebooks');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('Browser storage is unavailable. Enable site storage, then reload.'));
  });
  return notebookDB;
}
async function loadBrowser() {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notebooks','readonly'),request=tx.objectStore('notebooks').get('main');
    request.onsuccess=()=>resolve(request.result || normalizeNotebook({articles:[]}));
    request.onerror=()=>reject(request.error);
  });
}
async function saveBrowser(snapshot, revision) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('notebooks','readwrite'),store=tx.objectStore('notebooks');
    const read=store.get('main');let result,conflict=false;
    read.onsuccess=()=>{
      if((read.result?.revision || 0)!==revision){conflict=true;tx.abort();return;}
      result={...snapshot,revision:revision+1,updatedAt:Date.now()};store.put(result,'main');
    };
    tx.oncomplete=()=>resolve({revision:result.revision,updatedAt:result.updatedAt});
    tx.onabort=()=>reject(new Error(conflict?'Another tab saved changes. Download a backup of this tab, then reload to load the latest library.':'Browser storage is full or unavailable. Download a backup before closing this tab.'));
    tx.onerror=()=>{};
  });
}

function toast(message, timeout = 4500) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, timeout);
}
function current() { return state.articles.find(a => a.id === activeId); }
function domain(article) {
  try { return new URL(article.url).hostname.replace(/^www\./, ''); } catch { return 'Pasted text'; }
}
function wordCount(article) { return article.blocks.reduce((n,b) => n + b.text.trim().split(/\s+/).length, 0); }
function status(message, error = false) {
  $('save-status').replaceChildren();
  $('save-status').textContent=message;
  $('save-status').classList.toggle('error', error);
}
function remember() {
  try { localStorage.setItem(PENDING, JSON.stringify({state, dirty, base:cloudMode?cloudBase:undefined, editedAt: Date.now()})); }
  catch { if(dirty)toast('Recovery storage is full. Keep this tab open until saving finishes.'); }
}
function changed() {
  generation++; dirty = true; remember(); status('Saving…');
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 250);
  renderGroups(); renderLibrary();
}
async function request(path, body) {
  const response = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Margin-Request': '1'}, body: JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
async function cloudRequest(path,body) {
  const response=await fetch(CLOUD+path,{method:body?'POST':'GET',cache:'no-store',credentials:'omit',headers:{...(cloudToken?{Authorization:'Bearer '+cloudToken}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok){const error=new Error(data.error || 'Cloud save failed.');error.status=response.status;error.state=data.state;throw error;}
  return data;
}
async function saveCloud() {
  for(let attempt=0;attempt<4;attempt++) {
    const snapshot=JSON.parse(JSON.stringify(state));
    try {
      const result=await cloudRequest('/v1/notebook',{state:snapshot,revision:cloudBase.revision});
      cloudBase={...snapshot,...result};return result;
    } catch(error) {
      if(error.status!==409)throw error;
      const latest=normalizeNotebook(error.state || (await cloudRequest('/v1/notebook')).state);
      state=mergeNotebooks(cloudBase,state,latest);cloudBase=latest;
      renderBody();renderNotes();renderGroups();renderLibrary();
      if(editingId)$('note-'+editingId)?.querySelector('textarea')?.focus({preventScroll:true});
    }
  }
  throw new Error('The library is changing in another window. Your edits are retained here; try saving again.');
}
async function unlockCloud(event) {
  event.preventDefault();$('unlock-button').disabled=true;$('lock-error').hidden=true;
  try {
    cloudConfig=cloudConfig || await cloudRequest('/v1/config');
    const password=$('library-password').value;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(cloudConfig.salt),iterations:cloudConfig.iterations,hash:'SHA-256'},key,256));
    cloudToken=btoa(String.fromCharCode(...bits)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    const remote=normalizeNotebook((await cloudRequest('/v1/notebook')).state);
    let pending;try{pending=JSON.parse(getPref(PENDING)||'null');}catch{}
    const browser=normalizeNotebook(await loadBrowser());
    cloudBase=JSON.parse(JSON.stringify(remote));
    if(!getPref('margin-cloud-migrated'))state=mergeNotebooks(normalizeNotebook({articles:[]}),browser,remote);
    else if(pending?.dirty&&validNotebook(pending.state))state=mergeNotebooks(pending.base||remote,normalizeNotebook(pending.state),remote);
    else state=remote;
    $('library-password').value='';document.body.classList.remove('cloud-locked');$('lock-screen').hidden=true;
    $('storage-caption').textContent='Private cloud library.';$('import-provider').hidden=false;
    $('import-provider').lastChild.textContent='. Your notes are saved to your private cloud library.';
    renderGroups();openArticle(state.articles.find(a=>a.id===getPref('margin-active'))?.id || state.articles[0]?.id || null);
    if(JSON.stringify(state.articles)!==JSON.stringify(remote.articles)||JSON.stringify(state.groups)!==JSON.stringify(remote.groups)){changed();await save();}
    else status('Saved to cloud');
    if(!dirty)setPref('margin-cloud-migrated','1');
  }catch(error){cloudToken='';$('lock-error').textContent=error.status===401?'Incorrect password.':error.message;$('lock-error').hidden=false;}
  finally{$('unlock-button').disabled=false;}
}
async function save() {
  if (saving || !dirty || saveBlocked || (cloudMode&&!cloudToken)) return;
  saving = true;
  const stamp = generation;
  const snapshot = JSON.parse(JSON.stringify(state));
  try {
    const result = cloudMode ? await saveCloud() : nativeServer ? await request('/api/state', {state: snapshot, revision: state.revision}) : await saveBrowser(snapshot,state.revision);
    state.revision = result.revision; state.updatedAt = result.updatedAt;
    dirty = generation !== stamp; remember();
    status(dirty ? 'Saving…' : cloudMode ? 'Saved to cloud' : nativeDesktop ? 'Saved to Desktop' : nativeServer ? 'Saved on this Mac' : 'Saved in this browser');
    if(cloudMode&&!dirty)setPref('margin-cloud-migrated','1');
    snapshot.revision=state.revision; snapshot.updatedAt=state.updatedAt;
    if (desktopHandle) {
      try { await writeDesktop(cloudMode?JSON.parse(JSON.stringify(cloudBase)):snapshot); }
      catch { desktopHandle = null; $('desktop-connect').textContent = 'Reconnect Desktop folder'; toast('Saved. Reconnect the Desktop folder to continue backups.', 6000); }
    }
  } catch (e) {
    dirty = true; remember(); status('Save needs attention', true);
    if(e.message.includes('Another tab'))saveBlocked=true;
    toast(e.message, 8500);
  } finally {
    saving = false;
    if (dirty && !saveBlocked && generation !== stamp) saveTimer = setTimeout(save, 150);
  }
}

function setSidebar(hidden, persist=true) {
  document.body.classList.toggle('sidebar-hidden',hidden);
  $('library').inert=hidden;
  $('library').setAttribute('aria-hidden',String(hidden));
  $('toggle-library').setAttribute('aria-expanded',String(!hidden));
  $('toggle-library').setAttribute('aria-label',hidden?'Show library':'Hide library');
  $('toggle-library').title=hidden?'Show library':'Hide library';
  $('sidebar-scrim').hidden=hidden || window.innerWidth>650;
  if(persist)setPref('margin-sidebar-hidden',hidden?'1':'0');
  hideSelection();
}
function setNotes(hidden, persist=true) {
  $('reading-layout').classList.toggle('notes-hidden',hidden);
  $('toggle-notes').setAttribute('aria-expanded',String(!hidden));
  $('toggle-notes').setAttribute('aria-label',hidden?'Show notes':'Hide notes');
  $('toggle-notes').title=hidden?'Show notes':'Hide notes';
  if(persist)setPref('margin-notes-hidden',hidden?'1':'0');
}
function groupOptions(select, value='') {
  select.replaceChildren(new Option('Ungrouped',''));
  for(const group of state.groups)select.add(new Option(group.name,group.id));
  select.value=state.groups.some(g=>g.id===value)?value:'';
}
function renderGroups() {
  const list=$('group-list'); list.replaceChildren();
  const entries=[{id:'all',name:'All articles'},{id:'ungrouped',name:'Ungrouped'},...state.groups];
  for(const group of entries) {
    const row=document.createElement('div');row.className='group-row'+(activeGroup===group.id?' active':'');
    const button=document.createElement('button');button.className='group-filter';button.setAttribute('aria-current',activeGroup===group.id?'page':'false');
    button.innerHTML=folderIcon;
    const name=document.createElement('span');name.className='group-name';name.textContent=group.name;
    const count=document.createElement('span');count.className='group-count';count.textContent=visibleArticles(state,group.id).length;
    button.append(name,count);button.addEventListener('click',()=>selectGroup(group.id));row.append(button);
    if(!['all','ungrouped'].includes(group.id)) {
      const manage=document.createElement('button');manage.className='manage-group';manage.textContent='⋯';manage.setAttribute('aria-label','Manage group '+group.name);manage.addEventListener('click',()=>showGroup(group.id));row.append(manage);
    }
    list.append(row);
  }
  groupOptions($('article-group'),current()?.groupId || '');
  $('list-heading').textContent=entries.find(g=>g.id===activeGroup)?.name || 'All articles';
}
function selectGroup(id) {
  activeGroup=id;setPref('margin-active-group',id);renderGroups();
  const articles=visibleArticles(state,id,$('search').value);
  openArticle(articles.some(a=>a.id===activeId)?activeId:articles[0]?.id || null,false);
}
function showGroup(id=null) {
  editingGroup=id;
  $('group-dialog-title').textContent=id?'Edit group':'New group';
  $('group-name').value=state.groups.find(g=>g.id===id)?.name || '';
  $('group-error').hidden=true;$('delete-group').hidden=!id;
  $('group-dialog').showModal();$('group-name').focus();
}
function saveGroup(event) {
  event.preventDefault();const name=$('group-name').value.trim();
  const error=!name?'Enter a group name.':state.groups.some(g=>g.id!==editingGroup && g.name.toLocaleLowerCase()===name.toLocaleLowerCase())?'A group with this name already exists.':'';
  if(error){$('group-error').textContent=error;$('group-error').hidden=false;return;}
  if(editingGroup)state.groups.find(g=>g.id===editingGroup).name=name;
  else {const group={id:uid(),name,createdAt:Date.now()};state.groups.push(group);activeGroup=group.id;}
  changed();$('group-dialog').close();selectGroup(activeGroup);
}

function renderLibrary() {
  const query = $('search').value.toLowerCase().trim();
  const list = $('article-list'); list.replaceChildren();
  $('article-count').textContent = state.articles.length+' '+(state.articles.length===1?'article':'articles');
  const articles = visibleArticles(state,activeGroup,query);
  $('filtered-count').textContent=articles.length;
  for (const a of articles) {
    const button = document.createElement('button'); button.className = 'article-card' + (a.id === activeId ? ' active' : '');
    button.setAttribute('aria-current', a.id === activeId ? 'page' : 'false');
    const source = document.createElement('div'); source.className = 'card-source'; source.textContent = domain(a);
    const title = document.createElement('div'); title.className = 'card-title'; title.textContent = a.title;
    const info = document.createElement('div'); info.className = 'card-info';
    const date=document.createElement('time');date.textContent=formatDate(a.createdAt);if(Number(a.createdAt)>0)date.dateTime=new Date(a.createdAt).toISOString();date.title='Added '+formatDate(a.createdAt,true);
    const details=document.createElement('span');details.textContent=a.annotations.length ? a.annotations.length+' '+(a.annotations.length===1?'note':'notes') : Math.max(1,Math.ceil(wordCount(a)/230))+' min';
    info.append(date,details);
    button.append(source, title, info); button.addEventListener('click', ()=>openArticle(a.id,true)); list.append(button);
  }
  if (!articles.length) { const empty = document.createElement('p'); empty.className = 'library-empty'; empty.textContent = query ? 'No matching articles.' : 'No articles in this group.'; list.append(empty); }
}
function openArticle(id, closeMobile=false) {
  const previous = current();
  if (previous) { previous.scroll = $('reader-scroll').scrollTop; try {localStorage.setItem('margin-scroll-'+previous.id, previous.scroll);} catch {} }
  activeId = id; editingId = null; hideSelection();
  try { localStorage.setItem('margin-active', id || ''); } catch {}
  const a = current();
  $('welcome').hidden = !!a; $('reading-layout').hidden = !a;
  if (!a) { $('current-source').textContent = 'Library'; renderLibrary(); return; }
  $('current-source').textContent = domain(a);
  $('article-domain').textContent = domain(a);
  $('article-title').textContent = a.title;
  $('article-author').textContent = a.author || '';
  $('article-meta').textContent = `Added ${formatDate(a.createdAt,true)} · ${Math.max(1,Math.ceil(wordCount(a)/230))} min read · ${wordCount(a).toLocaleString()} words`;
  groupOptions($('article-group'),a.groupId);
  $('expand-article').hidden = !a.url || !readerOptions(a.url) || !a.blocks.some(b=>/expand to continue reading/i.test(b.text));
  $('source-link').hidden = !a.url;
  if (a.url) $('source-link').href = a.url;
  renderBody(); renderNotes(); renderLibrary();
  requestAnimationFrame(()=> { $('reader-scroll').scrollTop = Number(getPref('margin-scroll-'+a.id)) || a.scroll || 0; });
  if(closeMobile && window.innerWidth<=650)setSidebar(true,false);
}
function renderBody() {
  const a = current(), body = $('article-body'); body.replaceChildren();
  if (!a) return;
  for (const block of a.blocks) {
    const tag = ['h2','h3','blockquote','pre'].includes(block.type) ? block.type : 'p';
    const el = document.createElement(tag); el.dataset.block = block.id;
    if (block.type === 'li') el.className = 'list-item';
    if (block.type === 'figcaption') el.className = 'caption';
    const spans = a.annotations.flatMap(n => (n.spans || []).filter(s=>s.blockId === block.id).map(s=>({...s,id:n.id})));
    const points = [...new Set([0,block.text.length,...spans.flatMap(s=>[Math.max(0,s.start),Math.min(block.text.length,s.end)])])].sort((a,b)=>a-b);
    for (let i=0; i<points.length-1; i++) {
      const start=points[i], end=points[i+1]; if (start>=end) continue;
      const covers = spans.filter(s=>s.start<=start&&s.end>=end);
      const text = block.text.slice(start,end);
      if (!covers.length) el.append(document.createTextNode(text));
      else { const mark=document.createElement('mark'); mark.textContent=text; mark.dataset.notes=covers.map(s=>s.id).join(' '); mark.addEventListener('click',()=>{if (!window.getSelection().toString()) editNote(covers[0].id);}); el.append(mark); }
    }
    body.append(el);
  }
}
function renderNotes() {
  const a=current(); if (!a) return;
  const list=$('notes-list'); list.replaceChildren();
  $('note-count').textContent=a.annotations.length; $('notes-empty').hidden=!!a.annotations.length;
  for (const note of a.annotations) {
    const card=document.createElement('div'); card.className='note-card'+(editingId===note.id?' editing':''); card.id='note-'+note.id;
    const quote=document.createElement('div'); quote.className='note-quote'; quote.textContent=note.quote; card.append(quote);
    const bottom=document.createElement('div'); bottom.className='note-bottom';
    if (editingId===note.id) {
      const textarea=document.createElement('textarea'); textarea.className='note-input'; textarea.value=note.comment; textarea.placeholder='Write a comment…'; textarea.setAttribute('aria-label','Your comment');
      textarea.addEventListener('input',()=>{ note.comment=textarea.value; note.updatedAt=Date.now(); changed(); });
      card.append(textarea);
      const live=document.createElement('span'); live.className='note-live'; live.textContent='Autosaves';
      const done=document.createElement('button'); done.className='note-done'; done.textContent='Done'; done.addEventListener('click',e=>{e.stopPropagation(); editingId=null; renderNotes(); save();});
      bottom.append(live,done);
    } else {
      const text=document.createElement('div'); text.className=note.comment?'note-text':'add-thought'; text.textContent=note.comment||'Add comment'; card.append(text);
      const date=document.createElement('span'); date.textContent=new Date(note.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'});
      const actions=document.createElement('div'); actions.className='note-actions';
      const edit=document.createElement('button'); edit.textContent='Edit'; edit.addEventListener('click',e=>{e.stopPropagation(); editNote(note.id);});
      const remove=document.createElement('button'); remove.textContent='Remove'; remove.addEventListener('click',e=>{e.stopPropagation(); if(note.comment && !confirm('Remove this highlight and comment?')) return; a.annotations=a.annotations.filter(n=>n.id!==note.id); changed(); renderBody(); renderNotes();});
      actions.append(edit,remove); bottom.append(date,actions);
      card.addEventListener('click',()=>{focusHighlight(note.id); editNote(note.id,false);});
    }
    card.append(bottom); list.append(card);
  }
}
function focusHighlight(id) {
  const marks=[...$('article-body').querySelectorAll('mark')]; marks.forEach(m=>m.classList.toggle('focused',m.dataset.notes.split(' ').includes(id)));
  const mark=marks.find(m=>m.dataset.notes.split(' ').includes(id)); if(mark) mark.scrollIntoView({behavior:'smooth',block:'center'});
}
function editNote(id, focus=true) {
  editingId=id; setNotes(false); renderNotes();
  const card=$('note-'+id); if(card) { card.scrollIntoView({behavior:'smooth',block:'nearest'}); if(focus) card.querySelector('textarea')?.focus({preventScroll:true}); }
}
function hideSelection() { selection=null; $('selection-toolbar').hidden=true; }
function readSelection() {
  const sel=window.getSelection(), a=current();
  if(!a||!sel||sel.isCollapsed||!sel.rangeCount) return hideSelection();
  const range=sel.getRangeAt(0), body=$('article-body');
  if(!body.contains(range.startContainer)||!body.contains(range.endContainer)) return hideSelection();
  const spans=[];
  for(const el of body.children) {
    if(!range.intersectsNode(el)) continue;
    const b=a.blocks.find(b=>b.id===el.dataset.block); if(!b) continue;
    const pre=document.createRange(); pre.selectNodeContents(el);
    let start=0,end=b.text.length;
    if(el.contains(range.startContainer)) { pre.setEnd(range.startContainer,range.startOffset); start=pre.toString().length; }
    if(el.contains(range.endContainer)) { pre.selectNodeContents(el); pre.setEnd(range.endContainer,range.endOffset); end=pre.toString().length; }
    if(start<end) spans.push({blockId:b.id,start,end});
  }
  if(!spans.length) return hideSelection();
  const quote=spans.map(s=>a.blocks.find(b=>b.id===s.blockId).text.slice(s.start,s.end)).join('\n\n');
  if(!quote.trim()) return hideSelection();
  selection={articleId:a.id,spans,quote};
  const rect=range.getBoundingClientRect(), toolbar=$('selection-toolbar'); toolbar.hidden=false;
  toolbar.style.left=Math.max(8,Math.min(window.innerWidth-toolbar.offsetWidth-8,rect.left+rect.width/2-toolbar.offsetWidth/2))+'px';
  toolbar.style.top=Math.max(8,Math.min(window.innerHeight-toolbar.offsetHeight-8,rect.top-toolbar.offsetHeight-10))+'px';
}
function addAnnotation(comment) {
  if(!selection||selection.articleId!==activeId) return;
  const a=current(), note={id:uid(),spans:selection.spans,quote:selection.quote,comment:'',createdAt:Date.now()};
  a.annotations.push(note); window.getSelection().removeAllRanges(); hideSelection(); changed(); renderBody();
  if(comment) editNote(note.id); else {renderNotes(); toast('Highlight saved.',2000);}
}

function showImport() { groupOptions($('import-group'),activeGroup); $('import-dialog').showModal(); setImportMode(importMode); setTimeout(()=>$(importMode==='link'?'article-url':'paste-title').focus(),50); }
function setImportMode(mode) {
  importMode=mode; $('link-fields').hidden=mode!=='link'; $('text-fields').hidden=mode!=='text'; $('tab-link').classList.toggle('active',mode==='link'); $('tab-text').classList.toggle('active',mode==='text');
  $('article-url').required=mode==='link'; $('paste-title').required=mode==='text'; $('paste-body').required=mode==='text'; $('import-error').hidden=true;
  $('import-submit').textContent='Add article';
  $('tab-link').setAttribute('aria-selected',String(mode==='link'));$('tab-text').setAttribute('aria-selected',String(mode==='text'));
}
async function importLink(value) {
  const url=publicUrl(value);
  if(nativeServer)return request('/api/import',{url});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try {
    const options=readerOptions(url);
    const response=await fetch('https://r.jina.ai/'+(options?'':url),{method:options?'POST':'GET',headers:{Accept:'application/json',...(options?{'Content-Type':'application/json','X-No-Cache':'true'}:{})},...(options?{body:JSON.stringify(options)}:{}),credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
    if(!response.ok)throw new Error(response.status===429?'Link imports are temporarily rate limited. Try again later or paste the text.':'This site could not be imported. Use Text instead.');
    const payload=await response.json();
    if(payload.code && payload.code!==200)throw new Error('This site could not be imported. Use Text instead.');
    return readerArticle(payload,url);
  } catch(error) {
    if(error.name==='AbortError')throw new Error('The import timed out. Try again or use Text instead.');
    if(error instanceof TypeError)throw new Error('Cannot reach the article reader. Check your connection or use Text instead.');
    throw error;
  } finally {clearTimeout(timer);}
}
$('expand-article').addEventListener('click',async()=>{
  const article=current();if(!article?.url)return;
  const button=$('expand-article');button.disabled=true;button.textContent='Loading full article…';
  try {
    const fresh=await importLink(article.url);
    if(fresh.blocks.some(b=>/expand to continue reading/i.test(b.text)))throw new Error('The source still returned a preview. Open Original, expand it, then use Text to paste the article. Your notes were kept.');
    const latest=state.articles.find(a=>a.id===article.id);if(!latest)return;
    const upgraded=upgradeArticle(latest,fresh);state.articles=state.articles.map(a=>a.id===article.id?upgraded:a);changed();if(activeId===article.id)openArticle(article.id);toast('Full article loaded. Your highlights and comments were kept.');
  } catch(e){toast(e.message,10000);}
  finally{button.disabled=false;button.textContent='Load full article';}
});
async function importArticle(event) {
  event.preventDefault(); $('import-error').hidden=true; $('import-submit').disabled=true;
  $('import-submit').textContent='Importing…';
  const requestedMode=importMode;
  try {
    let data;
    if(requestedMode==='link') {
      const url=publicUrl($('article-url').value.trim());
      const existing=state.articles.find(a=>a.url===url);
      if(existing) { $('import-dialog').close(); activeGroup='all';renderGroups();openArticle(existing.id,true);toast('Already in your library.');return; }
      data=await importLink(url);
    } else {
      const text=$('paste-body').value.trim();
      if(text.length<10) throw new Error('Add a little more article text first.');
      data={title:$('paste-title').value.trim(),author:'',url:'',blocks:text.split(/\n\s*\n/).filter(Boolean).map((t,i)=>({id:'b'+i,type:'p',text:t.trim()}))};
    }
    const article={...data,id:uid(),createdAt:Date.now(),annotations:[],groupId:$('import-group').value};
    if(activeGroup!=='all' && (activeGroup==='ungrouped' ? !!article.groupId : activeGroup!==article.groupId))activeGroup=article.groupId || 'ungrouped';
    state.articles.unshift(article); changed(); openArticle(article.id,true); $('import-dialog').close();
    $('article-url').value=''; $('paste-title').value=''; $('paste-body').value='';
    toast('Article added.',2000);
  } catch(e) {
    $('import-error').textContent=e.message; $('import-error').hidden=false;
  } finally { $('import-submit').disabled=false; $('import-submit').textContent='Add article'; }
}

function markdown(articles) {
  return '# Reading notes\n\n'+articles.map(a=>`## ${a.title}\n\n${a.url || ''}\n\nAdded ${formatDate(a.createdAt,true)}\n\n`+a.annotations.map(n=>'> '+n.quote.replace(/\n/g,'\n> ')+'\n\n'+(n.comment||'_Highlight_')+'\n').join('\n')).join('\n');
}
function download(name,text,type) {
  const blob=new Blob([text],{type}), url=URL.createObjectURL(blob), link=document.createElement('a'); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function handleDB(action,value) {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('margin-folders',1); open.onupgradeneeded=()=>open.result.createObjectStore('handles'); open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,tx=db.transaction('handles',action==='get'?'readonly':'readwrite');const req=action==='get'?tx.objectStore('handles').get('desktop'):tx.objectStore('handles').put(value,'desktop');let result;req.onsuccess=()=>result=req.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
  });
}
let desktopWrite=Promise.resolve();
function writeDesktop(snapshot) {
  const handle=desktopHandle;
  desktopWrite=desktopWrite.catch(()=>{}).then(async()=>{
    for(const [name,content] of [['Margin.json',JSON.stringify(snapshot,null,2)],['Reading notes.md',markdown(snapshot.articles)]]) {
      const file=await handle.getFileHandle(name,{create:true}),writer=await file.createWritable(); await writer.write(content); await writer.close();
    }
    $('desktop-connect').textContent='Backing up to '+handle.name;
  });
  return desktopWrite;
}
async function connectDesktop() {
  if(nativeDesktop) return toast('Articles and comments autosave to '+dataDir,6500);
  if(!window.showDirectoryPicker) return toast('Use Chrome or Edge to connect a Desktop folder. You can also download a backup.',7000);
  try {
    const handle=await window.showDirectoryPicker({id:'margin-desktop',startIn:'desktop',mode:'readwrite'});
    const existing=await handle.getFileHandle('Margin.json').catch(()=>null);
    if(existing) {
      if(!state.articles.length && !state.groups.length) {
        if(!confirm('Load the Margin library from this folder and keep it backed up here?'))return;
        const data=JSON.parse(await (await existing.getFile()).text());
        if(!validNotebook(data))throw new Error('Invalid backup');
        const revision=state.revision;state=normalizeNotebook(data);state.revision=revision;activeGroup='all';changed();openArticle(state.articles[0]?.id || null);
      } else if(!confirm('This folder already contains Margin.json. Replace that backup with this library? To merge libraries, cancel and choose Restore backup first.'))return;
    }
    desktopHandle=handle; await writeDesktop(JSON.parse(JSON.stringify(state))); await handleDB('put',handle); toast('Automatic backup connected to '+handle.name+'.');
    navigator.storage?.persist?.().catch(()=>{});
  } catch(e) {if(e.name!=='AbortError') toast('Could not connect that folder. Please try a writable folder on your Desktop.');}
}
function restoreData(raw) {
    if(!validNotebook(raw))throw new Error('Choose a valid Margin.json backup.');
    const data=normalizeNotebook(raw),groupMapping=new Map();
    for(const group of data.groups) {
      const same=state.groups.find(g=>g.name.toLocaleLowerCase()===group.name.toLocaleLowerCase());
      if(same)groupMapping.set(group.id,same.id);
      else {const id=state.groups.some(g=>g.id===group.id)?uid():group.id;state.groups.push({...group,id});groupMapping.set(group.id,id);}
    }
    let added=0;
    for(const a of data.articles) {
      if(state.articles.some(x=>x.id===a.id)) { if(!confirm(`Replace “${a.title}” with the version in this backup?`)) continue; state.articles=state.articles.filter(x=>x.id!==a.id); }
      state.articles.unshift({...a,groupId:groupMapping.get(a.groupId)||''}); added++;
    }
    activeGroup='all';changed();openArticle(state.articles[0]?.id||null,true);toast(`${added} ${added===1?'article restored':'articles restored'}.`);
    navigator.storage?.persist?.().catch(()=>{});
}
async function restoreFile(event) {
  const file=event.target.files[0]; if(!file)return;
  try {restoreData(JSON.parse(await file.text()));}
  catch(e){toast(e.message);} finally {event.target.value='';}
}
$('paste-backup').addEventListener('click',()=>{$('restore-error').hidden=true;$('restore-dialog').showModal();$('backup-json').focus();});
$('close-restore').addEventListener('click',()=>$('restore-dialog').close());
$('restore-form').addEventListener('submit',event=>{
  event.preventDefault();
  try {restoreData(JSON.parse($('backup-json').value));$('backup-json').value='';$('restore-dialog').close();}
  catch(e){$('restore-error').hidden=false;$('restore-error').textContent=e instanceof SyntaxError?'Paste valid JSON from a Margin backup.':e.message;}
});

$('new-article').addEventListener('click',showImport); $('welcome-add').addEventListener('click',showImport);$('topbar-add').addEventListener('click',showImport);
$('toggle-library').addEventListener('click',()=>setSidebar(!document.body.classList.contains('sidebar-hidden')));
$('sidebar-scrim').addEventListener('click',()=>setSidebar(true));
$('new-group').addEventListener('click',()=>showGroup());$('close-group').addEventListener('click',()=>$('group-dialog').close());$('group-form').addEventListener('submit',saveGroup);
$('delete-group').addEventListener('click',()=>{
  if(!editingGroup)return;
  if(!confirm('Delete this group? Its articles will move to Ungrouped.'))return;
  state=removeGroup(state,editingGroup);if(activeGroup===editingGroup)activeGroup='all';
  changed();$('group-dialog').close();selectGroup(activeGroup);
});
$('article-group').addEventListener('change',()=>{
  const article=current();if(!article)return;article.groupId=$('article-group').value;
  if(activeGroup!=='all')activeGroup=article.groupId || 'ungrouped';
  setPref('margin-active-group',activeGroup);changed();toast('Group updated.',1600);
});
$('close-import').addEventListener('click',()=>$('import-dialog').close());
$('import-dialog').addEventListener('click',e=>{if(e.target===$('import-dialog')) {const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('tab-link').addEventListener('click',()=>setImportMode('link')); $('tab-text').addEventListener('click',()=>setImportMode('text'));
$('import-form').addEventListener('submit',importArticle); $('search').addEventListener('input',renderLibrary);
$('selection-toolbar').addEventListener('pointerdown',e=>e.preventDefault());
$('highlight-selection').addEventListener('click',()=>addAnnotation(false)); $('comment-selection').addEventListener('click',()=>addAnnotation(true));
document.addEventListener('pointerup',e=>{if(!$('selection-toolbar').contains(e.target))setTimeout(readSelection,10);});
document.addEventListener('keyup',e=>{if(e.shiftKey||['Shift','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))readSelection();});
document.addEventListener('pointerdown',e=>{if(!$('selection-toolbar').contains(e.target)&&!$('article-body').contains(e.target))hideSelection();});
$('reader-scroll').addEventListener('scroll',()=>{hideSelection(); if(activeId)try{localStorage.setItem('margin-scroll-'+activeId,$('reader-scroll').scrollTop);}catch{}},{passive:true});
window.addEventListener('resize',()=>{hideSelection();$('sidebar-scrim').hidden=document.body.classList.contains('sidebar-hidden') || window.innerWidth>650;});
$('toggle-notes').addEventListener('click',()=>setNotes(!$('reading-layout').classList.contains('notes-hidden')));
$('delete-article').addEventListener('click',()=>{const a=current(); if(a&&confirm(`Remove “${a.title}” and its ${a.annotations.length} highlights/comments?`)){state.articles=state.articles.filter(x=>x.id!==a.id);activeId=null;changed();openArticle(visibleArticles(state,activeGroup)[0]?.id||null);}});
$('download-backup').addEventListener('click',()=>download('Margin.json',JSON.stringify(state,null,2),'application/json'));
$('restore-backup').addEventListener('click',()=>$('restore-file').click()); $('restore-file').addEventListener('change',restoreFile);
$('welcome-restore').addEventListener('click',()=>$('restore-file').click());
$('export-notes').addEventListener('click',()=>{const a=current();if(a)download(a.title.replace(/[^a-zA-Z0-9 -]/g,'').slice(0,60)+' - notes.md',markdown([a]),'text/markdown');});
$('desktop-connect').addEventListener('click',connectDesktop);
$('unlock-form')?.addEventListener('submit',unlockCloud);
window.addEventListener('online',()=>{if(dirty){saveBlocked=false;save();}});
$('save-status').addEventListener('click',()=>{if(dirty)save();else toast(cloudMode?'Your articles, highlights, and comments are saved to your private cloud library.':nativeServer?'Autosaving to '+dataDir:'Articles and notes are saved in this browser. Connect a Desktop folder for an additional backup.',5000);});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();showImport();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key==='Escape')hideSelection();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&dirty)save();});
window.addEventListener('beforeunload',e=>{if(dirty){remember();e.preventDefault();e.returnValue='';}});

async function boot() {
  try {
    if(cloudMode){document.body.classList.add('cloud-locked');$('lock-screen').hidden=false;status('Locked');$('library-password').focus();return;}
    document.body.classList.remove('cloud-locked');$('lock-screen').hidden=true;
    if(['localhost','127.0.0.1'].includes(location.hostname)) {
      try {
        const response=await fetch('/api/state');
        if(response.ok && response.headers.get('content-type')?.includes('application/json')) {
          const data=await response.json();if(validNotebook(data.state)){state=normalizeNotebook(data.state);dataDir=data.dataDir;nativeDesktop=data.desktop;nativeServer=true;}
        }
      }catch{}
    }
    if(!nativeServer){const stored=await loadBrowser();if(!validNotebook(stored))throw new Error('Cannot read this library. Restore a backup to recover it.');state=normalizeNotebook(stored);}
    let pending; try{pending=JSON.parse(getPref(PENDING)||'null');}catch{}
    if(pending?.dirty&&validNotebook(pending.state)&&pending.editedAt>state.updatedAt) {
      if(pending.state.revision===state.revision || confirm('Margin found unsaved changes in this browser. Recover them?')) {
        const revision=state.revision; state=normalizeNotebook(pending.state); state.revision=revision; changed();toast('Recovered your unsaved work.');
      }
    }
    if(nativeDesktop)$('desktop-connect').textContent='Autosaving to Desktop';
    else try {const handle=await handleDB('get');if(handle && await handle.queryPermission({mode:'readwrite'})==='granted'){desktopHandle=handle;$('desktop-connect').textContent='Backing up to '+handle.name;}}catch{}
    $('storage-caption').textContent=nativeDesktop?'Saved to Desktop.':nativeServer?'Saved on this Mac.':'Saved in this browser.';
    $('import-provider').hidden=nativeServer;
    if(!dirty)status(nativeDesktop?'Saved to Desktop':nativeServer?'Saved on this Mac':'Saved in this browser');
    const group=getPref('margin-active-group');activeGroup=group==='ungrouped' || state.groups.some(g=>g.id===group)?group:'all';
    renderGroups();
    const last=getPref('margin-active'),articles=visibleArticles(state,activeGroup);
    openArticle(articles.find(a=>a.id===last)?.id||articles[0]?.id||null);
  }catch(e){status('Storage unavailable',true);toast(e.message,10000);}
}
setSidebar(window.innerWidth<=650 || getPref('margin-sidebar-hidden')==='1',false);
setNotes(window.innerWidth<=900 || getPref('margin-notes-hidden')==='1',false);
boot();

})();
