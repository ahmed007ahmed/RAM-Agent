package com.ram.agent;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
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

    private TextToSpeech tts;
    private AIService aiService;

    private boolean voiceReady = false;
    private boolean waitingForRam = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        aiService = new AIService();

        buildInterface();
        setupVoice();

        addRamMessage(
                "مرحباً أحمد.\n" +
                "أنا رام عشيش. تحدث معي بصورة طبيعية، " +
                "واكتب ما تريد تنفيذه أو البحث عنه."
        );
    }

    private void buildInterface() {

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(13, 15, 20));
        root.setPadding(dp(12), dp(10), dp(12), dp(10));

        setContentView(root);

        createHeader();
        createQuickTools();
        createChatArea();
        createComposer();
    }

    private void createHeader() {

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setGravity(Gravity.CENTER);
        header.setPadding(dp(8), dp(8), dp(8), dp(12));

        TextView title = new TextView(this);
        title.setText("RAM");
        title.setTextColor(Color.WHITE);
        title.setTextSize(30);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);

        TextView subtitle = new TextView(this);
        subtitle.setText("رام عشيش  •  المساعد الذكي");
        subtitle.setTextColor(Color.rgb(92, 220, 135));
        subtitle.setTextSize(15);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, dp(4), 0, 0);

        header.addView(title);
        header.addView(subtitle);

        root.addView(
                header,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                )
        );
    }

    private void createQuickTools() {

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);

        LinearLayout tools = new LinearLayout(this);
        tools.setOrientation(LinearLayout.HORIZONTAL);
        tools.setPadding(0, 0, 0, dp(8));

        addTool(tools, "🔎 بحث", "ابحث في الإنترنت عن طلبي التالي: ");
        addTool(tools, "💼 فرص", "ابحث عن فرص عمل حقيقية وحديثة تناسب خدماتي.");
        addTool(tools, "📋 مهامي", "اعرض ونظم المهام الحالية باختصار.");
        addTool(tools, "👥 العملاء", "ساعدني في تنظيم ومتابعة العملاء.");
        addTool(tools, "🚚 الشحن", "ساعدني في أعمال الشحن والخدمات اللوجستية.");
        addTool(tools, "🏢 العقارات", "ساعدني في فرص وأعمال العقارات والوساطة.");
        addTool(tools, "🌐 خدمات", "ساعدني في التصميم والبرمجة والترجمة والأبحاث.");
        addTool(tools, "✅ المنجزة", "اعرض الأعمال المنجزة وحالتها.");
        addTool(tools, "💰 المستحقات", "اعرض الأعمال التي لها مستحقات مالية وحالة المتابعة.");

        scroll.addView(tools);

        root.addView(
                scroll,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                )
        );
    }

    private void addTool(
            LinearLayout parent,
            String title,
            String prompt
    ) {

        Button button = new Button(this);
        button.setText(title);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setSingleLine(true);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        dp(48)
                );

        params.setMargins(0, 0, dp(7), 0);

        button.setLayoutParams(params);

        /*
         * مهم:
         * الضغط على الأداة لا يجعل RAM ينطق قائمة محفوظة.
         * فقط يضع توجيهاً في خانة الكتابة كي يضيف المستخدم التفاصيل.
         */
        button.setOnClickListener(v -> {
            messageInput.setText(prompt);
            messageInput.setSelection(messageInput.getText().length());
            messageInput.requestFocus();
            openKeyboard();
        });

        parent.addView(button);
    }

    private void createChatArea() {

        chatScroll = new ScrollView(this);
        chatScroll.setFillViewport(true);

        chatContainer = new LinearLayout(this);
        chatContainer.setOrientation(LinearLayout.VERTICAL);
        chatContainer.setPadding(dp(4), dp(8), dp(4), dp(8));

        chatScroll.addView(
                chatContainer,
                new ScrollView.LayoutParams(
                        ScrollView.LayoutParams.MATCH_PARENT,
                        ScrollView.LayoutParams.WRAP_CONTENT
                )
        );

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        0,
                        1f
                );

        root.addView(chatScroll, params);
    }

    private void createComposer() {

        LinearLayout composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(0, dp(8), 0, 0);

        messageInput = new EditText(this);
        messageInput.setHint("اكتب رسالتك إلى رام...");
        messageInput.setHintTextColor(Color.rgb(145, 145, 150));
        messageInput.setTextColor(Color.WHITE);
        messageInput.setTextSize(16);
        messageInput.setSingleLine(false);
        messageInput.setMaxLines(4);
        messageInput.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);
        messageInput.setBackgroundColor(Color.rgb(34, 37, 45));
        messageInput.setPadding(
                dp(14),
                dp(10),
                dp(14),
                dp(10)
        );

        LinearLayout.LayoutParams inputParams =
                new LinearLayout.LayoutParams(
                        0,
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        1f
                );

        composer.addView(messageInput, inputParams);

        Button mic = new Button(this);
        mic.setText("🎙");
        mic.setTextSize(20);
        mic.setAllCaps(false);

        LinearLayout.LayoutParams micParams =
                new LinearLayout.LayoutParams(
                        dp(58),
                        dp(54)
                );

        micParams.setMargins(dp(6), 0, 0, 0);

        mic.setLayoutParams(micParams);
        mic.setOnClickListener(v -> startVoiceRecognition());

        composer.addView(mic);

        Button send = new Button(this);
        send.setText("➤");
        send.setTextSize(20);
        send.setAllCaps(false);

        LinearLayout.LayoutParams sendParams =
                new LinearLayout.LayoutParams(
                        dp(58),
                        dp(54)
                );

        sendParams.setMargins(dp(5), 0, 0, 0);

        send.setLayoutParams(sendParams);

        send.setOnClickListener(v -> sendCurrentMessage());

        composer.addView(send);

        root.addView(
                composer,
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                )
        );
    }

    private void sendCurrentMessage() {

        if (waitingForRam) {
            Toast.makeText(
                    this,
                    "رام يعالج رسالتك الحالية.",
                    Toast.LENGTH_SHORT
            ).show();
            return;
        }

        String message =
                messageInput.getText().toString().trim();

        if (message.isEmpty()) {
            return;
        }

        messageInput.setText("");
        hideKeyboard();

        sendToRam(message);
    }

    private void sendToRam(String message) {

        if (message == null || message.trim().isEmpty()) {
            return;
        }

        waitingForRam = true;

        addUserMessage(message);
        addThinkingMessage();

        aiService.askAI(
                message,
                new AIService.AIResponseCallback() {

                    @Override
                    public void onSuccess(String response) {

                        runOnUiThread(() -> {

                            waitingForRam = false;
                            removeThinkingMessage();

                            String answer = response;

                            if (answer == null ||
                                    answer.trim().isEmpty()) {

                                answer =
                                        "وصلني طلبك، لكن لم يصل رد واضح من الخادم.";
                            }

                            answer = cleanForDisplay(answer);

                            addRamMessage(answer);

                            /*
                             * الصوت يقرأ رد RAM فقط.
                             * لا يقرأ الأزرار أو القوائم الموجودة على الشاشة.
                             */
                            speak(answer);
                        });
                    }

                    @Override
                    public void onError(String error) {

                        runOnUiThread(() -> {

                            waitingForRam = false;
                            removeThinkingMessage();

                            String readableError =
                                    "تعذر الاتصال بذكاء RAM الآن.";

                            if (error != null &&
                                    !error.trim().isEmpty()) {

                                readableError +=
                                        "\n" + error.trim();
                            }

                            addSystemMessage(readableError);

                            /*
                             * لا ننطق أخطاء الخادم الطويلة.
                             * هذا يمنع الصوت المزعج والمتكرر.
                             */
                        });
                    }
                }
        );
    }

    private String cleanForDisplay(String text) {

        if (text == null) {
            return "";
        }

        String result = text.trim();

        while (result.contains("\n\n\n")) {
            result = result.replace("\n\n\n", "\n\n");
        }

        return result;
    }

    private void addUserMessage(String text) {

        TextView view = createMessageView(
                "أنت\n" + text,
                Color.rgb(36, 82, 64),
                Gravity.RIGHT
        );

        chatContainer.addView(view);
        scrollToBottom();
    }

    private void addRamMessage(String text) {

        TextView view = createMessageView(
                "RAM\n" + text,
                Color.rgb(36, 40, 50),
                Gravity.LEFT
        );

        chatContainer.addView(view);
        scrollToBottom();
    }

    private void addSystemMessage(String text) {

        TextView view = createMessageView(
                text,
                Color.rgb(65, 48, 48),
                Gravity.CENTER
        );

        view.setTag("SYSTEM");

        chatContainer.addView(view);
        scrollToBottom();
    }

    private void addThinkingMessage() {

        TextView view = createMessageView(
                "RAM يفكر...",
                Color.rgb(30, 33, 40),
                Gravity.LEFT
        );

        view.setTag("THINKING");

        chatContainer.addView(view);
        scrollToBottom();
    }

    private void removeThinkingMessage() {

        for (int i = chatContainer.getChildCount() - 1;
             i >= 0;
             i--) {

            View child = chatContainer.getChildAt(i);

            Object tag = child.getTag();

            if (tag != null &&
                    "THINKING".equals(tag.toString())) {

                chatContainer.removeViewAt(i);
                return;
            }
        }
    }

    private TextView createMessageView(
            String text,
            int background,
            int gravity
    ) {

        TextView view = new TextView(this);

        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setTextSize(16);
        view.setLineSpacing(0, 1.15f);
        view.setPadding(
                dp(14),
                dp(11),
                dp(14),
                dp(11)
        );

        view.setBackgroundColor(background);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );

        params.gravity = gravity;
        params.setMargins(
                dp(4),
                dp(5),
                dp(4),
                dp(5)
        );

        view.setLayoutParams(params);

        return view;
    }

    private void setupVoice() {

        tts = new TextToSpeech(
                this,
                status -> {

                    if (status != TextToSpeech.SUCCESS) {
                        voiceReady = false;
                        return;
                    }

                    int result =
                            tts.setLanguage(
                                    new Locale("ar")
                            );

                    tts.setSpeechRate(1.03f);
                    tts.setPitch(1.0f);

                    voiceReady =
                            result != TextToSpeech.LANG_MISSING_DATA &&
                            result != TextToSpeech.LANG_NOT_SUPPORTED;
                }
        );
    }

    private void speak(String text) {

        if (!voiceReady ||
                tts == null ||
                text == null ||
                text.trim().isEmpty()) {

            return;
        }

        String spoken = prepareSpeech(text);

        if (spoken.isEmpty()) {
            return;
        }

        tts.stop();

        tts.speak(
                spoken,
                TextToSpeech.QUEUE_FLUSH,
                null,
                "RAM_REPLY"
        );
    }

    private String prepareSpeech(String text) {

        String spoken = text;

        /*
         * نحذف بعض رموز التنسيق التي تجعل TTS يبدو آلياً.
         */
        spoken = spoken.replace("**", "");
        spoken = spoken.replace("###", "");
        spoken = spoken.replace("##", "");
        spoken = spoken.replace("#", "");
        spoken = spoken.replace("`", "");
        spoken = spoken.replace("•", ". ");

        /*
         * الردود الطويلة جداً تظهر كاملة على الشاشة،
         * لكن لا نجبر المحرك الصوتي على قراءة صفحات كاملة.
         */
        int maximumSpeechLength = 1200;

        if (spoken.length() > maximumSpeechLength) {
            spoken =
                    spoken.substring(
                            0,
                            maximumSpeechLength
                    ) +
                    ". بقية التفاصيل موجودة على الشاشة.";
        }

        return spoken.trim();
    }

    private void startVoiceRecognition() {

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
                    "تحدث مع رام"
            );

            startActivityForResult(
                    intent,
                    VOICE_REQUEST
            );

        } catch (Exception e) {

            Toast.makeText(
                    this,
                    "التعرف الصوتي غير متاح على الجهاز.",
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

        if (requestCode != VOICE_REQUEST ||
                resultCode != RESULT_OK ||
                data == null) {

            return;
        }

        ArrayList<String> results =
                data.getStringArrayListExtra(
                        RecognizerIntent.EXTRA_RESULTS
                );

        if (results == null || results.isEmpty()) {
            return;
        }

        String spokenText = results.get(0);

        if (spokenText == null ||
                spokenText.trim().isEmpty()) {

            return;
        }

        messageInput.setText(spokenText);
        messageInput.setSelection(
                messageInput.getText().length()
        );

        /*
         * لا نرسل الكلام تلقائياً.
         * يظهر أولاً في خانة الكتابة حتى لا ينفذ
         * التعرف الصوتي الخاطئ أمراً لم يقصده المستخدم.
         */
    }

    private void scrollToBottom() {

        chatScroll.post(
                () -> chatScroll.fullScroll(
                        View.FOCUS_DOWN
                )
        );
    }

    private void openKeyboard() {

        messageInput.postDelayed(
                () -> {

                    InputMethodManager manager =
                            (InputMethodManager)
                                    getSystemService(
                                            Context.INPUT_METHOD_SERVICE
                                    );

                    if (manager != null) {
                        manager.showSoftInput(
                                messageInput,
                                InputMethodManager.SHOW_IMPLICIT
                        );
                    }
                },
                150
        );
    }

    private void hideKeyboard() {

        InputMethodManager manager =
                (InputMethodManager)
                        getSystemService(
                                Context.INPUT_METHOD_SERVICE
                        );

        if (manager != null &&
                messageInput != null) {

            manager.hideSoftInputFromWindow(
                    messageInput.getWindowToken(),
                    0
            );
        }
    }

    private int dp(int value) {

        float density =
                getResources()
                        .getDisplayMetrics()
                        .density;

        return Math.round(value * density);
    }

    @Override
    protected void onDestroy() {

        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }

        super.onDestroy();
    }
}
