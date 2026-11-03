// Portable scene recipe: IDs refer to library assets, coordinates never contain SVG.
type SceneInstance = { instanceId:string; assetId:string; x:number; y:number; rotation:number; layer:number; on:string|null; state?:'main'|'background' };
const SCENE_RELATION_TARGETS={leftOf:1,rightOf:1,above:1,below:1,between:2,near:1,alignedX:1,alignedY:1,inFrontOf:1,behind:1,tiltedToward:1,farFrom:1,centeredBetween:2,diagonalTo:1,sameRotation:1,oppositeRotation:1,alignedLeft:1,alignedRight:1,alignedTop:1,alignedBottom:1,centeredX:0,centeredY:0,centered:0,equalDistance:2} as const;
type SceneRelation = {type:keyof typeof SCENE_RELATION_TARGETS;subject:string;targets:string[]};
type SemanticPlan = { status:'ok'|'unsupported'; items:SceneInstance[]; explanation:string; relations?:SceneRelation[] };

function validateSemanticPlan(value:unknown):SemanticPlan {
  const fail=(field:string,reason:string)=>new Error(`План ИИ: ${field} — ${reason}.`);
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail('ответ','ожидается JSON-объект');
  const p=value as Record<string,unknown>;
  if(!['explanation,items,status','explanation,items,relations,status'].includes(Object.keys(p).sort().join(',')))throw fail('поля ответа','нужны только status, items, relations, explanation');
  if(p.status!=='ok'&&p.status!=='unsupported')throw fail('status','допустимы ok или unsupported');
  if(typeof p.explanation!=='string'||!p.explanation.trim()||p.explanation.length>600)throw fail('explanation','нужен текст длиной 1–600 символов');
  if(!Array.isArray(p.items))throw fail('items','нужен массив экземпляров');
  if(p.relations!==undefined&&(!Array.isArray(p.relations)||p.relations.length>24))throw fail('relations','нужен массив до 24 правил');
  if(p.status==='unsupported'){if(p.items.length||(Array.isArray(p.relations)&&p.relations.length))throw fail('unsupported','при отказе items и relations должны быть пустыми');return {status:p.status,items:[],relations:[],explanation:p.explanation.trim()};}
  if(!p.items.length||p.items.length>8)throw new Error('В плане должно быть от 1 до 8 экземпляров.');
  const items:SceneInstance[]=p.items.map((value,index)=>{
    const field='items['+index+']';
    if(!value||typeof value!=='object'||Array.isArray(value))throw fail(field,'нужен объект экземпляра');
    const i=value as Record<string,unknown>;
    if(!['assetId,instanceId,layer,on,rotation,x,y','assetId,instanceId,layer,on,rotation,state,x,y'].includes(Object.keys(i).sort().join(',')))throw fail(field,'нужны instanceId, assetId, x, y, rotation, layer, on; state необязателен');
    if(typeof i.instanceId!=='string'||!/^i[1-8]$/.test(i.instanceId))throw fail(field+'.instanceId','нужен уникальный ID i1…i8');
    if(typeof i.assetId!=='string'||!SEMANTIC_CATALOG.some(a=>a.id===i.assetId))throw fail(field+'.assetId','неизвестный компонент библиотеки');
    for(const coordinate of ['x','y'] as const)if(typeof i[coordinate]!=='number'||!Number.isFinite(i[coordinate])||(i[coordinate] as number)<.05||(i[coordinate] as number)>.95)throw fail(field+'.'+coordinate,'нужно число от 0.05 до 0.95, не пиксели и не проценты');
    if(typeof i.rotation!=='number'||!Number.isFinite(i.rotation)||Math.abs(i.rotation)>180)throw fail(field+'.rotation','нужен угол от −180 до 180');
    if(typeof i.layer!=='number'||!Number.isInteger(i.layer)||i.layer<0||i.layer>7)throw fail(field+'.layer','нужно целое число от 0 до 7');
    if(i.on!==null&&typeof i.on!=='string')throw fail(field+'.on','нужны null либо ID опоры');
    if(i.state!==undefined&&i.state!=='main'&&i.state!=='background')throw fail(field+'.state','допустимы main или background');
    return {instanceId:i.instanceId,assetId:i.assetId,x:i.x as number,y:i.y as number,rotation:i.rotation,layer:i.layer,on:i.on as string|null,...(i.state?{state:i.state as 'main'|'background'}:{})};
  });
  if(new Set(items.map(i=>i.instanceId)).size!==items.length||new Set(items.map(i=>i.layer)).size!==items.length)throw new Error('ID экземпляров и номера слоёв должны быть уникальны.');
  for(const item of items){
    if(item.on!==null){
      const parent=items.find(p=>p.instanceId===item.on);
      if(!parent||parent.layer>=item.layer||!['book','folder'].includes(parent.assetId))throw new Error('Недопустимая опора: разрешены книга и папка на более низком слое.');
      if(parent.on!==null)throw new Error('Вложенные стопки пока не поддерживаются: предмет кладётся непосредственно на книгу или папку.');
    }
  }
  const relations:SceneRelation[]=((p.relations||[]) as unknown[]).map((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw fail('relations','каждое правило должно быть объектом');
    const r=value as Record<string,unknown>;
    const field='relations['+index+']';
    if(Object.keys(r).sort().join(',')!=='subject,targets,type')throw fail(field,'нужны ровно type, subject, targets');
    if(typeof r.type!=='string'||!Object.prototype.hasOwnProperty.call(SCENE_RELATION_TARGETS,r.type)){
      const label=typeof r.type==='string'&&/^[a-zA-Z_ -]{1,40}$/.test(r.type)?' «'+r.type+'»':'';
      throw fail(field+'.type','неизвестное правило'+label+'; разрешены '+Object.keys(SCENE_RELATION_TARGETS).join(', ')+'. Для на опоре используй on у экземпляра');
    }
    if(typeof r.subject!=='string'||!items.some(i=>i.instanceId===r.subject))throw fail(field+'.subject','нужен существующий instanceId, не assetId');
    const count=SCENE_RELATION_TARGETS[r.type as SceneRelation['type']];
    if(!Array.isArray(r.targets)||r.targets.length!==count)throw fail(field+'.targets','ожидается массив ID длиной '+count);
    if(r.targets.some(t=>typeof t!=='string'||t===r.subject||!items.some(i=>i.instanceId===t))||new Set(r.targets).size!==r.targets.length)throw fail(field+'.targets','нужны другие существующие instanceId без повторов');
    return {type:r.type as SceneRelation['type'],subject:r.subject,targets:r.targets as string[]};
  });
  return {status:'ok',items,relations,explanation:p.explanation.trim()};
}

