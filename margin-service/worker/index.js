// Server-side password checks and conditional writes protect the private notebook.
const ALLOWED_ORIGINS = new Set(['https://lucasgravina.com','https://www.lucasgravina.com']);
const KEY = 'library/current.json';
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
function same(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0; }
function validNotebook(state) {
  if(!state || !Array.isArray(state.articles) || !Array.isArray(state.groups || []))return false;
  const ids=new Set();
  return state.articles.every(a=>{
    if(!a || typeof a.id!=='string'||ids.has(a.id)||typeof a.title!=='string'||!Array.isArray(a.blocks)||!Array.isArray(a.annotations))return false;
    ids.add(a.id);const blocks=new Map(a.blocks.map(b=>[b?.id,b]));
    return a.blocks.every(b=>b&&typeof b.id==='string'&&typeof b.text==='string')&&a.annotations.every(n=>n&&typeof n.id==='string'&&typeof n.comment==='string'&&typeof n.quote==='string'&&Array.isArray(n.spans)&&n.spans.every(s=>blocks.has(s.blockId)&&Number.isInteger(s.start)&&Number.isInteger(s.end)&&s.start>=0&&s.end>s.start&&s.end<=blocks.get(s.blockId).text.length));
  });
}
function response(request,status,data) {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
  if(ALLOWED_ORIGINS.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'});
  return new Response(status===204?null:JSON.stringify(data),{status,headers});
}
async function authenticate(request,env) {
  const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  const key='auth/'+await digest(ip),now=Date.now();
  const attemptObject=await env.BUCKET.get(key);
  const attempt=attemptObject?await attemptObject.json():null;
  if(attempt?.until>now && attempt.count>=20)return 429;
  const header=request.headers.get('Authorization') || '';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(token.length>=32 && token.length<300 && same(await digest(token),env.AUTH_VERIFIER))return 200;
  const next=attempt?.until>now?{...attempt,count:attempt.count+1}:{count:1,until:now+15*60*1000};
  await env.BUCKET.put(key,JSON.stringify(next));
  return 401;
}
export async function handle(request,env) {
  try {
    const path=new URL(request.url).pathname,origin=request.headers.get('Origin');
    if(origin && !ALLOWED_ORIGINS.has(origin))return response(request,403,{error:'Origin not allowed.'});
    if(request.method==='OPTIONS')return response(request,204,null);
    if(path==='/health')return response(request,200,{ok:true,service:'Margin'});
    if(!env.AUTH_SALT || !env.AUTH_VERIFIER || !env.BUCKET)return response(request,503,{error:'Cloud storage is not configured.'});
    if(path==='/v1/config' && request.method==='GET')return response(request,200,{salt:env.AUTH_SALT,iterations:310000});
    const auth=await authenticate(request,env);
    if(auth!==200)return response(request,auth,{error:auth===429?'Too many password attempts. Try again in 15 minutes.':'Incorrect password.'});
    if(path!=='/v1/notebook')return response(request,404,{error:'Not found.'});
    const existing=await env.BUCKET.get(KEY);
    const old=existing?await existing.json():{articles:[],groups:[],revision:0,updatedAt:0};
    if(request.method==='GET')return response(request,200,{state:old});
    if(request.method!=='POST')return response(request,405,{error:'Method not allowed.'});
    if(Number(request.headers.get('Content-Length') || 0)>20*1024*1024)return response(request,413,{error:'Notebook is too large.'});
    const raw=await request.text();
    if(enc.encode(raw).byteLength>20*1024*1024)return response(request,413,{error:'Notebook is too large.'});
    let payload;try{payload=JSON.parse(raw);}catch{return response(request,400,{error:'Invalid JSON.'});}
    if(!validNotebook(payload.state)||!Number.isInteger(payload.revision))return response(request,400,{error:'Invalid notebook.'});
    if(payload.revision!==old.revision)return response(request,409,{error:'The cloud library has newer changes.',state:old});
    const next={...payload.state,groups:payload.state.groups || [],revision:old.revision+1,updatedAt:Date.now()};
    // Preserve the prior complete revision before changing the current pointer.
    if(existing)await env.BUCKET.put('library/history/'+existing.etag+'.json',JSON.stringify(old));
    const written=await env.BUCKET.put(KEY,JSON.stringify(next),{onlyIf:existing?{etagMatches:existing.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(!written)return response(request,409,{error:'The cloud library changed while saving. Retry with the latest revision.'});
    return response(request,200,{revision:next.revision,updatedAt:next.updatedAt});
  }catch{return response(request,500,{error:'Cloud storage is temporarily unavailable. Your browser recovery copy is retained.'});}
}
export default {fetch:handle};
