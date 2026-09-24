import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("RAM AI Server is running with Gemini...");
});

async function callGemini(model, prompt, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await response.json();
  return { response, data };
}

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "الرسالة فارغة"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is missing"
      });
    }

    const prompt = `
أنت رام عشيش، مساعد ذكاء اصطناعي عربي يعمل لدى أحمد عشيش.

تحدث مع أحمد بصورة طبيعية وذكية ومباشرة.
ساعده في إدارة الأعمال والمهام والعملاء والمتابعات
والشحن واللوجستيات والعقارات والتصميم والترجمة والأبحاث.

أجب بالعربية ما لم يطلب لغة أخرى.
لا تدّع أنك نفذت اتصالاً أو رسالة أو معاملة خارجية
إلا عندما تكون أداة التنفيذ المطلوبة متصلة فعلاً.

رسالة أحمد:
${message}
`;

    const models = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite"
];

    let lastStatus = 500;
    let lastData = null;

    for (const model of models) {
      const result = await callGemini(model, prompt, apiKey);

      lastStatus = result.response.status;
      lastData = result.data;

      if (result.response.ok) {
        const reply =
          result.data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (reply) {
          return res.json({
            reply: reply,
            response: reply,
            model: model
          });
        }
      }

      console.error(
        `Gemini model ${model} failed:`,
        result.response.status,
        result.data
      );

      if (result.response.status !== 503) {
        break;
      }
    }

    return res.status(lastStatus).json({
      error: "تعذر الحصول على رد من Gemini",
      details: lastData
    });

  } catch (error) {
    console.error("RAM server error:", error);

    res.status(500).json({
      error: "حدث خطأ في خادم RAM",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RAM Gemini Server running on port ${PORT}`);
});
