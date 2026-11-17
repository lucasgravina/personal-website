const {test}=require('node:test');
const assert=require('node:assert/strict');
const {normalizeNotebook,validNotebook,visibleArticles,removeGroup,publicUrl,readerArticle,formatDate}=require('../core.js');
const article=(id,createdAt,groupId='')=>({id,title:id,createdAt,groupId,url:'',blocks:[{id:'b0',type:'p',text:'A passage to read and annotate.'}],annotations:[]});

test('older desktop backups retain comments, dates, and highlight offsets',()=>{
  const old={articles:[{...article('old',1234),annotations:[{id:'note',quote:'passage',comment:'Keep this',spans:[{blockId:'b0',start:2,end:9}]}]}],revision:5};
  assert.equal(validNotebook(old),true);
  const state=normalizeNotebook(old);
  assert.deepEqual(state.groups,[]);assert.equal(state.articles[0].createdAt,1234);assert.equal(state.articles[0].annotations[0].spans[0].start,2);
});
test('groups filter articles and search notes, newest first',()=>{
  const state=normalizeNotebook({groups:[{id:'research',name:'Research'}],articles:[article('one',10,'research'),article('two',30),article('three',20,'research')]});
  state.articles[0].annotations.push({comment:'Unique observation'});
  assert.deepEqual(visibleArticles(state,'research').map(a=>a.id),['three','one']);
  assert.deepEqual(visibleArticles(state,'ungrouped').map(a=>a.id),['two']);
  assert.deepEqual(visibleArticles(state,'research','observation').map(a=>a.id),['one']);
  assert.deepEqual(visibleArticles(state,'all').map(a=>a.id),['two','three','one']);
});
test('deleting a group retains all article content and dates',()=>{
  const state=normalizeNotebook({groups:[{id:'r',name:'Research'}],articles:[article('one',10,'r'),article('two',20)]});
  const next=removeGroup(state,'r');
  assert.equal(next.groups.length,0);assert.equal(next.articles.length,2);assert.equal(next.articles[0].groupId,'');
  assert.deepEqual(next.articles[0].blocks,state.articles[0].blocks);assert.equal(next.articles[0].createdAt,10);
});
test('backup validation rejects broken spans, duplicate article ids, and unsafe links',()=>{
  assert.equal(validNotebook({articles:[article('same',1),article('same',2)]}),false);
  assert.equal(validNotebook({articles:[{...article('a',1),url:'javascript:alert(1)'}]}),false);
  const a=article('a',1);a.annotations=[{id:'n',quote:'x',comment:'x',spans:[{blockId:'missing',start:0,end:2}]}];
  assert.equal(validNotebook({articles:[a]}),false);
});
test('public URL import rejects credentials, private networks, and other protocols',()=>{
  for(const url of ['file:///tmp/article','http://localhost/a','http://127.0.0.1/a','http://192.168.1.1/','http://172.20.0.1/','https://user:password@example.com/'])assert.throws(()=>publicUrl(url));
  assert.equal(publicUrl('https://example.com/article#section'),'https://example.com/article');
});
test('Reader JSON becomes ordered text blocks without executing markup',()=>{
  const result=readerArticle({data:{title:'Article',content:'# Article\n\nFirst **paragraph** with a [link](https://example.com).\n\n## Next section\n\n- A useful point\n- Another point\n\n> A quotation worth saving.\n\n```js\nconsole.log("code");\n```'}},'https://example.com');
  assert.deepEqual(result.blocks.map(b=>b.type),['p','h2','li','li','blockquote','pre']);
  assert.equal(result.blocks[0].text,'First paragraph with a link.');
  assert.equal(new Set(result.blocks.map(b=>b.id)).size,result.blocks.length);
});
test('missing article content produces a useful import failure',()=>{
  assert.throws(()=>readerArticle({data:{title:'Blocked',content:''}},'https://example.com'),/readable article text/);
  assert.throws(()=>readerArticle({code:500},'https://example.com'),/could not be imported/);
});
test('missing legacy dates are not silently replaced with today',()=>{
  assert.equal(formatDate(undefined),'Date unavailable');
  assert.equal(formatDate(0),'Date unavailable');
});
