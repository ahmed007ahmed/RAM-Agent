export function n8nConfigured(env = process.env) {
  return Boolean(env.N8N_WEBHOOK_URL && env.N8N_WEBHOOK_SECRET && env.N8N_WEBHOOK_SECRET.length >= 24);
}

async function rejectedWebhookError(response, secret, action) {
  let detail = '';
  try {
    const raw = (await response.text()).slice(0, 1200);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        detail = [data.message, data.description, data.errorMessage, data.error].find(value => typeof value === 'string') || '';
      } catch {
        // n8n can return HTML for an unhandled workflow error; don't expose a stack trace.
        const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        detail = match ? match[1].replace(/<[^>]*>/g, ' ') : '';
      }
    }
  } catch { /* The status code is still useful if the body cannot be read. */ }
  detail = String(detail)
    .replaceAll(secret, '[محجوب]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [محجوب]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[رابط محجوب]')
    .replace(/\s+/g, ' ').trim().slice(0, 240);
  const error = new Error(`Webhook الخاص بـn8n رفض ${action} (HTTP ${response.status})${detail ? `: ${detail}` : '. افتح Executions في n8n وافحص أول عقدة فاشلة.'}`);
  error.status = 502;
  error.upstreamStatus = response.status;
  return error;
}

export async function notifyN8nOpportunity(job, env = process.env, fetchImpl = fetch) {
  if (!n8nConfigured(env)) return {configured:false,triggered:false};
  let url;
  try { url = new URL(env.N8N_WEBHOOK_URL); }
  catch { throw Object.assign(new Error('رابط Webhook في n8n غير صالح.'), {status:503}); }
  if (url.protocol !== 'https:') throw Object.assign(new Error('يجب أن يكون Webhook الخاص بـn8n على HTTPS.'), {status:503});
  const response = await fetchImpl(url, {
    method:'POST', signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.N8N_WEBHOOK_SECRET}`,'X-RAM-Webhook-Secret':env.N8N_WEBHOOK_SECRET,'X-RAM-Event':'ram.opportunity.selected','Content-Type':'application/json'},
    body:JSON.stringify({source:'RAM-Agent',event:'ram.opportunity.selected',idempotencyKey:String(job.id),occurredAt:new Date().toISOString(),guardrails:{noPayment:true,noWithdrawal:true,noContractSignature:true,noUnapprovedExternalSubmission:true},job:{id:String(job.id),title:String(job.title||'').slice(0,300),source:String(job.source||'').slice(0,2000),category:String(job.category||'').slice(0,80),details:String(job.details||'').slice(0,8000),client:String(job.client||'').slice(0,300),amount:Number.isSafeInteger(job.amount)?job.amount:null,currency:String(job.currency||'').slice(0,12),basis:String(job.basis||'').slice(0,20),deadline:String(job.deadline||'').slice(0,40)}})
  });
  if (!response.ok) throw await rejectedWebhookError(response, env.N8N_WEBHOOK_SECRET, 'تشغيل المهمة');
  return {configured:true,triggered:true,status:response.status};
}

export async function testN8nConnection(env = process.env, fetchImpl = fetch) {
  if (!n8nConfigured(env)) return {configured:false, ok:false, error:'إعداد n8n غير مكتمل في Railway.'};
  let url;
  try { url = new URL(env.N8N_WEBHOOK_URL); }
  catch { throw Object.assign(new Error('رابط Webhook في n8n غير صالح.'), {status:503}); }
  if (url.protocol !== 'https:') throw Object.assign(new Error('يجب أن يكون Webhook الخاص بـn8n على HTTPS.'), {status:503});
  const testId = `connection-test-${Date.now()}`;
  const response = await fetchImpl(url, {
    method:'POST', signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.N8N_WEBHOOK_SECRET}`,'X-RAM-Webhook-Secret':env.N8N_WEBHOOK_SECRET,'X-RAM-Event':'ram.connection.test','Content-Type':'application/json'},
    body:JSON.stringify({source:'RAM-Agent',event:'ram.connection.test',test:true,noExternalActions:true,idempotencyKey:testId,testId,occurredAt:new Date().toISOString()})
  });
  if (!response.ok) throw await rejectedWebhookError(response, env.N8N_WEBHOOK_SECRET, 'اختبار الربط');
  return {configured:true,ok:true,accepted:true,status:response.status,event:'ram.connection.test',testId,note:'وصل الطلب إلى Webhook برد HTTP ناجح. هذا لا يثبت نجاح كل عقد n8n؛ تحقق من سجل Executions، واجعل مسار test:true ينتهي قبل أي خطوة خارجية.'};
}
