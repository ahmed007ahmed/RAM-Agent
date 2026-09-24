import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("RAM AI Server is running with OpenRouter");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "الرسالة فارغة"
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing"
      });
    }

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "system",
              content: `أنت رام عشيش، مساعد ذكاء اصطناعي عربي يعمل لدى أحمد عشيش.

تحدث مع أحمد بصورة طبيعية وذكية ومباشرة.
ساعده في إدارة الأعمال والمهام والعملاء والمتابعات،
والشحن واللوجستيات والعقارات وتصميم المواقع
والبرمجة والتصميم والترجمة والأبحاث والخدمات الرقمية.

أجب بالعربية ما لم يطلب أحمد لغة أخرى.

لا تدّع أنك نفذت اتصالاً أو أرسلت رسالة أو نفذت معاملة
إلا إذا كانت أداة التنفيذ المطلوبة متصلة فعلاً.

إذا لم تكن لديك أداة لتنفيذ شيء خارج المحادثة،
اشرح ذلك بوضوح وساعد أحمد في أقرب خطوة عملية ممكنة.`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenRouter error:", response.status, data);

      return res.status(response.status).json({
        error: "تعذر الحصول على رد من OpenRouter",
        details: data
      });
    }

    const reply =
      data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({
        error: "OpenRouter أعاد رداً فارغاً"
      });
    }

    return res.json({
      reply: reply,
      response: reply,
      model: data?.model || "openrouter/free"
    });

  } catch (error) {
    console.error("RAM server error:", error);

    return res.status(500).json({
      error: "حدث خطأ في خادم RAM",
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RAM OpenRouter Server running on port ${PORT}`);
});
