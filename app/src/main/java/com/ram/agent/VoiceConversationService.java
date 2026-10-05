package com.ram.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;

/** Explicit, user-started voice conversation. The notification action always stops listening. */
public final class VoiceConversationService extends Service {
    public static final String ACTION_START = "com.ram.agent.voice.START";
    public static final String ACTION_STOP = "com.ram.agent.voice.STOP";
    public static final String ACTION_RESUME = "com.ram.agent.voice.RESUME";
    public static final String ACTION_PAUSE = "com.ram.agent.voice.PAUSE";
    public static final String ACTION_TRANSCRIPT = "com.ram.agent.voice.TRANSCRIPT";
    public static final String ACTION_LISTENING = "com.ram.agent.voice.LISTENING";
    public static final String ACTION_STOPPED = "com.ram.agent.voice.STOPPED";
    private static final String CHANNEL = "ram_voice_session";
    private static final int NOTIFICATION_ID = 4201;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean active;
    private boolean listening;
    private boolean scheduled;
    private boolean paused;
    private int retryAttempt;

    @Override public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopSession();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSE.equals(action)) {
            paused = true;
            cancelListening();
            return START_STICKY;
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSession();
            return START_NOT_STICKY;
        }
        active = true;
        paused = false;
        getSharedPreferences("ram_voice", MODE_PRIVATE).edit().putBoolean("active", true).apply();
        startAsForeground();
        if (!ensureRecognizer()) {
            broadcast(ACTION_STOPPED, null);
            stopSession();
            return START_NOT_STICKY;
        }
        if (ACTION_RESUME.equals(action)) scheduleListen(250);
        else startListening();
        return START_STICKY;
    }

    private void startAsForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private boolean ensureRecognizer() {
        if (recognizer != null) return true;
        if (!SpeechRecognizer.isRecognitionAvailable(this)) return false;
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(android.os.Bundle params) { listening = true; retryAttempt = 0; broadcast(ACTION_LISTENING, null); }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { listening = false; }
                @Override public void onError(int error) {
                    listening = false;
                    if (active && !paused) {
                        long delay = Math.min(8000L, 400L * (1L << Math.min(retryAttempt++, 4)));
                        scheduleListen(Math.max(delay, error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 1000L : 0L));
                    }
                }
                @Override public void onResults(android.os.Bundle results) {
                    listening = false;
                    ArrayList<String> matches = results == null ? null :
                            results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty() && matches.get(0) != null && !matches.get(0).trim().isEmpty()) {
                        // Pause after each utterance. MainActivity resumes listening after RAM speaks.
                        paused = true;
                        broadcast(ACTION_TRANSCRIPT, matches.get(0).trim());
                    } else if (active && !paused) {
                        scheduleListen(350);
                    }
                }
                @Override public void onPartialResults(android.os.Bundle partialResults) {}
                @Override public void onEvent(int eventType, android.os.Bundle params) {}
            });
            return true;
        } catch (RuntimeException e) {
            recognizer = null;
            return false;
        }
    }

    private void startListening() {
        if (!active || paused || listening || recognizer == null) return;
        if (scheduled) {
            handler.removeCallbacks(listenRunnable);
            scheduled = false;
        }
        Intent request = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        request.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        request.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-YE");
        request.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        request.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            listening = true;
            recognizer.startListening(request);
        } catch (RuntimeException e) {
            listening = false;
            scheduleListen(1000);
        }
    }

    private void cancelListening() {
        if (scheduled) {
            handler.removeCallbacks(listenRunnable);
            scheduled = false;
        }
        if (recognizer != null && listening) {
            try { recognizer.cancel(); } catch (RuntimeException ignored) {}
        }
        listening = false;
    }

    private final Runnable listenRunnable = () -> {
        scheduled = false;
        startListening();
    };

    private void scheduleListen(long delayMs) {
        if (!active || scheduled) return;
        scheduled = true;
        handler.postDelayed(listenRunnable, delayMs);
    }

    private void stopSession() {
        active = false;
        paused = true;
        listening = false;
        scheduled = false;
        handler.removeCallbacks(listenRunnable);
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (RuntimeException ignored) {}
            try { recognizer.destroy(); } catch (RuntimeException ignored) {}
            recognizer = null;
        }
        getSharedPreferences("ram_voice", MODE_PRIVATE).edit().putBoolean("active", false).apply();
        broadcast(ACTION_STOPPED, null);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    private void broadcast(String action, String text) {
        Intent event = new Intent(action).setPackage(getPackageName());
        if (text != null) event.putExtra("text", text);
        sendBroadcast(event);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "محادثة رام الصوتية", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("يظهر هذا الإشعار ما دام وضع المحادثة الصوتية نشطًا");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification() {
        Intent stop = new Intent(this, VoiceConversationService.class).setAction(ACTION_STOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent stopPending = PendingIntent.getService(this, 4202, stop, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("رام في وضع المحادثة الصوتية")
                .setContentText("يتوقف الاستماع عند الضغط على إيقاف المحادثة")
                .setOngoing(true)
                .addAction(android.R.drawable.ic_media_pause, "إيقاف", stopPending);
        return builder.build();
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        // Keep the explicit session active when the user switches apps. Android shows its FGS notification.
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        active = false;
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (RuntimeException ignored) {}
            try { recognizer.destroy(); } catch (RuntimeException ignored) {}
            recognizer = null;
        }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
