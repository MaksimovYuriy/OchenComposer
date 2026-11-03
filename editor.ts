// Commands operate on native Figma nodes; generation provenance is never rewritten.
function selectedComposition(): FrameNode | undefined {
  if (figma.currentPage.selection.length !== 1) return;
  let node: BaseNode | null = figma.currentPage.selection[0];
  while (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
    if (node.type === 'FRAME' && node.getPluginData('ochen-composition') === '1') return node;
    node = node.parent;
  }
}

function sceneItems(frame: FrameNode): FrameNode[] {
  const items: FrameNode[] = [];
  function visit(node: SceneNode): void {
    if (node.type === 'FRAME' && node.getPluginData('ochen-asset-id')) { items.push(node); return; }
    if ('children' in node) node.children.forEach(visit);
  }
  frame.children.forEach(visit);
  return items;
}

function syncCurrentScene(frame: FrameNode): void {
  if (frame.removed) return;
  const snapshot = JSON.stringify({ version: 1, width: frame.width, height: frame.height,
    items: sceneItems(frame).map(node => ({ instanceId: node.id, assetId: node.getPluginData('ochen-asset-id'),
      detail: node.getPluginData('ochen-variant'), state: node.getPluginData('ochen-state') || (node.getPluginData('ochen-role') === 'background' ? 'background' : 'main'),
      role: node.getPluginData('ochen-role'), parentId: node.parent?.id,
      order: node.parent && 'children' in node.parent ? node.parent.children.indexOf(node) : -1,
      transform: node.relativeTransform, width: node.width, height: node.height, visible: node.visible })) });
  if (frame.getPluginData('ochen-current-scene') !== snapshot) frame.setPluginData('ochen-current-scene', snapshot);
}

function boxFor(width: number, height: number, matrix: Transform): Bounds {
  const corners = [[0,0],[width,0],[0,height],[width,height]].map(([x,y]) => [
    matrix[0][0]*x+matrix[0][1]*y+matrix[0][2], matrix[1][0]*x+matrix[1][1]*y+matrix[1][2]]);
  const xs=corners.map(p=>p[0]), ys=corners.map(p=>p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) };
}

function insideScene(box: Bounds, frame: FrameNode): boolean {
  return box.x >= -.01 && box.y >= -.01 && box.x+box.width <= frame.width+.01 && box.y+box.height <= frame.height+.01;
}

function copyMatrix(matrix: Transform): Transform { return [[...matrix[0]], [...matrix[1]]]; }

function findSpace(frame: FrameNode, width: number, height: number, angle: number, preferred?: Bounds): Transform {
  const size=rotatedSize(width,height,angle), margin=12;
  if (size.width > frame.width-margin*2 || size.height > frame.height-margin*2) throw new Error('Предмет не помещается в текущем масштабе. Выберите больший формат или удалите предмет.');
  const occupied=sceneItems(frame).filter(n=>n.parent===frame && n.getPluginData('ochen-role')!=='background')
    .map(n=>boxFor(n.width,n.height,n.relativeTransform));
  const candidates: {x:number;y:number}[]=[];
  if (preferred) {
    candidates.push({x:preferred.x+24,y:preferred.y+24},{x:preferred.x-24,y:preferred.y+24});
  }
  const xs=[margin,(frame.width-size.width)/2,frame.width-size.width-margin,...occupied.flatMap(b=>[b.x+b.width+margin,b.x-size.width-margin])];
  const ys=[margin,(frame.height-size.height)/2,frame.height-size.height-margin,...occupied.flatMap(b=>[b.y+b.height+margin,b.y-size.height-margin])];
  for (const y of ys) for (const x of xs) candidates.push({x,y});
  for(const candidate of candidates){
    const box={...candidate,...size};
    if(!insideScene(box,frame)) continue;
    const collision=occupied.some(b=>Math.min(box.x+box.width,b.x+b.width)-Math.max(box.x,b.x)>0
      && Math.min(box.y+box.height,b.y+b.height)-Math.max(box.y,b.y)>0);
    if(!collision)return centeredTransform(width,height,angle,box.x+size.width/2,box.y+size.height/2);
  }
  throw new Error('Нет свободного места без перекрытия. Освободите место или создайте композицию другого формата.');
}

function referenceAsset(node: FrameNode): Asset {
  const asset=ASSETS.find(a=>a.id===node.getPluginData('ochen-asset-id') && a.size===node.getPluginData('ochen-variant')
    && a.role===(node.getPluginData('ochen-state') || (node.getPluginData('ochen-role')==='background'?'background':'main')));
  if(!asset)throw new Error('Исходник выбранного предмета не найден.');
  return asset;
}

function sceneScale(frame: FrameNode): {scale:number;size:Asset['size']} {
  const items=sceneItems(frame);
  if(items.some(n=>n.parent!==frame))throw new Error('Для добавления разгруппируйте вложенные предметы до уровня композиции.');
  const first=items[0];
  if(!first){
    let scale=Number(frame.getPluginData('ochen-scene-scale')),size=frame.getPluginData('ochen-detail');
    if(!scale || !size){
      try{const provenance=JSON.parse(frame.getPluginData('ochen-plan'));
        scale=provenance.placements?.[0]?.scale;size=provenance.size;
      }catch{ /* Old/foreign frames without provenance get the explicit error below. */ }
    }
    if(scale>0 && Number.isFinite(scale) && (size==='large'||size==='small'))return {scale,size};
    throw new Error('Нет сохранённого масштаба. Создайте новую композицию.');
  }
  const asset=referenceAsset(first),scale=stateReplacementScale(asset,asset,first.width,first.height);
  for(const item of items){
    const ref=referenceAsset(item),value=stateReplacementScale(ref,ref,item.width,item.height);
    const m=item.relativeTransform;
    if(Math.abs(Math.hypot(m[0][0],m[1][0])-1)>.001 || Math.abs(Math.hypot(m[0][1],m[1][1])-1)>.001
      || Math.abs(m[0][0]*m[1][1]-m[0][1]*m[1][0]-1)>.001)throw new Error('В сцене есть деформированный предмет. Восстановите его пропорции.');
    if(ref.size!==asset.size || Math.abs(value-scale)>scale*.001)throw new Error('У предметов разные масштабы/детализация. Восстановите общие пропорции перед добавлением.');
  }
  return {scale,size:asset.size};
}

function editComposition(request: Record<string,unknown>): string {
  const frame=selectedComposition();
  if(!frame)throw new Error('Выберите нашу композицию или один её предмет.');
  if(frame.layoutMode && frame.layoutMode!=='NONE')throw new Error('Отключите Auto Layout композиции перед правкой.');
  const source=selectedAssetNode();
  const action=request.action;
  if(action==='add'){
    if(typeof request.name!=='string'||!['main','background'].includes(String(request.state)))throw new Error('Выберите предмет и состояние для добавления.');
    const {scale,size}=sceneScale(frame);
    if(sceneItems(frame).length>=9||sceneItems(frame).filter(n=>n.getPluginData('ochen-role')!=='background').length>=8)throw new Error('Максимум 8 предметов плюс исходный фоновый дубль.');
    const candidates=ASSETS.filter(a=>a.size===size&&a.role===request.state);
    const selected=resolveNames(request.name,candidates);
    if(selected.length!==1)throw new Error('Добавляйте по одному предмету.');
    const asset=selected[0],matrix=findSpace(frame,asset.width*scale,asset.height*scale,0);
    let added:FrameNode|undefined;
    try{
      added=figma.createNodeFromSvg(asset.svg);frame.appendChild(added);added.rescale(scale);added.relativeTransform=matrix;
      added.name=asset.name+(asset.role==='background'?' — монохромный':'');
      added.setPluginData('ochen-asset-id',asset.id);added.setPluginData('ochen-variant',asset.size);
      added.setPluginData('ochen-state',asset.role);added.setPluginData('ochen-role','support');
      if(asset.role==='background'){
        const firstColored=frame.children.findIndex(n=>n.getPluginData('ochen-asset-id')&&n.getPluginData('ochen-state')==='main');
        if(firstColored>=0)frame.insertChild(firstColored,added);
      }
      figma.currentPage.selection=[added];
    }catch(error){if(added&&!added.removed)added.remove();throw error;}
  }else{
    if(!source)throw new Error('Выберите один предмет композиции.');
    if(source.parent!==frame)throw new Error('Разгруппируйте предмет до уровня композиции для этой команды.');
    if(action==='delete'){
      figma.currentPage.selection=[frame];source.remove();
    }else if(action==='duplicate'){
      sceneScale(frame);
      if(sceneItems(frame).length>=9||sceneItems(frame).filter(n=>n.getPluginData('ochen-role')!=='background').length>=8)throw new Error('Максимум 8 предметов плюс исходный фоновый дубль.');
      const angle=Math.atan2(source.relativeTransform[1][0],source.relativeTransform[0][0])*180/Math.PI;
      const matrix=findSpace(frame,source.width,source.height,angle,boxFor(source.width,source.height,source.relativeTransform));
      let clone:FrameNode|undefined;
      try{clone=source.clone();frame.insertChild(frame.children.indexOf(source)+1,clone);
        clone.name=source.name+' — копия';clone.relativeTransform=matrix;clone.setPluginData('ochen-role','support');figma.currentPage.selection=[clone];
      }catch(error){if(clone&&!clone.removed)clone.remove();throw error;}
    }else if(action==='move'||action==='rotate'){
      const matrix=copyMatrix(source.relativeTransform);
      let next=matrix;
      if(action==='move'){
        if(typeof request.dx!=='number'||typeof request.dy!=='number'||![request.dx,request.dy].every(v=>Number.isFinite(v)&&Math.abs(v)<=2000))throw new Error('Недопустимое смещение.');
        next[0][2]+=request.dx;next[1][2]+=request.dy;
      }else{
        if(typeof request.angle!=='number'||!Number.isFinite(request.angle)||Math.abs(request.angle)>360)throw new Error('Угол должен быть от −360° до 360°.');
        const c=Math.hypot(matrix[0][0],matrix[1][0]),s=Math.hypot(matrix[0][1],matrix[1][1]);
        if(Math.abs(c-1)>.001||Math.abs(s-1)>.001||Math.abs(matrix[0][0]*matrix[1][1]-matrix[0][1]*matrix[1][0]-1)>.001)throw new Error('Не поддерживается деформация матрицы предмета.');
        const cx=matrix[0][0]*source.width/2+matrix[0][1]*source.height/2+matrix[0][2];
        const cy=matrix[1][0]*source.width/2+matrix[1][1]*source.height/2+matrix[1][2];
        next=centeredTransform(source.width,source.height,request.angle,cx,cy);
      }
      if(!insideScene(boxFor(source.width,source.height,next),frame))throw new Error('Предмет выйдет за холст. Сначала переместите его ближе к центру.');
      source.relativeTransform=next;
    }else if(action==='raise'||action==='lower'){
      const siblings=frame.children,index=siblings.indexOf(source),direction=action==='raise'?1:-1;
      let target=index+direction;
      while(target>=0&&target<siblings.length&&!siblings[target].getPluginData('ochen-asset-id'))target+=direction;
      if(target>=0&&target<siblings.length)frame.insertChild(target,source);
    }else throw new Error('Неизвестная команда редактирования.');
  }
  syncCurrentScene(frame);
  return 'Команда выполнена. Остальные предметы не пересобирались.';
}
