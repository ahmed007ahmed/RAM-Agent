import {cleanConversationalReply, maxOutputTokens} from './policy.js';

export function cloudflareAiConfigured(env = process.env) {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
}

function textValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    for (const key of ['text', 'content', 'response', 'output_text', 'generated_text']) {
      const text = textValue(value[key]);
      if (text) return text;
    }
  }
  return '';
}

function responseText(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message || choice?.delta || {};
  return textValue(message.content ?? choice?.text)
    || textValue(data?.result?.response)
    || textValue(data?.response)
    || textValue(data?.output_text)
    || textValue(data?.output)
    || textValue(data?.generated_text);
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
  if (data?.success === false || (Array.isArray(data?.errors) && data.errors.length)) {
    const detail = String(data?.errors?.[0]?.message || 'رفض Cloudflare تنفيذ الطلب.').slice(0,180);
    throw Object.assign(new Error(`Cloudflare AI: ${detail}`), {status:502,provider:'Cloudflare AI'});
  }
  const reply = cleanConversationalReply(responseText(data));
  if (!reply) {
    const finishReason = String(data?.choices?.[0]?.finish_reason || 'غير متاح').slice(0,40);
    const fields = Object.keys(data && typeof data === 'object' ? data : {}).slice(0,12).join(',') || 'لا توجد حقول';
    throw Object.assign(new Error(`Cloudflare قبل الطلب لكنه لم يُرجع نصًا قابلًا للعرض (model=${model}, finish_reason=${finishReason}, response_fields=${fields}).`), {status:502,provider:'Cloudflare AI'});
  }
  return {reply,model:data?.model || model,provider:'Cloudflare AI'};
}

