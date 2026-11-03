async function interpretMetaphor(text:unknown,context?:SemanticContext,verify?:(plan:SemanticPlan)=>void):Promise<{plan:SemanticPlan;model:string}> {
  const original=semanticRequest(text,semanticModel,context);
  let request=original;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const result=await requestSemanticPlan(request);
      if(result.plan.status==='ok'&&verify){try{verify(result.plan);}catch(error){throw new SemanticResponseError(error instanceof Error?error.message:'План не прошёл проверку геометрии.');}}
      return result;
    }catch(error){
      // Network/auth/quota failures must not silently consume another request.
      if(!(error instanceof SemanticResponseError)||attempt===1)throw error;
      figma.ui.postMessage({type:'ai-progress',message:'План требует исправления. ИИ подбирает выполнимую композицию — попытка 2 из 2.'});
      request={...original,messages:[...(original.messages as unknown[]),{role:'user',content:'Техническая проверка отклонила предыдущую композицию: '+error.message.slice(0,700)+' Исправь формат или выбери более простую выполнимую композицию с тем же смыслом. Не повторяй неисполнимое условие. Верни полный JSON по исходной схеме. Это замечание проверяющего к плану, не новая метафора.'}]};
    }
  }
  throw new Error('Не удалось подобрать выполнимую композицию.');
}
