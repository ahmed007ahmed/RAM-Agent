package com.ram.agent;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class AIService {

    private static final String API_URL =
            "https://ram-agent-production.up.railway.app/chat";

    public interface AIResponseCallback {
        void onSuccess(String response);
        void onError(String error);
    }

    public void askAI(String userMessage, AIResponseCallback callback) {

        if (userMessage == null || userMessage.trim().isEmpty()) {
            callback.onError("لم أسمع سؤالك بوضوح.");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;

            try {
                URL url = new URL(API_URL);
                connection = (HttpURLConnection) url.openConnection();

                connection.setRequestMethod("POST");
                connection.setRequestProperty(
                        "Content-Type",
                        "application/json; charset=UTF-8"
                );
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(60000);
                connection.setDoOutput(true);

                JSONObject body = new JSONObject();
                body.put("message", userMessage);

                byte[] data = body.toString()
                        .getBytes(StandardCharsets.UTF_8);

                try (OutputStream output =
                             connection.getOutputStream()) {
                    output.write(data);
                }

                int statusCode = connection.getResponseCode();

                InputStream stream =
                        statusCode >= 200 && statusCode < 300
                                ? connection.getInputStream()
                                : connection.getErrorStream();

                StringBuilder result = new StringBuilder();

                if (stream != null) {
                    try (BufferedReader reader =
                                 new BufferedReader(
                                         new InputStreamReader(
                                                 stream,
                                                 StandardCharsets.UTF_8
                                         ))) {

                        String line;

                        while ((line = reader.readLine()) != null) {
                            result.append(line);
                        }
                    }
                }

                if (statusCode >= 200 && statusCode < 300) {

                    JSONObject json =
                            new JSONObject(result.toString());

                    String response =
                            json.optString("response");

                    if (response.isEmpty()) {
                        throw new Exception(
                                "لم يصل رد من خادم RAM."
                        );
                    }

                    new Handler(Looper.getMainLooper()).post(
                            () -> callback.onSuccess(response)
                    );

                } else {

                    throw new Exception(
                            "خطأ من الخادم: " + statusCode
                    );
                }

            } catch (Exception e) {

                new Handler(Looper.getMainLooper()).post(
                        () -> callback.onError(
                                "تعذر الاتصال بخادم RAM: "
                                        + e.getMessage()
                        )
                );

            } finally {

                if (connection != null) {
                    connection.disconnect();
                }
            }

        }).start();
    }
}
