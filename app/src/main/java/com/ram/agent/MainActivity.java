package com.ram.agent;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int VOICE_REQUEST = 1001;

    private LinearLayout root;
    private LinearLayout chatContainer;
    private ScrollView chatScroll;
    private EditText messageInput;

    private TextToSpeech textToSpeech;
    private AIService aiService;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        aiService = new AIService();

        setupVoice();
        buildInterface();

        addRamMessage(
                "مرحباً أحمد.\n" +
                "أنا رام عشيش، مساعدك الذكي.\n" +
                "تحدث معي أو اكتب ما تريد، وسأحاول مساعدتك مباشرة."
        );

        speak("مرحباً أحمد. أنا رام عشيش. كيف أستطيع مساعدتك؟");
    }

    private void buildInterface() {

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(18, 18, 18, 18);
        root.setBackgroundColor(Color.rgb(14, 15, 20));

        TextView title = new TextView(this);
        title.setText("RAM");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        title.setPadding(10, 15, 10, 5);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("رام عشيش — المساعد الذكي");
        subtitle.setTextColor(Color.rgb(80, 220, 120));
        subtitle.setTextSize(17);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(5, 0, 5, 15);
        root.addView(subtitle);

        createQuickActions();

        chatScroll = new ScrollView(this);

        chatContainer = new LinearLayout(this);
        chatContainer.setOrientation(LinearLayout.VERTICAL);
        chatContainer.setPadding(5, 10, 5, 10);

        chatScroll.addView(chatContainer);

        LinearLayout.LayoutParams scrollParams =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1
                );

        root.addView(chatScroll, scrollParams);

        LinearLayout inputRow = new LinearLayout(this);
        inputRow.setOrientation(LinearLayout.HORIZONTAL);
        inputRow.setGravity(Gravity.CENTER_VERTICAL);

        messageInput = new EditText(this);
        messageInput.setHint("اكتب رسالتك إلى رام...");
        messageInput.setTextColor(Color.WHITE);
        messageInput.setHintTextColor(Color.GRAY);
        messageInput.setTextSize(16);
        messageInput.setSingleLine(false);
        messageInput.setMaxLines(4);
        messageInput.setBackgroundColor(Color.rgb(35, 37, 45));
        messageInput.setPadding(16, 12, 16, 12);

        LinearLayout.LayoutParams inputParams =
                new LinearLayout.LayoutParams(
                        0,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        1
                );

        inputRow.addView(messageInput, inputParams);

        Button voiceButton = new Button(this);
        voiceButton.setText("🎤");
        voiceButton.setTextSize(20);
        voiceButton.setOnClickListener(v -> startVoice());

        inputRow.addView(voiceButton);

        Button sendButton = new Button(this);
        sendButton.setText("إرسال");
        sendButton.setOnClickListener(v -> {
            String message = messageInput.getText().toString().trim();

            if (!message.isEmpty()) {
                messageInput.setText("");
                sendToRam(message);
            }
        });

        inputRow.addView(sendButton);

        root.addView(inputRow);

        setContentView(root);
    }

    private void createQuickActions() {

        ScrollView actionScroll = new ScrollView(this);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.VERTICAL);

        addActionButton(
                actions,
                "💼 فرص العمل",
                "ابحث معي عن فرص عمل مناسبة في التصميم والبرمجة والترجمة والأبحاث والخدمات الرقمية."
        );

        addActionButton(
                actions,
                "📋 المهام",
                "ساعدني في تنظيم مهامي الحالية حسب الأولوية والحالة والخطوة التالية."
        );

        addActionButton(
                actions,
                "👥 العملاء",
                "ساعدني في إدارة العملاء والمتابعات والعروض والطلبات."
        );

        addActionButton(
                actions,
                "🚢 الشحن واللوجستيات",
                "ساعدني في أعمال الشحن البحري والجوي والبري واللوجستيات وربط العملاء بمقدمي الخدمات."
        );

        addActionButton(
                actions,
                "🏢 العقارات والوساطة",
                "ساعدني في تنظيم أعمال العقارات والبيع والشراء والإيجار والوساطة."
        );

        addActionButton(
                actions,
                "🌐 المواقع والتصميم",
                "ساعدني في أعمال تصميم المواقع والواجهات والإعلانات والجرافيك."
        );

        addActionButton(
                actions,
                "🌍 الترجمة والأبحاث",
                "ساعدني في أعمال الترجمة والبحث وإعداد التقارير والاستشارات."
        );

        addActionButton(
                actions,
                "📊 تقرير العمل",
                "أنشئ لي تقريراً منظماً عن المهام والأعمال التي نناقشها وما يحتاج إلى متابعة."
        );
        addActionButton(
                actions,
                "✅ الأعمال المنجزة",
                "اعرض الأعمال التي اكتملت وتم تسليمها مع اسم العميل وقيمة العمل وتاريخ التسليم وحالة الدفع."
        );

        addActionButton(
                actions,
                "💰 المستحقات المالية",
                "اعرض المستحقات المالية لكل عمل منجز مع العميل والمبلغ وطريقة الاستلام وحالة الدفع وآخر متابعة."
        );

        addActionButton(
                actions,
                "📧 الشركات والمراسلات",
                "ساعدني في التواصل مع الشركات والعملاء وإعداد ومتابعة رسائل البريد والتنسيق والتفاوض ومتابعة الاتفاقات وإنهاء الأعمال والصفقات والمطالبة بالمستحقات."
        );
        actionScroll.addView(actions);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        300
                );

        root.addView(actionScroll, params);
    }

    private void addActionButton(
            LinearLayout parent,
            String title,
            String instruction
    ) {

        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(16);
        button.setAllCaps(false);

        button.setOnClickListener(v -> sendToRam(instruction));

        parent.addView(button);
    }

    private void sendToRam(String message) {

        if (message == null || message.trim().isEmpty()) {
            return;
        }

        addUserMessage(message);
        addSystemMessage("رام يفكر...");

        aiService.askAI(
                message,
                new AIService.AIResponseCallback() {

                    @Override
                    public void onSuccess(String response) {

                        runOnUiThread(() -> {

                            removeThinkingMessage();

                            String finalResponse = response;

if (finalResponse == null ||
        finalResponse.trim().isEmpty()) {

    finalResponse =
            "وصلني الطلب، لكن الخادم أعاد رداً فارغاً.";
}

final String safeResponse = finalResponse;
addRamMessage(safeResponse);
speak(safeResponse);
                        });
                    }

                    @Override
                    public void onError(String error) {

                        runOnUiThread(() -> {

                            removeThinkingMessage();

                            String message =
                                    "تعذر الحصول على رد RAM.\n" +
                                    (error == null
                                            ? "خطأ غير معروف."
                                            : error);

                            addRamMessage(message);
                        });
                    }
                }
        );
    }

    private void addUserMessage(String message) {

        TextView text = createMessageView(
                "أنت:\n" + message,
                Color.rgb(45, 90, 160)
        );

        text.setTag("user");
        chatContainer.addView(text);

        scrollToBottom();
    }

    private void addRamMessage(String message) {

        TextView text = createMessageView(
                "RAM:\n" + message,
                Color.rgb(40, 45, 55)
        );

        text.setTag("ram");
        chatContainer.addView(text);

        scrollToBottom();
    }

    private void addSystemMessage(String message) {

        TextView text = createMessageView(
                message,
                Color.rgb(60, 60, 60)
        );

        text.setTag("thinking");
        chatContainer.addView(text);

        scrollToBottom();
    }

    private TextView createMessageView(
            String message,
            int backgroundColor
    ) {

        TextView text = new TextView(this);

        text.setText(message);
        text.setTextColor(Color.WHITE);
        text.setTextSize(17);
        text.setPadding(18, 14, 18, 14);
        text.setBackgroundColor(backgroundColor);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );

        params.setMargins(5, 7, 5, 7);

        text.setLayoutParams(params);

        return text;
    }

    private void removeThinkingMessage() {

        for (int i = chatContainer.getChildCount() - 1; i >= 0; i--) {

            View view = chatContainer.getChildAt(i);

            Object tag = view.getTag();

            if (tag != null &&
                    tag.toString().equals("thinking")) {

                chatContainer.removeViewAt(i);
                break;
            }
        }
    }

    private void scrollToBottom() {

        if (chatScroll == null) {
            return;
        }

        chatScroll.post(() ->
                chatScroll.fullScroll(View.FOCUS_DOWN)
        );
    }

    private void startVoice() {

        try {

            Intent intent =
                    new Intent(
                            RecognizerIntent.ACTION_RECOGNIZE_SPEECH
                    );

            intent.putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            );

            intent.putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE,
                    "ar"
            );

            intent.putExtra(
                    RecognizerIntent.EXTRA_PROMPT,
                    "تحدث مع رام..."
            );

            startActivityForResult(
                    intent,
                    VOICE_REQUEST
            );

        } catch (Exception e) {

            Toast.makeText(
                    this,
                    "التعرف الصوتي غير متاح على هذا الجهاز.",
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {

        super.onActivityResult(
                requestCode,
                resultCode,
                data
        );

        if (requestCode == VOICE_REQUEST &&
                resultCode == RESULT_OK &&
                data != null) {

            ArrayList<String> results =
                    data.getStringArrayListExtra(
                            RecognizerIntent.EXTRA_RESULTS
                    );

            if (results != null &&
                    !results.isEmpty()) {

                String spoken =
                        results.get(0);

                messageInput.setText("");

                sendToRam(spoken);
            }
        }
    }

    private void setupVoice() {

        textToSpeech =
                new TextToSpeech(
                        this,
                        status -> {

                            if (status ==
                                    TextToSpeech.SUCCESS) {

                                int result =
                                        textToSpeech.setLanguage(
                                                new Locale("ar")
                                        );

                                textToSpeech.setSpeechRate(0.95f);
                                textToSpeech.setPitch(1.0f);

                                if (result ==
                                        TextToSpeech.LANG_MISSING_DATA ||
                                        result ==
                                                TextToSpeech.LANG_NOT_SUPPORTED) {

                                    Toast.makeText(
                                            this,
                                            "الصوت العربي غير مثبت بالكامل.",
                                            Toast.LENGTH_SHORT
                                    ).show();
                                }
                            }
                        }
                );
    }

    private void speak(String text) {

        if (textToSpeech == null ||
                text == null ||
                text.trim().isEmpty()) {

            return;
        }

        textToSpeech.speak(
                text,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "RAM_REPLY"
        );
    }

    @Override
    protected void onDestroy() {

        if (textToSpeech != null) {

            textToSpeech.stop();
            textToSpeech.shutdown();
        }

        super.onDestroy();
    }
}
