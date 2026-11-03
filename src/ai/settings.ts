const AI_STORAGE_KEY='ochen-openrouter-settings-v1';
let semanticKey='',semanticModel='openrouter/free',semanticRemember=false;
let semanticSettingsLoaded=false;
function sendSemanticSettings():void {
  figma.ui.postMessage({type:'ai-settings',hasKey:!!semanticKey,model:semanticModel,remember:semanticRemember});
}
async function loadSemanticSettings():Promise<void> {
  if(semanticSettingsLoaded)return;semanticSettingsLoaded=true;
  try{
    const value=await figma.clientStorage.getAsync(AI_STORAGE_KEY);
    if(value&&typeof value.key==='string'&&value.key.length<512){validateSemanticModel(value.model);semanticKey=value.key;semanticModel=value.model;semanticRemember=true;}
  }catch{/* Offline names and session keys work even without storage. */}
  sendSemanticSettings();
}
async function configureSemanticSettings(request:Record<string,unknown>):Promise<void> {
  validateSemanticModel(request.model);
  const key=typeof request.key==='string'&&request.key.trim()?request.key.trim():semanticKey;
  if(!key||key.length>512||/\s/.test(key))throw new Error('Введите корректный API-ключ OpenRouter.');
  const remember=request.remember===true;
  // Remove any old persisted key before switching to session-only mode.
  try{
    if(remember)await figma.clientStorage.setAsync(AI_STORAGE_KEY,{key,model:request.model});
    else if(semanticRemember)await figma.clientStorage.deleteAsync(AI_STORAGE_KEY);
  }catch{throw new Error('Не удалось обновить локальное хранилище ключа. Повторите настройку.');}
  semanticKey=key;semanticModel=request.model;semanticRemember=remember;sendSemanticSettings();
}
async function deleteSemanticSettings():Promise<void> {
  semanticKey='';
  try{await figma.clientStorage.deleteAsync(AI_STORAGE_KEY);semanticRemember=false;}
  catch{sendSemanticSettings();throw new Error('Ключ удалён из сессии, но хранилище недоступно. Повторите удаление сохранённого ключа.');}
  sendSemanticSettings();
}
