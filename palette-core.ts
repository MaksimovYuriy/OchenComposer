type ColorRole = 'surface' | 'mid' | 'deep' | 'accentLight' | 'accentStrong' | 'accentSoft' | 'ink' | 'paper';
type PaletteArea = 'background' | 'monochrome' | 'object';
type Palette = { schemaVersion: 1; id: string; name: string; version: number; colors: Record<ColorRole, string> };
const COLOR_ROLES: ColorRole[] = ['surface','mid','deep','accentLight','accentStrong','accentSoft','ink','paper'];

function validatePalette(input: unknown): Palette {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Палитра должна быть JSON-объектом.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['schemaVersion','id','name','version','colors','source'].includes(key))) throw new Error('Неизвестные поля палитры. Используйте файл-пример.');
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.version) || (value.version as number) < 1) throw new Error('Требуются schemaVersion: 1 и положительная целая version.');
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id)) throw new Error('id палитры: до 64 латинских букв нижнего регистра, цифр, _ или -.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('Название палитры: от 1 до 80 символов.');
  if (!value.colors || typeof value.colors !== 'object' || Array.isArray(value.colors)) throw new Error('В colors требуются восемь цветовых ролей.');
  const raw = value.colors as Record<string, unknown>;
  if (Object.keys(raw).length !== COLOR_ROLES.length || Object.keys(raw).some(key => !COLOR_ROLES.includes(key as ColorRole))) throw new Error('В colors должны быть ровно восемь ролей из файла-примера.');
  const colors = {} as Record<ColorRole,string>;
  for (const role of COLOR_ROLES) {
    const hex = raw[role];
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Роль ${role}: требуется HEX #RRGGBB.`);
    colors[role] = hex.toUpperCase();
  }
  for (const [left,right] of [['surface','deep'],['mid','deep'],['ink','paper'],['ink','surface'],['ink','accentLight'],['ink','accentStrong'],['ink','accentSoft']] as [ColorRole,ColorRole][]) {
    if (colors[left] === colors[right]) throw new Error(`Роли ${left} и ${right} совпадают: пропадут контуры или детали.`);
  }
  return {schemaVersion:1,id:value.id,name:value.name.trim(),version:value.version as number,colors};
}

function paletteWarnings(palette: Palette): string[] {
  function luminance(hex: string): number {
    const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  }
  const warnings: string[] = [];
  for(const [a,b] of [['surface','deep'],['paper','ink']] as [ColorRole,ColorRole][]){
    const x=luminance(palette.colors[a]),y=luminance(palette.colors[b]);
    if((Math.max(x,y)+.05)/(Math.min(x,y)+.05)<1.5)warnings.push(`Малый контраст ${a}/${b}: проверьте читаемость.`);
  }
  for(const hex of new Set(COLOR_ROLES.map(role=>palette.colors[role]))){
    const roles=COLOR_ROLES.filter(role=>palette.colors[role]===hex);
    if(roles.length>1)warnings.push(`Совпадают ${roles.join('/')}: проверьте соседние детали.`);
  }
  return warnings;
}

function sourceColorRole(color: RGB, area: PaletteArea): ColorRole {
  if(!color || [color.r,color.g,color.b].some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error('Повреждены сохранённые значения цвета.');
  const hex = '#'+[color.r,color.g,color.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const original=PALETTE_LIBRARY.find(p=>p.id==='violet');
  if(!original)throw new Error('Не найдена исходная схема библиотеки.');
  const role=COLOR_ROLES.find(role=>original.colors[role]===hex);
  if(!role)throw new Error(`Неподдерживаемый исходный цвет ${hex}. Ручные новые цвета нужно вернуть к исходной схеме.`);
  if(!PALETTE_ROLES[role].areas.includes(area))throw new Error(`Цвет роли ${role} недопустим для ${area}.`);
  return role;
}

function paletteRgb(hex: string): RGB {
  return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255};
}

function mapPalettePaints(paints: readonly Paint[], palette: Palette, area: PaletteArea): Paint[] {
  return paints.map(paint=>{
    if(!paint || typeof paint!=='object')throw new Error('Повреждены сохранённые заливки.');
    if('boundVariables' in paint && paint.boundVariables && Object.keys(paint.boundVariables).length)throw new Error('Снимите привязки переменных перед перекраской.');
    if(paint.type==='SOLID')return {...paint,color:paletteRgb(palette.colors[sourceColorRole(paint.color,area)])};
    if(paint.type==='GRADIENT_LINEAR'||paint.type==='GRADIENT_RADIAL'||paint.type==='GRADIENT_ANGULAR'||paint.type==='GRADIENT_DIAMOND'){
      return {...paint,gradientStops:paint.gradientStops.map(stop=>{
        if('boundVariables' in stop && stop.boundVariables && Object.keys(stop.boundVariables).length)throw new Error('Снимите привязки переменных градиента перед перекраской.');
        return {...stop,color:{...stop.color,...paletteRgb(palette.colors[sourceColorRole(stop.color,area)])}};
      })};
    }
    throw new Error(`Заливка ${paint.type} не поддерживается для перекраски векторной библиотеки.`);
  });
}
