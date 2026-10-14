const endpoint='https://public-api.gamma.app/v1.0';
export const gammaConfigured=(env=process.env)=>Boolean(String(env.GAMMA_API_KEY||'').trim());
function requireKey(env){const key=String(env.GAMMA_API_KEY||'').trim();if(!key)throw Object.assign(new Error('أضف GAMMA_API_KEY في Railway Variables. يحتاج مفتاح Gamma إلى خطة تسمح بواجهة API.'),{status:503});return key;}
async function gammaRequest(path,{method='GET',body,env=process.env,fetchImpl=fetch}={}){
 const key=requireKey(env);const response=await fetchImpl(`${endpoint}${path}`,{method,signal:AbortSignal.timeout(40000),headers:{'X-API-KEY':key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));if(!response.ok){const detail=String(data?.message||data?.error?.message||'').slice(0,180);throw Object.assign(new Error(detail||`Gamma أعاد HTTP ${response.status}. راجع المفتاح وخطة API.`),{status:response.status>=400&&response.status<500?response.status:502});}return data;
}
export async function createGamma({inputText,format='presentation',numCards=5,exportAs}={},env=process.env,fetchImpl=fetch){
 const text=String(inputText||'').trim();if(!text||text.length>12000)throw Object.assign(new Error('اكتب وصفًا من 1 إلى 12000 حرف لإنشاء Gamma.'),{status:400});
 if(!['presentation','document','webpage','social'].includes(format))throw Object.assign(new Error('نوع Gamma غير مدعوم.'),{status:400});
 const cards=Math.min(Math.max(Number(numCards)||5,1),20);const body={inputText:text,textMode:'generate',format,numCards:cards};if(['pdf','png','pptx'].includes(exportAs))body.exportAs=exportAs;
 const data=await gammaRequest('/generations',{method:'POST',body,env,fetchImpl});
 return {ok:true,generationId:String(data.generationId||''),status:String(data.status||'pending'),gammaUrl:data.gammaUrl||null,exportUrl:data.exportUrl||null,credits:data.credits||null};
}
export async function gammaGenerationStatus(id,env=process.env,fetchImpl=fetch){const safe=String(id||'');if(!/^[A-Za-z0-9_-]{4,160}$/.test(safe))throw Object.assign(new Error('معرّف إنشاء Gamma غير صالح.'),{status:400});const data=await gammaRequest(`/generations/${encodeURIComponent(safe)}`,{env,fetchImpl});return {ok:true,generationId:String(data.generationId||safe),status:String(data.status||'unknown'),gammaUrl:data.gammaUrl||null,exportUrl:data.exportUrl||null,credits:data.credits||null};}
export async function testGamma(env=process.env,fetchImpl=fetch){return createGamma({inputText:'RAM API connectivity check. Create a one-card document stating: API connection test.',format:'document',numCards:1},env,fetchImpl);}
