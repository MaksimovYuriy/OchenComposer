function composeAiScene(recipe:SemanticPlan,assets:Asset[],backgrounds:Asset[],width:number,height:number,seed:number,stateMode:StateMode):ScenePlan {
  // Validate again at execution boundary; never trust a cached or imported recipe.
  recipe=validateSemanticPlan(recipe);
  if(recipe.status!=='ok')throw new Error(recipe.explanation);
  if(!['color','mixed','mono'].includes(stateMode)||!Number.isInteger(seed)||seed<0||seed>2147483647||![width,height].every(n=>Number.isFinite(n)&&n>=300&&n<=2000))throw new Error('Неверные настройки сцены.');
  const items=[...recipe.items].sort((a,b)=>a.layer-b.layer);
  const sources=items.map((item,index)=>{
    const source=assets.find(a=>a.id===item.assetId);
    if(!source||![source.width,source.height].every(n=>Number.isFinite(n)&&n>0))throw new Error('Не найден исходник для плана сцены.');
    // An attachment cannot be behind its support due to a global state-mode ordering.
    // In this executor explicit layer order is authoritative, states only change paint variants.
    const mono=stateMode==='mono'||item.state==='background'||(stateMode==='mixed'&&index>0&&index%2===1);
    const asset=mono?backgrounds.find(a=>a.id===source.id&&a.size===source.size):source;
    if(!asset||asset.width!==source.width||asset.height!==source.height)throw new Error('Нет совместимого состояния предмета.');
    return asset;
  });
  const roots=items.filter(item=>item.on===null);
  type RootPositions=Record<string,{x:number;y:number}>;
  function layout(scale:number,positions?:RootPositions):ScenePlacement[] {
    const result:ScenePlacement[]=[];
    items.forEach((item,index)=>{
      const asset=sources[index],position=positions?.[item.instanceId]||item;let cx=position.x*width,cy=position.y*height;
      if(item.on){
        const parentIndex=items.findIndex(i=>i.instanceId===item.on),parent=result[parentIndex],p=sources[parentIndex],m=parent.transform;
        const x=p.width*scale*item.x,y=p.height*scale*item.y;
        cx=m[0][0]*x+m[0][1]*y+m[0][2];cy=m[1][0]*x+m[1][1]*y+m[1][2];
      }
      const size=rotatedSize(asset.width*scale,asset.height*scale,item.rotation);
      const bounds={x:cx-size.width/2,y:cy-size.height/2,...size};
      const transform=centeredTransform(asset.width*scale,asset.height*scale,item.rotation,cx,cy);
      result.push({asset,role:index===0?'main':'support',order:index,rotation:item.rotation,scale,x:transform[0][2],y:transform[1][2],pivot:{x:asset.width/2,y:asset.height/2},transform,bounds});
    });
    const byId=(id:string)=>items.findIndex(i=>i.instanceId===id);
    const move=(index:number,dx:number,dy:number)=>{
      // Move the whole support group; never detach an object from its support.
      if(items[index].on!==null)return;
      result.forEach((p,i)=>{if(i===index||items[i].on===items[index].instanceId){p.bounds.x+=dx;p.bounds.y+=dy;p.transform[0][2]+=dx;p.transform[1][2]+=dy;p.x=p.transform[0][2];p.y=p.transform[1][2];}});
    };
    // Exact edge/center alignment depends on the common scale. Resolve it locally
    // instead of asking the model to predict a pixel offset before scale fitting.
    for(let pass=0;pass<items.length;pass++)for(const r of recipe.relations||[]){
      const index=byId(r.subject),a=result[index].bounds;
      const b=r.targets.length?result[byId(r.targets[0])].bounds:a;
      switch(r.type){
        case 'centeredX':move(index,width/2-a.x-a.width/2,0);break;
        case 'centeredY':move(index,0,height/2-a.y-a.height/2);break;
        case 'centered':move(index,width/2-a.x-a.width/2,height/2-a.y-a.height/2);break;
        case 'alignedLeft':move(index,b.x-a.x,0);break;
        case 'alignedRight':move(index,b.x+b.width-a.x-a.width,0);break;
        case 'alignedTop':move(index,0,b.y-a.y);break;
        case 'alignedBottom':move(index,0,b.y+b.height-a.y-a.height);break;
        case 'centeredBetween':{
          const c=result[byId(r.targets[1])].bounds;
          move(index,(b.x+b.width/2+c.x+c.width/2)/2-a.x-a.width/2,(b.y+b.height/2+c.y+c.height/2)/2-a.y-a.height/2);break;
        }
      }
    }
    return result;
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
  const arrangements:RootPositions[]=[];
  for(const sx of [.65,.85,1,1.25])for(const sy of [.65,.85,1,1.25])arrangements.push(Object.fromEntries(roots.map(i=>[i.instanceId,{x:.5+(i.x-.5)*sx,y:.5+(i.y-.5)*sy}])));
  // A metaphor supplies intent, not immutable positions. Try alternate groupings,
  // but retain all instances, rotations, attachments, layers and selected rules.
  if(roots.length>1){
    for(const columns of new Set([1,roots.length,Math.min(roots.length,Math.ceil(Math.sqrt(roots.length*width/height)))])){
      const rows=Math.ceil(roots.length/columns);
      arrangements.push(Object.fromEntries(roots.map((i,n)=>[i.instanceId,{x:.15+.7*((n%columns)+.5)/columns,y:.15+.7*(Math.floor(n/columns)+.5)/rows}])));
    }
  }
  let best:ScenePlan|undefined,candidates=0;
  let lastError='План ИИ не удаётся разместить: проверьте опоры и расстояния. Попробуйте новый вариант.';
  function consider(placements:ScenePlacement[]):void {
    if(!fits(placements)||Math.min(...placements.map(p=>Math.min(p.bounds.width,p.bounds.height)))<12)return;
    try{checkSceneRelations(recipe,placements,width,height);}catch(error){lastError=error instanceof Error?error.message:lastError;return;}
    const candidate:ScenePlan={template:'focus',seed,placements};
    // An object on a support does not occupy an extra independent canvas region.
    const independent={...candidate,placements:placements.filter((_,i)=>items[i].on===null)};
    candidate.quality={...compositionQuality(independent,width,height),strategy:'ai-fit'};
    candidates++;
    if(!best||candidate.quality.score>best.quality!.score)best=candidate;
  }
  for(const positions of arrangements){
    let low=0,high=Math.min(...unit.map(p=>Math.min(width*.9/p.bounds.width,height*.9/p.bounds.height)));
    for(let n=0;n<32;n++){const mid=(low+high)/2;if(fits(layout(mid,positions)))low=mid;else high=mid;}
    if(low<.0001)continue;
    const original=layout(low*.96,positions);consider(original);
    const left=Math.min(...original.map(p=>p.bounds.x)),top=Math.min(...original.map(p=>p.bounds.y));
    const right=Math.max(...original.map(p=>p.bounds.x+p.bounds.width)),bottom=Math.max(...original.map(p=>p.bounds.y+p.bounds.height));
    const zoom=Math.min(width*.90/(right-left),height*.90/(bottom-top));
    const cx=(left+right)/2,cy=(top+bottom)/2;
    // Uniform zoom of the entire group, including its internal distances.
    const enlarged=original.map(p=>{
      const bounds={x:width/2+(p.bounds.x-cx)*zoom,y:height/2+(p.bounds.y-cy)*zoom,width:p.bounds.width*zoom,height:p.bounds.height*zoom};
      const scale=p.scale*zoom,transform=centeredTransform(p.asset.width*scale,p.asset.height*scale,p.rotation,bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      return {...p,bounds,scale,transform,x:transform[0][2],y:transform[1][2]};
    });consider(enlarged);
  }
  if(!best)throw new Error(lastError);
  best.quality!.candidates=candidates;
  return best;
}
