package com.ram.agent;

import android.content.Context;
import java.util.Locale;

public class RamEngine {

    private final Context context;
    private final LocalDatabase database;

    public RamEngine(Context context) {
        this.context = context;
        this.database = new LocalDatabase(context);
    }

    public String executeCommand(String command) {

        if (command == null || command.trim().isEmpty()) {
            return "لم أسمع أمراً واضحاً.";
        }

        String original = command.trim();
        String text = original.toLowerCase(Locale.ROOT);

        // إنشاء مهمة حقيقية وحفظها محلياً
        if (containsAny(text,
                "مهمة", "أضف مهمة", "اضف مهمة",
                "سجل مهمة", "عمل جديد")) {

            String title = cleanCommand(original,
                    "أضف مهمة", "اضف مهمة",
                    "سجل مهمة", "مهمة", "عمل جديد");

            if (title.trim().isEmpty()) {
                title = "مهمة جديدة";
            }

            return saveTask(title);
        }

        // أوامر التقرير
        if (containsAny(text,
                "التقرير", "تقرير اليوم",
                "التقرير اليومي")) {

            return buildDailyReport();
        }

        // الخدمات اللوجستية
        if (containsAny(text,
                "شحن", "لوجستي", "لوجستية",
                "نقل بحري", "نقل جوي", "نقل بري")) {

            return saveTask("متابعة لوجستية: " + original);
        }

        // العقارات والوساطة
        if (containsAny(text,
                "عقار", "عقارات", "وساطة",
                "فيلا", "شقة", "أرض")) {

            return saveTask("متابعة عقارية: " + original);
        }

        // التصميم والمواقع والترجمة
        if (containsAny(text,
                "تصميم", "موقع", "برمجة",
                "ترجمة", "هندسي")) {

            return saveTask("خدمة رقمية: " + original);
        }

        // العملاء
        if (containsAny(text,
                "عميل", "العملاء", "زبون")) {

            return saveTask("متابعة عميل: " + original);
        }

        return "فهمت الأمر: " + original +
                "\nسأحتاج ربط هذه الوظيفة بوحدة تنفيذ مناسبة.";
    }

    private String saveTask(String title) {
        try {
            /*
             * في الخطوة التالية سنطابق هذا الاستدعاء
             * مع الدوال الموجودة فعلياً في LocalDatabase.
             */
            return "تم تحليل المهمة:\n" + title;
        } catch (Exception e) {
            return "تعذر تنفيذ المهمة: " + e.getMessage();
        }
    }

    private String buildDailyReport() {
        return "RAM V4\n\n" +
                "التقرير اليومي جاهز للربط بقاعدة البيانات.\n" +
                "سيعرض المهام والعملاء والعمليات المنجزة.";
    }

    private boolean containsAny(String text, String... words) {
        for (String word : words) {
            if (text.contains(word.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private String cleanCommand(String text, String... words) {
        String result = text;

        for (String word : words) {
            result = result.replace(word, "");
        }

        return result.trim();
    }
}
