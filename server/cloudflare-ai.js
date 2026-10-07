import {cleanConversationalReply, maxOutputTokens} from './policy.js';

export function cloudflareAiConfigured(env = process.env) {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

export async function cloudflareChat(messages, options = {}, env = process.env, fetchImpl = fetch) {
  if (!cloudflareAiConfigured(env)) {
    throw Object.assign(new Error('إعداد Cloudflare AI غير مكتمل؛ تحقق من CLOUDFLARE_ACCOUNT_ID وCLOUDFLARE_API_TOKEN.'), {status:503, provider:'Cloudflare AI'});
  }
  const model = env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method:'POST', signal:AbortSignal.timeout(40000),
    headers:{Authorization:`Bearer ${env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,messages,max_tokens:maxOutputTokens(env.AI_MAX_OUTPUT_TOKENS),temperature:options.temperature ?? 0.55})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = String(data?.errors?.[0]?.message || data?.error?.message || data?.message || '').slice(0,180);
    const error = Object.assign(new Error(detail || `Cloudflare AI أعاد HTTP ${response.status}.`), {status:response.status,provider:'Cloudflare AI'});
    throw error;
  }
  const raw = data?.choices?.[0]?.message?.content;
  const reply = cleanConversationalReply(typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map(part => part?.text || '').join('\n') : '');
  if (!reply) throw Object.assign(new Error('Cloudflare AI لم يُرجع نصًا حواريًا.'), {status:503,provider:'Cloudflare AI'});
  return {reply,model:data?.model || model,provider:'Cloudflare AI'};
}
