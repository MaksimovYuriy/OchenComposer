figma.showUI(__html__, { width: 440, height: 700, themeColors: true });
let busy = false;
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
    const square = request.format === 'square';
    const placements: ScenePlacement[] = square
      ? composeSquare(selected, ASSETS.filter(a => a.role === 'background'), request.backgroundDuplicate)
      : layoutObjects(selected, width, height).map((placement, index) => ({ ...placement, role: index === 0 ? 'main' : 'support', order: index }));
    frame = figma.createFrame();
    frame.name = `Ochen — ${selected.map(asset => asset.name).join(', ')}`;
    frame.resize(width, height);
    frame.clipsContent = false;
    frame.x = figma.viewport.center.x - width / 2;
    frame.y = figma.viewport.center.y - height / 2;
    frame.setPluginData('ochen-composition', '1');
    frame.setPluginData('ochen-template', square ? 'diagonal-hero-v1' : 'grid-v1');
    if (square) {
      const backdrop = BACKDROPS.find(a => a.size === request.size);
      if (!backdrop) throw new Error('Не найден исходный фон.');
      const background = figma.createNodeFromSvg(backdrop.svg);
      frame.appendChild(background);
      background.name = 'Фон — исходный фиолетовый';
      background.rescale(width / backdrop.width);
      background.x = 0;
      background.y = 0;
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
    figma.ui.postMessage({ type: 'success', message: `Создано предметов: ${selected.length}${square && request.backgroundDuplicate ? ' + 1 фоновый дубль' : ''}. ${square ? 'Главный: ' + selected[0].name + '.' : 'Простая раскладка.'} Каждый предмет можно редактировать в Figma.` });
  } catch (error) {
    if (frame && !frame.removed) frame.remove();
    console.error('Ochen Composer:', error);
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось создать композицию.' });
  } finally {
    busy = false;
    figma.ui.postMessage({ type: 'busy', value: false });
  }
};
