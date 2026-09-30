# ربط Gmail في RAM

## ما الذي يفعّله هذا التحديث

- تفويض Google OAuth من تطبيق RAM إلى خادم Railway.
- عرض أحدث 15 رسالة من صندوق الوارد مع المرسل والعنوان والتاريخ ومقتطف قصير.
- إرسال رسالة باسم حساب Gmail بعد مراجعة المستلم والنص والضغط على زر الإرسال.
- لا يقرأ محتوى المرفقات، ولا يحذف الرسائل أو ينقلها، ولا يرسل ردودًا تلقائية.
- رمز تحديث Google يُحفظ مشفرًا على مساحة Railway الدائمة. لا تضع أي سر في التطبيق أو GitHub.

## إعداد Google Cloud مرة واحدة

1. افتح [Google Cloud Console](https://console.cloud.google.com/) وأنشئ مشروعًا، ثم فعّل **Gmail API**.
2. أعد إعداد **OAuth consent screen / Google Auth Platform** باسم RAM، وأضف بريدك كمستخدم اختباري أثناء التجربة.
3. أنشئ OAuth Client من النوع **Web application**. أضف عنوان إعادة التوجيه المصرح به حرفيًا:

   `https://ram-agent-production.up.railway.app/gmail/oauth/callback`

4. أضف نطاقات OAuth التالية فقط:

   - `https://www.googleapis.com/auth/gmail.metadata` لعرض بيانات الرسائل الواردة.
   - `https://www.googleapis.com/auth/gmail.send` لإرسال الرسالة التي تؤكدها.
   - `https://www.googleapis.com/auth/userinfo.email` لعرض الحساب المتصل.

**قيود Google:** نطاق `gmail.metadata` مقيّد، و`gmail.send` حساس. قد تُظهر Google تحذير تطبيق غير متحقق. أثناء حالة OAuth الخارجية `Testing` تنتهي صلاحية رمز التحديث بعد 7 أيام؛ لذلك هذا مناسب للاختبار فقط. التشغيل الدائم يتطلب نشر شاشة الموافقة ومعالجة متطلبات تحقق Google المناسبة. إذا طلبت Google تقييمًا أمنيًا أو مستندات سياسة خصوصية، يجب استكمالها في Google Cloud قبل الاعتماد على الاتصال طويل الأمد. RAM لا يستطيع تجاوز قرار Google.

## إعداد Railway

1. افتح خدمة `RAM-Agent` في Railway وأضف Volume دائمًا إلى الخدمة بمسار تركيب `/data`.
2. أضف المتغيرات التالية في **Variables**. خزّن القيم السرية مباشرة في Railway ولا ترسلها في المحادثة:

   | المتغير | القيمة |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Client ID من Google Cloud |
   | `GOOGLE_CLIENT_SECRET` | Client secret من Google Cloud |
   | `GMAIL_REDIRECT_URI` | `https://ram-agent-production.up.railway.app/gmail/oauth/callback` |
   | `GMAIL_ALLOWED_EMAIL` | `ahmed736937467@gmail.com` |
   | `GMAIL_TOKEN_ENCRYPTION_KEY` | مفتاح عشوائي 64 خانة hex؛ أنشئه محليًا بالأمر `openssl rand -hex 32` |
   | `GMAIL_TOKEN_FILE` | `/data/gmail-token.enc` |

3. انشر إصدار الخادم بعد تحديث ملفات المستودع. عنوان الصحة `/` وحده لا يثبت أن ربط Gmail أو Google OAuth يعمل.
4. في التطبيق المحدّث: **الإعدادات والربط → ربط Gmail بحساب Google**. سجّل الدخول بالحساب المطلوب، وافق على الصلاحيات، ثم ارجع إلى التطبيق واضغط **تحديث حالة الربط** ثم **تحميل صندوق الوارد**.
5. اختبر الإرسال إلى عنوان تملكه برسالة بسيطة، بعد مراجعة المستلم والنص. لا يبدأ الإرسال قبل ضغطك على التأكيد.

## إذا لم يظهر خيار البريد في التطبيق

أنت على نسخة أقدم. يجب بناء APK من مصدر الإصدار المحدّث وتثبيته؛ تعديل متغيرات Railway وحده لا يضيف شاشة أو وظائف إلى APK القديم. إذا فشل بناء GitHub Actions، افتح أحدث سجل تشغيل واقرأ أول خطوة حمراء؛ لا ترفع ملف ZIP إلى مستودع المصدر بوصفه ملفًا عاديًا.
