package com.ram.agent;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public class AIService {
    public static final String DEFAULT_SERVER = "https://ram-agent-production.up.railway.app";
    private final android.content.Context context;
    private final org.json.JSONArray history = new org.json.JSONArray();
    public AIService(android.content.Context context){this.context=context.getApplicationContext();}
    public String server(){return context.getSharedPreferences("ram_settings",0).getString("server",DEFAULT_SERVER).replaceAll("/+$","");}
    public interface AIResponseCallback { void onSuccess(String response); void onError(String error); }

    public void askAI(String userMessage, AIResponseCallback callback) {
        new Thread(() -> {
            HttpURLConnection c=null;
            try {
                c=(HttpURLConnection)new URL(server()+"/chat").openConnection();
                c.setRequestMethod("POST"); c.setRequestProperty("Content-Type","application/json; charset=UTF-8");
                c.setConnectTimeout(15000); c.setReadTimeout(60000); c.setDoOutput(true);
                JSONObject b=new JSONObject(); b.put("message",userMessage); synchronized(history){b.put("history",new org.json.JSONArray(history.toString()));}
                try(OutputStream o=c.getOutputStream()){o.write(b.toString().getBytes(StandardCharsets.UTF_8));}
                int code=c.getResponseCode();
                InputStream s=code>=200&&code<300?c.getInputStream():c.getErrorStream();
                String result=read(s);
                if(code<200||code>=300) throw new Exception("HTTP "+code);
                JSONObject j=new JSONObject(result);
                String reply=j.optString("response",j.optString("reply","")).trim();
                if(reply.isEmpty()) throw new Exception("رد فارغ");
                synchronized(history){try{history.put(new JSONObject().put("role","user").put("content",userMessage)); history.put(new JSONObject().put("role","assistant").put("content",reply)); while(history.length()>12)history.remove(0);}catch(Exception ignored){}} new Handler(Looper.getMainLooper()).post(()->callback.onSuccess(reply));
            } catch(Exception e) {
                String m=e.getMessage();
                new Handler(Looper.getMainLooper()).post(()->callback.onError(m));
            } finally { if(c!=null)c.disconnect(); }
        }).start();
    }
    private static String read(InputStream s)throws Exception{
        if(s==null)return "";
        BufferedReader r=new BufferedReader(new InputStreamReader(s,StandardCharsets.UTF_8));
        StringBuilder b=new StringBuilder(); String l; while((l=r.readLine())!=null)b.append(l); return b.toString();
    }
}
