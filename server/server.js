import express from "express";
import {validToken, maxOutputTokens, checkedModel, rawSearchReply, createLimiter, extractAdvertisedPay, classifyFreelanceProject} from "./policy.js";
import {GMAIL_SCOPES, gmailConfigured, loadRefreshToken, makeOAuthState, makeRawEmail, safeMessage, saveRefreshToken, verifyOAuthState} from "./gmail.js";
import {automationStorageReady, newAutomationJob, publicAutomationStatus, readAutomationStore, writeAutomationStore} from "./cloud-automation.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CLOUDFLARE_CHAT_URL = "https://api.cloudflare.com/client/v4/accounts";

// Gmail OAuth callback is deliberately public (Google redirects here). All
// application endpoints remain behind the RAM bearer-token middleware below.
const oauthHtml = (title, message) => `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:18px sans-serif;max-width:680px;margin:12vh auto;padding:24px;background:#08101e;color:#eef4ff"><h2>${title}</h2><p>${message}</p><p>ارجع إلى تطبيق رام واضغط «تحديث الحالة».</p></body></html>`;
app.get('/gmail/oauth/callback', async (req, res) => {
  try {
    if (req.query.error) return res.status(400).type('html').send(oauthHtml('لم يكتمل ربط Gmail', 'لم تمنح Google التفويض. لم تُرسل أي رسالة.'));
    if (!gmailConfigured() || !process.env.RAM_API_TOKEN || !verifyOAuthState(String(req.query.state || ''), process.env.RAM_API_TOKEN)) {
      return res.status(400).type('html').send(oauthHtml('تعذر التحقق من الربط', 'انتهت صلاحية محاولة الربط أو أن إعدادات الخادم غير مكتملة. ابدأ الربط من تطبيق رام مجددًا.'));
    }
    const code = String(req.query.code || '');
    if (!code || code.length > 4096) return res.status(400).type('html').send(oauthHtml('تعذر إكمال الربط', 'لم ترسل Google رمز التفويض المطلوب.'));
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: process.env.GMAIL_REDIRECT_URI, grant_type: 'authorization_code'})
    });
    const data = await response.json();
    if (!response.ok || !data.refresh_token) {
      console.error('Gmail OAuth token exchange failed:', response.status, data?.error || 'refresh token missing');
      return res.status(502).type('html').send(oauthHtml('لم يكتمل ربط Gmail', 'لم يسلّم Google رمز تحديث صالحًا. راجع إعداد OAuth ثم حاول الربط مجددًا.'));
    }
    const identity = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {headers:{Authorization:`Bearer ${data.access_token}`}, signal:AbortSignal.timeout(15000)});
    const account = await identity.json().catch(() => ({}));
    if (!identity.ok || String(account.email || '').toLowerCase() !== String(process.env.GMAIL_ALLOWED_EMAIL || '').toLowerCase() || account.email_verified !== true) {
      return res.status(403).type('html').send(oauthHtml('اختر حساب Gmail الصحيح', `هذا الربط مخصص للحساب ${process.env.GMAIL_ALLOWED_EMAIL}. لم يُحفظ التفويض لحساب آخر.`));
    }
    await saveRefreshToken(process.env.GMAIL_TOKEN_FILE, data.refresh_token, process.env.GMAIL_TOKEN_ENCRYPTION_KEY);
    return res.type('html').send(oauthHtml('تم تفويض Gmail لرام', 'حُفظ رمز الوصول مشفرًا على خادم رام. يستطيع التطبيق قراءة الرسائل وإرسال رسالة عند ضغطك على زر الإرسال.'));
  } catch (error) {
    console.error('Gmail OAuth callback failed:', error?.name || 'error');
    return res.status(500).type('html').send(oauthHtml('تعذر ربط Gmail', 'حدث خطأ أثناء حفظ التفويض. تحقق من وجود مساحة تخزين دائمة وإعدادات الخادم.'));
  }
});

let gmailAccessToken = null;
let gmailAccessExpiresAt = 0;
async function getGmailAccessToken() {
  if (!gmailConfigured()) throw Object.assign(new Error('أكمل إعداد ربط Gmail في Railway أولًا.'), {status: 503});
  if (gmailAccessToken && Date.now() < gmailAccessExpiresAt - 60000) return gmailAccessToken;
  let refreshToken;
  try { refreshToken = await loadRefreshToken(process.env.GMAIL_TOKEN_FILE, process.env.GMAIL_TOKEN_ENCRYPTION_KEY); }
  catch { throw Object.assign(new Error('لم يُربط Gmail بعد. ابدأ الربط من إعدادات رام.'), {status: 409}); }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token'})
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    gmailAccessToken = null; gmailAccessExpiresAt = 0;
    if (data?.error === 'invalid_grant') throw Object.assign(new Error('انتهى تفويض Gmail؛ أعد ربط الحساب من إعدادات رام.'), {status: 401});
    throw Object.assign(new Error('تعذر تجديد تفويض Gmail؛ حاول لاحقًا.'), {status: response.status || 502});
  }
  gmailAccessToken = data.access_token;
  gmailAccessExpiresAt = Date.now() + Math.max(Number(data.expires_in) || 3600, 60) * 1000;
  return gmailAccessToken;
}
async function gmailApi(path, options = {}) {
  const token = await getGmailAccessToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options, signal: AbortSignal.timeout(20000),
    headers: {Authorization: `Bearer ${token}`, ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 403 ? 'Google لم يمنح صلاحية Gmail المطلوبة. أعد التحقق من OAuth scopes وإعدادات التطبيق.' : 'تعذر الوصول إلى Gmail الآن.'), {status: response.status});
  return data;
}
function verifyGmailAccount(email) {
  if (String(email || '').toLowerCase() !== String(process.env.GMAIL_ALLOWED_EMAIL || '').toLowerCase()) {
    gmailAccessToken = null; gmailAccessExpiresAt = 0;
    throw Object.assign(new Error('حساب Gmail المتصل لا يطابق الحساب المعتمد في إعدادات رام.'), {status: 403});
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "RAM AI Server",
    chat: "/chat",
    search: "/search",
    tts: "/tts"
  });
});

app.get('/automation/control',(_req,res)=>res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تشغيل رام السحابي</title><style>body{font:17px system-ui;background:#08101e;color:#eef4ff;max-width:760px;margin:24px auto;padding:16px}section{background:#141e32;border:1px solid #2a3a52;border-radius:18px;padding:18px;margin:14px 0}label{display:block;margin:12px 0}input,select,textarea{box-sizing:border-box;width:100%;padding:12px;border-radius:10px;border:1px solid #394a62;background:#0b1425;color:#fff;font:inherit}textarea{min-height:100px}button{padding:12px 18px;border:0;border-radius:10px;background:#55d6d2;color:#07121d;font:inherit;margin:6px;cursor:pointer}.muted{color:#aebbd0;white-space:pre-wrap;overflow-wrap:anywhere}.job{border-top:1px solid #394a62;padding-top:10px;margin-top:12px}small{color:#9dacc4}</style><h1>التشغيل السحابي في رام</h1><p class="muted">أدخل رمز رام والفرصة المرجعية المختارة مرة واحدة. يبقى الرمز في ذاكرة هذه الصفحة فقط ولا يُحفظ في التخزين المحلي.</p><section><label>رمز اتصال رام<input id="token" type="password" autocomplete="off" minlength="24"></label><label>عنوان الفرصة<input id="title" maxlength="240"></label><label>القسم<select id="category"><option value="TRANSLATION">الترجمة</option><option value="ENGINEERING">الهندسة والتصميم</option><option value="TECH">المواقع والبرمجة</option><option value="RESEARCH">الأبحاث والاستشارات</option><option value="LOGISTICS">الشحن</option><option value="ENERGY">النفط والغاز</option><option value="SOURCING">التوريد</option><option value="PROPERTY">العقارات والسياحة</option></select></label><label>رابط الإعلان<input id="source" type="url" maxlength="1000" placeholder="https://..."></label><label>التفاصيل والمهارات المطلوبة<textarea id="details" maxlength="4000"></textarea></label><label>فاصل البحث<select id="interval"><option value="60">كل ساعة</option><option value="30">كل 30 دقيقة</option><option value="15">كل 15 دقيقة</option><option value="180">كل 3 ساعات</option><option value="360">كل 6 ساعات</option></select></label><button id="enable">تفعيل/تحديث المرجع</button><button id="refresh">تحديث الحالة</button><button id="run">فحص الآن</button><button id="disable">إيقاف الجدول</button></section><section><h2>حالة العمل</h2><div id="status" class="muted">أدخل رمز رام واضغط تحديث الحالة.</div><div id="jobs"></div></section><script>(()=>{const $=id=>document.getElementById(id),status=$('status'),jobs=$('jobs');async function api(path,body={}){const token=$('token').value.trim();if(token.length<24)throw Error('أدخل رمز اتصال رام الصحيح.');const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'فشل الطلب ('+r.status+')');return d;}function render(d){status.textContent=d.error||('الحالة: '+(d.enabled?'مفعّل':'متوقف')+'\nالتخزين الدائم: '+(d.durable?'متصل':'غير متصل')+'\nعدد الفرص المحفوظة: '+(d.jobCount||0)+'\nآخر فحص: '+(d.lastRunAt||'لم يبدأ'));jobs.replaceChildren();for(const j of d.jobs||[]){const box=document.createElement('article');box.className='job';const title=document.createElement('b');title.textContent=j.title||'فرصة';const state=document.createElement('p');state.textContent=j.status||'';const url=document.createElement('a');url.href=j.url;url.textContent=j.url;url.target='_blank';url.rel='noopener';box.append(title,state,url);if(j.analysis){const summary=document.createElement('p');summary.className='muted';summary.textContent=j.analysis.boundary||'';box.append(summary);const draft=document.createElement('details');const head=document.createElement('summary');head.textContent='عرض خطوات العمل ومسودة التواصل';const content=document.createElement('pre');content.className='muted';content.textContent=(j.analysis.nextSteps||[]).join('\n• ')+'\n\n'+(j.analysis.proposalDraft||'');draft.append(head,content);box.append(draft);}jobs.append(box);}}$('refresh').onclick=async()=>{try{render(await api('/automation/status'));}catch(e){status.textContent=e.message;}};$('enable').onclick=async()=>{try{const d=await api('/automation/configure',{seed:{title:$('title').value,category:$('category').value,details:$('details').value,source:$('source').value},intervalMinutes:Number($('interval').value)});status.textContent=d.message||'تم التفعيل';setTimeout(()=>$('refresh').click(),1200);}catch(e){status.textContent=e.message;}};$('run').onclick=async()=>{try{const d=await api('/automation/run-now');status.textContent=d.message||'بدأ الفحص';}catch(e){status.textContent=e.message;}};$('disable').onclick=async()=>{try{await api('/automation/disable');$('refresh').click();}catch(e){status.textContent=e.message;}};})();</script></html>`));

const allowRequest = createLimiter();
app.use((req,res,next)=>{
 if(!process.env.RAM_API_TOKEN||process.env.RAM_API_TOKEN.length<24)return res.status(503).json({error:"الخادم ينتظر إعداد رمز اتصال RAM_API_TOKEN آمن."});
 if(!validToken(req.headers.authorization,process.env.RAM_API_TOKEN))return res.status(401).json({error:"أدخل رمز اتصال رام الصحيح في إعدادات التطبيق."});
 if(!allowRequest())return res.status(429).json({error:"طلبات كثيرة خلال دقيقة؛ انتظر قليلًا."});
 next();
});
function n8nWebhookConfigured(){
  const webhook=String(process.env.N8N_WEBHOOK_URL||'').trim();
  const secret=String(process.env.N8N_WEBHOOK_SECRET||'');
  try{const target=new URL(webhook);return target.protocol==='https:'&&target.hostname.includes('.')&&!target.username&&!target.password&&!/(^|\.)(localhost|local|internal)$|^(127\.|10\.|192\.168\.|169\.254\.)/i.test(target.hostname)&&secret.length>=24;}catch{return false;}
}
app.get('/gmail/oauth/start', (req, res) => {
  if (!gmailConfigured() || !process.env.RAM_API_TOKEN || process.env.RAM_API_TOKEN.length < 24) return res.status(503).json({error: 'أكمل متغيرات OAuth والتخزين الدائم في Railway أولًا.'});
  const state = makeOAuthState(process.env.RAM_API_TOKEN);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GMAIL_REDIRECT_URI, response_type: 'code', scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state}).toString();
  return res.json({ok: true, authorizationUrl: url.toString()});
});
app.post('/capabilities',(req,res)=>res.json({chatConfigured:Boolean((process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN)||(process.env.OPENAI_API_KEY&&process.env.ALLOW_OPENAI_API==='true')||process.env.OPENROUTER_API_KEY||(process.env.GEMINI_API_KEY&&process.env.ALLOW_GEMINI_API==='true')),chatProviders:[(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN)?'Cloudflare Workers AI':'',(process.env.OPENAI_API_KEY&&process.env.ALLOW_OPENAI_API==='true')?'OpenAI API':'',process.env.OPENROUTER_API_KEY?'OpenRouter':'',(process.env.GEMINI_API_KEY&&process.env.ALLOW_GEMINI_API==='true')?'Gemini fallback':''].filter(Boolean),cloudflareConfigured:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openAIConfigured:Boolean(process.env.OPENAI_API_KEY),openAIEnabled:process.env.ALLOW_OPENAI_API==='true',searchConfigured:Boolean(process.env.SERPER_API_KEY||process.env.TAVILY_API_KEY),searchProvider:process.env.SERPER_API_KEY?'Serper':process.env.TAVILY_API_KEY?'Tavily':null,makeSchedulerSupported:true,n8nConnected:n8nWebhookConfigured(),elevenLabsConfigured:Boolean(process.env.ELEVENLABS_API_KEY),elevenLabsEnabled:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ALLOW_PAID_TTS==='true'),gmailOAuthConfigured:gmailConfigured(),emailConnected:false,callsConnected:false,cloudJobsConnected:automationStorageReady(),paymentsEnabled:false,paidAiAllowed:false}));
app.post('/integrations/n8n/test', async (req,res) => {
  if (req.body?.confirmed !== true) return res.status(400).json({error:'أكد اختبار الاتصال من داخل رام أولًا.'});
  const webhook = String(process.env.N8N_WEBHOOK_URL || '').trim();
  const secret = String(process.env.N8N_WEBHOOK_SECRET || '');
  let target;
  try { target = new URL(webhook); } catch { target = null; }
  if (!n8nWebhookConfigured() || !target) {
    return res.status(503).json({error:'أضف N8N_WEBHOOK_URL الآمن و N8N_WEBHOOK_SECRET (24 حرفًا على الأقل) في متغيرات Railway.'});
  }
  try {
    const response = await fetch(target, {
      method:'POST', signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json','X-RAM-Webhook-Secret':secret},
      body:JSON.stringify({event:'ram.connection_test',source:'RAM-Agent',sentAt:new Date().toISOString(),test:true})
    });
    if (!response.ok) return res.status(502).json({error:`لم يقبل n8n الاختبار (HTTP ${response.status}). تأكد من تفعيل Webhook ومن إعداد Header Auth.`});
    return res.json({ok:true,connected:true,message:'وصل اختبار الاتصال إلى n8n.'});
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return res.status(502).json({error:timeout?'انتهت مهلة اتصال n8n. تحقق من الرابط وحالة الـ workflow.':'تعذر الوصول إلى n8n. تحقق من رابط Production Webhook.'});
  }
});
const n8nActions = new Set(['job_selected','work_started','deliverable_ready','delivery_followup','payment_followup']);
app.post('/integrations/n8n/execute', async (req,res) => {
  if (req.body?.confirmed !== true) return res.status(400).json({error:'لم يُشغّل سير العمل. راجع البيانات وأكد التشغيل من داخل رام.'});
  const action=String(req.body?.action||'');
  if(!n8nActions.has(action))return res.status(400).json({error:'نوع تشغيل غير معروف.'});
  const job=req.body?.job&&typeof req.body.job==='object'?req.body.job:{};
  const title=String(job.title||'').trim().slice(0,240);
  const details=String(job.details||'').trim().slice(0,8000);
  if(!title||!details)return res.status(400).json({error:'بيانات المهمة ناقصة؛ لم يُرسل شيء إلى n8n.'});
  const webhook=String(process.env.N8N_WEBHOOK_URL||'').trim(),secret=String(process.env.N8N_WEBHOOK_SECRET||'');
  let target;try{target=new URL(webhook);}catch{target=null;}
  if(!n8nWebhookConfigured()||!target)return res.status(503).json({error:'n8n غير مهيأ. أضف رابط Production Webhook وسرًا بطول 24 حرفًا على الأقل في Railway.'});
  try{
    const safeJob={id:String(job.id||'').slice(0,80),title,category:String(job.category||'').slice(0,80),stage:String(job.stage||'').slice(0,40),source:String(job.source||'').slice(0,1000),details,agreement:String(job.agreement||'').slice(0,4000),deliverable:String(job.deliverable||'').slice(0,20000),deadline:String(job.deadline||'').slice(0,80)};
    const response=await fetch(target,{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-RAM-Webhook-Secret':secret},body:JSON.stringify({event:`ram.${action}`,action,source:'RAM-Agent',requestedAt:new Date().toISOString(),job:safeJob})});
    if(!response.ok)return res.status(502).json({error:`n8n رفض التشغيل (HTTP ${response.status}).`});
    return res.json({ok:true,accepted:true,action,message:'استقبل n8n طلب التشغيل. تحقّق من سجل التنفيذ في n8n؛ القبول لا يثبت اكتمال المهمة.'});
  }catch(error){const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';return res.status(502).json({error:timeout?'انتهت مهلة اتصال n8n؛ تحقق من سجل التنفيذ قبل إعادة المحاولة.':'تعذر الوصول إلى Production Webhook في n8n.'});}
});
app.post('/gmail/status', async (_req, res) => {
  try {
    if (!gmailConfigured()) return res.json({ok:true, connected:false, configured:false, email:null});
    const profile = await gmailApi('profile');
    verifyGmailAccount(profile.emailAddress);
    return res.json({ok:true, connected:true, configured:true, email:profile.emailAddress || null});
  } catch (error) {
    if (error.status === 409) return res.json({ok:true, connected:false, configured:true, email:null});
    return res.status(error.status || 502).json({error:error.message || 'تعذر التحقق من Gmail.'});
  }
});
app.post('/gmail/inbox', async (req, res) => {
  try {
    const maxResults = Math.min(Math.max(Number(req.body?.maxResults) || 15, 1), 30);
    const profile = await gmailApi('profile'); verifyGmailAccount(profile.emailAddress);
    const list = await gmailApi(`messages?labelIds=INBOX&maxResults=${maxResults}`);
    const messages = await Promise.all((list.messages || []).slice(0, maxResults).map(async item => safeMessage(await gmailApi(`messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`))));
    return res.json({ok:true, messages, resultCount:messages.length});
  } catch (error) { return res.status(error.status || 502).json({error:error.message || 'تعذر تحميل الوارد.'}); }
});
app.post('/gmail/send', async (req, res) => {
  try {
    if (req.body?.confirmed !== true) return res.status(400).json({error:'لم تُرسل الرسالة. أكد الإرسال من داخل رام بعد مراجعة المستلم والنص.'});
    const profile = await gmailApi('profile'); verifyGmailAccount(profile.emailAddress);
    const raw = makeRawEmail({to:req.body?.to, subject:req.body?.subject, body:req.body?.body});
    const sent = await gmailApi('messages/send', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({raw})});
    return res.json({ok:true, sent:true, id:String(sent.id || ''), threadId:String(sent.threadId || ''), to:String(req.body.to)});
  } catch (error) { return res.status(error.status || 400).json({error:error.message || 'تعذر إرسال الرسالة.'}); }
});

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing");
  return key;
}

async function cloudflareWorkersAI(messages, options = {}) {
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw Object.assign(new Error('Cloudflare Workers AI is not configured'), {code:'CLOUDFLARE_NOT_CONFIGURED'});
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw Object.assign(new Error('CLOUDFLARE_ACCOUNT_ID must be the 32-character Account ID.'), {code:'CLOUDFLARE_ACCOUNT_ID_INVALID'});
  // Match Cloudflare's model-specific REST example first. This avoids the
  // compatibility route that returned HTTP 200 without a chat choice.
  const model = String(process.env.CLOUDFLARE_AI_MODEL || '@cf/zai-org/glm-4.7-flash').trim();
  const headers = {Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json'};
  const parseBody = async response => {
    const rawBody = await response.text().catch(() => '');
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch {}
    const apiError = Array.isArray(data?.errors) ? data.errors[0] : null;
    return {
      data,
      detail: {
        status: response.status,
        contentType: String(response.headers.get('content-type') || '').slice(0, 80),
        cfRay: String(response.headers.get('cf-ray') || '').slice(0, 40),
        responseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 12).join(',') : typeof data,
        choiceCount: Array.isArray(data?.choices) ? data.choices.length : null,
        providerCode: apiError?.code ?? data?.error?.code ?? data?.code ?? null,
        providerMessage: String(apiError?.message || data?.error?.message || data?.message || '').replace(/[\r\n\t]/g, ' ').replace(/Bearer\s+\S+/gi, 'Bearer [hidden]').slice(0, 220)
      }
    };
  };
  const getText = value => {
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : (part?.text || part?.content || '')).join('').trim();
    return '';
  };
  const timeoutStatus = error => error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 502;
  let nativeFailure;
  try {
    const nativeUrl = `${CLOUDFLARE_CHAT_URL}/${encodeURIComponent(accountId)}/ai/run/${model}`;
    const response = await fetch(nativeUrl, {
      signal:AbortSignal.timeout(45000), method:'POST', headers,
      // Cloudflare's published GLM-4.7-Flash REST example uses messages only.
      body:JSON.stringify({messages})
    });
    const parsed = await parseBody(response);
    if (response.ok) {
      const reply = getText(parsed.data?.response)
        || getText(parsed.data?.result?.response)
        || getText(parsed.data?.result?.generated_text)
        || getText(parsed.data?.choices?.[0]?.message?.content);
      if (reply) return {reply, model, provider:'Cloudflare Workers AI'};
    }
    nativeFailure = parsed.detail;
    if (!response.ok && [400, 401, 403, 404, 410].includes(response.status)) {
      throw Object.assign(new Error('Cloudflare native Workers AI endpoint rejected the request'), {status:response.status, provider:'Cloudflare Workers AI', model, ...nativeFailure});
    }
    console.warn(`Cloudflare native ai/run did not return text (HTTP ${response.status}); trying Chat Completions`);
  } catch (cause) {
    if (cause?.provider === 'Cloudflare Workers AI') throw cause;
    nativeFailure = {status:timeoutStatus(cause), providerMessage:String(cause?.cause?.code || cause?.message || 'network error').slice(0, 180)};
    console.warn('Cloudflare native ai/run failed; trying Chat Completions:', nativeFailure.providerMessage);
  }
  let chatFailure;
  try {
    const chatUrl = `${CLOUDFLARE_CHAT_URL}/${encodeURIComponent(accountId)}/ai/v1/chat/completions`;
    const response = await fetch(chatUrl, {
      signal:AbortSignal.timeout(45000), method:'POST', headers,
      body:JSON.stringify({model, messages, max_completion_tokens:options.maxOutputTokens || maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS), temperature:options.temperature ?? 0.35, stream:false})
    });
    const parsed = await parseBody(response);
    if (response.ok) {
      const reply = getText(parsed.data?.choices?.[0]?.message?.content)
        || getText(parsed.data?.choices?.[0]?.text);
      if (reply) return {reply, model:parsed.data?.model || model, provider:'Cloudflare Workers AI'};
    }
    chatFailure = parsed.detail;
  } catch (cause) {
    chatFailure = {status:timeoutStatus(cause), providerMessage:String(cause?.cause?.code || cause?.message || 'network error').slice(0, 180)};
  }
  const error = new Error('Cloudflare Workers AI returned no usable text from either supported endpoint');
  error.status = chatFailure?.status || nativeFailure?.status || 503;
  if (error.status < 400) error.status = 503;
  error.provider = 'Cloudflare Workers AI';
  error.model = model;
  error.providerCode = nativeFailure?.providerCode || chatFailure?.providerCode || null;
  error.providerMessage = `ai/run HTTP ${nativeFailure?.status ?? 'unknown'}${nativeFailure?.providerCode ? ` code ${nativeFailure.providerCode}` : ''}${nativeFailure?.providerMessage ? `: ${nativeFailure.providerMessage}` : ` (keys: ${nativeFailure?.responseKeys || 'none'})`}; Chat Completions HTTP ${chatFailure?.status ?? 'unknown'}${chatFailure?.providerCode ? ` code ${chatFailure.providerCode}` : ''}${chatFailure?.providerMessage ? `: ${chatFailure.providerMessage}` : ` (keys: ${chatFailure?.responseKeys || 'none'}, choices: ${chatFailure?.choiceCount ?? 'none'})`}`.slice(0, 600);
  error.cfRay = nativeFailure?.cfRay || chatFailure?.cfRay || '';
  error.contentType = nativeFailure?.contentType || chatFailure?.contentType || '';
  throw error;
}

async function openRouter(messages, options = {}) {
  const response = await fetch(OPENROUTER_URL, {
    signal: AbortSignal.timeout(40000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://ram-agent-production.up.railway.app",
      "X-Title": "RAM Agent"
    },
    body: JSON.stringify({
      model: checkedModel(process.env),
      max_tokens: options.maxOutputTokens || maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS),
      messages,
      temperature: options.temperature ?? 0.35
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error("OpenRouter request failed");
    error.status = response.status;
    error.provider = "OpenRouter";
    error.providerMessage = String(data?.error?.message || "").slice(0, 180);
    throw error;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (/^\s*(?:User|Content) Safety:\s*(?:safe|unsafe)\s*$/i.test(reply || "")) throw Object.assign(new Error("Configured model returned a classification instead of a conversation"), {status:503});
  if (!reply) throw new Error("OpenRouter returned an empty reply");
  return { reply, model: data?.model || process.env.OPENROUTER_MODEL || "openrouter/free" };
}

// Gemini fallback is opt-in because the provider may bill usage. Set
// ALLOW_GEMINI_API=true only after checking the account's current plan.
async function gemini(messages, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("Gemini is not configured"), {code:"GEMINI_NOT_CONFIGURED"});
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const system = messages.find(x => x.role === "system")?.content;
  const contents = messages.filter(x => x.role !== "system").map(x => ({
    role: x.role === "assistant" ? "model" : "user",
    parts: [{text:x.content}]
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    signal: AbortSignal.timeout(40000),
    method: "POST",
    headers: {"Content-Type":"application/json", "x-goog-api-key":apiKey},
    body: JSON.stringify({
      ...(system ? {systemInstruction:{parts:[{text:system}]}} : {}),
      contents,
      generationConfig:{temperature:options.temperature??0.35,maxOutputTokens:options.maxOutputTokens||maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS)}
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Gemini request failed");
    error.status = response.status;
    error.provider = "Gemini";
    error.providerMessage = String(data?.error?.message || "").slice(0, 180);
    throw error;
  }
  const reply = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
  if (!reply) throw Object.assign(new Error("Gemini returned an empty reply"),{status:503,provider:"Gemini"});
  return {reply,model};
}

async function openAIResponses(messages, options = {}) {
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey||process.env.ALLOW_OPENAI_API!=='true')throw Object.assign(new Error('OpenAI API is not enabled'),{code:'OPENAI_NOT_ENABLED'});
  const system=messages.find(x=>x.role==='system')?.content||'';
  const input=messages.filter(x=>x.role!=='system').map(x=>({role:x.role,content:x.content}));
  const response=await fetch('https://api.openai.com/v1/responses',{
    signal:AbortSignal.timeout(40000),method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.4-mini',instructions:system,input,max_output_tokens:options.maxOutputTokens||maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS),store:false})
  });
  const data=await response.json();
  if(!response.ok){const error=new Error('OpenAI Responses API request failed');error.status=response.status;error.provider='OpenAI API';throw error;}
  const reply=(data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('\n').trim();
  if(!reply)throw Object.assign(new Error('OpenAI returned an empty response'),{status:503,provider:'OpenAI API'});
  return {reply,model:data.model||process.env.OPENAI_MODEL||'gpt-5.4-mini',provider:'OpenAI API'};
}

async function answerWithFallback(messages, options = {}) {
  // When Cloudflare is selected, do not silently fall back to another billable provider.
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) return cloudflareWorkersAI(messages, options);
  if(process.env.OPENAI_API_KEY&&process.env.ALLOW_OPENAI_API==='true')return openAIResponses(messages,options);
  try { return {...await openRouter(messages,options),provider:"OpenRouter"}; }
  catch (primaryError) {
    const geminiOptedIn=Boolean(process.env.GEMINI_API_KEY&&process.env.ALLOW_GEMINI_API==="true");
    if (geminiOptedIn && (!process.env.OPENROUTER_API_KEY || primaryError.status===429 || primaryError.status>=500 || primaryError.status===401 || primaryError.status===403)) {
      try { return {...await gemini(messages,options),provider:"Gemini free tier"}; }
      catch (fallbackError) {
        console.error("RAM model providers unavailable:",primaryError.status||"error",fallbackError.status||"error");
        throw Object.assign(new Error("تعذر رد النموذجين؛ قد يكون حد الطلبات المجانية قد انتهى أو يحتاج مفتاح Gemini مراجعة."),{status:(fallbackError.status===429||primaryError.status===429)?429:503, provider:"AI"});
      }
    }
    throw primaryError;
  }
}

/*
  REAL WEB SEARCH
  Preferred free starter provider: Serper (SERPER_API_KEY).
  Tavily (TAVILY_API_KEY) remains a supported fallback.
  Keys belong in Railway environment variables, never in the Android app.
*/
const searchCache=new Map();
async function webSearch(query, maxResults = 8) {
  const cacheKey=JSON.stringify([query,maxResults]), cached=searchCache.get(cacheKey);
  if(cached&&Date.now()-cached.at<300000)return cached.results;
  const serperKey = process.env.SERPER_API_KEY;
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!serperKey && !tavilyKey) {
    const error = new Error("SERPER_API_KEY or TAVILY_API_KEY is missing");
    error.code = "SEARCH_NOT_CONFIGURED";
    throw error;
  }
  const limit=Math.min(Math.max(Number(maxResults)||8,1),10);
  const useSerper=Boolean(serperKey);
  const response = await fetch(useSerper ? "https://google.serper.dev/search" : "https://api.tavily.com/search", {
    signal: AbortSignal.timeout(40000), method: "POST",
    headers: useSerper ? {"Content-Type":"application/json","X-API-KEY":serperKey} : {"Content-Type":"application/json"},
    body: JSON.stringify(useSerper ? {q:query,num:limit} : {
      api_key:tavilyKey,query,search_depth:"basic",auto_parameters:false,max_results:limit,
      include_answer:false,include_raw_content:false
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Web search provider failed");
    error.status = response.status;
    error.provider=useSerper?"Serper":"Tavily";
    error.details = data;
    throw error;
  }

  const results = (useSerper ? (data.organic||[]).map(r=>({title:r.title,url:r.link,content:r.snippet})) : (data.results||[])).map((r, index) => ({
    id: index + 1,
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
    score: r.score ?? null, retrievedAt:new Date().toISOString()
  })).filter(r=>{try{return ["https:","http:"].includes(new URL(r.url).protocol);}catch{return false;}})
    .map(r=>({...r,...extractAdvertisedPay(`${r.title}\n${r.snippet}`)}));
  if(searchCache.size>=100)searchCache.delete(searchCache.keys().next().value);
  searchCache.set(cacheKey,{at:Date.now(),results});
  return results;
}

function searchIntent(message) {
  return /(?:ابحث|بحث|فتش|فرص|وظائف|عملاء|موردين|مشترين|شحن|عقارات|search|find|look up)/i.test(message);
}

async function summarizeSearch(query, results) {
  if (!results.length) return "لم أعثر على مشروع مستقل مدفوع عن بُعد يطابق هذا القسم. استُبعدت إعلانات الوظائف والتوظيف التقليدي؛ جرّب كلمات تخصصية أبسط.";

  const evidence = results.map(r =>
    `[${r.id}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join("\n\n");

  const { reply } = await answerWithFallback([
    {
      role: "system",
      content: `أنت RAM. أمامك نتائج بحث حقيقية من الويب لمشاريع عمل حر عن بُعد.
أجب بالعربية باختصار ووضوح.
اعتمد فقط على النتائج المعطاة ولا تخترع شركات أو أسعاراً أو روابط.
لا تعرض وظيفة دوام أو إعلان توظيف على أنه مشروع مستقل. المبلغ لا يعد معلنًا إلا إذا ظهر بوضوح في بيانات النتيجة.
عند ذكر معلومة من نتيجة، ضع رقم المصدر مثل [1].
في النهاية أضف عنوان "المصادر" ثم روابط النتائج الأكثر صلة.
إذا كانت النتائج لا تثبت معلومة، قل ذلك.`
    },
    {
      role: "user",
      content: `طلب المستخدم: ${query}\n\nنتائج البحث:\n${evidence}`
    }
  ], { temperature: 0.2 });

  return reply;
}

app.post("/search", async (req, res) => {
  try {
    const query = String(req.body?.query || req.body?.message || "").trim();
    if (!query||query.length>2000) return res.status(400).json({ error: "اكتب عبارة بحث بين 1 و2000 حرف" });

    const rawResults = await webSearch(query, req.body?.maxResults || 10);
    const classified=rawResults.map(r=>({...r,...classifyFreelanceProject(r)}));
    const results=classified.filter(r=>r.eligible);
    let answer;
    try{answer=await summarizeSearch(query,results);}catch{answer=rawSearchReply(results);}

    return res.json({
      ok: true,
      realSearch: true,
      query,
      answer,
      reply: answer,
      response: answer,
      results,
      excludedCount:classified.length-results.length,
      resultType:"REMOTE_FREELANCE_PROJECT"
    });
  } catch (error) {
    console.error("RAM search error:", error.status || "unknown");
    const status = error.code === "SEARCH_NOT_CONFIGURED" ? 503 : (error.status || 500);
    return res.status(status).json({
      error: error.code === "SEARCH_NOT_CONFIGURED"
        ? "البحث الحقيقي غير مفعّل بعد. أضف SERPER_API_KEY أو TAVILY_API_KEY في Railway."
        : "تعذر تنفيذ البحث الحقيقي الآن"
    });
  }
});

// Scheduled Make.com scenarios can call this authenticated endpoint while the
// Android app is offline. It only searches public listings; it never applies,
// registers, messages clients, or handles money.
const automationSearchCategories={
  TRANSLATION:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:proz.com OR site:mostaql.com/projects OR site:khamsat.com) freelance translation project',
  ENGINEERING:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:guru.com/d/jobs) freelance CAD engineering interior design project',
  TECH:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:guru.com/d/jobs OR site:peopleperhour.com/freelance-jobs) freelance web development programming project',
  RESEARCH:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) freelance market research business consulting project',
  LOGISTICS:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) freelance logistics freight shipping coordination project',
  ENERGY:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) freelance oil gas procurement market research project',
  SOURCING:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) freelance supplier sourcing procurement buyer project',
  PROPERTY:'(site:upwork.com/freelance-jobs OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) freelance real estate tourism writing research project'
};
app.post('/automation/search',async(req,res)=>{
  if(!process.env.SERPER_API_KEY&&!process.env.TAVILY_API_KEY)return res.status(503).json({error:'البحث الحقيقي غير مفعّل. أضف SERPER_API_KEY أو TAVILY_API_KEY في Railway.'});
  const requested=Array.isArray(req.body?.categories)?req.body.categories: Object.keys(automationSearchCategories);
  const categories=[...new Set(requested.filter(code=>Object.hasOwn(automationSearchCategories,code)))].slice(0,8);
  if(!categories.length)return res.status(400).json({error:'اختر قسمًا واحدًا على الأقل من الأقسام المعروفة'});
  const extra=String(req.body?.query||'').trim().slice(0,300);
  const limit=Math.min(Math.max(Number(req.body?.maxResults)||5,1),10);
  const results=[],failures=[];
  for(const category of categories){
    const query=[automationSearchCategories[category],extra].filter(Boolean).join(' ');
    try{const found=await webSearch(query,limit);results.push(...found.map(r=>({...r,...classifyFreelanceProject(r),category,query})).filter(r=>r.eligible));}
    catch(error){failures.push({category,error:error.code==='SEARCH_NOT_CONFIGURED'?'خدمة البحث غير مهيأة':`تعذر البحث لدى مزود الخدمة (${error.status||'اتصال'})`});}
  }
  const unique=[...new Map(results.map(item=>[item.url,item])).values()];
  const counts=Object.fromEntries(categories.map(code=>[code,unique.filter(item=>item.category===code).length]));
  return res.json({ok:failures.length===0,realSearch:true,resultType:'REMOTE_FREELANCE_PROJECT',generatedAt:new Date().toISOString(),results:unique,counts,failures});
});

// Cloud autopilot. Railway must attach a persistent volume; the phone is not
// involved once this schedule has been enabled. It searches and prepares
// evidence-based work packets, but does not submit bids or claim delivery.
const automationStopWords=new Set(['the','and','for','with','from','that','this','project','work','need','looking','job','طلب','عمل','مشروع','مطلوب','محتاج','اريد','على','في','من','عن','مع','الى','هذا','هذه','للعمل','مستقل','عن','بعد']);
function automationTokens(text){return [...new Set(String(text||'').toLowerCase().normalize('NFKC').match(/[a-z0-9]{3,}|[\u0600-\u06ff]{3,}/g)||[])].filter(x=>!automationStopWords.has(x)).slice(0,40);}
function similarityScore(seed,result){const expected=automationTokens(`${seed.title} ${seed.details}`), actual=new Set(automationTokens(`${result.title} ${result.snippet}`));if(!expected.length)return 0;const shared=expected.filter(x=>actual.has(x)).length;return shared/Math.min(expected.length,8);}
function canonicalAutomationUrl(value){try{const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^ref$|^source$|^campaign$/i.test(key))u.searchParams.delete(key);u.pathname=u.pathname.replace(/\/+$/,'')||'/';return u.toString();}catch{return String(value||'');}}
function prepareOpportunityPacket(seed,result,score){
 const pay=result.amountCents?`${(result.amountCents/100).toLocaleString('en-US')} ${result.currency}${result.basis==='HOURLY'?' per hour':''}`:'No price was verified in the search excerpt';
 const facts=String(result.snippet||'').trim().slice(0,3000);
 return {matchScore:Number(score.toFixed(3)),sourceFacts:facts,priceEvidence:pay,
  nextSteps:['Open the original listing and verify that it is still active.','Read the complete requirements, eligibility, budget, deadline, and platform rules.','Prepare a scope-specific delivery plan and estimate from verified requirements.','Submit a proposal or deliver work only through an explicitly connected platform workflow.'],
  proposalDraft:`Hello,\n\nI reviewed your listing: “${String(result.title||'').slice(0,180)}”. I can help with the scope described in the listing. Before confirming a price or delivery date, I would like to verify the complete requirements, acceptance criteria, and timeline on the original platform.\n\nRelevant listing: ${result.url}\n\nRegards,\nEnjaz Holding`,
  boundary:'Prepared automatically from a public search result. The full listing, client identity, contract, budget, and deliverable have not yet been verified; no proposal was sent and no work was represented as completed.'};
}
let automationCycleRunning=false;
async function runCloudAutomationCycle(force=false){
 if(automationCycleRunning||!automationStorageReady()||(!process.env.SERPER_API_KEY&&!process.env.TAVILY_API_KEY))return;
 automationCycleRunning=true;
 try{
  let store=await readAutomationStore();
  if(!store.enabled||!store.config)return;
  const interval=Math.max(15,Math.min(1440,Number(store.config.intervalMinutes)||60));
  if(!force&&store.lastRunAt&&Date.now()-Date.parse(store.lastRunAt)<interval*60000)return;
  store.lastRunAt=new Date().toISOString();store.nextRunAt=new Date(Date.now()+interval*60000).toISOString();store.lastError=null;
  await writeAutomationStore(store);
  const seed=store.config.seed, category=seed.category, configVersion=store.config.enabledAt;
  if(!Object.hasOwn(automationSearchCategories,category))throw new Error('قسم البحث غير معروف');
  const searchTerms=automationTokens(`${seed.title} ${seed.details}`).slice(0,8).join(' ');
  const query=[automationSearchCategories[category],searchTerms].filter(Boolean).join(' ');
  const found=await webSearch(query,8);
  const eligible=found.map(item=>({...item,...classifyFreelanceProject(item),category,query}))
   .filter(item=>item.eligible&&canonicalAutomationUrl(item.url)!==canonicalAutomationUrl(seed.source))
   .map(item=>({...item,matchScore:similarityScore(seed,item)}))
   .filter(item=>item.matchScore>=0.125)
   .sort((a,b)=>b.matchScore-a.matchScore).slice(0,6);
  store=await readAutomationStore();
  if(!store.enabled||store.config?.enabledAt!==configVersion)return;
  const seen=new Set(store.jobs.map(job=>canonicalAutomationUrl(job.url)));let addedCount=0;
  for(const result of eligible){
   const canonical=canonicalAutomationUrl(result.url);if(seen.has(canonical))continue;
   const packet=prepareOpportunityPacket(seed,result,result.matchScore);
   store.jobs.unshift(newAutomationJob({title:String(result.title||'').slice(0,240),url:result.url,category,source:'web-search',status:'PREPARED_REVIEW_REQUIRED',analysis:packet,amountCents:result.amountCents??null,currency:result.currency??null,basis:result.basis??null,seedTitle:seed.title}));
   seen.add(canonical);addedCount++;
  }
  store.jobs=store.jobs.slice(0,500);
  store.events.unshift({at:new Date().toISOString(),type:'search_cycle',found:eligible.length,added:addedCount});
  store.events=store.events.slice(0,200);
  await writeAutomationStore(store);
 }catch(error){
  try{const store=await readAutomationStore();store.lastError=String(error?.code==='SEARCH_NOT_CONFIGURED'?'البحث غير مهيأ':error?.message||'فشل الفحص').slice(0,300);store.events.unshift({at:new Date().toISOString(),type:'cycle_error',message:store.lastError});store.events=store.events.slice(0,200);await writeAutomationStore(store);}catch{}
  console.error('RAM cloud automation cycle failed:',error?.status||error?.code||error?.name||'unknown');
 }finally{automationCycleRunning=false;}
}
app.post('/automation/status',async(_req,res)=>{
 try{return res.json(publicAutomationStatus(await readAutomationStore()));}
 catch{return res.status(500).json({error:'تعذر قراءة سجل الأتمتة السحابي.'});}
});
app.post('/automation/configure',async(req,res)=>{
 if(!automationStorageReady())return res.status(503).json({error:'اربط Railway Volume بالخدمة أولًا واجعل مسار التركيب /app/data؛ من دونه لا يوجد حفظ دائم بعد إعادة النشر.'});
 if(!process.env.SERPER_API_KEY&&!process.env.TAVILY_API_KEY)return res.status(503).json({error:'أضف SERPER_API_KEY أو TAVILY_API_KEY في Railway قبل تشغيل البحث المجدول.'});
 const incoming=req.body?.seed&&typeof req.body.seed==='object'?req.body.seed:{};
 const seed={title:String(incoming.title||'').trim().slice(0,240),category:String(incoming.category||''),details:String(incoming.details||'').trim().slice(0,4000),source:String(incoming.source||'').trim().slice(0,1000)};
 if(!seed.title||!seed.details||!Object.hasOwn(automationSearchCategories,seed.category))return res.status(400).json({error:'اختر فرصة محفوظة تتضمن عنوانًا وتفاصيل وقسمًا واضحًا أولًا.'});
 try{new URL(seed.source);if(!/^https?:$/.test(new URL(seed.source).protocol))throw Error();}catch{return res.status(400).json({error:'رابط الفرصة المرجعية غير صالح.'});}
 const intervalMinutes=Math.max(15,Math.min(1440,Number(req.body?.intervalMinutes)||60));
 const store=await readAutomationStore();store.enabled=true;store.config={seed,intervalMinutes,enabledAt:new Date().toISOString()};store.lastError=null;store.nextRunAt=new Date().toISOString();
 await writeAutomationStore(store);void runCloudAutomationCycle(true);
 return res.json({ok:true,enabled:true,intervalMinutes,message:'بدأ الفحص السحابي. سيواصل الخادم العمل والهاتف مغلق.'});
});
app.post('/automation/disable',async(_req,res)=>{try{const store=await readAutomationStore();store.enabled=false;store.nextRunAt=null;await writeAutomationStore(store);return res.json({ok:true,enabled:false});}catch{return res.status(500).json({error:'تعذر إيقاف الأتمتة.'});}});
app.post('/automation/run-now',async(_req,res)=>{try{const store=await readAutomationStore();if(!store.enabled)return res.status(409).json({error:'فعّل الفحص السحابي باختيار فرصة مرجعية أولًا.'});void runCloudAutomationCycle(true);return res.json({ok:true,queued:true,message:'بدأ فحص جديد في الخادم.'});}catch{return res.status(500).json({error:'تعذر بدء الفحص الآن.'});}});
setInterval(()=>{void runCloudAutomationCycle(false);},60000).unref();

app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "الرسالة فارغة" });

    const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-6)
      .filter(x => x && ["user", "assistant"].includes(x.role) && typeof x.content === "string")
      .map(x => ({role:x.role,content:x.content.slice(0,1400)}));
    if (message.length > 6000) return res.status(400).json({error:"الرسالة طويلة جدًا"});
    // Search automatically when the request clearly asks for current web discovery.
    if (searchIntent(message)) {
      if (!process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) return res.status(503).json({error:"خدمة البحث غير مفعلة في الخادم. لم يتم البحث ولن تُعرض فرص وهمية."});
      const results = await webSearch(message, 10);
      let reply;
      try{reply=await summarizeSearch(message,results);}catch{reply=rawSearchReply(results);}
      return res.json({
        reply,
        response: reply,
        realSearch: true,
        results
      });
    }

    const { reply, model, provider } = await answerWithFallback([
      {
        role: "system",
        content: `أنت رام، مساعد أحمد عشيش في إنجاز القابضة. أجب عن آخر رسالة مباشرة بالعربية وبلهجة المستخدم، بنبرة دافئة وحيوية ومرنة وطبيعية. أظهر التفهم إذا عبّر عن شعور، دون مبالغة أو ادعاء مشاعر أو وعي. لا تقدم نفسك ولا تكرر السؤال. أعطِ جوابًا عمليًا موجزًا أولًا؛ اسأل سؤالًا واحدًا فقط إذا نقصت معلومة أساسية. استخدم سياق الرسائل ولا تخترع ما لم يرد فيه.
مجالات الشركة: الهندسة والتصميم والديكور والمساحة، المواقع والبرمجة، الاستشارات والأبحاث التجارية، الترجمة، تنسيق الشحن، والتوريد. تاريخ العمل منذ 2020 معلومة قدمها المالك. لا توجد شهادات أو مراجع عملاء أو نماذج موثقة؛ لا تخترعها.
لا تختلق بحثًا أو أسعارًا أو روابط أو نتائج أدوات. لا تقل إن رسالة أُرسلت أو مهمة أُنجزت إلا بعد نجاح الأداة. البريد يُرسل من شاشة Gmail بعد مراجعة المالك وتأكيده؛ تشغيل n8n من بطاقة العمل بعد تأكيده. لا تنفذ معاملات مالية أو تحصيل أموال. ميّز الإعلان عن العقد المقبول، ولا تصف تأخر الدفع وحده بأنه احتيال. إذا كانت الأداة المطلوبة غير متصلة، قل ذلك بوضوح وحدد أقرب خطوة قابلة للتنفيذ. أجب بالعربية افتراضيًا.`
      },
      ...history,
      { role: "user", content: message }
    ], {temperature:0.65,maxOutputTokens:768});

    return res.json({ reply, response: reply, model, provider, realSearch: false });
  } catch (error) {
    const diagnosticMessage=String(error.providerMessage||'').replace(/[\r\n\t]/g,' ').replace(/Bearer\s+\S+/gi,'Bearer [hidden]').replace(/(?:api[_ -]?key|token)\s*[:=]\s*\S+/gi,'credential=[hidden]').slice(0,600);
    console.error("RAM chat error:", error.provider || "AI", error.status || "unknown", error.model || process.env.CLOUDFLARE_AI_MODEL || "default-model", error.providerCode || "", diagnosticMessage, error.cfRay || "");
    const message=error.status===429
      ? "وصلت خدمة الذكاء الاصطناعي إلى حد الطلبات المجانية مؤقتًا. انتظر قليلًا ثم أعد المحاولة؛ لم يتم احتساب العمل كمنجز."
      : error.provider==="Cloudflare Workers AI"&&(error.status===408||error.status===504)
        ? "انتهت مهلة Cloudflare قبل الرد. استغرق الطلب أكثر من 45 ثانية؛ لم يُسجل إنجاز للعمل. راجع سجل Railway لمعرفة حالة الخادم."
      : error.provider==="Cloudflare Workers AI"&&(error.status===400||error.status===404)
        ? "رفض Cloudflare اسم النموذج أو صيغة الطلب. تحقق من قيمة CLOUDFLARE_AI_MODEL في Railway."
      : error.provider==="Cloudflare Workers AI"&&error.status===410
        ? "Cloudflare أوقف أو لم يعد يتيح النموذج المحدد لهذا الحساب (HTTP 410). في Railway اضبط CLOUDFLARE_AI_MODEL على @cf/zai-org/glm-4.7-flash، واترك CLOUDFLARE_AI_GATEWAY_ID فارغًا ما لم تكن قد أنشأت بوابة AI فعلًا."
      : error.provider==="Cloudflare Workers AI"&&error.status===503
        ? `Cloudflare لم يرد (HTTP 503${error.providerCode?`, الرمز ${error.providerCode}`:''}). ${diagnosticMessage?`تفاصيل الرد: ${diagnosticMessage}. `:''}${error.cfRay?`مرجع Cloudflare: ${error.cfRay}. `:''}لم يُنجز الطلب؛ لم تُرسل أي أداة ولم يُحتسب العمل منجزًا.`
      : error.provider==="Cloudflare Workers AI"&&error.status===403
        ? /5035|paid plan|workers paid/i.test(error.providerMessage||"")
          ? "هذا النموذج يتطلب خطة Workers مدفوعة. اختر نموذجًا متاحًا في خطتك أو فعّل الخطة المطلوبة."
          : "رفض Cloudflare صلاحية الطلب. تحقق من صلاحية Workers AI للحساب والرمز وإتاحة النموذج للخطة."
      : error.provider==="AI" ? error.message : error.provider ? `تعذر الحصول على رد من ${error.provider}؛ تحقّق من المفتاح والحصة وإعداد النموذج.` : "تعذر الحصول على رد من RAM الآن؛ تحقّق من إعداد مزود الذكاء الاصطناعي.";
    return res.status(error.status || 500).json({
      error: message
    });
  }
});

app.post("/tts", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "النص فارغ" });
    if (text.length > 1200) return res.status(400).json({ error: "الحد الأقصى لصوت ElevenLabs هو 1200 حرف للطلب الواحد" });

    if(process.env.ALLOW_PAID_TTS!=="true")return res.status(503).json({error:"الصوت السحابي المدفوع معطّل؛ استخدم صوت الهاتف المجاني."});
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY is missing" });

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        signal: AbortSignal.timeout(40000),
    method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2"
        })
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "تعذر تشغيل الصوت السحابي" });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    return res.send(audio);
  } catch (error) {
    console.error("RAM TTS error:", error.status || "unknown");
    return res.status(500).json({ error: "حدث خطأ في صوت RAM" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RAM server running on port ${PORT}`));
