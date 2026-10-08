const ENDPOINT='https://api.firecrawl.dev/v2/search';

export async function testFirecrawlConnection(env=process.env,fetchImpl=fetch){
  const key=String(env.FIRECRAWL_API_KEY||'').trim();
  if(!key)return {ok:false,provider:'Firecrawl',error:'أضف FIRECRAWL_API_KEY في متغيرات Railway.'};
  let response;
  try{response=await fetchImpl(ENDPOINT,{method:'POST',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({query:'Firecrawl API documentation',limit:1,sources:[{type:'web'}]})});}
  catch(error){throw Object.assign(new Error(error?.name==='TimeoutError'?'انتهت مهلة Firecrawl. أعد المحاولة.':'تعذر الوصول إلى Firecrawl من Railway.'),{status:502});}
  if(response.status===401||response.status===403)throw Object.assign(new Error('رفض Firecrawl المفتاح؛ تحقق من FIRECRAWL_API_KEY.'),{status:502});
  if(response.status===429)throw Object.assign(new Error('بلغ حساب Firecrawl حد الطلبات أو انتهت الحصة.'),{status:429});
  if(!response.ok)throw Object.assign(new Error(`أعاد Firecrawl حالة HTTP ${response.status}.`),{status:502});
  let data;try{data=await response.json();}catch{throw Object.assign(new Error('رد Firecrawl ليس JSON صالحًا.'),{status:502});}
  const results=Array.isArray(data?.data?.web)?data.data.web:Array.isArray(data?.data)?data.data:[];
  return {ok:true,provider:'Firecrawl',resultCount:results.length,checkedAt:new Date().toISOString()};
}
