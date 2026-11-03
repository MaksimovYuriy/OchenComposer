type ExportGroup = { id:string; name:string; assetId:string; state:string };
type SvgExport = { svg:string; filename:string; width:number; height:number; groups:ExportGroup[]; sceneId:string; sceneName:string };

function exportFilename(name:string):string {
  // eslint-disable-next-line no-control-regex
  const clean=name.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').trim().slice(0,140);
  return (clean||'ochen-composition')+'.svg';
}

function exportPreflight(frame:FrameNode):void {
  if(frame.removed||!frame.visible)throw new Error('Композиция удалена или скрыта.');
  if(!Number.isFinite(frame.width)||!Number.isFinite(frame.height)||frame.width<=0||frame.height<=0)throw new Error('У композиции некорректные размеры.');
  let subjects=0;
  function visit(node:SceneNode,insideAsset:boolean,insideBackdrop:boolean):void {
    if(!node.visible||('opacity' in node&&node.opacity===0))return;
    const assetId=node.getPluginData('ochen-asset-id');
    if(assetId){
      if(!ASSETS.some(a=>a.id===assetId&&a.size===node.getPluginData('ochen-variant')))throw new Error(`Неизвестный исходник «${node.name}».`);
      subjects++;insideAsset=true;
    }
    const legacyBackdrop=node.parent===frame&&node.type==='FRAME'&&node.name==='Фон'&&node.clipsContent;
    insideBackdrop=insideBackdrop||node.getPluginData('ochen-backdrop')==='1'||legacyBackdrop;
    if(node!==frame&&!insideAsset&&!insideBackdrop){
      if(node.type!=='FRAME'&&node.type!=='GROUP')throw new Error(`«${node.name}» не относится к библиотеке композиции. Удалите посторонний объект перед экспортом.`);
      for(const key of ['fills','strokes'] as const)if(key in node){
        const paints=(node as unknown as Record<string,unknown>)[key];
        if(Array.isArray(paints)&&paints.some(p=>p.visible!==false))throw new Error(`В контейнере «${node.name}» есть посторонняя графика.`);
      }
    }
    for(const key of ['fills','strokes'] as const)if(key in node){
      const paints=(node as unknown as Record<string,unknown>)[key];
      if(!Array.isArray(paints))throw new Error(`Смешанные ${key} в «${node.name}» требуют отдельной проверки.`);
      if(paints.some(p=>p.visible!==false&&(p.type==='IMAGE'||p.type==='VIDEO')))throw new Error(`В «${node.name}» обнаружена растровая/видео-заливка. SVG не должен содержать растр.`);
    }
    if('effects' in node&&node.effects.some(effect=>effect.visible!==false))throw new Error(`Эффекты «${node.name}» не входят в проверенный векторный экспорт. Уберите эффект, сохранив исходные контуры.`);
    if('children' in node)node.children.forEach(child=>visit(child,insideAsset,insideBackdrop));
  }
  visit(frame,false,false);
  if(!subjects)throw new Error('В композиции нет видимых предметов для экспорта.');
}

async function prepareSvgExport(expectedSceneId?:unknown):Promise<SvgExport> {
  const source=selectedComposition();
  if(!source)throw new Error('Выберите композицию или один её предмет для экспорта.');
  if(expectedSceneId!==undefined&&expectedSceneId!==source.id)throw new Error('Выделение изменилось. Проверьте выбранную композицию и повторите экспорт.');
  exportPreflight(source);
  const sceneId=source.id,sceneName=source.name,width=source.width,height=source.height;
  let snapshot:FrameNode|undefined;
  try{
    // Freeze current paints, geometry and stacking. Never rename or reassemble the original.
    snapshot=source.clone();figma.currentPage.appendChild(snapshot);
    snapshot.relativeTransform=[[1,0,100000],[0,1,100000]];
    snapshot.name='ochen_export_snapshot';
    const groups:ExportGroup[]=[];
    let index=0;
    function rename(node:SceneNode,invisible:boolean):void {
      const hidden=invisible||!node.visible||('opacity' in node&&node.opacity===0);
      const assetId=node.getPluginData('ochen-asset-id');
      if(assetId&&!hidden){
        const id='ochen_item_'+String(groups.length+1).padStart(4,'0');
        groups.push({id,name:node.name,assetId,state:node.getPluginData('ochen-state')||'main'});
        node.name=id;
      }else node.name='ochen_node_'+String(++index).padStart(6,'0');
      if('children' in node)node.children.forEach(child=>rename(child,hidden));
    }
    snapshot.children.forEach(child=>rename(child,false));
    const svg=await snapshot.exportAsync({format:'SVG_STRING',svgIdAttribute:true,svgOutlineText:false,svgSimplifyStroke:false,contentsOnly:false,useAbsoluteBounds:false});
    if(source.removed)throw new Error('Исходная композиция удалена во время подготовки. Повторите экспорт нужной сцены.');
    if(typeof svg!=='string'||!svg.trim())throw new Error('Figma вернула пустой SVG.');
    return {svg,filename:exportFilename(sceneName),width,height,groups,sceneId,sceneName};
  }finally{if(snapshot&&!snapshot.removed)snapshot.remove();}
}
