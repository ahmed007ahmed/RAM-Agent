# قائمة فحص متغيرات Railway — أسماء فقط

لا تضع القيم هنا. اضبطها في Railway → Variables، ثم أرسل لقطة تُظهر أسماء المتغيرات فقط مع حجب عمود القيم.

## ما ظهر في لقطاتك بتاريخ 17 أكتوبر 2026

الأسماء التالية ظاهرة بالفعل في صور Railway: `ALLOW_PAID_TTS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_MODEL`, `CLOUDFLARE_API_TOKEN`, `ELEVENLABS_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `GMAIL_ALLOWED_EMAIL`, `GMAIL_REDIRECT_URI`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `GMAIL_TOKEN_FILE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `N8N_WEBHOOK_SECRET`, `N8N_WEBHOOK_URL`, `RAM_API_TOKEN`, `RAM_DATA_DIR`, `SERPER_API_KEY`. ظهر أيضًا متغير أو أكثر يبدأ بـ`RAM_BACKGROUND_LEADS_` لكن الاسم مقطوع في الصورة. كما تظهر متغيرات Railway النظامية الخاصة بالـVolume، ومنها مسار التركيب.

هذا يؤكد وجود الأسماء في شاشة الإعداد فقط؛ لا يثبت صحة المفاتيح أو صلاحيتها أو نجاح التكامل. لا تضف نسخًا مكررة من هذه المتغيرات. تعديل هذه الحزمة يجعل خدمة الأتمتة تتعرف على `RAM_DATA_DIR=/data` الموجود لديك، مع أولوية `RAM_AUTOMATION_DATA_FILE` إن ضُبط.

## الحد الأدنى لمرحلة التشغيل السحابي

- `RAM_API_TOKEN` — ظاهر في لقطة Railway؛ لا ترسله في الصور أو المحادثة.
- `SERPER_API_KEY` أو `TAVILY_API_KEY` — `SERPER_API_KEY` ظاهر لديك وهو كافٍ للبحث في هذه المرحلة إذا كان صالحًا.
- `RAM_DATA_DIR=/data` — ظاهر لديك؛ النسخة المرفقة تقرأه لمسار البيانات الدائم.
- `RAILWAY_VOLUME_MOUNT_PATH` — تظهر متغيرات Volume النظامية في اللقطة؛ تأكد أن مسار التركيب الفعلي هو `/data`.

## تكاملات اختيارية، عند تفعيلها فقط

- Cloudflare AI: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, ويمكن `CLOUDFLARE_AI_MODEL`.
- OpenRouter: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- OpenAI الاختياري: `OPENAI_API_KEY`, `OPENAI_MODEL`, و`ALLOW_OPENAI_API=true` فقط إذا قررت استخدامه.
- Gemini الاختياري: `GEMINI_API_KEY`, `GEMINI_MODEL`, و`ALLOW_GEMINI_API=true` فقط إذا قررت استخدامه.
- n8n: `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET`.
- Gmail OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`, `GMAIL_ALLOWED_EMAIL`, `GMAIL_TOKEN_ENCRYPTION_KEY`. يفضّل مسار تخزين دائم للرمز عبر `GMAIL_TOKEN_FILE`.
- ElevenLabs الاختياري: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, و`ALLOW_PAID_TTS=true` فقط إذا فعّلت صوتًا مدفوعًا.
- روابط/تخزين: `APP_URL`, `RAM_AUTOMATION_DATA_FILE` عند الحاجة. اجعل ملف البيانات داخل مسار الـVolume.
- `PORT` يديره Railway غالبًا ولا تحتاج إضافته يدويًا.

المتغيرات الاختيارية لا تعني أن التكامل اختُبر؛ اختبر كل خدمة من واجهتها المناسبة بعد توافق المسارات ونشر الخادم. لا توجد مفاتيح مطلوبة للإيداع أو التداول ضمن هذه الحزمة.
