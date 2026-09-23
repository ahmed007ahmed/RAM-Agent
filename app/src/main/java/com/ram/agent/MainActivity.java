package com.ram.agent;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private LinearLayout container;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ScrollView scrollView = new ScrollView(this);

        container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(35, 55, 35, 55);
        container.setBackgroundColor(Color.rgb(15, 17, 22));

        TextView title = new TextView(this);
        title.setText("RAM Agent");
        title.setTextSize(32);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, 20, 0, 10);
        container.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("المساعد الذكي لإدارة الأعمال والمهام");
        subtitle.setTextSize(18);
        subtitle.setTextColor(Color.LTGRAY);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 0, 0, 30);
        container.addView(subtitle);

        statusText = new TextView(this);
        statusText.setText("● RAM جاهز للعمل");
        statusText.setTextSize(18);
        statusText.setTextColor(Color.GREEN);
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(0, 15, 0, 30);
        container.addView(statusText);

        addButton("▶ تشغيل RAM", "تم تشغيل RAM");
        addButton("📋 المهام والأعمال", "فتح مركز المهام");
        addButton("👥 العملاء", "فتح إدارة العملاء");
        addButton("☎ المكالمات", "فتح مركز المكالمات");
        addButton("🍽 الحجوزات والطلبات", "فتح الحجوزات والطلبات");
        addButton("🚚 الشحن والخدمات اللوجستية", "فتح قسم الشحن");
        addButton("🏢 العقارات والوساطة", "فتح قسم العقارات");
        addButton("🌐 المواقع والتصميم والترجمة", "فتح الخدمات الرقمية");
        addButton("📊 التقرير اليومي", "فتح التقرير اليومي");

        TextView footer = new TextView(this);
        footer.setText(
            "\nRAM Agent V2\n" +
            "مركز إدارة الأعمال الذكي"
        );
        footer.setTextSize(14);
        footer.setTextColor(Color.GRAY);
        footer.setGravity(Gravity.CENTER);
        footer.setPadding(0, 25, 0, 20);
        container.addView(footer);

        scrollView.addView(container);
        setContentView(scrollView);
    }

    private void addButton(String text, final String message) {

        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(17);
        button.setAllCaps(false);

        LinearLayout.LayoutParams params =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            );

        params.setMargins(0, 8, 0, 8);
        button.setLayoutParams(params);

        button.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {

                statusText.setText("● " + message);

                Toast.makeText(
                    MainActivity.this,
                    message,
                    Toast.LENGTH_SHORT
                ).show();
            }
        });

        container.addView(button);
    }
}
