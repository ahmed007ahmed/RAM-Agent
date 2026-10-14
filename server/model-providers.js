// Official server-side chat adapters. Keys must stay in the hosting environment.
const PROVIDERS = {
  anthropic: {name:'Claude API', key:'ANTHROPIC_API_KEY', modelKey:'ANTHROPIC_MODEL', defaultModel:'claude-sonnet-4-5', endpoint:'https://api.anthropic.com/v1/messages'},
  gemini: {name:'Gemini API', key:'GEMINI_API_KEY', modelKey:'GEMINI_MODEL', defaultModel:'gemini-3.8-flash'},
  perplexity: {name:'Perplexity API', key:'PERPLEXITY_API_KEY', modelKey:'PERPLEXITY_MODEL', defaultModel:'sonar', endpoint:'https://api.perplexity.ai/chat/completions'}
};
const tokenLimit = env => Math.min(Math.max(Number(env.AI_MAX_OUTPUT_TOKENS)||4096,256),8192);
const messageText = value => typeof value==='string'?value:Array.isArray(value)?value.map(x=>messageText(x?.text??x?.content)).filter(Boolean).join('\n'):'';

export function modelProvidersStatus(env=process.env){
  return Object.entries(PROVIDERS).map(([id,p])=>({id,name:p.name,configured:Boolean(String(env[p.key]||'').trim()),keyVariable:p.key,modelVariable:p.modelKey,model:env[p.modelKey]||p.defaultModel}));
}
export function modelProviderConfigured(id,env=process.env){return Boolean(PROVIDERS[id]&&String(env[PROVIDERS[id].key]||'').trim());}
export function selectedModelProvider(env=process.env){
  const id=String(env.RAM_AI_PROVIDER||'cloudflare').toLowerCase();
  // Unknown or removed provider settings safely fall back to Cloudflare.
  if(id==='cloudflare'||!PROVIDERS[id])return 'cloudflare';
  if(modelProviderConfigured(id,env))return id;
  throw Object.assign(new Error(`المزود ${id} غير مهيأ. أضف مفتاحه إلى Railway أو اجعل RAM_AI_PROVIDER=cloudflare.`),{status:503,provider:'RAM'});
}
function bodyFor(id,messages,options,env){
  const p=PROVIDERS[id],model=env[p.modelKey]||p.defaultModel,limit=tokenLimit(env),temperature=options.temperature??0.55;
  if(id==='anthropic')return {model,max_tokens:limit,temperature,system:messages.filter(x=>x.role==='system').map(x=>x.content).join('\n\n'),messages:messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'assistant':'user',content:x.content}))};
  if(id==='gemini')return {systemInstruction:{parts:[{text:messages.filter(x=>x.role==='system').map(x=>x.content).join('\n\n')}]},contents:messages.filter(x=>x.role!=='system').map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:x.content}]})),generationConfig:{maxOutputTokens:limit,temperature}};
  return {model,max_tokens:limit,temperature,messages};
}
export async function modelProviderChat(id,messages,options={},env=process.env,fetchImpl=fetch){
  const p=PROVIDERS[id];
  if(!p)throw Object.assign(new Error('مزود النموذج غير معروف.'),{status:400,provider:'RAM'});
  const key=String(env[p.key]||'').trim();
  if(!key)throw Object.assign(new Error(`أضف ${p.key} في Variables على Railway.`),{status:503,provider:p.name});
  const model=env[p.modelKey]||p.defaultModel;
  const url=id==='gemini'?`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`:p.endpoint;
  const headers={'Content-Type':'application/json'};
  if(id==='anthropic')Object.assign(headers,{'x-api-key':key,'anthropic-version':'2023-06-01'});
  else if(id==='gemini')headers['x-goog-api-key']=key;
  else headers.Authorization=`Bearer ${key}`;
  const response=await fetchImpl(url,{method:'POST',signal:AbortSignal.timeout(40000),headers,body:JSON.stringify(bodyFor(id,messages,options,env))});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const detail=String(data?.error?.message||data?.message||'').slice(0,180);throw Object.assign(new Error(detail||`${p.name} أعاد HTTP ${response.status}. تحقق من المفتاح وصلاحية النموذج.`),{status:response.status>=400&&response.status<500?response.status:502,provider:p.name});}
  const raw=id==='anthropic'?messageText(data?.content):id==='gemini'?messageText(data?.candidates?.[0]?.content?.parts):messageText(data?.choices?.[0]?.message?.content);
  const reply=raw.trim();
  if(!reply)throw Object.assign(new Error(`${p.name} أعاد استجابة بلا نص.`),{status:502,provider:p.name});
  return {reply,provider:p.name,model:data?.model||data?.modelVersion||model};
}
export async function testModelProvider(id,env=process.env,fetchImpl=fetch){
  const result=await modelProviderChat(id,[{role:'user',content:'أجب بكلمة واحدة: متصل'}],{temperature:0},env,fetchImpl);
  return {ok:true,provider:result.provider,model:result.model,reply:result.reply};
}
