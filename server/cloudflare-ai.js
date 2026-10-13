import {cleanConversationalReply, maxOutputTokens} from './policy.js';

export const DEFAULT_CLOUDFLARE_AI_MODEL='@cf/zai-org/glm-4.7-flash';

export function cloudflareAiConfigured(env=process.env) {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

function textFrom(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : textFrom(part?.text ?? part?.content ?? part?.output_text)).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return textFrom(value.text ?? value.content ?? value.response ?? value.output_text);
  return '';
}

function responseText(data) {
  const candidates=[data?.choices?.[0]?.message?.content,data?.choices?.[0]?.text,data?.result?.response,data?.result?.text,data?.result?.output_text,data?.response,data?.output_text,data?.output?.[0]?.content,data?.result?.choices?.[0]?.message?.content];
  for(const candidate of candidates){const text=textFrom(candidate);if(text.trim())return text;}
  return '';
}

async function requestJson(fetchImpl,endpoint,body,env) {
  const response=await fetchImpl(endpoint,{method:'POST',signal:AbortSignal.timeout(40000),headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {response,data:await response.json().catch(()=>({}))};
}

export async function cloudflareChat(messages,options={},env=process.env,fetchImpl=fetch) {
  if(!cloudflareAiConfigured(env))throw Object.assign(new Error('إعداد Cloudflare AI غير مكتمل؛ تحقق من CLOUDFLARE_ACCOUNT_ID وCLOUDFLARE_API_TOKEN.'),{status:503,provider:'Cloudflare AI'});
  const model=env.CLOUDFLARE_AI_MODEL||DEFAULT_CLOUDFLARE_AI_MODEL;
  const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}`;
  const input={messages,max_tokens:maxOutputTokens(env.AI_MAX_OUTPUT_TOKENS),temperature:options.temperature??0.55};
  let {response,data}=await requestJson(fetchImpl,`${base}/ai/v1/chat/completions`,{model,...input},env);
  if(!response.ok){const detail=String(data?.errors?.[0]?.message||data?.error?.message||data?.message||'').slice(0,180);throw Object.assign(new Error(detail||`Cloudflare AI أعاد HTTP ${response.status}.`),{status:response.status,provider:'Cloudflare AI'});}
  if(data?.success===false||(Array.isArray(data?.errors)&&data.errors.length)){const detail=String(data?.errors?.[0]?.message||'رفض Cloudflare تنفيذ الطلب.').slice(0,180);throw Object.assign(new Error(`Cloudflare AI: ${detail}`),{status:502,provider:'Cloudflare AI'});}
  let reply=cleanConversationalReply(responseText(data)),usedModel=data?.model||model;
  if(!reply){
    const native=await requestJson(fetchImpl,`${base}/ai/run/${encodeURIComponent(model)}`,input,env),nativeData=native.data;
    if(native.response.ok&&nativeData?.success!==false&&!(Array.isArray(nativeData?.errors)&&nativeData.errors.length)){reply=cleanConversationalReply(responseText(nativeData));usedModel=nativeData?.model||model;}
    if(!reply){const detail=String(nativeData?.errors?.[0]?.message||data?.errors?.[0]?.message||'').slice(0,160);throw Object.assign(new Error(detail?`Cloudflare AI: ${detail}`:'Cloudflare AI أعاد استجابة بلا نص عبر واجهتي المحادثة والتنفيذ. تحقق من النموذج وصلاحيات Workers AI.'),{status:502,provider:'Cloudflare AI'});}
  }
  return {reply,model:usedModel,provider:'Cloudflare AI'};
}
