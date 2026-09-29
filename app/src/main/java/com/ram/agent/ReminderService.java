package com.ram.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Intent;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

public class ReminderService extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        try {
            JSONObject state = new JSONObject(
                getSharedPreferences("ram_business", MODE_PRIVATE)
                    .getString("state", "{}")
            );

            JSONArray jobs = state.optJSONArray("jobs");
            int open = 0;
            int late = 0;
            long now = System.currentTimeMillis();

            if (jobs != null) {
                for (int i = 0; i < jobs.length(); i++) {
                    JSONObject job = jobs.getJSONObject(i);
                    String stage = job.optString("stage");

                    if (!stage.equals("NEW") && !stage.equals("RECEIVED")) {
                        open++;
                    }

                    long dueAt = job.optLong("dueAt", 0);
                    if ((stage.equals("PAYMENT_PENDING")
                            || stage.equals("PAYMENT_REPORTED"))
                            && dueAt > 0 && now - dueAt >= 86400000) {
                        late++;
                    }
                }
            }

            if (open > 0) {
                NotificationManager manager =
                    (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                String channel = "ram-followups";

                if (Build.VERSION.SDK_INT >= 26) {
                    manager.createNotificationChannel(
                        new NotificationChannel(
                            channel, "متابعات رام",
                            NotificationManager.IMPORTANCE_DEFAULT
                        )
                    );
                }

                Intent intent = new Intent(this, MainActivity.class);
                PendingIntent pending = PendingIntent.getActivity(
                    this, 0, intent,
                    PendingIntent.FLAG_IMMUTABLE
                        | PendingIntent.FLAG_UPDATE_CURRENT
                );

                Notification.Builder notification =
                    Build.VERSION.SDK_INT >= 26
                        ? new Notification.Builder(this, channel)
                        : new Notification.Builder(this);

                notification
                    .setSmallIcon(android.R.drawable.ic_popup_reminder)
                    .setContentTitle("متابعة سجل أعمال رام")
                    .setContentText(
                        "أعمال مفتوحة: " + open
                            + " · مستحقات للمراجعة: " + late
                    )
                    .setContentIntent(pending)
                    .setAutoCancel(true);

                manager.notify(71717, notification.build());
            }
        } catch (Exception ignored) {
        }

        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
