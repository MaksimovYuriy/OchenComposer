type Asset = {
  id: string; name: string; role: 'main' | 'background'; size: 'large' | 'small';
  source: string; width: number; height: number; svg: string;
};
type Placement = { asset: Asset; x: number; y: number; scale: number };
type Backdrop = { size: 'large' | 'small'; svg: string; width: number; height: number };
type ScenePlacement = Placement & { role: 'main' | 'support' | 'background'; order: number };

// Hero below/left, accents above/right; foreground fit rectangles do not overlap.
function composeSquare(assets: Asset[], backgrounds: Asset[], duplicate: boolean): ScenePlacement[] {
  if (!assets.length || assets.length > 8) throw new Error('Допустимо от 1 до 8 предметов.');
  const result: ScenePlacement[] = [];
  function fit(asset: Asset, role: ScenePlacement['role'], cx: number, cy: number, w: number, h: number): void {
    if (![asset.width, asset.height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Некорректные размеры предмета.');
    const scale = Math.min(w / asset.width, h / asset.height);
    result.push({ asset, role, order: result.length, scale, x: cx - asset.width * scale / 2, y: cy - asset.height * scale / 2 });
  }
  if (duplicate) {
    const background = backgrounds.find(a => a.id === assets[0].id && a.size === assets[0].size);
    if (!background) throw new Error('Не найден фоновый вариант главного предмета.');
    fit(background, 'background', 270, 250, 440, 380);
  }
  if (assets.length === 1) {
    fit(assets[0], 'main', 540, 590, 780, 660);
  } else if (assets.length <= 3) {
    fit(assets[0], 'main', assets.length === 2 ? 440 : 360, 640, assets.length === 2 ? 720 : 600, 560);
    fit(assets[1], 'support', 710, 220, 440, 280);
    if (assets[2]) fit(assets[2], 'support', 830, 730, 220, 260);
  } else {
    fit(assets[0], 'main', 340, 600, 560, 640);
    const count = assets.length - 1;
    const slot = 840 / count;
    assets.slice(1).forEach((asset, index) => fit(asset, 'support', 805, 80 + slot * (index + .5), 250, slot * .80));
  }
  return result;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function resolveNames(text: string, assets: Asset[]): Asset[] {
  if (text.length > 1000) throw new Error('Запрос слишком длинный: максимум 1000 символов.');
  const tokens = text.split(/[,;\n]+/).map(normalizeName).filter(Boolean);
  if (!tokens.length) throw new Error('Введите названия предметов через запятую.');
  if (tokens.length > 8) throw new Error('В первой версии можно разместить не больше 8 предметов.');
  const aliases: Record<string, string[]> = {
    book: ['книги'], phone: ['смартфон'], coin: ['монеты'], puzzle: ['пазл'],
    flowers: ['цветок'], headphones: ['наушник'], wallet: ['кошельки'],
  };
  const missing: string[] = [];
  const result: Asset[] = [];
  for (const token of tokens) {
    const matches = assets.filter(asset => normalizeName(asset.name) === token || aliases[asset.id]?.includes(token));
    if (matches.length === 1) result.push(matches[0]);
    else missing.push(`${token}${matches.length > 1 ? ' (несколько совпадений)' : ''}`);
  }
  if (missing.length) throw new Error(`Не удалось выбрать: ${missing.join(', ')}. Доступны: ${assets.map(asset => asset.name).join(', ')}.`);
  return result;
}

// A conservative first layout; reference-based composition templates follow later.
function layoutObjects(assets: Asset[], width: number, height: number): Placement[] {
  if (!assets.length || assets.length > 8) throw new Error('Некорректное число предметов.');
  if (![width, height].every(value => Number.isFinite(value) && value >= 300 && value <= 2000)) {
    throw new Error('Недопустимый размер холста.');
  }
  const columns = Math.ceil(Math.sqrt(assets.length * width / height));
  const rows = Math.ceil(assets.length / columns);
  const margin = 60;
  const cellW = (width - margin * 2) / columns;
  const cellH = (height - margin * 2) / rows;
  return assets.map((asset, index) => {
    if (![asset.width, asset.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Некорректные размеры предмета.');
    const scale = Math.min(cellW * .82 / asset.width, cellH * .82 / asset.height);
    const row = Math.floor(index / columns);
    const inRow = Math.min(columns, assets.length - row * columns);
    return { asset, scale,
      x: margin + (columns - inRow) * cellW / 2 + (index % columns) * cellW + (cellW - asset.width * scale) / 2,
      y: margin + row * cellH + (cellH - asset.height * scale) / 2 };
  });
}
