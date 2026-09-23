package com.ram.agent;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;

public class MainActivity extends Activity {

    private LinearLayout container;
    private TextView statusText;
    private static final int VOICE_REQUEST = 33;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showHome();
    }

    private void showHome() {

        ScrollView scrollView = new ScrollView(this);

        container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(30, 45, 30, 45);
        container.setGravity(Gravity.CENTER_HORIZONTAL);
        container.setBackgroundColor(Color.rgb(15, 16, 22));

        addText("RAM Agent V3", 34, Color.WHITE);

        addText(
                "المساعد الذكي لإدارة الأعمال والمهام",
                20,
                Color.LTGRAY
        );

        statusText = addText(
                "● RAM V3 جاهز للعمل",
                20,
                Color.GREEN
        );

        addButton("🎙 الأوامر الصوتية", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startVoice();
            }
        });

        addButton("📋 المهام والأعمال", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "مركز المهام والأعمال",
                        "• فرص العمل\n\n" +
                        "• المهام الحالية\n\n" +
                        "• المهام ذات الأولوية\n\n" +
                        "• متابعة الأعمال\n\n" +
                        "• سجل الإنجاز"
                );
            }
        });

        addButton("👥 العملاء", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "إدارة العملاء",
                        "• العملاء المحتملون\n\n" +
                        "• العملاء الحاليون\n\n" +
                        "• بيانات التواصل\n\n" +
                        "• المتابعات\n\n" +
                        "• حالة الصفقة"
                );
            }
        });

        addButton("☎ المكالمات", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "مركز المكالمات",
                        "• جهات الاتصال\n\n" +
                        "• فتح شاشة الاتصال\n\n" +
                        "• تعليمات المكالمات\n\n" +
                        "• متابعة المكالمات\n\n" +
                        "• ملخص المكالمة"
                );
            }
        });

        addButton("🍽 الحجوزات والطلبات", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "الحجوزات والطلبات",
                        "• حجوزات المطاعم\n\n" +
                        "• المواعيد\n\n" +
                        "• الطلبات\n\n" +
                        "• متابعة حالة الحجز"
                );
            }
        });

        addButton("🚚 الشحن والخدمات اللوجستية", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "الشحن والخدمات اللوجستية",
                        "• الشحن البحري\n\n" +
                        "• الشحن الجوي\n\n" +
                        "• الشحن البري\n\n" +
                        "• الموردون والمشترون\n\n" +
                        "• متابعة الشحنات"
                );
            }
        });

        addButton("🏢 العقارات والوساطة", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "العقارات والوساطة",
                        "• عروض العقارات\n\n" +
                        "• طلبات البيع والشراء\n\n" +
                        "• الإيجارات\n\n" +
                        "• مطابقة العملاء\n\n" +
                        "• متابعة الصفقات"
                );
            }
        });

        addButton("🌐 المواقع والتصميم والترجمة", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "الخدمات الرقمية",
                        "• تصميم المواقع\n\n" +
                        "• البرمجة\n\n" +
                        "• التصميم الهندسي و3D\n\n" +
                        "• التصميم الإعلاني\n\n" +
                        "• الترجمة\n\n" +
                        "• الأبحاث والاستشارات"
                );
            }
        });

        addButton("📊 التقرير اليومي", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "التقرير اليومي",
                        "• المهام المنجزة\n\n" +
                        "• المهام المفتوحة\n\n" +
                        "• العملاء والمتابعات\n\n" +
                        "• الصفقات\n\n" +
                        "• النتائج اليومية"
                );
            }
        });
        addButton("💰 المستحقات واستلام الأموال", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "المستحقات واستلام الأموال",
                        "• المهمة أو العمل المنجز\n\n" +
                        "• اسم العميل أو الشركة\n\n" +
                        "• المبلغ والعملة\n\n" +
                        "• حالة الدفع: بانتظار الدفع / تم الاستلام\n\n" +
                        "• تحويل بنكي: رقم أو مرجع التحويل\n\n" +
                        "• Western Union: رقم الحوالة MTCN\n\n" +
                        "• MoneyGram: الرقم المرجعي\n\n" +
                        "• USDT: الشبكة ورقم TXID\n\n" +
                        "• ربط المستحقات بالمهمة بعد إنجازها\n\n" +
                        "• لا يعتبر المبلغ مستلماً إلا بعد التحقق"
                );
            }
        });

        addButton("🌍 البحث والتنسيق اللوجستي", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPanel(
                        "البحث والتنسيق اللوجستي",
                        "• البحث عن العملاء والأعمال والشركات من مصادر متعددة حول العالم\n\n" +
                        "• ربط التجار بالموردين والمشترين\n\n" +
                        "• التنسيق بين التاجر وشركات الشحن\n\n" +
                        "• الشحن البحري والجوي والبري\n\n" +
                        "• متابعة عروض الأسعار والتحميل والوجهة والتسليم\n\n" +
                        "• متابعة المستندات وحالة الصفقة\n\n" +
                        "• ربط كل عمل منجز بالمستحقات والعمولة\n\n" +
                        "• المدفوعات والعقود النهائية تتطلب موافقة المستخدم"
                );
            }
        });
        addButton("⚙ إعدادات RAM", new View.OnClickListener() {
            @Override
            public void onClick(View v) {

                Intent intent =
                        new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);

                intent.setData(
                        Uri.parse("package:" + getPackageName())
                );

                startActivity(intent);
            }
        });

        addText(
                "RAM Agent V3\nالعمليات المالية الحساسة تتطلب موافقة المستخدم",
                14,
                Color.GRAY
        );

        scrollView.addView(container);
        setContentView(scrollView);
    }

    private TextView addText(
            String text,
            int size,
            int color
    ) {

        TextView textView = new TextView(this);

        textView.setText(text);
        textView.setTextSize(size);
        textView.setTextColor(color);
        textView.setGravity(Gravity.CENTER);
        textView.setPadding(0, 12, 0, 18);

        container.addView(textView);

        return textView;
    }

    private void addButton(
            String title,
            View.OnClickListener listener
    ) {

        Button button = new Button(this);

        button.setText(title);
        button.setTextSize(19);
        button.setAllCaps(false);

        LinearLayout.LayoutParams params =
                new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                );

        params.setMargins(0, 8, 0, 8);

        button.setLayoutParams(params);
        button.setOnClickListener(listener);

        container.addView(button);
    }

    private void showPanel(
            String title,
            String body
    ) {

        container.removeAllViews();

        addText(
                "RAM Agent V3",
                28,
                Color.WHITE
        );

        addText(
                title,
                25,
                Color.GREEN
        );

        TextView information =
                addText(
                        body,
                        20,
                        Color.WHITE
                );

        information.setGravity(Gravity.RIGHT);

        addButton("← العودة للرئيسية", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showHome();
            }
        });
    }

    private void startVoice() {

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
                "تحدث إلى RAM"
        );

        try {

            startActivityForResult(
                    intent,
                    VOICE_REQUEST
            );

        } catch (Exception e) {

            Toast.makeText(
                    this,
                    "خدمة التعرف الصوتي غير متاحة على الهاتف",
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

        if (requestCode == VOICE_REQUEST
                && resultCode == RESULT_OK
                && data != null) {

            ArrayList<String> results =
                    data.getStringArrayListExtra(
                            RecognizerIntent.EXTRA_RESULTS
                    );

            if (results != null
                    && !results.isEmpty()) {

                String command = results.get(0);
RamEngine ramEngine = new RamEngine(this);

String response = ramEngine.executeCommand(command);

statusText.setText(
        "● الأمر: " + command +
        "\n\n● رد RAM:\n" + response
);

Toast.makeText(
        this,
        "تم تنفيذ الأمر بواسطة RAM",
        Toast.LENGTH_LONG
).show();
                
                    
            

                
                    
            
                        
            
            }
        }
    }
}
