const ENDPOINT='https://api.exa.ai/search';

export async function testExaConnection(env=process.env,fetchImpl=fetch){
  const key=String(env.EXA_API_KEY||'').trim();
  if(!key)return {ok:false,provider:'Exa',error:'أضف EXA_API_KEY في متغيرات Railway.'};
  let response;
  try{response=await fetchImpl(ENDPOINT,{method:'POST',signal:AbortSignal.timeout(25000),headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({query:'Exa API documentation',numResults:1,type:'auto'})});}
  catch(error){throw Object.assign(new Error(error?.name==='TimeoutError'?'انتهت مهلة Exa. أعد المحاولة.':'تعذر الوصول إلى Exa من Railway.'),{status:502});}
  if(response.status===401||response.status===403)throw Object.assign(new Error('رفض Exa المفتاح؛ تحقق من EXA_API_KEY.'),{status:502});
  if(response.status===429)throw Object.assign(new Error('بلغ حساب Exa حد الطلبات أو انتهت الحصة.'),{status:429});
  if(!response.ok)throw Object.assign(new Error(`أعاد Exa حالة HTTP ${response.status}.`),{status:502});
  let data;try{data=await response.json();}catch{throw Object.assign(new Error('رد Exa ليس JSON صالحًا.'),{status:502});}
  return {ok:true,provider:'Exa',resultCount:Array.isArray(data.results)?data.results.length:0,checkedAt:new Date().toISOString()};
}
