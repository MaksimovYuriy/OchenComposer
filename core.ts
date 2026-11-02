type Asset = {
  id: string; name: string; role: 'main' | 'background'; size: 'large' | 'small';
  source: string; width: number; height: number; svg: string;
};
type Placement = { asset: Asset; x: number; y: number; scale: number };

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
