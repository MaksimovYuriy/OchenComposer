class SemanticResponseError extends Error {}
function normalizeSemanticRelations(p:Record<string,unknown>):void {
  if(!Array.isArray(p.relations))return;
  const aliases:Record<string,string>={leftof:'leftOf',rightof:'rightOf',above:'above',below:'below',between:'between',near:'near',nextto:'near',beside:'near',adjacentto:'near',alignedx:'alignedX',alignedy:'alignedY',infrontof:'inFrontOf',behind:'behind',tiltedtoward:'tiltedToward',on:'on',ontopof:'on'};
  for(const type of Object.keys(SCENE_RELATION_TARGETS))aliases[type.toLowerCase()]=type;
  Object.assign(aliases,{left:'leftOf',right:'rightOf',closeto:'near',adjacent:'near',far:'farFrom',distantfrom:'farFrom',middleof:'centeredBetween',midpointof:'centeredBetween',diagonal:'diagonalTo',alignleft:'alignedLeft',alignright:'alignedRight',aligntop:'alignedTop',alignbottom:'alignedBottom',centerx:'centeredX',centery:'centeredY',center:'centered',centre:'centered',equidistant:'equalDistance',horizontalalignment:'alignedY',verticalalignment:'alignedX'});
  p.relations=p.relations.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return value;
    const r={...value} as Record<string,unknown>;
    if(typeof r.type==='string'){
      const key=r.type.trim().replace(/[_\s-]/g,'').toLowerCase();
      if(Object.prototype.hasOwnProperty.call(aliases,key))r.type=aliases[key];
    }
    if(r.subject===undefined&&typeof r.from==='string'){r.subject=r.from;delete r.from;}
    if(r.targets===undefined&&r.target!==undefined){r.targets=r.target;delete r.target;}
    if(r.targets===undefined&&r.to!==undefined){r.targets=r.to;delete r.to;}
    if(typeof r.targets==='string')r.targets=[r.targets];
    return r;
  }).filter(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return true;
    const r=value as Record<string,unknown>;
    // Only remove a redundant assertion already enforced by the attachment executor.
    if(r.type!=='on'||Object.keys(r).sort().join(',')!=='subject,targets,type'||!Array.isArray(r.targets)||r.targets.length!==1||!Array.isArray(p.items))return true;
    const target=r.targets[0];
    return !p.items.some(item=>item&&typeof item==='object'&&!Array.isArray(item)&&item.instanceId===r.subject&&typeof item.on==='string'&&item.on===target);
  });
}
async function requestSemanticPlan(request:Record<string,unknown>):Promise<{plan:SemanticPlan;model:string}> {
  const result=await semanticApi('chat/completions',request) as {choices?:{finish_reason?:string;message?:{content?:unknown}}[];model?:unknown};
  try{
  const choice=result?.choices?.[0],content=choice?.message?.content;
  if(choice?.finish_reason!=='stop'||typeof content!=='string'||content.length>8000)throw new Error('Модель не вернула законченный план. Попробуйте другую бесплатную модель или формулировку.');
  let parsed:unknown;try{parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1'));}catch{throw new Error('Модель вернула ответ вне JSON-схемы. Попробуйте ещё раз.');}
  // Normalize representation only; never infer missing objects or spatial intent.
  if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
    const p=parsed as Record<string,unknown>;
    if(p.version===SEMANTIC_VERSION)delete p.version;
    normalizeSemanticRelations(p);
    if(Array.isArray(p.items))for(const item of p.items)if(item&&typeof item==='object'&&!Array.isArray(item)){
      const record=item as Record<string,unknown>;
      for(const key of ['x','y','rotation','layer'])if(typeof record[key]==='string'&&/^-?(?:\d+\.?\d*|\.\d+)$/.test(record[key] as string))record[key]=Number(record[key]);
    }
  }
  const plan=validateSemanticPlan(parsed);
  if(!Array.isArray((parsed as Record<string,unknown>).relations))throw new Error('Модель не вернула список пространственных правил scene-v3. Попробуйте новый вариант.');
  return {plan,model:typeof result.model==='string'?result.model.slice(0,160):semanticModel};
  }catch(error){throw new SemanticResponseError(error instanceof Error?error.message:'Некорректный ответ модели.');}
}
