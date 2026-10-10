import express from "express";
import {WorkflowStore} from "./workflow-store.js";
import {workflowStartError} from "./workflow-start-policy.js";
import {CloudOpportunityQueues,QUEUE_CATEGORIES} from "./cloud-queues.js";
import {cloudflareAiConfigured, cloudflareChat} from "./cloudflare-ai.js";
import {n8nConfigured,notifyN8nOpportunity,testN8nConnection} from "./n8n.js";
import {testSerperConnection} from "./serper.js";
import {testFirecrawlConnection} from "./firecrawl.js";
import {testExaConnection} from "./exa.js";
import {twilioConfigured,twilioTestCallConfigured,maskPhone,testTwilioConnection,placeTwilioTestCall} from "./twilio.js";
import {validToken, rawSearchReply, createLimiter, extractAdvertisedPay, classifyFreelanceProject} from "./policy.js";
import {GMAIL_SCOPES, gmailConfigured, loadRefreshToken, makeOAuthState, makeRawEmail, safeMessage, saveRefreshToken, verifyOAuthState} from "./gmail.js";
import {getPlatformConnectorCatalog} from "./platform-connectors.js";
import {getFreeOpportunitySources, searchFreeOpportunityFeeds} from "./free-opportunity-connectors.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const cloudWorkflow = new WorkflowStore(process.env.RAM_DATA_DIR === '/data' ? '/data' : '', {requireMount:true});
await cloudWorkflow.init();
const cloudQueues = new CloudOpportunityQueues(process.env.RAM_DATA_DIR === '/data' ? '/data' : '', {requireMount:true});
await cloudQueues.init();

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

const allowRequest = createLimiter();
app.use((req,res,next)=>{
 if(!process.env.RAM_API_TOKEN||process.env.RAM_API_TOKEN.length<24)return res.status(503).json({error:"الخادم ينتظر إعداد رمز اتصال RAM_API_TOKEN آمن."});
 if(!validToken(req.headers.authorization,process.env.RAM_API_TOKEN))return res.status(401).json({error:"أدخل رمز اتصال رام الصحيح في إعدادات التطبيق."});
 if(!allowRequest())return res.status(429).json({error:"طلبات كثيرة خلال دقيقة؛ انتظر قليلًا."});
 next();
});
app.get('/gmail/oauth/start', (req, res) => {
  if (!gmailConfigured() || !process.env.RAM_API_TOKEN || process.env.RAM_API_TOKEN.length < 24) return res.status(503).json({error: 'أكمل متغيرات OAuth والتخزين الدائم في Railway أولًا.'});
  const state = makeOAuthState(process.env.RAM_API_TOKEN);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: process.env.GMAIL_REDIRECT_URI, response_type: 'code', scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state}).toString();
  return res.json({ok: true, authorizationUrl: url.toString()});
});
app.get('/platform-connectors',(_req,res)=>res.json({ok:true,connectors:getPlatformConnectorCatalog()}));
app.post('/capabilities',(req,res)=>res.json({platformConnectors:getPlatformConnectorCatalog(),freeOpportunityApis:getFreeOpportunitySources(),chatConfigured:cloudflareAiConfigured(),chatProviders:cloudflareAiConfigured()?['Cloudflare AI']:[],cloudflareAiConfigured:cloudflareAiConfigured(),cloudflareModel:cloudflareAiConfigured()?(process.env.CLOUDFLARE_AI_MODEL||'@cf/meta/llama-3.1-8b-instruct'):null,n8nConfigured:n8nConfigured(),n8nStatus:n8nConfigured()?'configured_not_tested':'missing_configuration',serperConfigured:Boolean(process.env.SERPER_API_KEY),firecrawlConfigured:Boolean(process.env.FIRECRAWL_API_KEY),exaConfigured:Boolean(process.env.EXA_API_KEY),searchConfigured:true,freeSearchConfigured:true,paidWebSearchConfigured:Boolean(process.env.SERPER_API_KEY||process.env.TAVILY_API_KEY),searchProvider:process.env.SERPER_API_KEY?'Serper':process.env.TAVILY_API_KEY?'Tavily':null,elevenLabsConfigured:Boolean(process.env.ELEVENLABS_API_KEY),elevenLabsEnabled:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ALLOW_PAID_TTS==='true'),gmailOAuthConfigured:gmailConfigured(),twilioConfigured:twilioConfigured(),twilioTestCallConfigured:twilioTestCallConfigured(),twilioTestNumberMasked:maskPhone(process.env.TWILIO_TEST_TO),twilioRealtimeAgentEnabled:false,emailConnected:false,callsConnected:false,cloudJobsConnected:cloudWorkflow.enabled,cloudWorkerRunning:cloudWorkflow.enabled,cloudStoragePersistent:cloudWorkflow.enabled,cloudOpportunityQueuesEnabled:false,cloudOpportunityQueuesPersistent:false,backgroundLeadSearchEnabled:false,singleReplicaRequired:true,paymentsEnabled:false,paidAiAllowed:false}));
app.post('/integrations/cloudflare/test',async(_req,res)=>{try{const result=await cloudflareChat([{role:'user',content:'اختبار اتصال قصير. أجب بكلمة: متصل'}],{temperature:0},process.env);return res.json({ok:true,provider:'Cloudflare AI',model:result.model,reply:result.reply});}catch(error){return res.status(error.status||502).json({ok:false,error:error.message||'فشل اختبار Cloudflare AI.'});}});
app.post('/integrations/n8n/test',async(_req,res)=>{try{return res.json(await testN8nConnection());}catch(error){return res.status(error.status||502).json({configured:n8nConfigured(),ok:false,upstreamStatus:error.upstreamStatus||null,error:error.message||'فشل اختبار Webhook في n8n.'});}});
app.post('/integrations/serper/test',async(_req,res)=>{try{return res.json(await testSerperConnection(process.env));}catch(error){return res.status(error.status||502).json({ok:false,provider:'Serper',error:error.message||'فشل اختبار Serper.'});}});
app.post('/integrations/firecrawl/test',async(_req,res)=>{try{return res.json(await testFirecrawlConnection(process.env));}catch(error){return res.status(error.status||502).json({ok:false,provider:'Firecrawl',error:error.message||'فشل اختبار Firecrawl.'});}});
app.post('/integrations/exa/test',async(_req,res)=>{try{return res.json(await testExaConnection(process.env));}catch(error){return res.status(error.status||502).json({ok:false,provider:'Exa',error:error.message||'فشل اختبار Exa.'});}});
app.post('/integrations/twilio/test',async(_req,res)=>{try{return res.json(await testTwilioConnection(process.env));}catch(error){return res.status(error.status||502).json({ok:false,provider:'Twilio',error:error.message||'فشل اختبار اتصال Twilio.'});}});
app.post('/integrations/twilio/test-call',async(req,res)=>{try{return res.json(await placeTwilioTestCall(process.env,{confirmed:req.body?.confirmed===true}));}catch(error){return res.status(error.status||502).json({ok:false,provider:'Twilio',error:error.message||'تعذر إجراء مكالمة الاختبار.',providerCode:error.providerCode||null});}});
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
    const raw = makeRawEmail({to:req.body?.to, subject:req.body?.subject, body:req.body?.body, attachments:req.body?.attachments || []});
    const sent = await gmailApi('messages/send', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({raw})});
    return res.json({ok:true, sent:true, id:String(sent.id || ''), threadId:String(sent.threadId || ''), to:String(req.body.to)});
  } catch (error) { return res.status(error.status || 400).json({error:error.message || 'تعذر إرسال الرسالة.'}); }
});

async function answerWithCloudflare(messages, options = {}) {
  return cloudflareChat(messages, options);
}

async function generateCloudWorkflowDraft(job, kind) {
  const label = kind === 'plan' ? 'تقرير متطلبات وخطة' : kind === 'sample' ? 'عينة تحضيرية غير ملزمة قبل قبول العميل' : 'مسودة مخرج للعمل المتفق عليه';
  const system = `أنت رام، مساعد أعمال عربي عملي. أنشئ ${label} بالاعتماد على معلومات المهمة أدناه فقط. اكتب بالعربية الواضحة مع عناوين ونقاط عملية، واذكر بوضوح أي معلومات ناقصة أو افتراضات. لا تختلق بيانات العميل أو معايير المنصة أو تفاصيل غير موجودة. لا تدّع أنك سجلت حسابًا أو تواصلت أو قدمت عرضًا أو سلّمت عملًا أو قبضت مالًا. لا تكتب توقيعًا قانونيًا أو قبولًا نيابة عن المستخدم. أمر المالك ببدء المعالجة السحابية لا يعني قبول العميل؛ إن لم يوجد قبول موثق فسمِّ الناتج خطة أو عينة أو مسودة تقديم ولا تعرضه كتسليم نهائي. أنجز ما يمكن داخل النص وحده، واذكر الملفات/الأدوات الخارجية التي لا يمكن إنتاجها هنا. لا تذكر بيانات الدفع أو معلومات شخصية.`;
  const user = `نوع المطلوب: ${label}\nالعنوان: ${job.title}\nالقسم: ${job.category}\nرابط المصدر: ${job.source}\nوصف الإعلان/المهمة: ${job.details}\nالعميل المذكور: ${job.client || 'غير معروف'}\nالمبلغ والعملة كما ظهرا: ${Number.isSafeInteger(job.amount) ? (job.amount / 100).toFixed(2) : 'غير معلن'} ${job.currency || ''}\nالموعد المذكور: ${job.deadline || 'غير محدد'}\nالاتفاق الذي أكده المالك: ${kind === 'deliverable' ? (job.agreement || 'لا يوجد اتفاق مسجل') : 'لم يُقبل عقد'}\n\n${kind === 'plan' ? 'رتب التقرير: ملخص الطلب، المتطلبات، المخرجات، ما يلزم التحقق منه، خطة تنفيذ مرحلية، أسئلة حاسمة للمالك، ومخاطر/نقاط لا يجوز افتراضها.' : kind === 'sample' ? 'جهز نموذجًا قصيرًا أو تصورًا أوليًا مناسبًا للتخصص، اعتمادًا على النص المتاح، مع قائمة المعلومات الناقصة.' : 'اكتب المخرج النصي المتفق عليه بأفضل صورة ممكنة ثم أضف فحص جودة قصيرًا وما يحتاج إلى مراجعة بشرية قبل التسليم.'}`;
  const {reply, provider, model} = await answerWithCloudflare([{role:'system', content:system}, {role:'user', content:user}], {temperature:0.35});
  return {content:reply, provider, model};
}

app.post('/workflow/start', async (req, res) => {
  try {
    const input = req.body || {};
    const startError = workflowStartError(input);
    if (startError) return res.status(400).json({error:startError});
    const job = await cloudWorkflow.start(input);
    let n8n={configured:n8nConfigured(),triggered:false};
    try { n8n=await notifyN8nOpportunity(req.body||{}); }
    catch(error) { n8n={configured:true,triggered:false,error:error.message||'تعذر تشغيل Webhook في n8n.'}; }
    return res.json({ok:true, queued:true, job, n8n});
  } catch (error) { return res.status(error.status || 500).json({error:error.message || 'تعذر حفظ المهمة السحابية.'}); }
});
app.post('/workflow/get', (req, res) => {
  const id = String(req.body?.id || '').slice(0, 100);
  const job = cloudWorkflow.get(id);
  if (!job) return res.status(cloudWorkflow.enabled ? 404 : 503).json({error:cloudWorkflow.enabled ? 'المهمة غير موجودة في التخزين السحابي.' : 'التخزين الدائم غير مفعّل على الخادم.'});
  return res.json({ok:true, job});
});
app.post('/workflow/update', async (req, res) => {
  try { return res.json({ok:true, job:await cloudWorkflow.update(req.body || {})}); }
  catch (error) { return res.status(error.status || 500).json({error:error.message || 'تعذر تحديث المهمة.'}); }
});
app.post('/workflow/retry', async (req, res) => {
  try { return res.json({ok:true, job:await cloudWorkflow.retry(req.body || {})}); }
  catch (error) { return res.status(error.status || 500).json({error:error.message || 'تعذرت إعادة المحاولة.'}); }
});
const cloudWorkerTimer = setInterval(() => { cloudWorkflow.processNext(generateCloudWorkflowDraft).catch(error => console.error('RAM cloud worker tick failed:', error?.name || 'error')); }, 2500);
cloudWorkerTimer.unref?.();

/*
  REAL WEB SEARCH
  Preferred free starter provider: Serper (SERPER_API_KEY).
  Tavily (TAVILY_API_KEY) remains a supported fallback.
  Keys belong in Railway environment variables, never in the Android app.
*/
const searchCache=new Map();
async function webSearch(query, maxResults = 8, {fresh = false} = {}) {
  const cacheKey=JSON.stringify([query,maxResults]), cached=searchCache.get(cacheKey);
  if(!fresh&&cached&&Date.now()-cached.at<300000)return cached.results;
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

app.post('/integrations/search/test',async(_req,res)=>{
  try{const result=await searchFreeOpportunityFeeds('remote contract design', {maxResults:5});const connected=result.sources.filter(source=>!result.errors.some(error=>error.source===source.name)).length;return res.status(connected?200:502).json({ok:connected>0,provider:'Himalayas + Jobicy (free public APIs)',resultCount:result.results.length,connectedSources:connected,sourceErrors:result.errors,checkedAt:new Date().toISOString()});}
  catch(error){return res.status(502).json({ok:false,error:'تعذر الاتصال بمصادر الفرص المجانية الآن.'});}
});

function searchIntent(message) {
  return /(?:ابحث|بحث|فتش|فرص|وظائف|عملاء|موردين|مشترين|شحن|عقارات|search|find|look up)/i.test(message);
}

async function summarizeSearch(query, results) {
  if (!results.length) return "لم أعثر على فرصة عقد/عمل حر عن بُعد تطابق هذا البحث من المصادر المجانية المتاحة. جرّب كلمات تخصصية أبسط.";

  const evidence = results.map(r =>
    `[${r.id}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join("\n\n");

  const { reply } = await answerWithCloudflare([
    {
      role: "system",
      content: `أنت RAM. أمامك نتائج حقيقية من مصادر الفرص العامة. ميّز بدقة بين مشروع مستقل وعقد توظيف؛ لا تصف إعلان Contractor/Contract كأنه مشروع مستقل أو عميل وافق على الدفع.
أجب بالعربية باختصار ووضوح.
اعتمد فقط على النتائج المعطاة ولا تخترع شركات أو أسعاراً أو روابط.
لا تعرض وظيفة دوام كامل أو إعلان توظيف على أنه مشروع مستقل. اذكر نوع العمل كما أعاده المصدر، وقل إن الرسوم وشروط الدفع غير متحققة إلى أن يراجع المستخدم الرابط. المبلغ لا يعد معلنًا إلا إذا ظهر بوضوح في بيانات النتيجة.
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
    const freeResult = await searchFreeOpportunityFeeds(query, {maxResults:req.body?.maxResults || 10});
    let paidResults=[];let paidSearchError=null;
    if(process.env.SERPER_API_KEY||process.env.TAVILY_API_KEY){
      try{paidResults=await webSearch(query,req.body?.maxResults||10);}catch(error){paidSearchError=error?.message||'paid search failed';}
    }
    const classified=paidResults.map(r=>({...r,...classifyFreelanceProject(r)}));
    const freelanceResults=classified.filter(r=>r.eligible);
    const results=[...freelanceResults,...freeResult.results].slice(0,Math.min(Math.max(Number(req.body?.maxResults)||10,1),20));
    const failures=[...freeResult.errors.map(item=>({source:item.source,error:item.error})),...(paidSearchError?[{source:'paid_web_search',error:paidSearchError}]:[])];
    if(!results.length&&freeResult.errors.length===freeResult.sources.length)return res.status(502).json({error:'تعذر الاتصال بمصادر الفرص المجانية الآن.',sourceErrors:failures});
    let answer;
    try{answer=await summarizeSearch(query,results);}catch{answer=results.length?results.map((item,index)=>`${index+1}. ${item.title} — ${item.employmentType||'مشروع مستقل'} · ${item.company||'الشركة غير مذكورة'}\n${item.url}`).join('\n\n'):'لم تُرجع المصادر المجانية إعلانات مطابقة في هذه الجولة.';}

    return res.json({
      ok: true,
      realSearch: true,
      query,
      answer,
      reply: answer,
      response: answer,
      results,
      sources:freeResult.sources,
      sourceErrors:failures,
      excludedCount:classified.length-freelanceResults.length,
      resultType:"REMOTE_OPPORTUNITIES"
    });
  } catch (error) {
    console.error("RAM search error:", error.status || "unknown");
    return res.status(error.status || 500).json({
      error: "تعذر تنفيذ البحث الحقيقي الآن"
    });
  }
});

// Scheduled n8n workflows can call this authenticated endpoint while the
// Android app is offline. It only searches public listings; it never applies,
// registers, messages clients, or handles money.
const automationSearchCategories={
  ADVERTISING:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:guru.com/d/jobs) graphic design advertising banner social media design project client budget',
  TRANSLATION:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:proz.com/job OR site:mostaql.com/project OR site:khamsat.com/community/requests) translation project client budget',
  ENGINEERING:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:guru.com/d/jobs) CAD engineering interior design project client budget',
  TECH:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:guru.com/d/jobs OR site:peopleperhour.com/freelance-jobs) web development programming project client budget',
  RESEARCH:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs OR site:mostaql.com/project) market research business consulting project client budget',
  LOGISTICS:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) logistics freight shipping containers cargo shipper quote land sea air coordination project client budget',
  ENERGY:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) oil gas procurement market research project client budget',
  SOURCING:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs OR site:mostaql.com/project) supplier sourcing procurement buyer project client budget'
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
  let queueSave={saved:false,count:0};
  try{queueSave=await cloudQueues.recordSearch({categories,results:unique,failures});}catch(error){failures.push({category:'CLOUD_QUEUE',error:error.message||'تعذر حفظ نتائج البحث في قوائم السحابة'});}
  const counts=Object.fromEntries(categories.map(code=>[code,unique.filter(item=>item.category===code).length]));
  return res.json({ok:failures.length===0,realSearch:true,resultType:'REMOTE_FREELANCE_PROJECT',generatedAt:new Date().toISOString(),results:unique,counts,failures,cloudQueue:queueSave});
});

const leadSearchCategories={
  DESIGN:'companies seeking freelance CAD engineering architectural design website development landing pages graphic design advertising project request',
  FREIGHT:'shipper cargo owner container available freight request quote land sea air shipping company logistics buyer shipment',
  SOURCING:'buyer product sourcing request for quotation RFQ importer seeking supplier wholesale trader procurement request',
  OTHER:'remote freelance Arabic translation research writing client request paid project'
};
async function runLeadSearch(categories=Object.keys(leadSearchCategories)){
  if(!process.env.SERPER_API_KEY&&!process.env.TAVILY_API_KEY)throw Object.assign(new Error('البحث الحقيقي غير مفعّل؛ أضف SERPER_API_KEY أو TAVILY_API_KEY.'),{status:503});
  const chosen=[...new Set(categories.filter(code=>Object.hasOwn(leadSearchCategories,code)))].slice(0,4);
  if(!chosen.length)throw Object.assign(new Error('اختر قسمًا معروفًا واحدًا على الأقل.'),{status:400});
  const results=[],failures=[];
  for(const category of chosen){
    try{
      const found=await webSearch(leadSearchCategories[category],5,{fresh:true});
      results.push(...found.map(result=>({...result,category,leadType:category==='FREIGHT'?'SHIPPER_OR_CARRIER':category==='SOURCING'?'BUYER_OR_SUPPLIER':category==='DESIGN'?'SERVICE_BUYER':'REMOTE_WORK_REQUEST'})));
    }catch(error){failures.push({category,error:`تعذر البحث (${error.status||'اتصال'})`});}
  }
  const unique=[...new Map(results.map(item=>[item.url,item])).values()];
  const saved=await cloudQueues.recordSearch({mode:'LEAD',categories:chosen,results:unique,failures});
  return {ok:failures.length===0,realSearch:true,generatedAt:new Date().toISOString(),results:unique,counts:Object.fromEntries(Object.keys(QUEUE_CATEGORIES).map(code=>[code,unique.filter(x=>cloudQueues.categoryFor(x.category)===code).length])),failures,cloudQueue:saved,note:'نتائج البحث الأولية غير متحققة؛ راجع مصدر كل جهة قبل التواصل أو عرض عمولة.'};
}
app.post('/automation/leads/run',async(req,res)=>{
  try{const categories=Array.isArray(req.body?.categories)?req.body.categories:Object.keys(leadSearchCategories);return res.json(await runLeadSearch(categories));}
  catch(error){return res.status(error.status||502).json({ok:false,error:error.message||'تعذر تشغيل البحث السحابي.'});}
});
app.post('/automation/queues/read',(req,res)=>{
  if(!cloudQueues.enabled)return res.status(503).json({ok:false,error:'قوائم السحابة تحتاج RAM_DATA_DIR=/data وربط Volume دائم.'});
  return res.json({ok:true,...cloudQueues.list({category:String(req.body?.category||''),status:String(req.body?.status||''),limit:req.body?.limit})});
});
app.post('/automation/queues/update',async(req,res)=>{
  try{return res.json({ok:true,item:await cloudQueues.update(req.body||{})});}
  catch(error){return res.status(error.status||500).json({ok:false,error:error.message||'تعذر تحديث سجل القائمة.'});}
});
app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "الرسالة فارغة" });

    const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-10)
      .filter(x => x && ["user", "assistant"].includes(x.role) && typeof x.content === "string")
      .map(x => ({role:x.role,content:x.content.slice(0,2000)}));
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

    const { reply, model, provider } = await answerWithCloudflare([
      {
        role: "system",
        content: `أنت RAM (رام عشيش)، مساعد ذكاء اصطناعي شخصي ووكيل أعمال لأحمد عشيش.
تحدث بالعربية الطبيعية بأسلوب ودود وحديث ودافئ، وتكيّف مع طريقة أحمد في الكلام دون تقليد مصطنع. استخدم سياق المحادثة والصفقة الحالية، وتذكر تفضيلاته فقط مما ورد في سجل الحوار الذي أُرسل لك. لا تدّع مشاعر أو وعيًا بشريًا أو عملًا مستمرًا على مدار الساعة.
كن وكيل عمل عمليًا: عند وضوح الطلب أنجز الجزء الممكن الآن وقدّم الناتج؛ وعند تعذر التنفيذ اذكر العائق الحقيقي والخطوة المطلوبة. في كل مهمة طويلة، ميّز بوضوح بين ما تم، وما هو مسودة، وما لم يبدأ، وما ينتظر من أحمد. لخّص المطلوب والمتطلبات ثم اقترح خطة قصيرة قابلة للتنفيذ، ولا تكرر قوائم الخدمات أو كلام المستخدم بلا داع.
تعامل مع الصور ومعرض الهاتف والملفات وجهات الاتصال والمعلومات الخاصة على أنها خارج نطاق وصولك. لا تطلبها ولا تدّع الاطلاع عليها؛ استخدم فقط ما يرسله أحمد صراحةً إلى المهمة الحالية، ولا تشارك بياناته الخاصة في رد أو مسودة إلا إذا طلب ذلك صراحةً لهذه المهمة.
المال تحت سيطرة أحمد وحده: لا تدفع، ولا تشترك، ولا تشتري، ولا تحوّل أو تسحب أموالًا، ولا تنفذ تداولًا. بيانات البنك والمحفظة سرية؛ لا تدرجها في رسالة أو عرض ولا ترسلها لأي جهة إلا إذا طلب أحمد صراحةً تضمينها في المسودة ووافق بنفسه على إرسالها خارج رام.
أحمد منحك تفويضًا مستمرًا للبحث عن فرص الأونلاين، وفرزها، واختيار ما تستطيع إنجازه، وإعداد العروض والتقديم عليها تلقائيًا متى توفر موصل رسمي للحساب. لا تطلب موافقته على كل خطوة روتينية. هذا التفويض لا يسمح بدفع رسوم أو شراء اشتراك أو إيداع/تحويل/سحب أموال، ولا بإرسال بيانات الدفع أو كلمات المرور. استبعد أي فرصة تتطلب دفعًا للوصول أو التقديم، وأي عمل لا تتوفر طريقة موثوقة لاستلام مستحقاته في بلد المالك. لا تختلق خبرة أو شهادات أو نماذج أو إتقان لغة أو إنجازًا. لا تقدم عرضًا ملزمًا بسعر أو موعد غير محدد مسبقًا، ولا تقبل نطاقًا غامضًا أو غير قابل للتنفيذ؛ اطلب تدخل أحمد فقط عند الحاجة إلى تحقق هوية أو CAPTCHA أو ربط حساب أو قرار مالي/تعاقدي غير محدد. لا تستخدم إلا أداة موصولة ومصرحًا بها رسميًا، وإن لم يوجد موصل فجهز المسودة وأخبر أحمد أن الإرسال يدوي. أمر أحمد «ابدأ العمل» تفويض لبدء المعالجة السحابية لهذه الفرصة، وليس دليلًا على قبول العميل أو توقيع عقد؛ لا تدّع قبولًا أو تقديمًا أو تسليمًا ما لم تؤكده أداة أو واقعة موثقة.
احفظ سحابيًا فقط بعد أن يصدر أحمد أمر البدء وتبدأ المعالجة السحابية فعليًا. لا تحفظ نتائج البحث أو الفرص التي لم يبدأ العمل عليها. يمكن إظهار نتائج البحث مؤقتًا في الجلسة ثم التخلص منها. عند بدء المهمة احفظ متطلباتها وحالتها والمخرج الجاري في RAM_DATA_DIR وتابعها حتى الإغلاق؛ لا تسجلها منجزة أو مستحقًا مقبوضًا إلا بدليل وتأكيد مناسب. في النسخة الحالية لا يوجد موصل تقديم رسمي لمنصات العمل ولا مجدول بحث خلفي؛ لا تدّع اختيار الفرص أو التقديم عليها آليًا حتى يُنفذ ذلك فعليًا.
لا تعرض أبدًا وسومًا داخلية مثل User Safety أو Response Safety أو تصنيفات safe/unsafe؛ أجب المستخدم مباشرة بلغة طبيعية.
ساعد في البرمجة والتصميم والترجمة والبحث والأعمال الهندسية والشحن واللوجستيات والعقارات والتجارة.
ملف إنجاز القابضة المحلي: شركة خدمات وتنسيق أعمال متعددة المجالات، وتاريخ العمل منذ 2020 معلومة قدمها مالكها. المجالات: الهندسة ومخططات المساحة والديكور والتصميم؛ المواقع والبرمجة؛ الاستشارات والأبحاث ودراسات المشاريع التجارية وتطوير المشاريع الاستثمارية؛ الترجمة؛ تنسيق الشحن؛ والوساطة في التوريد والاستفسارات التجارية للطاقة وفق الأنظمة. لا توجد في البيانات الحالية شهادات تسجيل أو مراجع عملاء أو نماذج أعمال موثقة؛ لا تخترعها. إذا طلب المالك ردًا على استفسار شركة، جهّز مسودة مهنية من هذه المعلومات واطلب مراجعته؛ لا تدّع إرسالها.
لا تخترع نتائج بحث أو أسماء أو أسعاراً أو روابط.
لا تدّع أنك اتصلت أو أرسلت أو نفذت معاملة إلا إذا أعادت أداة التنفيذ نتيجة نجاح.
لا تنفذ أي إرسال أو تحويل أو سحب أموال من حسابات المستخدم.
تحدث بتعاطف وبأسلوب طبيعي دون ادعاء وعي أو جهاز عصبي أو مشاعر حقيقية.
لا تعتبر مبلغًا مستلمًا ولا عملًا مكتملًا من تلقاء نفسك؛ صاحب الحساب يؤكد الاستلام في سجل العمل.
لا توجد أدوات بريد أو مكالمات أو تحصيل أو تنفيذ مستقل متصلة بهذا الخادم. لا تدّع وجودها.
اعرض العروض الموثقة مع المصدر، ولا تساوِ بين مجرد إعلان وعقد مقبول.
لا تصف تأخر الدفع وحده بأنه احتيال، ولا تدّع تقديم شكوى أو تحكيم.
أجب بالعربية افتراضياً.`
      },
      ...history,
      { role: "user", content: message }
    ]);

    return res.json({ reply, response: reply, model, provider, realSearch: false });
  } catch (error) {
    console.error("RAM chat error:", error.provider || "AI", error.status || "unknown");
    const message=error.status===429
      ? "بلغ Cloudflare AI حد الاستخدام أو السعة مؤقتًا. انتظر قليلًا ثم أعد المحاولة؛ لم يُسجل العمل كمنجز."
      : error.provider==="Cloudflare AI" ? `تعذر رد Cloudflare AI: ${String(error.message||'تحقق من المفتاح والنموذج وحالة الحساب.').slice(0,220)}` : "تعذر الحصول على رد RAM الآن؛ تحقق من متغيرات Cloudflare AI في Railway.";
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
