package com.ram.agent;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;

/** User-started microphone conversation without Android's one-utterance beep recognizer. */
public final class VoiceConversationService extends Service {
    public static final String ACTION_START = "com.ram.agent.voice.START";
    public static final String ACTION_STOP = "com.ram.agent.voice.STOP";
    public static final String ACTION_RESUME = "com.ram.agent.voice.RESUME";
    public static final String ACTION_PAUSE = "com.ram.agent.voice.PAUSE";
    public static final String ACTION_AUDIO_READY = "com.ram.agent.voice.AUDIO_READY";
    public static final String ACTION_LISTENING = "com.ram.agent.voice.LISTENING";
    public static final String ACTION_PROCESSING = "com.ram.agent.voice.PROCESSING";
    public static final String ACTION_ERROR = "com.ram.agent.voice.ERROR";
    public static final String ACTION_STOPPED = "com.ram.agent.voice.STOPPED";
    private static final String CHANNEL = "ram_voice_session";
    private static final int NOTIFICATION_ID = 4201;
    private static final int RATE = 16000;
    private static final int FRAME = 320; // 20 ms of mono PCM
    private static final int SILENCE_MS = 1300;
    private static final int MAX_TURN_MS = 90000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean active, listening, paused, captureRun, scheduled;
    private volatile AudioRecord recorder;
    private Thread captureThread;

    @Override public void onCreate() { super.onCreate(); createNotificationChannel(); }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? ACTION_START : intent.getAction();
        if (ACTION_STOP.equals(action)) { stopSession(); return START_NOT_STICKY; }
        if (ACTION_PAUSE.equals(action)) { paused = true; cancelCapture(); return START_STICKY; }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            broadcast(ACTION_ERROR, "يحتاج وضع المحادثة إلى إذن الميكروفون."); stopSession(); return START_NOT_STICKY;
        }
        active = true; paused = false;
        getSharedPreferences("ram_voice", MODE_PRIVATE).edit().putBoolean("active", true).apply();
        startAsForeground();
        if (ACTION_RESUME.equals(action)) scheduleListen(250); else startListening();
        return START_STICKY;
    }

    private void startAsForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(NOTIFICATION_ID, n);
    }

    private void startListening() {
        if (!active || paused || listening) return;
        if (captureThread != null && captureThread.isAlive()) { scheduleListen(250); return; }
        listening = true; captureRun = true; broadcast(ACTION_LISTENING, null);
        captureThread = new Thread(this::captureUtterance, "ram-audio-capture"); captureThread.start();
    }

    private void captureUtterance() {
        AudioRecord local = null;
        try {
            int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (min <= 0) throw new IOException("تعذر تهيئة الميكروفون على هذا الجهاز.");
            local = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT, Math.max(min, FRAME * 8));
            if (local.getState() != AudioRecord.STATE_INITIALIZED) throw new IOException("تعذر تهيئة الميكروفون.");
            recorder = local; local.startRecording();
            ByteArrayOutputStream pcm = new ByteArrayOutputStream(RATE * 2 * 12);
            ArrayDeque<short[]> preRoll = new ArrayDeque<>(); short[] frame = new short[FRAME];
            boolean speech = false; long speechSamples = 0, silentMs = 0, turnMs = 0; double noiseRms = 180;
            while (captureRun && active && !paused && turnMs < MAX_TURN_MS) {
                int count = local.read(frame, 0, frame.length, AudioRecord.READ_BLOCKING); if (count <= 0) continue;
                turnMs += (long) count * 1000 / RATE; double sum = 0;
                for (int i=0;i<count;i++) sum += (double)frame[i] * frame[i];
                double rms = Math.sqrt(sum / count), threshold = Math.max(300, noiseRms * 2.5); boolean voiced = rms > threshold;
                if (!speech) {
                    if (!voiced) { noiseRms = noiseRms * 0.96 + rms * 0.04; addPreRoll(preRoll, frame, count); continue; }
                    speech = true; while (!preRoll.isEmpty()) appendPcm(pcm, preRoll.removeFirst(), FRAME); speechSamples += count;
                } else if (voiced) { silentMs = 0; speechSamples += count; }
                else silentMs += (long) count * 1000 / RATE;
                appendPcm(pcm, frame, count);
                if (speech && silentMs >= SILENCE_MS) break;
            }
            if (captureRun && active && speech && speechSamples >= RATE / 3) {
                File dir = new File(getCacheDir(), "ram-voice");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("تعذر حفظ المقطع الصوتي مؤقتًا.");
                File wav = File.createTempFile("utterance-", ".wav", dir); writeWav(wav, pcm.toByteArray());
                listening = false; paused = true; broadcast(ACTION_PROCESSING, null); broadcast(ACTION_AUDIO_READY, wav.getAbsolutePath());
            } else if (captureRun && active && !paused) { listening = false; scheduleListen(250); }
        } catch (Exception e) {
            listening = false;
            if (active && !paused) { broadcast(ACTION_ERROR, e.getMessage()); scheduleListen(1200); }
        } finally {
            recorder = null;
            if (local != null) { try { if (local.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) local.stop(); } catch (Exception ignored) {} local.release(); }
            listening = false;
        }
    }

    private static void addPreRoll(ArrayDeque<short[]> q, short[] frame, int count) {
        short[] copy = new short[FRAME]; System.arraycopy(frame, 0, copy, 0, count); if (q.size() == 12) q.removeFirst(); q.addLast(copy);
    }
    private static void appendPcm(ByteArrayOutputStream out, short[] frame, int count) {
        for (int i=0;i<count;i++) { int v=frame[i]; out.write(v & 255); out.write((v >>> 8) & 255); }
    }
    private static void writeWav(File file, byte[] pcm) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(new byte[]{'R','I','F','F'}); writeLeInt(out, 36 + pcm.length); out.write(new byte[]{'W','A','V','E','f','m','t',' '});
            writeLeInt(out, 16); writeLeShort(out, 1); writeLeShort(out, 1); writeLeInt(out, RATE); writeLeInt(out, RATE * 2);
            writeLeShort(out, 2); writeLeShort(out, 16); out.write(new byte[]{'d','a','t','a'}); writeLeInt(out, pcm.length); out.write(pcm);
        }
    }
    private static void writeLeInt(FileOutputStream out, int v) throws IOException { out.write(v & 255); out.write((v>>>8)&255); out.write((v>>>16)&255); out.write((v>>>24)&255); }
    private static void writeLeShort(FileOutputStream out, int v) throws IOException { out.write(v & 255); out.write((v>>>8)&255); }

    private void cancelCapture() {
        if (scheduled) { handler.removeCallbacks(listenRunnable); scheduled = false; }
        captureRun = false; AudioRecord r = recorder; if (r != null) { try { r.stop(); } catch (Exception ignored) {} } listening = false;
    }
    private final Runnable listenRunnable = () -> { scheduled = false; startListening(); };
    private void scheduleListen(long delay) { if (!active || paused || scheduled) return; scheduled = true; handler.postDelayed(listenRunnable, delay); }
    private void stopSession() {
        active = false; paused = true; cancelCapture(); handler.removeCallbacksAndMessages(null);
        getSharedPreferences("ram_voice", MODE_PRIVATE).edit().putBoolean("active", false).apply(); broadcast(ACTION_STOPPED, null);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true); stopSelf();
    }
    private void broadcast(String action, String value) {
        Intent event = new Intent(action).setPackage(getPackageName());
        if (value != null) event.putExtra(action.equals(ACTION_AUDIO_READY) ? "path" : "message", value); sendBroadcast(event);
    }
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel c = new NotificationChannel(CHANNEL, "محادثة رام الصوتية", NotificationManager.IMPORTANCE_LOW);
        c.setDescription("نشط ما دامت المحادثة الصوتية قيد التشغيل"); NotificationManager m = getSystemService(NotificationManager.class); if (m != null) m.createNotificationChannel(c);
    }
    private Notification buildNotification() {
        Intent stop = new Intent(this, VoiceConversationService.class).setAction(ACTION_STOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT; if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getService(this, 4202, stop, flags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("رام في وضع المحادثة الصوتية")
                .setContentText("رام يستمع حتى نهاية كلامك؛ اضغط إيقاف لإنهاء المحادثة").setOngoing(true)
                .addAction(android.R.drawable.ic_media_pause, "إيقاف", pi).build();
    }
    @Override public void onTaskRemoved(Intent rootIntent) { super.onTaskRemoved(rootIntent); }
    @Override public void onDestroy() { active=false; cancelCapture(); handler.removeCallbacksAndMessages(null); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
