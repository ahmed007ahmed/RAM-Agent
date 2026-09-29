import express from "express";
import {validToken, maxOutputTokens, checkedModel, rawSearchReply, createLimiter, extractAdvertisedPay} from "./policy.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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
app.post('/capabilities',(req,res)=>res.json({chatConfigured:Boolean(process.env.OPENROUTER_API_KEY||process.env.GEMINI_API_KEY),chatProviders:[process.env.OPENROUTER_API_KEY?'OpenRouter':'',process.env.GEMINI_API_KEY?'Gemini fallback':''].filter(Boolean),searchConfigured:Boolean(process.env.SERPER_API_KEY||process.env.TAVILY_API_KEY),searchProvider:process.env.SERPER_API_KEY?'Serper':process.env.TAVILY_API_KEY?'Tavily':null,elevenLabsConfigured:Boolean(process.env.ELEVENLABS_API_KEY),elevenLabsEnabled:Boolean(process.env.ELEVENLABS_API_KEY&&process.env.ALLOW_PAID_TTS==='true'),emailConnected:false,callsConnected:false,cloudJobsConnected:false,paymentsEnabled:false,paidAiAllowed:false}));

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
      model: checkedModel(process.env),
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

// Free-tier Gemini fallback for OpenRouter throttling/outages. Paid Gemini
// models are deliberately not selected automatically.
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

async function answerWithFallback(messages, options = {}) {
  try { return {...await openRouter(messages,options),provider:"OpenRouter"}; }
  catch (primaryError) {
    if (process.env.GEMINI_API_KEY && (primaryError.status===429 || primaryError.status>=500 || primaryError.status===401 || primaryError.status===403)) {
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
  if (!results.length) return "لم أعثر على نتائج ويب مناسبة لهذا البحث.";

  const evidence = results.map(r =>
    `[${r.id}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join("\n\n");

  const { reply } = await answerWithFallback([
    {
      role: "system",
      content: `أنت RAM. أمامك نتائج بحث حقيقية من الويب.
أجب بالعربية باختصار ووضوح.
اعتمد فقط على النتائج المعطاة ولا تخترع شركات أو أسعاراً أو روابط.
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

    const results = await webSearch(query, req.body?.maxResults || 10);
    let answer;
    try{answer=await summarizeSearch(query,results);}catch{answer=rawSearchReply(results);}

    return res.json({
      ok: true,
      realSearch: true,
      query,
      answer,
      reply: answer,
      response: answer,
      results
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
      : error.provider==="AI" ? error.message : "تعذر الحصول على رد من RAM الآن؛ تحقّق من إعداد مزود الذكاء الاصطناعي.";
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
