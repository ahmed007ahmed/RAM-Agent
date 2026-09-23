package com.ram.agent;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Button;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(40, 40, 40, 40);
        layout.setBackgroundColor(Color.rgb(15, 18, 25));

        TextView title = new TextView(this);
        title.setText("RAM Agent");
        title.setTextSize(32);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);

        TextView status = new TextView(this);
        status.setText("\nالمساعد جاهز للعمل\n");
        status.setTextSize(20);
        status.setTextColor(Color.WHITE);
        status.setGravity(Gravity.CENTER);

        Button startButton = new Button(this);
        startButton.setText("تشغيل RAM");

        startButton.setOnClickListener(v ->
            Toast.makeText(
                MainActivity.this,
                "تم تشغيل RAM",
                Toast.LENGTH_SHORT
            ).show()
        );

        layout.addView(title);
        layout.addView(status);
        layout.addView(startButton);

        setContentView(layout);
    }
}
