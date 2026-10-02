import express from "express";
import { normalizeReply } from "./response-format.mjs";

const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const RAM_SYSTEM = `أنت رام، وكيل أعمال ذكي يعمل مع أحمد عشيش في إنجاز القابضة. افهم الهدف من سياق المحادثة، تحقق من المعلومات عند الحاجة، ثم قدّم خطوة عملية واضحة.
تواصل بلهجة عربية مهنية ودافئة، أو بلغة العميل إذا طُلبت رسالة له. اربط إجابتك بتفصيل فعلي من كلام المستخدم، وافهم قصده من سياق المحادثة قبل الرد. كن مرنًا؛ أجب مباشرة، ونفّذ الجزء الممكن، واسأل سؤالًا واحدًا فقط عندما تمنع معلومة ناقصة الخطوة التالية. قدّم توصية واضحة مع سبب موجز وخطوة عملية، واذكر البدائل فقط عند وجود مفاضلة حقيقية. أظهر التعاطف باحترام من دون ادعاء مشاعر أو حواس بشرية. تجنب المقدمات العامة والكلام الدعائي. عند طلب التواصل مع صاحب فرصة، افحص سياق الفرصة أولًا واكتب رسالة مخصصة له؛ إن لم يتوفر عنوان بريده أو وسيلة إرسال مربوطة، وضّح أن النص مسودة ولم يُرسل.
اكتب نصًا عاديًا بفقرات قصيرة. تجنب عناوين Markdown والهاشتاقات والنجوم والرموز النقطية والفواصل المتكررة. استخدم علامات الترقيم مرة واحدة وبشكل طبيعي. لا تحوّل كل رد إلى قائمة.
في رسائل التقديم، خصّص الرسالة للمشروع من تفاصيله الفعلية، واطرح سؤالًا واحدًا مرتبطًا بنطاق العمل. لا تخترع خبرة أو عملاء سابقين أو نماذج أعمال أو مواعيد أو أسعارًا. لا تعد بتسليم ما لم يُتحقق من القدرة عليه. لا تقل إن رسالة أُرسلت أو مكالمة تمت أو عملًا سُلّم إلا بعد نجاح أداة فعلية.
استخدم المعلومات والنتائج المتاحة فقط، وميّز بوضوح بين الحقيقة والافتراض. إذا كان نقص معلومة يمنع الخطوة، اسأل سؤالًا واحدًا محددًا. لا تكشف التفكير الداخلي؛ أعطِ خلاصة القرار والخطوة التالية.`;

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "RAM AI Server",
    chat: "/chat",
    search: "/search",
    tts: "/tts"
  });
});

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing");
  return key;
}

async function openRouter(messages, options = {}) {
  const model = String(process.env.OPENROUTER_MODEL || "").trim();
  try {
    if (!model || /(^|\/)free(?:$|[-/])/i.test(model)) {
      const error = new Error("Set OPENROUTER_MODEL to a capable, non-free model in the server environment.");
      error.code = "AI_MODEL_NOT_CONFIGURED";
      throw error;
    }
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterKey()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://ram-agent-production.up.railway.app",
        "X-Title": "RAM Agent"
      },
      body: JSON.stringify({ model, messages, temperature: options.temperature ?? 0.35 })
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error("OpenRouter request failed");
      error.status = response.status;
      error.details = data;
      throw error;
    }
    const reply = normalizeReply(data?.choices?.[0]?.message?.content);
    if (!reply) throw new Error("OpenRouter returned an empty reply");
    return { reply, model: data?.model || model, provider: "openrouter" };
  } catch (primaryError) {
    const retryable = !primaryError.status || [429, 500, 502, 503, 504].includes(primaryError.status);
    if (!retryable || !process.env.GEMINI_API_KEY) throw primaryError;
    console.warn("OpenRouter unavailable; trying Gemini fallback", primaryError.status || primaryError.code || primaryError.name);
    return geminiFallback(messages, options);
  }
}

async function geminiFallback(messages, options = {}) {
  const model = String(process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();
  const systemInstruction = messages.filter(item => item.role === "system").map(item => item.content).join("\n\n");
  const contents = messages.filter(item => item.role !== "system").map(item => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: String(item.content || "") }]
  }));
  if (!contents.length) throw new Error("Gemini needs at least one user message");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      contents,
      generationConfig: { temperature: options.temperature ?? 0.35 }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Gemini fallback request failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }
  const reply = normalizeReply(data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join(""));
  if (!reply) throw new Error("Gemini returned an empty reply");
  return { reply, model, provider: "gemini" };
}

/*
  REAL WEB SEARCH
  Provider: Tavily
  Railway variable required: TAVILY_API_KEY
  This endpoint returns actual web results with titles, URLs and snippets.
*/
async function tavilySearch(query, maxResults = 8) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const error = new Error("TAVILY_API_KEY is missing");
    error.code = "SEARCH_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: Math.min(Math.max(Number(maxResults) || 8, 1), 10),
      include_answer: false,
      include_raw_content: false
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error("Web search provider failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return (data.results || []).map((r, index) => ({
    id: index + 1,
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
    score: r.score ?? null
  }));
}

function searchIntent(message) {
  return /(?:ابحث|بحث|فتش|فرص|وظائف|عملاء|موردين|مشترين|شحن|عقارات|search|find|look up)/i.test(message);
}

async function summarizeSearch(query, results) {
  if (!results.length) return "لم أعثر على نتائج ويب مناسبة لهذا البحث.";

  const evidence = results.map(r =>
    `[${r.id}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
  ).join("\n\n");

  const { reply } = await openRouter([
    {
      role: "system",
      content: `${RAM_SYSTEM}\nأمامك نتائج بحث حقيقية من الويب. اعتمد عليها فقط ولا تخترع شركات أو أسعارًا أو روابط. أضف روابط مباشرة للمصادر ذات الصلة في فقرة أخيرة قصيرة. إذا لم تثبت النتائج معلومة، قل ذلك.`
    },
    {
      role: "user",
      content: `طلب المستخدم: ${query}\n\nنتائج البحث:\n${evidence}`
    }
  ], { temperature: 0.2 });

  return normalizeReply(reply);
}

app.post("/proposal", async (req, res) => {
  try {
    const project = req.body?.project || {};
    const title = String(project.title || "").trim();
    const description = String(project.description || "").trim();
    const url = String(project.url || "").trim();
    if (!title || !description) return res.status(400).json({ error: "أرسل عنوان المشروع ووصفه لصياغة عرض مخصص." });
    const language = String(req.body?.language || "English").slice(0, 40);
    const sender = String(req.body?.senderName || "Ahmed").slice(0, 100);
    const company = String(req.body?.company || "Enjaz Holding").slice(0, 100);
    const details = [
      `Project title: ${title}`,
      `Project description: ${description.slice(0, 7000)}`,
      url ? `Project link: ${url}` : "",
      project.budget ? `Published budget: ${String(project.budget).slice(0, 200)}` : "",
      project.skills ? `Requested skills: ${String(project.skills).slice(0, 500)}` : "",
      project.verifiedSamples ? `Verified relevant samples available: ${String(project.verifiedSamples).slice(0, 1000)}` : "No verified portfolio samples were supplied. Do not claim to attach samples."
    ].filter(Boolean).join("\n");
    const { reply, model } = await openRouter([
      { role: "system", content: `${RAM_SYSTEM}\nاكتب مسودة رسالة تقديم مهنية مخصصة لهذا المشروع باللغة ${language}. ابدأ بتحية مناسبة، ثم فقرة محددة عن فهم المطلوب وخطة تنفيذ موجزة، ثم سؤال توضيحي واحد فقط، ثم ختام وتوقيع ${sender}، ${company}. اجعلها بين 90 و150 كلمة. أخرج نص الرسالة فقط، بلا عنوان أو نقاط أو شرح. لا تذكر خبرة أو عينات إلا إذا وردت ضمن البيانات الموثقة.` },
      { role: "user", content: details }
    ], { temperature: 0.35 });
    return res.json({ ok: true, draftOnly: true, subject: `Regarding: ${title}`.slice(0, 180), body: normalizeReply(reply), model, projectUrl: url || null });
  } catch (error) {
    console.error("RAM proposal error:", error);
    const status = error.code === "AI_MODEL_NOT_CONFIGURED" ? 503 : (error.status || 500);
    return res.status(status).json({ error: error.code === "AI_MODEL_NOT_CONFIGURED" ? "يجب اختيار نموذج ذكاء اصطناعي قوي في إعدادات الخادم." : "تعذرت صياغة مسودة العرض الآن." });
  }
});

app.post("/search", async (req, res) => {
  try {
    const query = String(req.body?.query || req.body?.message || "").trim();
    if (!query) return res.status(400).json({ error: "عبارة البحث فارغة" });

    const results = await tavilySearch(query, req.body?.maxResults || 8);
    const answer = await summarizeSearch(query, results);

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
    console.error("RAM search error:", error);
    const status = error.code === "SEARCH_NOT_CONFIGURED" ? 503 : (error.status || 500);
    return res.status(status).json({
      error: error.code === "SEARCH_NOT_CONFIGURED"
        ? "البحث الحقيقي غير مفعّل بعد. أضف TAVILY_API_KEY في Railway."
        : "تعذر تنفيذ البحث الحقيقي الآن",
      details: error.details || error.message
    });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) return res.status(400).json({ error: "الرسالة فارغة" });

    // Search automatically when the request clearly asks for current web discovery.
    if (searchIntent(message) && !process.env.TAVILY_API_KEY) return res.status(503).json({error:"البحث الحقيقي غير مفعّل؛ أضف TAVILY_API_KEY إلى إعدادات الخادم."});
    if (searchIntent(message) && process.env.TAVILY_API_KEY) {
      const results = await tavilySearch(message, 8);
      const reply = await summarizeSearch(message, results);
      return res.json({
        reply,
        response: reply,
        realSearch: true,
        results
      });
    }

    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12).filter(x => ["user","assistant"].includes(x?.role) && typeof x.content === "string").map(x => ({role:x.role, content:x.content.slice(0,4000)})) : [];
    const { reply, model } = await openRouter([
      {
        role: "system",
        content: RAM_SYSTEM
      },
      ...history,
      { role: "user", content: message }
    ]);

    return res.json({ reply, response: reply, model, realSearch: false });
  } catch (error) {
    console.error("RAM chat error:", error);
    const status = error.code === "AI_MODEL_NOT_CONFIGURED" ? 503 : (error.status || 500);
    return res.status(status).json({
      error: error.code === "AI_MODEL_NOT_CONFIGURED" ? "لم يُضبط نموذج ذكاء اصطناعي قوي في الخادم."
        : status === 429 ? "خدمات الذكاء مشغولة الآن. فعّل مفتاح Gemini الاحتياطي أو أعد المحاولة بعد قليل."
        : "تعذر الحصول على رد من RAM",
      details: status === 429 ? undefined : (error.details || error.message)
    });
  }
});

app.post("/tts", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "النص فارغ" });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY is missing" });

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
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
      const details = await response.text();
      return res.status(response.status).json({ error: "ElevenLabs TTS failed", details });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audio.length);
    return res.send(audio);
  } catch (error) {
    console.error("RAM TTS error:", error);
    return res.status(500).json({ error: "حدث خطأ في صوت RAM", details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RAM server running on port ${PORT}`));
