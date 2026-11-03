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
type CompositionQuality = { version: 'composition-v2'; score: number; density: number; balance: number; minSide: number; candidates: number; strategy: string; warnings: string[] };
type ScenePlan = { template: TemplateId; seed: number; placements: ScenePlacement[]; quality?: CompositionQuality };
type Zone = { x: number; y: number; w: number; h: number };

function composeZonedScene(assets: Asset[], backgrounds: Asset[], duplicate: boolean,
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

// Search only changes whole-object placement, permitted angles and one shared scale.
// A slicing tree packs unequal source rectangles without imposing identical slots.
type LayoutTree = { width: number; height: number; index?: number; horizontal?: boolean; first?: LayoutTree; second?: LayoutTree };

function compositionQuality(plan: ScenePlan, width: number, height: number): CompositionQuality {
  const items=plan.placements.filter(p=>p.role!=='background');
  const area=width*height;
  let mass=0,cx=0,cy=0;
  const density=items.reduce((sum,p)=>sum+p.bounds.width*p.bounds.height/area,0);
  for(const p of items){
    const weight=p.bounds.width*p.bounds.height*(p.asset.role==='background'?.45:1);
    mass+=weight;cx+=(p.bounds.x+p.bounds.width/2)*weight;cy+=(p.bounds.y+p.bounds.height/2)*weight;
  }
  const balance=Math.hypot(cx/mass/width-.5,cy/mass/height-.5);
  const minSide=Math.min(...items.map(p=>Math.min(p.bounds.width,p.bounds.height)));
  const hero=items.find(p=>p.role==='main')!;
  const target=plan.template==='diagonal'?[.38,.62]:plan.template==='terrace'?[.5,.32]:[.40,.5];
  const emphasis=Math.hypot((hero.bounds.x+hero.bounds.width/2)/width-target[0],(hero.bounds.y+hero.bounds.height/2)/height-target[1]);
  const nearest=items.length===1?0:items.reduce((sum,p)=>sum+Math.min(...items.filter(q=>q!==p).map(q=>{
    const a=p.bounds,b=q.bounds;
    return Math.hypot(Math.max(0,a.x-b.x-b.width,b.x-a.x-a.width)/width,Math.max(0,a.y-b.y-b.height,b.y-a.y-a.height)/height);
  })),0)/items.length;
  const background=plan.placements.find(p=>p.role==='background');
  let backgroundPenalty=0;
  if(background){
    const b=background.bounds,ownArea=b.width*b.height;
    const covered=items.reduce((sum,p)=>{const a=p.bounds;return sum+Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));},0)/ownArea;
    // A duplicate should form a second plane, without disappearing behind its original.
    backgroundPenalty=Math.max(0,.12-covered)*.7+Math.max(0,covered-.65)*1.5;
  }
  const score=100-110*Math.abs(density-.43)-85*balance-24*emphasis-60*Math.max(0,nearest-.08)-backgroundPenalty*35-35*Math.max(0,(48-minSide)/48);
  const warnings:string[]=[];
  if(minSide<48)warnings.push('Мелкие предметы: попробуйте другой формат или сократите набор.');
  if(density<.20)warnings.push('Разреженная композиция: исходные пропорции ограничивают заполнение.');
  return {version:'composition-v2',score,density,balance,minSide,candidates:1,strategy:'zones',warnings};
}

function composeScene(assets: Asset[], backgrounds: Asset[], duplicate: boolean,
  width: number, height: number, template: string, seed: number, stateMode: StateMode = 'color'): ScenePlan {
  // This also validates input, state variants and angle policies before any search.
  const baseline=composeZonedScene(assets,backgrounds,duplicate,width,height,template,seed,stateMode);
  const candidates:ScenePlan[]=[baseline];
  const templates:TemplateId[]=template==='auto'?['diagonal','focus','terrace']:[template as TemplateId];
  let randomState=(seed+1)>>>0;
  const random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
  for(const style of templates){
    // Preserve explicit membership and states; rotations remain within library policy.
    const source=composeZonedScene(assets,backgrounds,duplicate,width,height,style,seed,stateMode);
    const foreground=source.placements.filter(p=>p.role!=='background').sort((a,b)=>Number(b.role==='main')-Number(a.role==='main'));
    for(let variant=0;variant<16;variant++){
      const rotated=foreground.map(p=>rotatedSize(p.asset.width,p.asset.height,p.rotation));
      const gap=Math.max(...rotated.map(b=>Math.min(b.width,b.height)))*(.045+random()*.055);
      function tree(indices:number[],depth:number):LayoutTree {
        if(indices.length===1)return {...rotated[indices[0]],index:indices[0]};
        const split=variant<4&&depth===0?1:1+Math.floor(random()*(indices.length-1));
        const first=tree(indices.slice(0,split),depth+1),second=tree(indices.slice(split),depth+1);
        const horizontal=depth===0?(style==='terrace'?false:variant%2===0):random()>.5;
        return {first,second,horizontal,width:horizontal?first.width+second.width+gap:Math.max(first.width,second.width),height:horizontal?Math.max(first.height,second.height):first.height+second.height+gap};
      }
      const root=tree(foreground.map((_,i)=>i),0);
      const maxScale=Math.min(width*.86/root.width,height*.84/root.height);
      const boxArea=rotated.reduce((sum,b)=>sum+b.width*b.height,0);
      const scale=Math.min(maxScale,Math.sqrt(width*height*(.39+random()*.09)/boxArea));
      const positions:Bounds[]=[];
      function place(node:LayoutTree,x:number,y:number):void {
        if(node.index!==undefined){positions[node.index]={x,y,width:node.width*scale,height:node.height*scale};return;}
        const a=node.first!,b=node.second!;
        const align=variant%3===0?.5:.22+random()*.56;
        if(node.horizontal){
          place(a,x,y+(node.height-a.height)*scale*(style==='diagonal'?.85:align));
          place(b,x+(a.width+gap)*scale,y+(node.height-b.height)*scale*(style==='diagonal'?.15:1-align));
        }else if(style==='diagonal'){
          place(b,x+(node.width-b.width)*scale*.78,y);
          place(a,x+(node.width-a.width)*scale*.22,y+(b.height+gap)*scale);
        }else{
          place(a,x+(node.width-a.width)*scale*align,y);
          place(b,x+(node.width-b.width)*scale*(1-align),y+(a.height+gap)*scale);
        }
      }
      place(root,(width-root.width*scale)/2,(height-root.height*scale)/2);
      // Center the visual mass, leaving a small margin around the entire cluster.
      let mass=0,cx=0,cy=0;
      positions.forEach((b,i)=>{const weight=b.width*b.height*(foreground[i].asset.role==='background'?.45:1);mass+=weight;cx+=(b.x+b.width/2)*weight;cy+=(b.y+b.height/2)*weight;});
      const dx=Math.max(width*.06-Math.min(...positions.map(b=>b.x)),Math.min(width*.94-Math.max(...positions.map(b=>b.x+b.width)),width*.5-cx/mass));
      const dy=Math.max(height*.06-Math.min(...positions.map(b=>b.y)),Math.min(height*.94-Math.max(...positions.map(b=>b.y+b.height)),height*.5-cy/mass));
      const placements=foreground.map((p,i)=>{
        const bounds={...positions[i],x:positions[i].x+dx,y:positions[i].y+dy};
        const transform=centeredTransform(p.asset.width*scale,p.asset.height*scale,p.rotation,bounds.x+bounds.width/2,bounds.y+bounds.height/2);
        return {...p,scale,bounds,transform,x:transform[0][2],y:transform[1][2]};
      });
      if(duplicate){
        const bg=source.placements.find(p=>p.role==='background')!;
        const size=rotatedSize(bg.asset.width*scale,bg.asset.height*scale,bg.rotation),hero=placements[0].bounds;
        if(size.width>width||size.height>height)continue;
        const left=Math.max(width*.025,Math.min(width-size.width-width*.025,hero.x-size.width*.32));
        const top=Math.max(height*.025,Math.min(height-size.height-height*.025,hero.y-size.height*.42));
        const bounds={x:left,y:top,...size};
        const transform=centeredTransform(bg.asset.width*scale,bg.asset.height*scale,bg.rotation,left+size.width/2,top+size.height/2);
        placements.unshift({...bg,scale,bounds,transform,x:transform[0][2],y:transform[1][2]});
      }
      placements.sort((a,b)=>Number(a.asset.role!=='background')-Number(b.asset.role!=='background'));
      if(placements.some(p=>{
        const b=p.bounds;
        return ![b.x,b.y,b.width,b.height,p.scale].every(Number.isFinite)||b.x<-.001||b.y<-.001||b.x+b.width>width+.001||b.y+b.height>height+.001;
      }))continue;
      const plan:ScenePlan={template:style,seed,placements:placements.map((p,order)=>({...p,order}))};
      plan.quality={...compositionQuality(plan,width,height),strategy:'cluster'};
      candidates.push(plan);
    }
  }
  baseline.quality=compositionQuality(baseline,width,height);
  // Stable ties keep reproducibility; seed changes candidate geometry, not object identity.
  candidates.sort((a,b)=>b.quality!.score-a.quality!.score);
  const chosen=candidates[0];chosen.quality!.candidates=candidates.length;
  return chosen;
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
