export function n8nConfigured(env = process.env) {
  return Boolean(env.N8N_WEBHOOK_URL && env.N8N_WEBHOOK_SECRET && env.N8N_WEBHOOK_SECRET.length >= 24);
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
  if (!response.ok) throw Object.assign(new Error(`Webhook الخاص بـn8n رفض تشغيل المهمة (HTTP ${response.status}).`), {status:502});
  return {configured:true,triggered:true,status:response.status};
}
