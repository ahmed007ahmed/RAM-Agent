package com.ram.agent;

public class AIService {

    public interface AIResponseCallback {
        void onSuccess(String response);
        void onError(String error);
    }

    /*
     * هذه الوحدة ستكون بوابة RAM إلى خادم الذكاء الاصطناعي.
     * لن نضع مفتاح API داخل التطبيق لحمايته.
     */
    public void askAI(
            String userMessage,
            AIResponseCallback callback
    ) {
        if (userMessage == null || userMessage.trim().isEmpty()) {
            callback.onError("لم أسمع سؤالك بوضوح.");
            return;
        }

        // سيتم ربط هذا الجزء بالخادم الآمن في الخطوة التالية.
        callback.onError(
                "خدمة الذكاء الاصطناعي جاهزة للربط بالخادم."
        );
    }
}
