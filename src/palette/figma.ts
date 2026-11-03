type PaintSnapshot = {version:1; fills?: Paint[]; strokes?: Paint[]};
type PaletteChange = {node:SceneNode; before:PaintSnapshot; after:PaintSnapshot; oldData:string; newData:string};
const BASELINE_KEY = 'ochen-color-baseline';

function getScenePalette(frame: FrameNode): Palette {
  const saved=frame.getPluginData('ochen-palette');
  if(saved){try{return validatePalette(JSON.parse(saved));}catch{throw new Error('Повреждены данные палитры сцены. Выберите корректную схему и примените заново.');}}
  return validatePalette(PALETTE_LIBRARY.find(p=>p.id==='violet'));
}

function paletteChanges(root: SceneNode, palette: Palette, area: PaletteArea, scene: boolean): PaletteChange[] {
  const changes: PaletteChange[]=[];
  function visit(node: SceneNode, inherited: PaletteArea): void {
    let current=inherited;
    if(scene && node.getPluginData('ochen-asset-id'))current=(node.getPluginData('ochen-state') || (node.getPluginData('ochen-role')==='background'?'background':'main'))==='background'?'monochrome':'object';
    const before:PaintSnapshot={version:1};
    if(!('isMask' in node && node.isMask)) {
      const bindings=('boundVariables' in node ? node.boundVariables : undefined) as Record<string,unknown>|undefined;
      if(bindings && ['fills','strokes'].some(key=>Array.isArray(bindings[key])?bindings[key].length>0:!!bindings[key]))throw new Error(`Снимите цветовые привязки переменных у «${node.name}».`);
      for(const key of ['fills','strokes'] as const){
        if(!(key in node))continue;
        const paints=(node as unknown as Record<string,unknown>)[key];
        if(!Array.isArray(paints))throw new Error(`Смешанные ${key} у «${node.name}» не поддерживаются.`);
        const styleKey=key==='fills'?'fillStyleId':'strokeStyleId';
        if(styleKey in node && (node as unknown as Record<string,unknown>)[styleKey])throw new Error(`Снимите стиль ${key} у «${node.name}» перед перекраской.`);
        before[key]=JSON.parse(JSON.stringify(paints)) as Paint[];
      }
      if(before.fills!==undefined || before.strokes!==undefined){
        const oldData=node.getPluginData(BASELINE_KEY);
        let baseline:PaintSnapshot;
        try{baseline=oldData?JSON.parse(oldData) as PaintSnapshot:before;}
        catch{throw new Error(`Повреждены исходные цвета «${node.name}».`);}
        if(!baseline || typeof baseline!=='object' || baseline.version!==1)throw new Error(`Неизвестная версия исходных цветов «${node.name}».`);
        const after:PaintSnapshot={version:1};
        for(const key of ['fills','strokes'] as const){
          if(before[key]===undefined)continue;
          if(!Array.isArray(baseline[key]) || baseline[key]!.length!==before[key]!.length)throw new Error(`Изменена структура ${key} у «${node.name}». Верните исходную структуру.`);
          after[key]=mapPalettePaints(baseline[key]!,palette,current);
        }
        changes.push({node,before,after,oldData,newData:oldData||JSON.stringify(baseline)});
      }
    }
    if('children' in node)node.children.forEach(child=>visit(child,current));
  }
  visit(root,area);
  return changes;
}

function writePaints(node:SceneNode, snapshot:PaintSnapshot):void {
  if(snapshot.fills!==undefined && 'fills' in node)node.fills=snapshot.fills;
  if(snapshot.strokes!==undefined && 'strokes' in node)node.strokes=snapshot.strokes;
}

function commitPaletteChanges(changes:PaletteChange[]):()=>void {
  const applied:PaletteChange[]=[];
  const rollback=()=>{for(const item of [...applied].reverse()){
    if(item.node.removed)continue;
    try{writePaints(item.node,item.before);item.node.setPluginData(BASELINE_KEY,item.oldData);}catch(error){console.error('Palette rollback:',error);}
  }};
  try{for(const item of changes){applied.push(item);writePaints(item.node,item.after);
    if(item.newData!==item.oldData)item.node.setPluginData(BASELINE_KEY,item.newData);
  }}catch(error){rollback();throw error;}
  return rollback;
}

function recolorTree(root:SceneNode,palette:Palette,area:PaletteArea):void {
  commitPaletteChanges(paletteChanges(root,palette,area,false));
}

function applyScenePalette(frame:FrameNode,palette:Palette):void {
  // Validate and plan the entire scene before the first write.
  const checked=validatePalette(palette),changes=paletteChanges(frame,checked,'background',true);
  const old=frame.getPluginData('ochen-palette'),rollback=commitPaletteChanges(changes);
  try{frame.setPluginData('ochen-palette',JSON.stringify(checked));}
  catch(error){rollback();frame.setPluginData('ochen-palette',old);throw error;}
}
