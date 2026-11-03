// Portable scene recipe: IDs refer to library assets, coordinates never contain SVG.
type SceneInstance = { instanceId:string; assetId:string; x:number; y:number; rotation:number; layer:number; on:string|null };
type SemanticPlan = { status:'ok'|'unsupported'; items:SceneInstance[]; explanation:string };

function validateSemanticPlan(value:unknown):SemanticPlan {
  const fail=()=>new Error('ИИ вернул некорректный план композиции.');
  if(!value||typeof value!=='object'||Array.isArray(value))throw fail();
  const p=value as Record<string,unknown>;
  if(Object.keys(p).sort().join(',')!=='explanation,items,status'||(p.status!=='ok'&&p.status!=='unsupported')||typeof p.explanation!=='string'||!p.explanation.trim()||p.explanation.length>600||!Array.isArray(p.items))throw fail();
  if(p.status==='unsupported'){if(p.items.length)throw fail();return {status:p.status,items:[],explanation:p.explanation.trim()};}
  if(!p.items.length||p.items.length>8)throw new Error('В плане должно быть от 1 до 8 экземпляров.');
  const items:SceneInstance[]=p.items.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw fail();
    const i=value as Record<string,unknown>;
    if(Object.keys(i).sort().join(',')!=='assetId,instanceId,layer,on,rotation,x,y'||typeof i.instanceId!=='string'||!/^i[1-8]$/.test(i.instanceId)||typeof i.assetId!=='string'||!SEMANTIC_CATALOG.some(a=>a.id===i.assetId))throw fail();
    if(typeof i.x!=='number'||typeof i.y!=='number'||!Number.isFinite(i.x)||!Number.isFinite(i.y)||i.x<.05||i.x>.95||i.y<.05||i.y>.95||typeof i.rotation!=='number'||!Number.isFinite(i.rotation)||Math.abs(i.rotation)>15||typeof i.layer!=='number'||!Number.isInteger(i.layer)||i.layer<0||i.layer>7||(i.on!==null&&typeof i.on!=='string'))throw fail();
    return {instanceId:i.instanceId,assetId:i.assetId,x:i.x,y:i.y,rotation:i.rotation,layer:i.layer,on:i.on as string|null};
  });
  if(new Set(items.map(i=>i.instanceId)).size!==items.length||new Set(items.map(i=>i.layer)).size!==items.length)throw new Error('ID экземпляров и номера слоёв должны быть уникальны.');
  for(const item of items){
    if(item.on!==null){
      const parent=items.find(p=>p.instanceId===item.on);
      if(!parent||parent.layer>=item.layer||!['book','folder'].includes(parent.assetId))throw new Error('Недопустимая опора: разрешены книга и папка на более низком слое.');
      if(parent.on!==null)throw new Error('Вложенные стопки пока не поддерживаются: предмет кладётся непосредственно на книгу или папку.');
    }
  }
  return {status:'ok',items,explanation:p.explanation.trim()};
}

function composeAiScene(recipe:SemanticPlan,assets:Asset[],backgrounds:Asset[],width:number,height:number,seed:number,stateMode:StateMode):ScenePlan {
  // Validate again at execution boundary; never trust a cached or imported recipe.
  recipe=validateSemanticPlan(recipe);
  if(recipe.status!=='ok')throw new Error(recipe.explanation);
  if(!['color','mixed','mono'].includes(stateMode)||!Number.isInteger(seed)||seed<0||seed>2147483647||![width,height].every(n=>Number.isFinite(n)&&n>=300&&n<=2000))throw new Error('Неверные настройки сцены.');
  const items=[...recipe.items].sort((a,b)=>a.layer-b.layer);
  const sources=items.map((item,index)=>{
    const source=assets.find(a=>a.id===item.assetId);
    if(!source||![source.width,source.height].every(n=>Number.isFinite(n)&&n>0))throw new Error('Не найден исходник для плана сцены.');
    if(!(source.rotationAngles||[0]).includes(item.rotation))throw new Error(`Недопустимый поворот: ${source.name}.`);
    // An attachment cannot be behind its support due to a global state-mode ordering.
    // In this executor explicit layer order is authoritative, states only change paint variants.
    const mono=stateMode==='mono'||(stateMode==='mixed'&&index>0&&index%2===1);
    const asset=mono?backgrounds.find(a=>a.id===source.id&&a.size===source.size):source;
    if(!asset||asset.width!==source.width||asset.height!==source.height)throw new Error('Нет совместимого состояния предмета.');
    return asset;
  });
  function layout(scale:number):ScenePlacement[] {
    const result:ScenePlacement[]=[];
    items.forEach((item,index)=>{
      const asset=sources[index];let cx=item.x*width,cy=item.y*height;
      if(item.on){
        const parentIndex=items.findIndex(i=>i.instanceId===item.on),parent=result[parentIndex],p=sources[parentIndex],m=parent.transform;
        const x=p.width*scale*item.x,y=p.height*scale*item.y;
        cx=m[0][0]*x+m[0][1]*y+m[0][2];cy=m[1][0]*x+m[1][1]*y+m[1][2];
      }
      const size=rotatedSize(asset.width*scale,asset.height*scale,item.rotation);
      const bounds={x:cx-size.width/2,y:cy-size.height/2,...size};
      const transform=centeredTransform(asset.width*scale,asset.height*scale,item.rotation,cx,cy);
      result.push({asset,role:index===0?'main':'support',order:index,rotation:item.rotation,scale,x:transform[0][2],y:transform[1][2],pivot:{x:asset.width/2,y:asset.height/2},transform,bounds});
    });return result;
  }
  const intersects=(a:Bounds,b:Bounds,gap=0)=>Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>-gap&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>-gap;
  function fits(placements:ScenePlacement[]):boolean {
    for(let i=0;i<placements.length;i++){
      const a=placements[i].bounds;
      if(a.x<width*.025||a.y<height*.025||a.x+a.width>width*.975||a.y+a.height>height*.975)return false;
      for(let j=0;j<i;j++){
        const b=placements[j].bounds;
        if(items[i].on===items[j].instanceId){
          // Keep the child inside its support's rotated rectangle in the support's
          // own coordinates. No deformation or separate shrinking is allowed.
          const parent=placements[j],m=parent.transform,w=sources[i].width*placements[i].scale,h=sources[i].height*placements[i].scale,c=placements[i].transform;
          for(const [x,y] of [[0,0],[w,0],[0,h],[w,h]]){
            const px=c[0][0]*x+c[0][1]*y+c[0][2]-m[0][2],py=c[1][0]*x+c[1][1]*y+c[1][2]-m[1][2];
            const lx=m[0][0]*px+m[1][0]*py,ly=m[0][1]*px+m[1][1]*py;
            if(lx<-.01||ly<-.01||lx>sources[j].width*parent.scale+.01||ly>sources[j].height*parent.scale+.01)return false;
          }
        }else if(intersects(a,b,Math.min(width,height)*.012))return false;
      }
    }return true;
  }
  // Attachment proportions/anchors must fit at unit scale; shrinking the entire
  // scene cannot repair an impossible child-to-parent size ratio.
  const unit=layout(1);
  for(let i=0;i<items.length;i++)if(items[i].on){
    const parent=items.findIndex(p=>p.instanceId===items[i].on);
    const a=rotatedSize(sources[i].width,sources[i].height,items[i].rotation-items[parent].rotation);
    if(a.width>sources[parent].width||a.height>sources[parent].height)throw new Error('Предмет не помещается на опоре в исходных пропорциях.');
  }
  let low=0,high=Math.min(...unit.map(p=>Math.min(width*.9/p.bounds.width,height*.9/p.bounds.height)));
  for(let n=0;n<36;n++){const mid=(low+high)/2;if(fits(layout(mid)))low=mid;else high=mid;}
  if(low<.0001)throw new Error('План ИИ не удаётся разместить: проверьте опоры и расстояния. Попробуйте новый вариант.');
  const placements=layout(low*.96);
  if(!fits(placements)||Math.min(...placements.map(p=>Math.min(p.bounds.width,p.bounds.height)))<12)throw new Error('План ИИ даёт слишком мелкие или пересекающиеся предметы. Попробуйте новый вариант или другой формат.');
  return {template:'focus',seed,placements};
}
