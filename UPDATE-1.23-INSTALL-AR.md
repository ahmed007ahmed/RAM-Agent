# رفع RAM 1.23 من الهاتف

ارفع محتويات هذا الضغط إلى جذر مستودع RAM-Agent مع الحفاظ على المسارات ووافق على استبدال الملفات:

- `.github/workflows/build-apk.yml`
- `app/build.gradle.kts`
- `app/src/main/assets/app.js`
- `server/server.js`
- `server/policy.js`
- أضف `server/cloudflare-ai.js` و`server/n8n.js`
- أضف ملفات الاختبار في `tests/`
- استبدل ملفات التوثيق المرفقة في جذر المستودع.

بعد إنشاء commit:
1. انتظر نجاح GitHub Actions.
2. نزّل artifact `RAM-BUSINESS-SIGNED-APK-v1.23` وثبته بالتوقيع نفسه المستخدم سابقًا.
3. انتظر نشر Railway. لا تغيّر المتغيرات أو القرص `/data`.
4. افتح إعدادات رام واضغط «اختبار الخادم والبحث». يجب أن يظهر Cloudflare AI وبيانات n8n.
5. أرسل رسالة قصيرة للمحادثة. بعدها اختر فرصة اختبارية غير ملزمة؛ يجب أن تظهر حالة إرسال الحدث إلى n8n.

يجب أن يكون Webhook n8n منشورًا على HTTPS وأن يقبل `Authorization: Bearer <N8N_WEBHOOK_SECRET>` أو `X-RAM-Webhook-Secret`. يتلقى حدث الاختيار `ram.opportunity.selected` وبيانات الإعلان وحواجز تمنع الدفع/السحب والتوقيع والإرسال الخارجي غير الموافق عليه. قبول HTTP 2xx يعني أن n8n استقبل الحدث فقط، ولا يثبت أن بقية workflow اكتملت.
