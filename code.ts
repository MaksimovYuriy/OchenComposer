figma.showUI(__html__, { width: 440, height: 700, themeColors: true });
let busy = false;
let previousResult: FrameNode | undefined;
let trackedScene: FrameNode | undefined;
let documentRefresh: number | undefined;
function selectedAssetNode(): FrameNode | undefined {
  if (figma.currentPage.selection.length !== 1) return;
  let node: BaseNode | null = figma.currentPage.selection[0];
  while (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
    if (node.type === 'FRAME' && node.getPluginData('ochen-asset-id')) {
      let ancestor = node.parent;
      while (ancestor && ancestor.type !== 'DOCUMENT') {
        if (ancestor.getPluginData('ochen-composition') === '1') return node;
        ancestor = ancestor.parent;
      }
      return;
    }
    node = node.parent;
  }
}

function sendSelectionState(): void {
  const node = selectedAssetNode();
  const scene = selectedComposition();
  if (scene) trackedScene = scene;
  let palette: Palette | undefined;
  let paletteError: string | undefined;
  if(scene){try{palette=getScenePalette(scene);}catch(error){paletteError=error instanceof Error?error.message:'Ошибка данных палитры.';}}
  figma.ui.postMessage({ type: 'asset-selection', selected: node ? {
    instanceId: node.id,
    name: node.name, state: node.getPluginData('ochen-state') || (node.getPluginData('ochen-role') === 'background' ? 'background' : 'main'),
    angle: Math.atan2(node.relativeTransform[1][0], node.relativeTransform[0][0]) * 180 / Math.PI,
  } : null, scene: scene ? { id:scene.id, name: scene.name, count: sceneItems(scene).length, palette, paletteError,
    paletteWarnings:palette?paletteWarnings(palette):[] } : null });
}

function changeSelectedState(state: unknown): void {
  if (state !== 'main' && state !== 'background') throw new Error('Неизвестное состояние предмета.');
  const source = selectedAssetNode();
  if (!source) throw new Error('Выберите один предмет созданной композиции (можно выбрать его деталь).');
  const id = source.getPluginData('ochen-asset-id');
  const size = source.getPluginData('ochen-variant');
  const oldState = source.getPluginData('ochen-state') || (source.getPluginData('ochen-role') === 'background' ? 'background' : 'main');
  if (oldState === state) return;
  const oldAsset = ASSETS.find(a => a.id === id && a.size === size && a.role === oldState);
  const newAsset = ASSETS.find(a => a.id === id && a.size === size && a.role === state);
  if (!oldAsset || !newAsset) throw new Error('Не найдены исходные состояния предмета.');
  const scale = stateReplacementScale(oldAsset, newAsset, source.width, source.height);
  const parent = source.parent;
  if (!parent || !('insertChild' in parent) || parent.type === 'INSTANCE') throw new Error('Нельзя заменить предмет в этом контейнере.');
  const index = parent.children.indexOf(source);
  const transform: Transform = [[...source.relativeTransform[0]], [...source.relativeTransform[1]]];
  let replacement: FrameNode | undefined;
  try {
    replacement = figma.createNodeFromSvg(newAsset.svg);
    const scene=selectedComposition();
    if(!scene)throw new Error('Композиция не выбрана.');
    recolorTree(replacement,getScenePalette(scene),state==='background'?'monochrome':'object');
    replacement.rescale(scale);
    parent.insertChild(index, replacement);
    replacement.relativeTransform = transform;
    replacement.name = `${newAsset.name}${state === 'background' ? ' — монохромный' : ''}${source.getPluginData('ochen-role') === 'background' ? ' (дубль)' : ''}`;
    for (const key of source.getPluginDataKeys()) if(key!==BASELINE_KEY)replacement.setPluginData(key, source.getPluginData(key));
    replacement.setPluginData('ochen-state', state);
    replacement.opacity = source.opacity;
    replacement.blendMode = source.blendMode;
    replacement.visible = source.visible;
    replacement.locked = source.locked;
    figma.currentPage.selection = [replacement];
    source.remove();
  } catch (error) {
    if (replacement && !replacement.removed) replacement.remove();
    throw error;
  }
}

figma.on('selectionchange', sendSelectionState);
function scheduleSceneRefresh(): void {
  if (documentRefresh !== undefined) clearTimeout(documentRefresh);
  documentRefresh = setTimeout(() => {
    documentRefresh = undefined;
    if (trackedScene && !trackedScene.removed) syncCurrentScene(trackedScene);
    sendSelectionState();
  }, 80);
}
// Observe only the active page; dynamic-page documents need not load every page.
let observedPage = figma.currentPage;
observedPage.on('nodechange', scheduleSceneRefresh);
figma.on('currentpagechange', () => {
  observedPage.off('nodechange', scheduleSceneRefresh);
  observedPage = figma.currentPage;
  observedPage.on('nodechange', scheduleSceneRefresh);
  trackedScene = undefined;
  sendSelectionState();
});
figma.ui.onmessage = async (message: unknown) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  const request = message as Record<string, unknown>;
  if (request.type === 'catalog') {
    figma.ui.postMessage({ type: 'catalog', names: ASSETS.filter(a => a.role === 'main' && a.size === 'large').map(a => a.name) });
    sendPaletteCatalog();
    void loadPersonalPalettes();
    sendSelectionState();
    return;
  }
  if(request.type==='export-svg'&&!busy){
    busy=true;figma.ui.postMessage({type:'busy',value:true});
    try{const result=await prepareSvgExport(request.sceneId);figma.ui.postMessage({type:'svg-export',...result});}
    catch(error){figma.ui.postMessage({type:'error',message:error instanceof Error?error.message:'Не удалось подготовить SVG.'});}
    finally{busy=false;figma.ui.postMessage({type:'busy',value:false});sendSelectionState();}
    return;
  }
  if((request.type==='apply-palette'||request.type==='import-palette')&&!busy){
    busy=true;figma.ui.postMessage({type:'busy',value:true});
    try{
      let palette:Palette;
      let text:string;
      if(request.type==='import-palette'){
        const imported=await importPersonalPalette(request.palette);palette=imported.palette;
        text=`Палитра «${palette.name}» загружена. Она доступна для сборки; для выбранной сцены нажмите «Применить».`;
        if(!imported.persisted)text+=' Личное хранилище недоступно: схема доступна в этой сессии и сохранится в документе после применения.';
      }else{
        const scene=selectedComposition();
        if(!scene)throw new Error('Выберите нашу композицию или один её предмет для перекраски.');
        palette=requestedPalette(request.palette);applyScenePalette(scene,palette);syncCurrentScene(scene);
        text=`Схема «${palette.name}» применена только к выбранной композиции.`;
      }
      const warnings=paletteWarnings(palette);
      figma.ui.postMessage({type:'success',message:text+(warnings.length?' '+warnings.join(' '):'')});
    }catch(error){figma.ui.postMessage({type:'error',message:error instanceof Error?error.message:'Не удалось применить палитру.'});}
    finally{busy=false;figma.ui.postMessage({type:'busy',value:false});sendSelectionState();}
    return;
  }
  if ((request.type === 'set-state' || request.type === 'edit') && !busy) {
    busy = true;
    figma.ui.postMessage({ type: 'busy', value: true });
    try {
      const scene = selectedComposition();
      const message = request.type === 'edit' ? editComposition(request)
        : (changeSelectedState(request.state), 'Состояние применено. Положение, поворот, размер и порядок слоёв сохранены.');
      if (scene) syncCurrentScene(scene);
      figma.ui.postMessage({ type: 'success', message });
    } catch (error) {
      figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось изменить состояние.' });
    } finally {
      busy = false;
      figma.ui.postMessage({ type: 'busy', value: false });
      sendSelectionState();
    }
    return;
  }
  if (request.type !== 'compose' || busy) return;
  busy = true;
  figma.ui.postMessage({ type: 'busy', value: true });
  let frame: FrameNode | undefined;
  try {
    if (typeof request.text !== 'string') throw new Error('Некорректный запрос.');
    if (request.size !== 'large' && request.size !== 'small') throw new Error('Выберите вариант L или S.');
    const formats: Record<string, [number, number]> = { square: [1000, 1000], landscape: [1200, 630], portrait: [800, 1200] };
    if (typeof request.format !== 'string' || !Object.prototype.hasOwnProperty.call(formats, request.format)) throw new Error('Неизвестный формат.');
    const [width, height] = formats[request.format];
    const palette=requestedPalette(request.palette);
    const candidates = ASSETS.filter(asset => asset.role === 'main' && asset.size === request.size);
    const selected = resolveNames(request.text, candidates);
    const stateMode = request.stateMode === undefined ? 'color' : request.stateMode;
    if (stateMode !== 'color' && stateMode !== 'mixed' && stateMode !== 'mono') throw new Error('Выберите режим состояний предметов.');
    if (typeof request.backgroundDuplicate !== 'boolean') throw new Error('Некорректная настройка фона.');
    if (typeof request.template !== 'string' || typeof request.seed !== 'number') throw new Error('Выберите схему и seed.');
    const plan = composeScene(selected, ASSETS.filter(a => a.role === 'background'), request.backgroundDuplicate,
      width, height, request.template, request.seed, stateMode);
    const placements = plan.placements;
    frame = figma.createFrame();
    frame.name = `Ochen — ${selected.map(asset => asset.name).join(', ')} · ${plan.template} #${plan.seed}`;
    frame.resize(width, height);
    frame.clipsContent = false;
    frame.fills = [];
    frame.x = figma.viewport.center.x - width / 2;
    frame.y = figma.viewport.center.y - height / 2;
    if (previousResult && !previousResult.removed && previousResult.parent === figma.currentPage) {
      frame.x = previousResult.x + previousResult.width + 80;
      frame.y = previousResult.y;
    }
    frame.setPluginData('ochen-composition', '1');
    frame.setPluginData('ochen-template', plan.template);
    frame.setPluginData('ochen-seed', String(plan.seed));
    frame.setPluginData('ochen-scene-scale', String(placements[0].scale));
    frame.setPluginData('ochen-detail', request.size);
    frame.setPluginData('ochen-palette',JSON.stringify(palette));
    frame.setPluginData('ochen-plan', JSON.stringify({ version: 2, ids: selected.map(a => a.id), size: request.size,
      width, height, template: plan.template, seed: plan.seed, backgroundDuplicate: request.backgroundDuplicate, stateMode, palette,
      placements: placements.map(p => ({ id: p.asset.id, state: p.asset.role, role: p.role, rotation: p.rotation,
        pivot: p.pivot, scale: p.scale, transform: p.transform, order: p.order })) }));
    {
      const backdrop = BACKDROPS.find(a => a.size === request.size);
      if (!backdrop) throw new Error('Не найден исходный фон.');
      const background = figma.createNodeFromSvg(backdrop.svg);
      frame.appendChild(background);
      recolorTree(background,palette,'background');
      background.name = 'Фон — векторная подложка';
      const scale = Math.max(width / backdrop.width, height / backdrop.height);
      background.rescale(scale);
      background.x = (width - backdrop.width * scale) / 2;
      background.y = (height - backdrop.height * scale) / 2;
      // Crop only the source background; foreground objects remain whole.
      const backgroundClip = figma.createFrame();
      frame.appendChild(backgroundClip);
      backgroundClip.name = 'Фон';
      backgroundClip.resize(width, height);
      backgroundClip.x = 0;
      backgroundClip.y = 0;
      backgroundClip.fills = [];
      backgroundClip.clipsContent = true;
      backgroundClip.appendChild(background);
      // Reparenting can change local coordinates; set them explicitly again.
      background.x = (width - backdrop.width * scale) / 2;
      background.y = (height - backdrop.height * scale) / 2;
      backgroundClip.locked = true;
      backgroundClip.setPluginData('ochen-backdrop', '1');
      background.locked = true;
    }
    for (const placement of placements) {
      const node = figma.createNodeFromSvg(placement.asset.svg);
      // Attach immediately so a failure only removes this incomplete result.
      frame.appendChild(node);
      node.name = placement.role === 'background' ? `Фоновый дубль — ${placement.asset.name}`
        : `${placement.asset.name}${placement.asset.role === 'background' ? ' — монохромный' : ''}`;
      node.setPluginData('ochen-asset-id', placement.asset.id);
      node.setPluginData('ochen-variant', placement.asset.size);
      node.setPluginData('ochen-role', placement.role);
      node.setPluginData('ochen-state', placement.asset.role);
      node.setPluginData('ochen-generated-rotation', String(placement.rotation));
      recolorTree(node,palette,placement.asset.role==='background'?'monochrome':'object');
      node.rescale(placement.scale);
      node.relativeTransform = placement.transform;
    }
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    previousResult = frame;
    trackedScene = frame;
    syncCurrentScene(frame);
    figma.ui.postMessage({ type: 'success', seed: plan.seed, template: plan.template,
      message: `Предметов: ${selected.length}${request.backgroundDuplicate ? ' + 1 фоновый дубль' : ''}. Схема: ${plan.template}, seed: ${plan.seed}. Повороты по часовой стрелке: ${placements.filter(p => p.role !== 'background').map(p => p.asset.name + ' ' + p.rotation + '°').join(', ')}.` });
  } catch (error) {
    if (frame && !frame.removed) frame.remove();
    console.error('Ochen Composer:', error);
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось создать композицию.' });
  } finally {
    busy = false;
    figma.ui.postMessage({ type: 'busy', value: false });
    sendSelectionState();
  }
};
