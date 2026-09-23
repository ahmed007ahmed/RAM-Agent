import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("RAM AI Server is running");
});

app.post("/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({
        error: "لم يتم إرسال رسالة إلى RAM"
      });
    }

    const response = await openai.responses.create({
      model: "gpt-5.6",
      instructions: `
أنت RAM، مساعد ذكاء اصطناعي عربي تفاعلي.
اسمك رام عشيش.
تحدث مع المستخدم بصورة طبيعية وذكية.
افهم سياق المحادثة وأجب باللغة التي يستخدمها المستخدم.
ساعد في إدارة الأعمال والمهام والعملاء والخدمات اللوجستية
والترجمة والتصميم والبحث والاستشارات.
لا تدّع تنفيذ أي إجراء خارجي لم يتم تنفيذه فعلياً.
`,
      input: message
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "تعذر الحصول على رد من الذكاء الاصطناعي"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RAM AI Server running on port ${PORT}`);
});
