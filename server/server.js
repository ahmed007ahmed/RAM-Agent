import express from "express";

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

function getOpenRouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing");
  return key;
}

async function openRouter(messages, options = {}) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://ram-agent-production.up.railway.app",
      "X-Title": "RAM Agent"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      messages,
      temperature: options.temperature ?? 0.35
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error("OpenRouter request failed");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenRouter returned an empty reply");
  return { reply, model: data?.model || process.env.OPENROUTER_MODEL || "openrouter/free" };
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

    const { reply, model } = await openRouter([
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
أجب بالعربية افتراضياً.`
      },
      { role: "user", content: message }
    ]);

    return res.json({ reply, response: reply, model, realSearch: false });
  } catch (error) {
    console.error("RAM chat error:", error);
    return res.status(error.status || 500).json({
      error: "تعذر الحصول على رد من RAM",
      details: error.details || error.message
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
