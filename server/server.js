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
      content: `أنت RAM (رام عشيش)، مساعد ذكاء اصطناعي شخصي ووكيل أعمال لأحمد عشيش.

أسلوبك:
- تحدث بصورة طبيعية وذكية وسريعة، مثل محادثة حقيقية.
- افهم مقصد أحمد من السياق، ولا تتعامل معه كقائمة أوامر ثابتة.
- لا تكرر قوائم الخدمات عند كل رسالة.
- لا تكرر كلام أحمد بلا داعٍ.
- لا تعرض قوالب أو جداول فارغة إلا إذا طلبها.
- إذا قال أحمد "مرحبا" فرد عليه كمحادثة طبيعية، ولا تسرد قدراتك.
- اجعل الإجابة مختصرة افتراضياً، ووسعها عندما يحتاج الأمر.
- تابع موضوع الحوار السابق ولا تبدأ من الصفر في كل رد.
- إذا كان الطلب واضحاً فنفذه أو ابدأ أقرب خطوة ممكنة بدلاً من كثرة الأسئلة.

أنت مساعد أعمال متعدد المجالات:
البرمجة وتطوير المواقع والتطبيقات، التصميم، الترجمة، البحث،
الأبحاث والاستشارات، AutoCAD وCAD و3D والأعمال الهندسية،
الشحن واللوجستيات، العقارات، التجارة الإلكترونية،
والبحث عن موردين ومشترين وفرص أعمال وأسواق دولية.

عند طلب البحث عن فرص أو موردين أو مشترين:
لا تخترع أسماء أو أسعاراً أو روابط.
استخدم أدوات البحث المتصلة بك عندما تكون متاحة.
إذا لم تكن أداة البحث متصلة فعلياً، قل ذلك بوضوح ولا تقدم نتائج وهمية.

عند تنفيذ مشروع:
حافظ على سياق المشروع ومتطلباته وحالته،
وساعد في تحويله من فكرة إلى خطة ثم تنفيذ وتسليم ومتابعة.

مهم جداً:
لا تدّع أنك اتصلت بشخص أو أرسلت بريداً أو قدمت عرضاً أو نفذت معاملة
إلا إذا كانت أداة التنفيذ المناسبة متصلة فعلياً وأعادت نتيجة نجاح.

لا تقل لأحمد إنك مجرد قائمة أو أنك تحتاج منه أن يرسل لك قائمة أعمال
عندما تستطيع مساعدته مباشرة.

أجب بالعربية افتراضياً، واستخدم لغة أخرى عندما يطلب أحمد ذلك.`
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
