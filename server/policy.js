import { timingSafeEqual } from 'node:crypto';
export function validToken(header, token) {
 if (!token || token.length < 24) return false;
 const a=Buffer.from(String(header||'')),b=Buffer.from(`Bearer ${token}`);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function maxOutputTokens(value) {const n=Number(value);return Number.isFinite(n)&&n>=128?Math.min(Math.floor(n),2048):1024;}
export function checkedModel(env) {
 const model=env.OPENROUTER_MODEL||'google/gemma-4-26b-a4b-it:free';
 if(!model.endsWith(':free')&&(env.ALLOW_PAID_AI!=='true'||!env.RAM_API_TOKEN||env.RAM_API_TOKEN.length<24))throw Object.assign(new Error('Paid AI disabled; configure authentication and provider spending limits first'),{status:503});
 return model;
}
export function rawSearchReply(results) {
 if(!results.length)return 'لم يُرجع محرك البحث نتائج لهذا الطلب.';
 return 'هذه نتائج بحث فعلية؛ تعذر تلخيصها بالنموذج الآن. تحقّق من صلاحية الإعلان والميزانية في المصدر قبل اختيار العمل.\n\n'+results.map((r,i)=>`${i+1}. ${r.title}\n${r.snippet}\n${r.url}`).join('\n\n');
}
// Burst protection only; monthly billing limits belong at the provider.
export function createLimiter(limit=10,windowMs=60000){let start=0,count=0;return(now=Date.now())=>{if(now-start>=windowMs){start=now;count=0;}return ++count<=limit;};}

const currencyCodes=[['USDT',/USDT/i],['USD',/USD|US\$|\$/i],['EUR',/EUR|€/i],['GBP',/GBP|£/i],['AED',/AED/i],['SAR',/SAR/i],['YER',/YER/i]];
export function extractAdvertisedPay(text='') {
 const re=/(USD|US\$|\$|EUR|€|GBP|£|AED|SAR|YER|USDT)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(USD|US\$|EUR|€|GBP|£|AED|SAR|YER|USDT)/ig;
 for(const m of String(text).matchAll(re)) {
  const at=m.index, around=String(text).slice(Math.max(0,at-80),Math.min(String(text).length,at+120));
  if(/application fee|registration fee|upfront|deposit required|fee to apply|رسوم التقديم|رسوم التسجيل|مقدم|deposit/i.test(around))continue;
  if(!/budget|paid|pay|payment|project fee|compensation|salary|stipend|hourly|per hour|\/hour|مبلغ|مدفوع|الميزانية|الأجر|بالساعة|مكافأة/i.test(around))continue;
  const raw=(m[2]||m[3]||'').replace(/,/g,'');const amount=Number(raw),c=m[1]||m[4]||'';
  const currency=currencyCodes.find(([,pattern])=>pattern.test(c))?.[0];
  const cents=Math.round(amount*100);if(!Number.isSafeInteger(cents)||cents<=0||!currency)continue;
  return {amountCents:cents,currency,basis:/hourly|per hour|\/hour|بالساعة/i.test(around)?'HOURLY':'FIXED',amountEvidence:m[0]};
 }
 return {amountCents:null,currency:null,basis:null,amountEvidence:null};
}
