# RAM Agent v1 — Android

تطبيق أندرويد عربي أولي لوكيل RAM.

## بناء APK في Android Studio
1. فك ضغط المشروع وافتح مجلد `RAM-Agent-v1` في Android Studio.
2. انتظر اكتمال Gradle Sync.
3. من القائمة اختر Build > Build App Bundle(s) / APK(s) > Build APK(s).
4. ستجد الملف عادة في: `app/build/outputs/apk/debug/app-debug.apk`.

## بناء APK تلقائياً عبر GitHub Actions
المشروع يتضمن `.github/workflows/build-apk.yml`. بعد رفعه إلى مستودع GitHub، شغّل Workflow باسم **Build RAM Android APK** ثم نزّل artifact باسم **RAM-Agent-v1-APK**.

## الأمان
النسخة الحالية لا تحتوي مفاتيح بنكية أو صلاحيات سحب/تحويل/شراء. وهي واجهة محلية أولية؛ الاتصال بخادم دائم والبريد ومنصات العمل يحتاج إعداد تكاملات منفصلة وآمنة.
