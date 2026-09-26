package com.ram.agent;

import android.app.*;
import android.os.*;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private final int BG=Color.rgb(7,11,18), PANEL=Color.rgb(17,24,34), GREEN=Color.rgb(38,210,123), MUTED=Color.rgb(145,157,174);
    private LinearLayout chat;
    private ScrollView scroll;
    private EditText input;
    private TextView state;
    private final AIService ai=new AIService();
    private boolean waiting=false;
    private MediaPlayer player;

    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable box(int color,int radius){
        GradientDrawable g=new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius)); return g;
    }
    private GradientDrawable outline(int color,int radius){
        GradientDrawable g=box(color,radius); g.setStroke(dp(1),Color.rgb(43,55,70)); return g;
    }
    private TextView txt(String s,float size,int color){
        TextView v=new TextView(this); v.setText(s); v.setTextSize(size); v.setTextColor(color); return v;
    }

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        build();
        ram("أنا معك. تحدث معي بشكل طبيعي: أخبرني بالهدف أو العمل الذي تريد إنجازه، وسأحافظ على سياق المهمة داخل هذه المحادثة.");
    }

    private void build(){
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setPadding(dp(16),dp(12),dp(16),dp(12));
        setContentView(root);

        LinearLayout header=new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView logo=txt("R",22,Color.WHITE); logo.setTypeface(null,Typeface.BOLD); logo.setGravity(Gravity.CENTER); logo.setBackground(box(GREEN,15));
        header.addView(logo,new LinearLayout.LayoutParams(dp(44),dp(44)));

        LinearLayout identity=new LinearLayout(this); identity.setOrientation(LinearLayout.VERTICAL); identity.setPadding(dp(11),0,0,0);
        TextView name=txt("RAM",23,Color.WHITE); name.setTypeface(null,Typeface.BOLD); identity.addView(name);
        state=txt("● متصل • شريكك الذكي",12,GREEN); identity.addView(state);
        header.addView(identity,new LinearLayout.LayoutParams(0,-2,1));

        TextView menu=txt("⋮",28,Color.LTGRAY); menu.setGravity(Gravity.CENTER); menu.setOnClickListener(v->menu());
        header.addView(menu,new LinearLayout.LayoutParams(dp(44),dp(44)));
        root.addView(header);

        LinearLayout presence=new LinearLayout(this); presence.setOrientation(LinearLayout.VERTICAL);
        presence.setPadding(dp(14),dp(11),dp(14),dp(11)); presence.setBackground(outline(PANEL,17));
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(-1,-2); pp.setMargins(0,dp(13),0,dp(9)); root.addView(presence,pp);
        TextView p1=txt("RAM حاضر",14,Color.WHITE); p1.setTypeface(null,Typeface.BOLD); presence.addView(p1);
        TextView p2=txt("يفهم • يبحث • يجهز • يتابع • يتذكر سياق المهمة",12,MUTED); p2.setPadding(0,dp(3),0,0); presence.addView(p2);

        HorizontalScrollView hs=new HorizontalScrollView(this); hs.setHorizontalScrollBarEnabled(false);
        LinearLayout tools=new LinearLayout(this); tools.setOrientation(LinearLayout.HORIZONTAL);
        chip(tools,"بحث","ابحث عن هذا بشكل حقيقي وحديث. اعرض المصادر والروابط والتواريخ، ولا تخترع نتائج: ");
        chip(tools,"إنجاز","حوّل طلبي إلى مهمة عملية. حدد ما تستطيع تنفيذه فعلياً الآن وابدأ بالجزء القابل للتنفيذ: ");
        chip(tools,"متابعة","راجع سياق مهمتنا الحالية: ما تم، ما لم يتم، وما الخطوة العملية التالية.");
        chip(tools,"فرص","ابحث عن فرص عمل حقيقية حديثة في خدمات المواقع والتصميم والهندسة والترجمة والتجارة والشحن، مع مصادر يمكن التحقق منها.");
        chip(tools,"مستحقات","نظم متابعة مستحقات المهمة الحالية. لا تعتبر أي مبلغ مستلماً حتى أؤكد أنا الاستلام.");
        hs.addView(tools); root.addView(hs);

        TextView ct=txt("المحادثة",12,MUTED); ct.setPadding(0,dp(11),0,dp(5)); root.addView(ct);

        scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false);
        chat=new LinearLayout(this); chat.setOrientation(LinearLayout.VERTICAL); chat.setPadding(0,0,0,dp(8));
        scroll.addView(chat); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout composer=new LinearLayout(this); composer.setGravity(Gravity.BOTTOM);
        composer.setPadding(dp(5),dp(5),dp(5),dp(5)); composer.setBackground(outline(Color.rgb(22,31,43),21));

        input=new EditText(this); input.setHint("تحدث مع RAM…"); input.setHintTextColor(Color.rgb(121,133,149));
        input.setTextColor(Color.WHITE); input.setTextSize(16); input.setMinLines(1); input.setMaxLines(5);
        input.setBackgroundColor(Color.TRANSPARENT); input.setPadding(dp(12),dp(8),dp(8),dp(8));
        composer.addView(input,new LinearLayout.LayoutParams(0,-2,1));

        TextView send=txt("➤",24,Color.WHITE); send.setTypeface(null,Typeface.BOLD); send.setGravity(Gravity.CENTER);
        send.setBackground(box(GREEN,18)); send.setOnClickListener(v->send());
        composer.addView(send,new LinearLayout.LayoutParams(dp(50),dp(50)));
        root.addView(composer);
    }

    private void chip(LinearLayout parent,String title,String prompt){
        TextView v=txt(title,13,Color.WHITE); v.setGravity(Gravity.CENTER); v.setPadding(dp(15),0,dp(15),0);
        v.setBackground(outline(Color.rgb(22,31,43),18));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,dp(42)); p.setMargins(0,0,dp(8),0); parent.addView(v,p);
        v.setOnClickListener(x->{input.setText(prompt);input.setSelection(input.length());input.requestFocus();
            ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(input,InputMethodManager.SHOW_IMPLICIT);});
    }

    private void menu(){
        new AlertDialog.Builder(this).setTitle("RAM")
        .setItems(new String[]{"حالة الاتصال","قدرات RAM","قاعدة الأموال"},(d,w)->{
            if(w==0) ram("الخادم المرتبط بالتطبيق:\n"+AIService.SERVER+"\n\nيتم اختبار الاتصال الحقيقي عند إرسال الرسالة.");
            if(w==1) ram("هذه الواجهة لا تصنع نتائج وهمية. قدرات البحث والتنفيذ والمتابعة تعتمد على الأدوات الحقيقية التي سنربطها بخادم RAM.");
            if(w==2) ram("RAM لا يسحب ولا يحول ولا يدفع من أموالك. المستحق الوارد يبقى بانتظار تأكيدك حتى تؤكد استلامه.");
        }).setNegativeButton("إغلاق",null).show();
    }

    private void send(){
        String m=input.getText().toString().trim(); if(m.isEmpty()||waiting)return;
        input.setText(""); user(m); waiting=true; state.setText("● RAM يفكر…");
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(),0);
        ai.askAI(m,new AIService.AIResponseCallback(){
            public void onSuccess(String r){waiting=false;state.setText("● متصل • شريكك الذكي");ram(r);playVoice(r);}
            public void onError(String e){waiting=false;state.setText("● تعذر الاتصال");ram("تعذر الوصول إلى خادم RAM.\n"+e);}
        });
    }

    private void user(String s){bubble("أنت",s,Color.rgb(27,94,68),Gravity.RIGHT);}
    private void ram(String s){bubble("RAM",s,PANEL,Gravity.LEFT);}
    private void bubble(String who,String s,int color,int gravity){
        LinearLayout b=new LinearLayout(this); b.setOrientation(LinearLayout.VERTICAL); b.setPadding(dp(14),dp(10),dp(14),dp(12)); b.setBackground(box(color,17));
        TextView n=txt(who,11,who.equals("RAM")?GREEN:Color.rgb(187,235,210)); n.setTypeface(null,Typeface.BOLD); b.addView(n);
        TextView m=txt(s,16,Color.WHITE); m.setTextIsSelectable(true); m.setPadding(0,dp(4),0,0); b.addView(m);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2); p.gravity=gravity;p.setMargins(dp(3),dp(5),dp(3),dp(5));b.setMinimumWidth(dp(120));chat.addView(b,p);
        scroll.post(()->scroll.fullScroll(View.FOCUS_DOWN));
    }

    private void playVoice(String text){
        final String spoken=text.replace("**","").replace("#","").replace("`","");
        new Thread(()->{
            HttpURLConnection c=null; File f=null;
            try{
                c=(HttpURLConnection)new URL(AIService.SERVER+"/tts").openConnection();
                c.setRequestMethod("POST");c.setRequestProperty("Content-Type","application/json; charset=UTF-8");
                c.setDoOutput(true);c.setConnectTimeout(15000);c.setReadTimeout(60000);
                JSONObject j=new JSONObject();j.put("text",spoken.length()>1200?spoken.substring(0,1200):spoken);
                try(OutputStream o=c.getOutputStream()){o.write(j.toString().getBytes(StandardCharsets.UTF_8));}
                int h=c.getResponseCode();if(h<200||h>=300)throw new IOException("TTS HTTP "+h);
                f=File.createTempFile("ram_voice_",".mp3",getCacheDir());
                try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(f)){byte[]buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);}
                File audio=f;runOnUiThread(()->{try{if(player!=null)player.release();player=new MediaPlayer();player.setDataSource(audio.getAbsolutePath());
                    player.setOnCompletionListener(mp->{mp.release();player=null;audio.delete();});player.prepare();player.start();}catch(Exception e){audio.delete();}});
            }catch(Exception ignored){if(f!=null)f.delete();}finally{if(c!=null)c.disconnect();}
        }).start();
    }

    @Override protected void onDestroy(){if(player!=null){player.release();player=null;}super.onDestroy();}
}
