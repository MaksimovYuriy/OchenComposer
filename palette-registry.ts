let personalPalettes: Palette[] = [];
let personalPaletteLoad: Promise<void> | undefined;

function sendPaletteCatalog(selectedKey?: string): void {
  figma.ui.postMessage({type:'palettes',entries:[
    ...PALETTE_LIBRARY.map(palette=>({key:'builtin:'+palette.id,palette,warnings:paletteWarnings(palette)})),
    ...personalPalettes.map(palette=>({key:'custom:'+palette.id,palette,warnings:paletteWarnings(palette)})),
  ],selectedKey});
}

function loadPersonalPalettes(): Promise<void> {
  if(personalPaletteLoad)return personalPaletteLoad;
  personalPaletteLoad=(async()=>{
    if(!figma.clientStorage)return;
    try{
      const stored:unknown=await figma.clientStorage.getAsync('ochen-personal-palettes-v1');
      if(stored!==undefined){
        if(!Array.isArray(stored)||stored.length>10)throw new Error('Неверный формат хранилища палитр.');
        const checked=stored.map(validatePalette);
        if(new Set(checked.map(p=>p.id)).size!==checked.length || checked.some(p=>PALETTE_LIBRARY.some(b=>b.id===p.id)))throw new Error('Повторяющиеся или зарезервированные id палитр.');
        personalPalettes=checked;
      }
    }catch(error){figma.ui.postMessage({type:'palette-notice',message:'Личные палитры не загружены. Встроенные схемы доступны. '+(error instanceof Error?error.message:'')});}
    sendPaletteCatalog();
  })();
  return personalPaletteLoad;
}

function requestedPalette(value: unknown): Palette {
  if(value===undefined)return validatePalette(PALETTE_LIBRARY.find(p=>p.id==='violet'));
  if(typeof value==='string'){
    const found=[...PALETTE_LIBRARY,...personalPalettes].find(p=>p.id===value);
    if(!found)throw new Error('Палитра не найдена. Выберите схему заново.');
    return validatePalette(found);
  }
  const checked=validatePalette(value);
  const reserved=PALETTE_LIBRARY.find(p=>p.id===checked.id);
  if(reserved && COLOR_ROLES.some(role=>reserved.colors[role]!==checked.colors[role]))throw new Error('id встроенной схемы зарезервирован. Задайте пользовательской палитре другой id.');
  return checked;
}

async function importPersonalPalette(input: unknown): Promise<{palette:Palette;persisted:boolean}> {
  await loadPersonalPalettes();
  const palette=validatePalette(input);
  if(PALETTE_LIBRARY.some(p=>p.id===palette.id))throw new Error('Измените id: он занят встроенной схемой.');
  const next=personalPalettes.filter(p=>p.id!==palette.id);
  if(next.length>=10)throw new Error('Можно хранить до 10 личных схем. Для обновления используйте id существующей личной схемы.');
  next.push(palette);
  let persisted=true;
  try{await figma.clientStorage.setAsync('ochen-personal-palettes-v1',next);}catch{persisted=false;}
  personalPalettes=next;
  sendPaletteCatalog('custom:'+palette.id);
  return {palette,persisted};
}
