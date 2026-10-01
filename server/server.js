import express from "express";
import {validToken, maxOutputTokens, openRouterModels, rawSearchReply, createLimiter, extractAdvertisedPay, classifyFreelanceProject} from "./policy.js";
import {GMAIL_SCOPES, gmailConfigured, loadRefreshToken, makeOAuthState, makeRawEmail, safeMessage, saveRefreshToken, verifyOAuthState} from "./gmail.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
app.post('/capabilities',(req,res)=>res.json({chatConfigured:Boolean((process.env.OPENAI_API_KEY&&process.env.ALLOW_OPENAI_API==='true')||process.env.OPENROUTER_API_KEY||(process.env.GEMINI_API_KEY&&process.env.ALLOW_GEMINI_API==='true')),chatProviders:[(process.env.OPENAI_API_KEY&&process.env.ALLOW_OPENAI_API==='true')?'OpenAI API':'',process.env.OPENROUTER_API_KEY?'OpenRouter':'',(process.env.GEMINI_API_KEY&&process.env.ALLOW_GEMINI_API==='true')?'Gemini fallback':''].filter(Boolean),openAIConfigured:Boolean(process.env.OPENAI_API_KEY),openAIEnabled:process.env.ALLOW_OPENAI_API==='true',searchConfigured:Boolean(process.env.SERPER_API_KEY||process.env.TAVILY_API_KEY),searchProvider:process.env.SERPER_API_KEY?'Serper':process.env.TAVILY_API_KEY?'Tavily':null,makeSchedulerSupported:true,elevenLabsConfigured:Boolean(process.env.ELEVENLABS_API_KEY),elevenLabsEnabled:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ALLOW_PAID_TTS==='true'),gmailOAuthConfigured:gmailConfigured(),emailConnected:false,callsConnected:false,cloudJobsConnected:false,paymentsEnabled:false,paidAiAllowed:false}));
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
      models: openRouterModels(process.env),
      max_tokens: maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS),
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
      generationConfig:{temperature:options.temperature??0.35,maxOutputTokens:maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS)}
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
    body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.4-mini',instructions:system,input,max_output_tokens:maxOutputTokens(process.env.AI_MAX_OUTPUT_TOKENS),store:false})
  });
  const data=await response.json();
  if(!response.ok){const error=new Error('OpenAI Responses API request failed');error.status=response.status;error.provider='OpenAI API';throw error;}
  const reply=(data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('\n').trim();
  if(!reply)throw Object.assign(new Error('OpenAI returned an empty response'),{status:503,provider:'OpenAI API'});
  return {reply,model:data.model||process.env.OPENAI_MODEL||'gpt-5.4-mini',provider:'OpenAI API'};
}

async function answerWithFallback(messages, options = {}) {
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
  TRANSLATION:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:proz.com/job OR site:mostaql.com/project OR site:khamsat.com/community/requests) translation project client budget',
  ENGINEERING:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:guru.com/d/jobs) CAD engineering interior design project client budget',
  TECH:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:guru.com/d/jobs OR site:peopleperhour.com/freelance-jobs) web development programming project client budget',
  RESEARCH:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs OR site:mostaql.com/project) market research business consulting project client budget',
  LOGISTICS:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) logistics freight shipping coordination project client budget',
  ENERGY:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) oil gas procurement market research project client budget',
  SOURCING:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs OR site:mostaql.com/project) supplier sourcing procurement buyer project client budget',
  PROPERTY:'(site:upwork.com/freelance-jobs/apply OR site:freelancer.com/projects OR site:peopleperhour.com/freelance-jobs) real estate tourism project client budget'
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

    const { reply, model, provider } = await answerWithFallback([
      {
        role: "system",
        content: `أنت RAM (رام عشيش)، مساعد ذكاء اصطناعي شخصي ووكيل أعمال لأحمد عشيش.
تحدث بصورة طبيعية وذكية وسريعة، وافهم المقصد من السياق.
لا تكرر قوائم الخدمات أو كلام المستخدم بلا داع.
إذا كان الطلب واضحاً فابدأ أقرب خطوة قابلة للتنفيذ.
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
      ? "وصلت خدمة الذكاء الاصطناعي إلى حد الطلبات المجانية مؤقتًا. انتظر قليلًا ثم أعد المحاولة؛ لم يتم احتساب العمل كمنجز."
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
