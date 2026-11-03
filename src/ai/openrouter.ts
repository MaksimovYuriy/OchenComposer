function semanticHttpError(status:number):Error {
  const messages:Record<number,string>={401:'Неверный или отозванный ключ OpenRouter.',402:'Квота или баланс аккаунта исчерпаны.',403:'API отклонил запрос: проверьте доступность сервиса и разрешения ключа.',404:'Бесплатная модель недоступна. Выберите другую модель.',429:'Достигнут лимит запросов. Повторите позже.'};
  return new Error(messages[status]||'Сервис ИИ временно недоступен. Повторите позже.');
}
async function semanticApi(path:string,body?:Record<string,unknown>,timeoutMs=45000):Promise<unknown> {
  if(!semanticKey)throw new Error('Сначала добавьте API-ключ в настройках ИИ.');
  let timer:number|undefined;
  try{
    const operation=(async()=>{
      let response:FetchResponse;
      try{response=await fetch('https://openrouter.ai/api/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+semanticKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
      catch{throw new Error('Не удалось подключиться к OpenRouter. Проверьте интернет и доступность сервиса.');}
      if(!response.ok)throw semanticHttpError(response.status);
      const text=await response.text();
      if(text.length>200000)throw new Error('Сервис вернул слишком большой ответ.');
      try{return JSON.parse(text) as unknown;}catch{throw new Error('Сервис вернул некорректный JSON.');}
    })();
    return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Время ожидания OpenRouter истекло. Проверьте интернет и доступность сервиса, затем повторите.')),timeoutMs);})]);
  }finally{if(timer!==undefined)clearTimeout(timer);}
}
