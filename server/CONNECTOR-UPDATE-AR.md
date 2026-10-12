# تحديث الموصلات — فرص مجانية وشحن جوي/بري/بحري

## ما يعمل بهذا التحديث

- البحث للقراءة فقط في Himalayas وJobicy وRemotive وRemoteJobs.org موجود أصلًا في `free-opportunity-connectors.js` ولا يحتاج أي متغيرات سرية.
- أضفنا سجلًا موحدًا للموصلات ومسار `GET /integrations/catalog` ليعرض المتغيرات وحالة كل تكامل من دون ادعاء أن وجود المفتاح يعني نجاح الاتصال.
- Serper وExa وFirecrawl اختيارية؛ المتغيرات هي `SERPER_API_KEY` و`EXA_API_KEY` و`FIRECRAWL_API_KEY`. وجود المفتاح يعني «موجود ويحتاج اختبارًا»، لا «اتصال ناجح».
- أضيفت قائمة إعداد مستقبلية لشركات DHL وFedEx وUPS وMaersk وHapag-Lloyd وCMA CGM عبر الجو والبر والبحر. **موصلات الناقل نفسها غير منفذة هنا**؛ لذلك لن تعمل الأسعار أو الحجوزات أو بوليصات الشحن بمجرد وضع المتغيرات.

## أين تضع الملفات

انسخ `connector-catalog.js` و`connector-catalog.test.js` و`CONNECTOR-UPDATE-AR.md` داخل مجلد `server` في المستودع، ثم أضف سطر الاستيراد والمسار أدناه إلى `server.js` الحالي. لا تستبدل خادمك الكامل بهذا التصحيح. لا ترفع محتوى هذا المجلد إلى واجهة n8n؛ هذه ملفات خادم Railway. بعد رفعها إلى GitHub، أعد البناء في Railway.

في `server.js` أضف الاستيراد التالي بجوار استيرادات الكتالوج:

```js
import {getConnectorCatalog,getConnectorEnvironmentTemplate} from "./connector-catalog.js";
```

ثم أضف المسار بعد وسيط المصادقة (مثل مسارات `/platform-connectors`):

```js
app.get('/integrations/catalog',(_req,res)=>res.json({ok:true,catalog:getConnectorCatalog(process.env),environment:getConnectorEnvironmentTemplate()}));
```

## المتغيرات

لا تضف متغيرات منصات البحث المجانية؛ لا تحتاج أسرارًا. متغيرات الشحن أدناه أسماء معيارية محجوزة للتنفيذ اللاحق، وإضافتها الآن لن تشغّل خدمات الناقل:

| الناقل | المتغيرات المعيارية | المطلوب من الناقل |
|---|---|---|
| DHL Express | `DHL_API_KEY`, `DHL_API_SECRET`, `DHL_ACCOUNT_NUMBER` | حساب DHL Express تجاري وبيانات API من ممثل DHL |
| FedEx | `FEDEX_API_KEY`, `FEDEX_API_SECRET`, `FEDEX_ACCOUNT_NUMBER` | حساب شاحن، مفاتيح اختبار، ثم اعتماد الإنتاج |
| UPS | `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_ACCOUNT_NUMBER` | حساب UPS شاحن مرتبط بتطبيق OAuth |
| Maersk | `MAERSK_CLIENT_ID`, `MAERSK_CLIENT_SECRET`, `MAERSK_CUSTOMER_CODE` | صلاحية API؛ بعض عمليات الحجز متاحة للعملاء/المطورين المعتمدين |
| DHL Freight | `DHL_FREIGHT_CLIENT_ID`, `DHL_FREIGHT_CLIENT_SECRET`, `DHL_FREIGHT_ACCOUNT_NUMBER` | حساب عميل DHL Freight وصلاحية المنتج حسب البلد |
| Hapag-Lloyd | `HAPAG_LLOYD_CLIENT_ID`, `HAPAG_LLOYD_CLIENT_SECRET`, `HAPAG_LLOYD_CUSTOMER_CODE` | تسجيل API وتفويض العميل |
| CMA CGM | `CMA_CGM_CLIENT_ID`, `CMA_CGM_CLIENT_SECRET`, `CMA_CGM_CUSTOMER_CODE` | تسجيل البوابة ومنح صلاحية المنتج |

اترك الأسرار فارغة ولا ترسلها في المحادثة. افحص السجل بعد النشر من التطبيق عبر `GET /integrations/catalog` باستخدام رمز RAM المعتاد.

## الاختبار

شغّل `npm test` داخل `server`. الاختبارات تثبت أن المصادر المجانية بلا مفاتيح، وأن مفتاحًا حاضرًا لا يُعرض كاختبار ناجح، وأن شركة الشحن لا تُعرض كموصولة قبل بناء موصلها الفعلي.
