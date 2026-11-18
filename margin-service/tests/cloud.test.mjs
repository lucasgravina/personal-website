import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handle} from '../worker/index.js';
class Bucket {
  data=new Map();version=0;
  async get(key){const value=this.data.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.body)}:null;}
  async put(key,body,options={}){const old=this.data.get(key);if(options.onlyIf?.etagMatches && old?.etag!==options.onlyIf.etagMatches)return null;if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const value={etag:String(++this.version),body};this.data.set(key,value);return value;}
}
const token='test-token-which-is-at-least-thirty-two-characters';
const verifier=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
const env=()=>({BUCKET:new Bucket(),AUTH_SALT:'test-salt',AUTH_VERIFIER:verifier});
const req=(path,body,auth=token,origin='https://lucasgravina.com')=>new Request('https://cloud.example'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(auth?{Authorization:'Bearer '+auth}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const article={id:'article',title:'Private article',blocks:[{id:'b0',text:'A private passage.'}],annotations:[{id:'n',quote:'private',comment:'My comment',spans:[{blockId:'b0',start:2,end:9}]}]};
test('missing and wrong passwords cannot read or write the notebook',async()=>{const e=env();assert.equal((await handle(req('/v1/notebook',null,''),e)).status,401);assert.equal((await handle(req('/v1/notebook',{state:{articles:[]},revision:0},'incorrect-token'),e)).status,401);assert.equal(e.BUCKET.data.has('library/current.json'),false);});
test('authenticated saves are durable and stale saves cannot overwrite them',async()=>{const e=env();const first=await handle(req('/v1/notebook',{state:{articles:[article],groups:[]},revision:0}),e);assert.equal(first.status,200);assert.equal((await first.json()).revision,1);const stale=await handle(req('/v1/notebook',{state:{articles:[]},revision:0}),e);assert.equal(stale.status,409);const loaded=await (await handle(req('/v1/notebook'),e)).json();assert.equal(loaded.state.articles[0].annotations[0].comment,'My comment');assert.equal(loaded.state.revision,1);});
test('prior revisions are retained before a successful update',async()=>{const e=env();await handle(req('/v1/notebook',{state:{articles:[article]},revision:0}),e);await handle(req('/v1/notebook',{state:{articles:[]},revision:1}),e);const backup=[...e.BUCKET.data.entries()].find(([key])=>key.startsWith('library/history/'));assert.equal(JSON.parse(backup[1].body).articles[0].annotations[0].comment,'My comment');});
test('unknown origins and malformed highlight ranges are rejected',async()=>{const e=env();assert.equal((await handle(req('/v1/notebook',null,token,'https://other.example'),e)).status,403);const bad={...article,annotations:[{...article.annotations[0],spans:[{blockId:'b0',start:0,end:999}]}]};assert.equal((await handle(req('/v1/notebook',{state:{articles:[bad]},revision:0}),e)).status,400);});
test('conditional object writes also reject a race after the revision check',async()=>{const e=env();const original=e.BUCKET.put.bind(e.BUCKET);e.BUCKET.put=async(key,body,options)=>key==='library/current.json'?null:original(key,body,options);assert.equal((await handle(req('/v1/notebook',{state:{articles:[article]},revision:0}),e)).status,409);});
test('repeated incorrect passwords are rate limited',async()=>{const e=env();for(let i=0;i<20;i++)assert.equal((await handle(req('/v1/notebook',null,'incorrect-token'),e)).status,401);assert.equal((await handle(req('/v1/notebook',null,'incorrect-token'),e)).status,429);});
