type Asset = {
  id: string; name: string; role: 'main' | 'background'; size: 'large' | 'small';
  source: string; width: number; height: number; svg: string;
  rotationAngles?: number[];
};
type Placement = { asset: Asset; x: number; y: number; scale: number };
type Backdrop = { size: 'large' | 'small'; svg: string; width: number; height: number };
type Matrix = [[number, number, number], [number, number, number]];
type Bounds = { x: number; y: number; width: number; height: number };
type ScenePlacement = Placement & { role: 'main' | 'support' | 'background'; order: number;
  rotation: number; pivot: { x: number; y: number }; transform: Matrix; bounds: Bounds };
type StateMode = 'color' | 'mixed' | 'mono';
type TemplateId = 'diagonal' | 'focus' | 'terrace';
type ScenePlan = { template: TemplateId; seed: number; placements: ScenePlacement[] };
type Zone = { x: number; y: number; w: number; h: number };

function composeScene(assets: Asset[], backgrounds: Asset[], duplicate: boolean,
  width: number, height: number, template: string, seed: number, stateMode: StateMode = 'color'): ScenePlan {
  if (!assets.length || assets.length > 8) throw new Error('Допустимо от 1 до 8 предметов.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Seed: целое число от 0 до 2147483647.');
  if (!['color', 'mixed', 'mono'].includes(stateMode)) throw new Error('Неизвестный режим состояний.');
  if (![width, height].every(v => Number.isFinite(v) && v >= 300 && v <= 2000)) throw new Error('Недопустимый размер холста.');
  const templates: TemplateId[] = ['diagonal', 'focus', 'terrace'];
  if (template !== 'auto' && !templates.includes(template as TemplateId)) throw new Error('Неизвестная схема композиции.');
  const chosen = template === 'auto' ? templates[seed % 3] : template as TemplateId;
  let state = (seed + 1) >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const pending: { asset: Asset; role: ScenePlacement['role']; zone: Zone; rotation: number }[] = [];
  function fit(asset: Asset, role: ScenePlacement['role'], zone: Zone): void {
    if (![asset.width, asset.height].every(v => Number.isFinite(v) && v > 0)) throw new Error('Некорректные размеры предмета.');
    const angles = asset.rotationAngles || [0];
    if (!angles.length || angles.some(angle => !Number.isFinite(angle) || Math.abs(angle) > 15)) throw new Error('Недопустимая политика углов.');
    const rotation = angles[(seed + pending.length + templates.indexOf(chosen)) % angles.length];
    const monochrome = role !== 'background' && (stateMode === 'mono' || (stateMode === 'mixed' && role === 'support' && pending.filter(p => p.role === 'support').length % 2 === 0));
    if (monochrome) {
      const variant = backgrounds.find(a => a.id === asset.id && a.size === asset.size);
      if (!variant || variant.width !== asset.width || variant.height !== asset.height) throw new Error('Не найден совместимый монохромный исходник.');
      asset = variant;
    }
    pending.push({ asset, role, zone, rotation });
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
    const weights = assets.slice(1).map(a => horizontal ? a.width : a.height);
    const sum = weights.reduce((total, value) => total + value, 0);
    let offset = 0;
    return weights.map(weight => {
      const share = weight / sum;
      const slot = horizontal
        ? { x: zone.x + zone.w * offset, y: zone.y, w: zone.w * share * .90, h: zone.h }
        : { x: zone.x, y: zone.y + zone.h * offset, w: zone.w, h: zone.h * share * .90 };
      offset += share;
      return slot;
    });
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
  assets.slice(1).forEach((asset, index) => fit(asset, 'support', supports[index]));
  // Exported at 1x from the original library (confirmed by the owner).
  // Preserve relative dimensions: one scale for every foreground and background instance.
  const scale = Math.min(...pending.filter(p => p.role !== 'background').map(({asset,zone,rotation}) => {
    const bounds = rotatedSize(asset.width, asset.height, rotation);
    return Math.min(zone.w * width / bounds.width, zone.h * height / bounds.height);
  }))
    * (.92 + random() * .06);
  const placements = pending.map(({asset,role,zone,rotation},order) => {
    const size = rotatedSize(asset.width * scale, asset.height * scale, rotation);
    const remainingW = zone.w * width - size.width;
    const remainingH = zone.h * height - size.height;
    const left = Math.max(0, Math.min(width - size.width, zone.x * width + remainingW * (.35 + random() * .30)));
    const top = Math.max(0, Math.min(height - size.height, zone.y * height + remainingH * (.35 + random() * .30)));
    const transform = centeredTransform(asset.width * scale, asset.height * scale, rotation, left + size.width / 2, top + size.height / 2);
    return { asset, role, order, scale, rotation, pivot: { x: asset.width / 2, y: asset.height / 2 }, transform,
      x: transform[0][2], y: transform[1][2], bounds: { x: left, y: top, ...size } };
  });
  // Background duplicates may overlap, but must also remain inside the canvas.
  if (placements.some(p => p.bounds.width > width + .001 || p.bounds.height > height + .001)) {
    throw new Error('Набор не помещается с выбранными поворотами. Измените формат или вариант.');
  }
  // Monochrome instances are behind colored instances; keep semantic roles separate.
  placements.sort((a, b) => Number(a.asset.role !== 'background') - Number(b.asset.role !== 'background'));
  return { template: chosen, seed, placements: placements.map((placement, order) => ({ ...placement, order })) };
}

function rotatedSize(width: number, height: number, angle: number): { width: number; height: number } {
  const radians = angle * Math.PI / 180;
  const c = Math.abs(Math.cos(radians)), s = Math.abs(Math.sin(radians));
  return { width: c * width + s * height, height: s * width + c * height };
}

function centeredTransform(width: number, height: number, angle: number, cx: number, cy: number): Matrix {
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return [[c, -s, cx - c * width / 2 + s * height / 2], [s, c, cy - s * width / 2 - c * height / 2]];
}

function stateReplacementScale(source: Asset, target: Asset, width: number, height: number): number {
  if (source.id !== target.id || source.size !== target.size || source.width !== target.width || source.height !== target.height) {
    throw new Error('Варианты предмета не имеют подтверждённого общего размера.');
  }
  const scale = width / source.width;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(height - source.height * scale) > Math.max(.1, height * .001)) {
    throw new Error('Предмет растянут по осям. Восстановите его пропорции перед переключением.');
  }
  return scale;
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
