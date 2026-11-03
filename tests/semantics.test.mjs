import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=ts.transpile(['core.ts','scene-plan.ts','semantics.ts'].map(p=>readFileSync(p,'utf8')).join('\n'),{target:ts.ScriptTarget.ES2020});
const item={instanceId:'i1',assetId:'book',x:.5,y:.5,rotation:0,layer:0,on:null};
const plan={status:'ok',items:[item],explanation:'Знания помогают находить решения.'};
function session(options={}){
 const messages=[],calls=[],storage=new Map();let timeout;
 const figma={ui:{postMessage:m=>messages.push(m)},clientStorage:{async getAsync(k){return storage.get(k)},async setAsync(k,v){if(options.storageFailure)throw new Error('sensitive-storage-error');storage.set(k,v)},async deleteAsync(k){if(options.storageFailure)throw new Error('sensitive-storage-error');storage.delete(k)}}};
 const context=vm.createContext({figma,setTimeout:callback=>{timeout=callback;return 1},clearTimeout:()=>{timeout=undefined},fetch:async(url,request)=>{calls.push({url,request});if(options.hang)return new Promise(()=>{});if(options.networkFailure)throw new Error('secret error');return {ok:!options.status,status:options.status||200,text:async()=>options.raw??JSON.stringify(options.response??{choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],model:'test/free:free'})}}});
 vm.runInContext(code,context);
 return {context,messages,calls,storage,expire:()=>timeout?.(),configure:(remember=false)=>context.configureSemanticSettings({key:'test-secret-key',model:'openrouter/free',remember})};
}
test('Semantic contract rejects unknown, duplicate, excessive, malformed and executable plans',()=>{
 const {context:c}=session();assert.equal(c.validateSemanticPlan(plan).items[0].assetId,'book');
 for(const value of [null,[],{...plan,items:[{...item,assetId:'dragon'}]},{...plan,items:[item,item]},{...plan,items:Array(9).fill(item)},{...plan,svg:'<svg/>'},{...plan,status:'maybe'},{...plan,explanation:''},{...plan,status:'unsupported'},{...plan,items:[{...item,x:2}]},{...plan,items:[{...item,on:'i1'}]}])assert.throws(()=>c.validateSemanticPlan(value));
 assert.equal(c.validateSemanticPlan({status:'unsupported',items:[],explanation:'Нет подходящего объекта.'}).status,'unsupported');
});
test('Outbound request contains only literal phrase and curated text catalog; no SVG or document',async()=>{
 const s=session();await s.configure();await s.context.interpretMetaphor('Знания открывают возможности');
 assert.equal(s.calls.length,1);const {url,request}=s.calls[0],body=JSON.parse(request.body);
 assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');assert.equal(request.headers.Authorization,'Bearer test-secret-key');
 assert.equal(body.messages[1].content,'Знания открывают возможности');assert.equal(body.messages.length,2);
 assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','model','provider','response_format','temperature']);
 assert.ok(!request.body.includes('test-secret-key'));assert.ok(!/<svg|<path|data:image|image_url|pluginData/.test(request.body));
 assert.ok(!JSON.stringify(s.messages).includes('test-secret-key'));
 for(const model of ['paid/model','openrouter/auto','https://evil.test','x/y:free/../../'])assert.throws(()=>s.context.semanticRequest('test',model));
});
test('Session and persisted keys are explicit, removable and never echoed to UI',async()=>{
 const s=session();await s.configure();assert.equal(s.storage.size,0);
 await s.configure(true);assert.equal(s.storage.size,1);await s.configure(false);assert.equal(s.storage.size,0);
 await s.configure(true);await s.context.deleteSemanticSettings();assert.equal(s.storage.size,0);assert.equal(s.messages.at(-1).hasKey,false);
 assert.ok(!JSON.stringify(s.messages).includes('test-secret-key'));await assert.rejects(s.context.interpretMetaphor('test'),/ключ/);
 const broken=session({storageFailure:true});await assert.rejects(broken.configure(true),/хранилище/);assert.ok(!JSON.stringify(broken.messages).includes('secret'));
});
test('HTTP, malformed outputs and timeout fail without secret or provider-body disclosure',async()=>{
 for(const status of [401,402,403,404,429,500]){
  const s=session({status,raw:'test-secret-key'});await s.configure();await assert.rejects(s.context.interpretMetaphor('test'),e=>!e.message.includes('test-secret-key'));
 }
 for(const options of [{networkFailure:true},{raw:'<html>secret</html>'},{response:{choices:[]}},{response:{choices:[{finish_reason:'length',message:{content:'{}'}}]}},{response:{choices:[{finish_reason:'stop',message:{content:'```json\n{}\n```'}}]}}]){
  const s=session(options);await s.configure();await assert.rejects(s.context.interpretMetaphor('test'));
 }
 const slow=session({hang:true});await slow.configure();const pending=slow.context.interpretMetaphor('test');slow.expire();await assert.rejects(pending,/ожидания/);
});
