type Asset = {
  id: string; name: string; role: 'main' | 'background'; size: 'large' | 'small';
  source: string; width: number; height: number; svg: string;
};
type Placement = { asset: Asset; x: number; y: number; scale: number };
type Backdrop = { size: 'large' | 'small'; svg: string; width: number; height: number };
type ScenePlacement = Placement & { role: 'main' | 'support' | 'background'; order: number };
type TemplateId = 'diagonal' | 'focus' | 'terrace';
type ScenePlan = { template: TemplateId; seed: number; placements: ScenePlacement[] };
type Zone = { x: number; y: number; w: number; h: number };

function composeScene(assets: Asset[], backgrounds: Asset[], duplicate: boolean,
  width: number, height: number, template: string, seed: number): ScenePlan {
  if (!assets.length || assets.length > 8) throw new Error('Допустимо от 1 до 8 предметов.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Seed: целое число от 0 до 2147483647.');
  if (![width, height].every(v => Number.isFinite(v) && v >= 300 && v <= 2000)) throw new Error('Недопустимый размер холста.');
  const templates: TemplateId[] = ['diagonal', 'focus', 'terrace'];
  if (template !== 'auto' && !templates.includes(template as TemplateId)) throw new Error('Неизвестная схема композиции.');
  const chosen = template === 'auto' ? templates[seed % 3] : template as TemplateId;
  let state = (seed + 1) >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const result: ScenePlacement[] = [];
  function fit(asset: Asset, role: ScenePlacement['role'], zone: Zone): void {
    if (![asset.width, asset.height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Некорректные размеры предмета.');
    const factor = .92 + random() * .06;
    const scale = Math.min(zone.w * width / asset.width, zone.h * height / asset.height) * factor;
    const remainingW = zone.w * width - asset.width * scale;
    const remainingH = zone.h * height - asset.height * scale;
    result.push({ asset, role, order: result.length, scale,
      x: zone.x * width + remainingW * (.35 + random() * .30),
      y: zone.y * height + remainingH * (.35 + random() * .30) });
  }
  if (duplicate) {
    const background = backgrounds.find(a => a.id === assets[0].id && a.size === assets[0].size);
    if (!background) throw new Error('Не найден фоновый вариант главного предмета.');
    fit(background, 'background', chosen === 'terrace'
      ? { x: .04, y: .39, w: .45, h: .49 } : { x: .04, y: .05, w: .43, h: .38 });
  }
  let hero: Zone;
  let supports: Zone[] = [];
  const count = assets.length - 1;
  function strip(zone: Zone, horizontal: boolean): Zone[] {
    return Array.from({ length: count }, (_, i) => horizontal
      ? { x: zone.x + zone.w * i / count, y: zone.y, w: zone.w / count * .90, h: zone.h }
      : { x: zone.x, y: zone.y + zone.h * i / count, w: zone.w, h: zone.h / count * .90 });
  }
  if (!count) {
    hero = chosen === 'terrace' ? { x: .13, y: .08, w: .76, h: .73 }
      : chosen === 'focus' ? { x: .12, y: .15, w: .76, h: .72 }
      : { x: .15, y: .30, w: .78, h: .64 };
  } else if (chosen === 'terrace') {
    hero = { x: .12, y: .07, w: .76, h: .54 };
    supports = strip({ x: .07, y: .70, w: .87, h: .24 }, true);
  } else if (chosen === 'focus') {
    if (height > width && count <= 2) {
      hero = { x: .08, y: .26, w: .84, h: .46 };
      supports = [{ x: .58, y: .05, w: .34, h: .17 }, { x: .08, y: .80, w: .35, h: .15 }].slice(0, count);
    } else if (height > width) {
      hero = { x: .08, y: .10, w: .84, h: .50 };
      supports = strip({ x: .08, y: .72, w: .84, h: .22 }, true);
    } else {
      hero = { x: .06, y: .18, w: .59, h: .68 };
      supports = strip({ x: .73, y: .08, w: .22, h: .84 }, false);
    }
  } else if (width === height && count <= 2) {
    hero = count === 1 ? { x: .08, y: .36, w: .72, h: .56 } : { x: .06, y: .36, w: .60, h: .56 };
    supports = [{ x: .49, y: .08, w: .44, h: .28 }, { x: .72, y: .60, w: .22, h: .26 }].slice(0, count);
  } else if (height > width) {
    hero = { x: .10, y: .40, w: .80, h: .53 };
    supports = strip({ x: .08, y: .07, w: .85, h: .25 }, true);
  } else {
    hero = { x: .06, y: .27, w: .56, h: .65 };
    supports = strip({ x: .69, y: .08, w: .25, h: .84 }, false);
  }
  fit(assets[0], 'main', hero);
  assets.slice(1).forEach((asset, index) => fit(asset, 'support', supports[(index + seed % count) % count]));
  return { template: chosen, seed, placements: result };
}

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
