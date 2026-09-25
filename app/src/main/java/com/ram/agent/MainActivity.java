package com.ram.agent;

import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.*;
import android.media.MediaPlayer;
import android.speech.RecognizerIntent;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int VOICE_REQUEST=1001;
    private LinearLayout root,chat; private ScrollView scroll; private EditText input;
    private AIService ai=new AIService(); private boolean waiting=false; private MediaPlayer player;

    public void onCreate(Bundle b){super.onCreate(b); build(); ram("مرحباً أحمد. أنا RAM، جاهز للمحادثة والعمل.");}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private void build(){
        root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(12),dp(10),dp(12),dp(10)); root.setBackgroundColor(Color.rgb(13,15,20)); setContentView(root);
        TextView title=new TextView(this); title.setText("RAM"); title.setTextColor(Color.WHITE); title.setTextSize(30); title.setGravity(Gravity.CENTER); title.setTypeface(null,1); root.addView(title);
        TextView sub=new TextView(this); sub.setText("رام عشيش • المساعد الذكي"); sub.setTextColor(Color.rgb(92,220,135)); sub.setTextSize(15); sub.setGravity(Gravity.CENTER); sub.setPadding(0,0,0,dp(8)); root.addView(sub);
        HorizontalScrollView hs=new HorizontalScrollView(this); LinearLayout tools=new LinearLayout(this);
        tool(tools,"🔎 بحث","ابحث عن "); tool(tools,"💼 فرص","ابحث عن فرص عمل حقيقية مناسبة لخدماتي: "); tool(tools,"🚚 الشحن","ساعدني في فرص الشحن واللوجستيات: "); tool(tools,"💰 المستحقات","ساعدني في متابعة المستحقات: ");
        hs.addView(tools); root.addView(hs);
        scroll=new ScrollView(this); chat=new LinearLayout(this); chat.setOrientation(LinearLayout.VERTICAL); scroll.addView(chat); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout bar=new LinearLayout(this); input=new EditText(this); input.setHint("اكتب رسالتك إلى رام..."); input.setTextColor(Color.WHITE); input.setHintTextColor(Color.GRAY); input.setBackgroundColor(Color.rgb(34,37,45)); input.setPadding(dp(12),dp(8),dp(12),dp(8)); bar.addView(input,new LinearLayout.LayoutParams(0,-2,1));
        Button mic=new Button(this); mic.setText("🎙"); mic.setOnClickListener(v->voice()); bar.addView(mic,new LinearLayout.LayoutParams(dp(58),dp(54)));
        Button send=new Button(this); send.setText("➤"); send.setOnClickListener(v->send()); bar.addView(send,new LinearLayout.LayoutParams(dp(58),dp(54))); root.addView(bar);
    }
    private void tool(LinearLayout p,String t,String prompt){Button b=new Button(this);b.setText(t);b.setAllCaps(false);b.setOnClickListener(v->{input.setText(prompt);input.setSelection(input.length());});p.addView(b);}
    private void send(){String m=input.getText().toString().trim(); if(m.isEmpty()||waiting)return; input.setText(""); user(m); waiting=true; ai.askAI(m,new AIService.AIResponseCallback(){
        public void onSuccess(String r){waiting=false;ram(r);playNeuralVoice(r);}
        public void onError(String e){waiting=false;ram("تعذر الاتصال بخادم RAM الآن: "+e);}
    });}
    private void user(String s){bubble("أنت\n"+s,Color.rgb(36,82,64),Gravity.RIGHT);}
    private void ram(String s){bubble("RAM\n"+s,Color.rgb(36,40,50),Gravity.LEFT);}
    private void bubble(String s,int c,int g){TextView v=new TextView(this);v.setText(s);v.setTextColor(Color.WHITE);v.setTextSize(16);v.setPadding(dp(14),dp(11),dp(14),dp(11));v.setBackgroundColor(c);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);p.gravity=g;p.setMargins(dp(4),dp(5),dp(4),dp(5));chat.addView(v,p);scroll.post(()->scroll.fullScroll(View.FOCUS_DOWN));}
    private void voice(){try{Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"ar");startActivityForResult(i,VOICE_REQUEST);}catch(Exception e){Toast.makeText(this,"التعرف الصوتي غير متاح",Toast.LENGTH_SHORT).show();}}
    protected void onActivityResult(int r,int c,Intent d){super.onActivityResult(r,c,d);if(r==VOICE_REQUEST&&c==RESULT_OK&&d!=null){ArrayList<String>x=d.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);if(x!=null&&!x.isEmpty()){input.setText(x.get(0));input.setSelection(input.length());}}}
    private void playNeuralVoice(String text){
        final String spoken=text.replace("**","").replace("#","").replace("`","");
        new Thread(()->{
            HttpURLConnection c=null; File f=null;
            try{
                c=(HttpURLConnection)new URL(AIService.SERVER+"/tts").openConnection(); c.setRequestMethod("POST"); c.setRequestProperty("Content-Type","application/json; charset=UTF-8"); c.setDoOutput(true); c.setConnectTimeout(15000); c.setReadTimeout(60000);
                JSONObject j=new JSONObject(); j.put("text",spoken.length()>1200?spoken.substring(0,1200):spoken);
                try(OutputStream o=c.getOutputStream()){o.write(j.toString().getBytes(StandardCharsets.UTF_8));}
                if(c.getResponseCode()<200||c.getResponseCode()>=300)throw new Exception("TTS HTTP "+c.getResponseCode());
                f=File.createTempFile("ram_voice_",".mp3",getCacheDir()); try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(f)){byte[]buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);}
                File audio=f; runOnUiThread(()->{try{if(player!=null){player.release();}player=new MediaPlayer();player.setDataSource(audio.getAbsolutePath());player.setOnCompletionListener(mp->{mp.release();player=null;audio.delete();});player.prepare();player.start();}catch(Exception e){audio.delete();}});
            }catch(Exception ignored){if(f!=null)f.delete();}finally{if(c!=null)c.disconnect();}
        }).start();
    }
    protected void onDestroy(){if(player!=null)player.release();super.onDestroy();}
}
