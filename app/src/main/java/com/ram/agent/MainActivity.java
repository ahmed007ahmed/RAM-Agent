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
    private LinearLayout chat, services;
    private ScrollView scroll;
    private EditText input;
    private TextView status;
    private final AIService ai = new AIService();
    private boolean waiting = false;
    private MediaPlayer player;

    private int dp(int n){ return Math.round(n*getResources().getDisplayMetrics().density); }
    private GradientDrawable bg(int color,int radius){
        GradientDrawable g=new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius)); return g;
    }
    private TextView text(String s,int size,int color){
        TextView v=new TextView(this); v.setText(s); v.setTextSize(size); v.setTextColor(color); return v;
    }

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        build();
        ram("مرحباً أحمد. أنا RAM. اختر خدمة أو اكتب ما تريد، وسأبدأ معك من هنا.");
    }

    private void build(){
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(8,12,18));
        root.setPadding(dp(16),dp(14),dp(16),dp(14));
        setContentView(root);

        LinearLayout head=new LinearLayout(this); head.setGravity(Gravity.CENTER_VERTICAL);
        TextView logo=text("R",22,Color.WHITE); logo.setGravity(Gravity.CENTER); logo.setTypeface(null,1);
        logo.setBackground(bg(Color.rgb(35,196,110),18));
        head.addView(logo,new LinearLayout.LayoutParams(dp(42),dp(42)));

        LinearLayout names=new LinearLayout(this); names.setOrientation(LinearLayout.VERTICAL); names.setPadding(dp(10),0,0,0);
        TextView title=text("RAM",24,Color.WHITE); title.setTypeface(null,1); names.addView(title);
        status=text("● متصل • وكيل الأعمال الذكي",12,Color.rgb(79,220,139)); names.addView(status);
        head.addView(names,new LinearLayout.LayoutParams(0,-2,1));

        TextView settings=text("⚙",24,Color.LTGRAY); settings.setGravity(Gravity.CENTER);
        settings.setOnClickListener(v->showSettings());
        head.addView(settings,new LinearLayout.LayoutParams(dp(48),dp(48)));
        root.addView(head);

        TextView section=text("الخدمات",13,Color.rgb(145,155,170)); section.setPadding(0,dp(12),0,dp(7)); root.addView(section);
        HorizontalScrollView hs=new HorizontalScrollView(this); hs.setHorizontalScrollBarEnabled(false);
        services=new LinearLayout(this); services.setOrientation(LinearLayout.HORIZONTAL);
        service("🔎  بحث وفرص","ابحث على الويب عن فرص عمل حقيقية وحديثة مناسبة لخدماتي، مع الروابط والمصادر.");
        service("💼  مهامي","اعرض لي خطة مهامي الحالية وحالاتها، وما الخطوة التالية لكل مهمة.");
        service("🚚  شحن ولوجستيات","ابحث عن فرص شحن ولوجستيات وعملاء يحتاجون شحناً بحرياً أو جوياً أو برياً.");
        service("🏗  هندسة و3D","ابحث عن أعمال هندسية وAutoCAD و3D وطاقة ذكية يمكنني تنفيذها.");
        service("🌐  مواقع وبرمجة","ابحث عن أعمال تصميم مواقع وبرمجة وواجهات مناسبة.");
        service("📝  ترجمة","ابحث عن أعمال ترجمة وكتابة ومراسلات يمكن تنفيذها عن بعد.");
        service("🏠  عقارات","ابحث عن فرص وساطة عقارية حقيقية وطلبات شراء أو إيجار.");
        service("🤝  تجارة","ابحث عن مشترين وموردين وفرص ربط تجاري بعمولة.");
        service("💰  المستحقات","نظم المستحقات: تم التسليم، بانتظار الدفع، المتأخر، وبانتظار تأكيدي للاستلام.");
        hs.addView(services); root.addView(hs);

        LinearLayout dash=new LinearLayout(this); dash.setPadding(0,dp(12),0,dp(10));
        dash.addView(card("الفرص","بحث حي"),new LinearLayout.LayoutParams(0,dp(64),1));
        dash.addView(card("المهام","متابعة"),new LinearLayout.LayoutParams(0,dp(64),1));
        dash.addView(card("المستحقات","تأكيدك"),new LinearLayout.LayoutParams(0,dp(64),1));
        root.addView(dash);

        scroll=new ScrollView(this); scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false);
        chat=new LinearLayout(this); chat.setOrientation(LinearLayout.VERTICAL); chat.setPadding(0,dp(4),0,dp(8));
        scroll.addView(chat); root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout composer=new LinearLayout(this); composer.setGravity(Gravity.CENTER_VERTICAL);
        composer.setPadding(dp(4),dp(5),dp(4),dp(5)); composer.setBackground(bg(Color.rgb(22,28,38),20));
        input=new EditText(this); input.setHint("اكتب إلى RAM…"); input.setTextColor(Color.WHITE);
        input.setHintTextColor(Color.rgb(125,135,150)); input.setTextSize(16); input.setSingleLine(false);
        input.setMaxLines(4); input.setBackgroundColor(Color.TRANSPARENT); input.setPadding(dp(12),dp(8),dp(8),dp(8));
        composer.addView(input,new LinearLayout.LayoutParams(0,-2,1));

        TextView send=text("➤",24,Color.WHITE); send.setGravity(Gravity.CENTER); send.setTypeface(null,1);
        send.setBackground(bg(Color.rgb(35,196,110),18)); send.setOnClickListener(v->send());
        composer.addView(send,new LinearLayout.LayoutParams(dp(48),dp(48)));
        root.addView(composer);

        input.setOnEditorActionListener((v,id,event)->{ if(event!=null && event.getKeyCode()==KeyEvent.KEYCODE_ENTER && !event.isShiftPressed()){send();return true;} return false; });
    }

    private View card(String a,String b){
        LinearLayout c=new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setGravity(Gravity.CENTER);
        c.setBackground(bg(Color.rgb(17,23,32),14));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(64),1); p.setMargins(dp(3),0,dp(3),0);
        TextView x=text(a,13,Color.WHITE); x.setTypeface(null,1); x.setGravity(Gravity.CENTER); c.addView(x);
        TextView y=text(b,11,Color.rgb(92,205,140)); y.setGravity(Gravity.CENTER); c.addView(y);
        return c;
    }

    private void service(String label,String prompt){
        TextView b=text(label,13,Color.WHITE); b.setGravity(Gravity.CENTER); b.setPadding(dp(13),0,dp(13),0);
        b.setBackground(bg(Color.rgb(25,32,43),18));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,dp(42)); p.setMargins(0,0,dp(8),0);
        services.addView(b,p);
        b.setOnClickListener(v->{ input.setText(prompt); input.setSelection(input.length()); input.requestFocus(); });
    }

    private void showSettings(){
        new AlertDialog.Builder(this)
            .setTitle("إعدادات RAM")
            .setItems(new String[]{"حالة الخادم","الخدمات والمهام","حول RAM"},(d,w)->{
                if(w==0) ram("الخادم: "+AIService.SERVER+"\nسأعرض خطأ واضحاً إذا تعذر الاتصال.");
                if(w==1) ram("الخدمات مفعلة من الواجهة. المرحلة التالية تربط كل خدمة بأدوات التنفيذ والمتابعة الحقيقية.");
                if(w==2) ram("RAM • وكيل أعمال ذكي على Android.");
            }).setNegativeButton("إغلاق",null).show();
    }

    private void send(){
        String m=input.getText().toString().trim();
        if(m.isEmpty()||waiting)return;
        input.setText(""); user(m); waiting=true; status.setText("● RAM يفكر…");
        ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(),0);
        ai.askAI(m,new AIService.AIResponseCallback(){
            public void onSuccess(String r){ waiting=false; status.setText("● متصل • وكيل الأعمال الذكي"); ram(r); playNeuralVoice(r); }
            public void onError(String e){ waiting=false; status.setText("● تعذر الاتصال"); ram("تعذر الاتصال بخادم RAM الآن:\n"+e); }
        });
    }

    private void user(String s){ bubble("أنت",s,Color.rgb(26,91,65),Gravity.RIGHT); }
    private void ram(String s){ bubble("RAM",s,Color.rgb(20,27,37),Gravity.LEFT); }
    private void bubble(String who,String s,int color,int gravity){
        LinearLayout box=new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(dp(14),dp(10),dp(14),dp(11)); box.setBackground(bg(color,16));
        TextView name=text(who,11,who.equals("RAM")?Color.rgb(79,220,139):Color.rgb(180,235,205)); name.setTypeface(null,1); box.addView(name);
        TextView msg=text(s,16,Color.WHITE); msg.setPadding(0,dp(3),0,0); msg.setTextIsSelectable(true); box.addView(msg);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2); p.gravity=gravity; p.setMargins(dp(3),dp(5),dp(3),dp(5)); box.setMinimumWidth(dp(110)); chat.addView(box,p);
        scroll.post(()->scroll.fullScroll(View.FOCUS_DOWN));
    }

    private void playNeuralVoice(String text){
        final String spoken=text.replace("**","").replace("#","").replace("`","");
        new Thread(()->{
            HttpURLConnection c=null; File f=null;
            try{
                c=(HttpURLConnection)new URL(AIService.SERVER+"/tts").openConnection();
                c.setRequestMethod("POST"); c.setRequestProperty("Content-Type","application/json; charset=UTF-8");
                c.setDoOutput(true); c.setConnectTimeout(15000); c.setReadTimeout(60000);
                JSONObject j=new JSONObject(); j.put("text",spoken.length()>1200?spoken.substring(0,1200):spoken);
                try(OutputStream o=c.getOutputStream()){o.write(j.toString().getBytes(StandardCharsets.UTF_8));}
                if(c.getResponseCode()<200||c.getResponseCode()>=300)throw new Exception("TTS HTTP "+c.getResponseCode());
                f=File.createTempFile("ram_voice_",".mp3",getCacheDir());
                try(InputStream in=c.getInputStream();FileOutputStream out=new FileOutputStream(f)){byte[]buf=new byte[8192];int n;while((n=in.read(buf))>0)out.write(buf,0,n);}
                File audio=f; runOnUiThread(()->{try{if(player!=null)player.release();player=new MediaPlayer();player.setDataSource(audio.getAbsolutePath());player.setOnCompletionListener(mp->{mp.release();player=null;audio.delete();});player.prepare();player.start();}catch(Exception e){audio.delete();}});
            }catch(Exception ignored){if(f!=null)f.delete();}finally{if(c!=null)c.disconnect();}
        }).start();
    }
    @Override protected void onDestroy(){if(player!=null)player.release();super.onDestroy();}
}
