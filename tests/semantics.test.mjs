import {readSource} from '../scripts/sources.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
const code=ts.transpile('const AI_COMPOSITION_GUIDE='+JSON.stringify(readFileSync('catalog/ai-composition-rules.json','utf8'))+';\n'+['composition','scene','ai'].map(p=>readSource(p)).join('\n'),{target:ts.ScriptTarget.ES2020});
const item={instanceId:'i1',assetId:'book',x:.5,y:.5,rotation:0,layer:0,on:null};
const plan={status:'ok',items:[item],relations:[],explanation:'Знания помогают находить решения.'};
function session(options={}){
 const messages=[],calls=[],storage=new Map();let timeout;
 const figma={ui:{postMessage:m=>messages.push(m)},clientStorage:{async getAsync(k){return storage.get(k)},async setAsync(k,v){if(options.storageFailure)throw new Error('sensitive-storage-error');storage.set(k,v)},async deleteAsync(k){if(options.storageFailure)throw new Error('sensitive-storage-error');storage.delete(k)}}};
 const context=vm.createContext({figma,setTimeout:callback=>{timeout=callback;return 1},clearTimeout:()=>{timeout=undefined},fetch:async(url,request)=>{calls.push({url,request});if(options.hang)return new Promise(()=>{});if(options.networkFailure)throw new Error('secret error');return {ok:!options.status,status:options.status||200,text:async()=>options.raw??JSON.stringify(options.responses?.[calls.length-1]??options.response??{choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],model:'test/free:free'})}}});
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
 assert.ok(body.messages[0].content.includes('tiltedToward'));assert.ok(body.messages[0].content.includes('between'));assert.ok(body.messages[0].content.includes('scene-v3'));
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

test('Response representation normalization preserves intent and reports the exact invalid field',async()=>{
 const response=content=>({choices:[{finish_reason:'stop',message:{content}}]});
 const draft={...plan,version:'scene-v3',items:[{...item,x:'0.5',y:'0.5',layer:'0',rotation:'15'}]};
 const s=session({response:response('```json\n'+JSON.stringify(draft)+'\n```')});await s.configure();
 const result=await s.context.interpretMetaphor('test');assert.equal(result.plan.items[0].rotation,15);assert.equal(result.plan.items[0].x,.5);
 for(const [field,value] of [['x',50],['rotation',270],['layer',8],['state','purple'],['assetId','unknown']]){
  const bad=session({response:response(JSON.stringify({...plan,items:[{...item,[field]:value}]}))});await bad.configure();
  await assert.rejects(bad.context.interpretMetaphor('test'),error=>error.message.includes('items[0].'+field));
 }
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

test('Invalid plan gets one correction request; network failures and explicit refusals do not retry',async()=>{
 const envelope=value=>({model:'test:free',choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
 const bad={...plan,relations:[{type:'near',subject:'book',targets:['i1']}]};
 const s=session({responses:[envelope(bad),envelope(plan)]});await s.configure();
 assert.equal((await s.context.interpretMetaphor('Метафора')).plan.status,'ok');assert.equal(s.calls.length,2);
 const body=JSON.parse(s.calls[1].request.body);assert.equal(body.messages[1].content,'Метафора');assert.ok(body.messages[2].content.includes('relations[0].subject'));
 assert.ok(s.messages.some(m=>m.type==='ai-progress'));assert.ok(!body.messages[2].content.includes('test-secret-key'));
 const repeated=session({response:envelope(bad)});await repeated.configure();await assert.rejects(repeated.context.interpretMetaphor('test'));assert.equal(repeated.calls.length,2);
 const network=session({status:429});await network.configure();await assert.rejects(network.context.interpretMetaphor('test'));assert.equal(network.calls.length,1);
 const refusal=session({response:envelope({status:'unsupported',items:[],relations:[],explanation:'Нет разумного решения.'})});await refusal.configure();assert.equal((await refusal.context.interpretMetaphor('test')).plan.status,'unsupported');assert.equal(refusal.calls.length,1);
});

test('Geometric verification participates in the same bounded repair loop',async()=>{
 const s=session();await s.configure();let attempts=0;
 const result=await s.context.interpretMetaphor('test',undefined,()=>{if(++attempts===1)throw vm.runInContext("new Error('Предмет не помещается на опоре.')",s.context);});
 assert.equal(result.plan.status,'ok');assert.equal(attempts,2);assert.equal(s.calls.length,2);
 assert.ok(JSON.parse(s.calls[1].request.body).messages[2].content.includes('на опоре'));
});

test('Relation aliases normalize without losing attachments or silently discarding unknown constraints',async()=>{
 const items=[{...item,x:.2},{...item,instanceId:'i2',x:.5,layer:1},{...item,instanceId:'i3',assetId:'phone',on:'i1',x:.5,y:.4,layer:2},{...item,instanceId:'i4',assetId:'lamp',x:.8,layer:3}];
 const envelope=relations=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...plan,items,relations})}}]});
 const s=session({response:envelope([{type:'on',subject:'i3',target:'i1'},{type:'next_to',from:'i2',to:'i4'}])});await s.configure();
 const result=await s.context.interpretMetaphor('2 книги, на первой телефон, вторая рядом с лампой');
 assert.equal(s.calls.length,1);assert.equal(result.plan.items.length,4);assert.equal(result.plan.items[2].on,'i1');assert.equal(result.plan.relations.length,1);assert.equal(result.plan.relations[0].type,'near');assert.equal(result.plan.relations[0].subject,'i2');assert.equal(result.plan.relations[0].targets[0],'i4');
 for(const relation of [{type:'mirror',subject:'i1',targets:['i2']},{type:'on',subject:'i3',targets:['i2']},{type:'near',subject:'i2',targets:['i4'],extra:true}]){
  const bad=session({response:envelope([relation])});await bad.configure();await assert.rejects(bad.context.interpretMetaphor('test'));assert.equal(bad.calls.length,2);
 }
});

test('Expanded rule registry and aliases are available to the model and response adapter',()=>{
 const s=session();
 for(const [alias,canonical,targets] of [['center_x','centeredX',[]],['align_left','alignedLeft',['i2']],['same_rotation','sameRotation',['i2']],['midpoint_of','centeredBetween',['i2','i3']],['equidistant','equalDistance',['i2','i3']]]){
  const payload={items:[],relations:[{type:alias,subject:'i1',targets}]};s.context.normalizeSemanticRelations(payload);assert.equal(payload.relations[0].type,canonical);
 }
 const body=s.context.semanticRequest('test','openrouter/free');
 for(const name of ['centeredX','alignedLeft','oppositeRotation','equalDistance','farFrom'])assert.ok(body.messages[0].content.includes(name));
 assert.ok(body.messages[0].content.includes('1–5'));
});
