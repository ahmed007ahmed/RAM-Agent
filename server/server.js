import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("RAM AI Server is running with Gemini...");
});

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
أنت مساعد عملي لإدارة الأعمال والمهام والعملاء والمتابعات
والشحن واللوجستيات والعقارات والتصميم والترجمة والأبحاث.

تحدث مع المستخدم بصورة طبيعية وذكية مثل مساعد محادثة متقدم.
أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى.
لا تدّع تنفيذ عمل خارجي أو إرسال رسالة أو إجراء اتصال
إلا إذا كانت أداة التنفيذ المطلوبة متصلة فعلاً.

رسالة المستخدم:
${message}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
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
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);
      return res.status(response.status).json({
        error: "Gemini API error",
        details: data
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      return res.status(500).json({
        error: "لم يصل رد نصي من Gemini"
      });
    }

    res.json({
      reply: reply,
      response: reply
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
