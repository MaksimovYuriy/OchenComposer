figma.showUI(__html__, { width: 440, height: 700, themeColors: true });
let busy = false;
let previousResult: FrameNode | undefined;
figma.ui.onmessage = (message: unknown) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  const request = message as Record<string, unknown>;
  if (request.type === 'catalog') {
    figma.ui.postMessage({ type: 'catalog', names: ASSETS.filter(a => a.role === 'main' && a.size === 'large').map(a => a.name) });
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
    const candidates = ASSETS.filter(asset => asset.role === 'main' && asset.size === request.size);
    const selected = resolveNames(request.text, candidates);
    if (typeof request.backgroundDuplicate !== 'boolean') throw new Error('Некорректная настройка фона.');
    if (typeof request.template !== 'string' || typeof request.seed !== 'number') throw new Error('Выберите схему и seed.');
    const plan = composeScene(selected, ASSETS.filter(a => a.role === 'background'), request.backgroundDuplicate,
      width, height, request.template, request.seed);
    const placements = plan.placements;
    frame = figma.createFrame();
    frame.name = `Ochen — ${selected.map(asset => asset.name).join(', ')} · ${plan.template} #${plan.seed}`;
    frame.resize(width, height);
    frame.clipsContent = false;
    frame.x = figma.viewport.center.x - width / 2;
    frame.y = figma.viewport.center.y - height / 2;
    if (previousResult && !previousResult.removed && previousResult.parent === figma.currentPage) {
      frame.x = previousResult.x + previousResult.width + 80;
      frame.y = previousResult.y;
    }
    frame.setPluginData('ochen-composition', '1');
    frame.setPluginData('ochen-template', plan.template);
    frame.setPluginData('ochen-seed', String(plan.seed));
    frame.setPluginData('ochen-plan', JSON.stringify({ version: 1, ids: selected.map(a => a.id), size: request.size,
      width, height, template: plan.template, seed: plan.seed, backgroundDuplicate: request.backgroundDuplicate }));
    {
      const backdrop = BACKDROPS.find(a => a.size === request.size);
      if (!backdrop) throw new Error('Не найден исходный фон.');
      const background = figma.createNodeFromSvg(backdrop.svg);
      frame.appendChild(background);
      background.name = 'Фон — исходный фиолетовый';
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
      background.locked = true;
    }
    for (const placement of placements) {
      const node = figma.createNodeFromSvg(placement.asset.svg);
      // Attach immediately so a failure only removes this incomplete result.
      frame.appendChild(node);
      node.name = placement.role === 'background' ? `Фоновый дубль — ${placement.asset.name}` : placement.asset.name;
      node.setPluginData('ochen-asset-id', placement.asset.id);
      node.setPluginData('ochen-variant', placement.asset.size);
      node.setPluginData('ochen-role', placement.role);
      node.rescale(placement.scale);
      node.x = placement.x;
      node.y = placement.y;
    }
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    previousResult = frame;
    figma.ui.postMessage({ type: 'success', seed: plan.seed, template: plan.template,
      message: `Предметов: ${selected.length}${request.backgroundDuplicate ? ' + 1 фоновый дубль' : ''}. Главный: ${selected[0].name}. Схема: ${plan.template}, seed: ${plan.seed}.` });
  } catch (error) {
    if (frame && !frame.removed) frame.remove();
    console.error('Ochen Composer:', error);
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось создать композицию.' });
  } finally {
    busy = false;
    figma.ui.postMessage({ type: 'busy', value: false });
  }
};
