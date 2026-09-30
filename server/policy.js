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

// Keep ordinary vacancies out of RAM's paid, remote freelance project feed.
// We only accept clear project/freelance wording or a known freelance
// marketplace URL, and reject employee-style positions even if they say remote.
const freelanceMarketplaces = /(?:^|\.)(?:upwork\.com|fiverr\.com|freelancer\.com|guru\.com|peopleperhour\.com|toptal\.com|ureed\.com|mostaql\.com|khamsat\.com|truelancer\.com)$/i;
const freelanceSignals = /\b(?:freelanc(?:e|er|ing)|fixed[ -]price|project[ -]based|client project|project budget|submit (?:a )?proposal|gig|independent contractor|paid project|commission[- ]based)\b|مشروع مستقل|عمل حر|عمل مستقل|ميزانية المشروع|سعر ثابت|عمولة معلنة/i;
const remoteSignals = /\b(?:remote|work from home|work from anywhere|online project|fully remote|remote contract)\b|عن بعد|من المنزل|عمل إلكتروني|عبر الإنترنت/i;
const employmentSignals = /\b(?:full[ -]?time|part[ -]?time|permanent employee|employee position|job vacancy|job opening|employment opportunity|career opportunity|monthly salary|onsite|on[ -]site|hybrid role|visa sponsorship|staff position)\b|وظيفة شاغرة|دوام كامل|دوام جزئي|راتب شهري|توظيف موظف|مقر الشركة/i;
const sellerOfferSignals = /\b(?:hello[,! ]+)?(?:i can|we can) (?:help|support|design|create|provide|deliver|draw|draft|translate|build)|\b(?:hire me|my services|our services|my portfolio|services include|i offer|we offer|i am a freelancer|professional freelancer|available for freelance work)\b|أستطيع مساعدتك|أقدم خدمات|خدماتنا|خدماتي|مصمم مستقل|مستقل محترف/i;
function isMarketplaceProjectUrl(url,host) {
 let path='';try{path=new URL(url).pathname.toLowerCase();}catch{return false;}
 if(/\/(?:u|user|users|profile|profiles|freelancer|freelancers|seller|sellers|service|services|gig|gigs|portfolio|hourlie)(?:\/|$)/i.test(path))return false;
 if(host==='upwork.com')return /\/freelance-jobs\/apply\/[^/]+|\/jobs\/~[^/]+/i.test(path);
 if(host==='freelancer.com')return /\/projects\/[^/]+\/[^/]+/i.test(path);
 if(host==='guru.com')return /\/d\/jobs\/[^/]+/i.test(path);
 if(host==='peopleperhour.com')return /\/freelance-jobs\/[^/]+/i.test(path);
 if(host==='proz.com')return /\/job\/\d+/i.test(path);
 if(host==='mostaql.com')return /\/project\/[^/]+/i.test(path);
 if(host==='khamsat.com')return /\/community\/requests\/[^/]+/i.test(path);
 if(host==='truelancer.com')return /\/freelance-projects\/[^/]+/i.test(path);
 return false;
}
export function classifyFreelanceProject({title='',url='',snippet=''}={}) {
 const text=`${title}\n${url}\n${snippet}`;
 let host='';try{host=new URL(url).hostname.replace(/^www\./i,'');}catch{}
 const marketplace=freelanceMarketplaces.test(host);
 // Search snippets often describe an entire category (including salaried or
 // full-time roles), even when the linked page is a genuine marketplace
 // project. Only reject on explicit employment wording in the result title or
 // URL; snippet text is noisy and should not erase a real project listing.
 const employment=employmentSignals.test(`${title}\n${url}`);
 const marketplaceProject=marketplace&&isMarketplaceProjectUrl(url,host);
 const sellerOffer=sellerOfferSignals.test(text);
 const project=freelanceSignals.test(text)||marketplaceProject;
 const remote=remoteSignals.test(text)||marketplaceProject;
 const eligible=!employment&&!sellerOffer&&project&&remote;
 return {eligible,workType:eligible?'REMOTE_FREELANCE_PROJECT':null,remoteEvidence:marketplaceProject?'صفحة مشروع في منصة عمل حر':remoteSignals.test(text)?'مذكور عن بُعد في الإعلان':null,rejectionReason:eligible?null:employment?'إعلان توظيف أو وظيفة تقليدية':sellerOffer?'عرض خدمة من مستقل وليس طلب مشروع من عميل':marketplace&&!marketplaceProject?'ليست صفحة مشروع منشور على منصة عمل حر':!project?'لم يظهر أنه مشروع مستقل أو عمل حر':!remote?'لم يتضح أن العمل عن بُعد':null};
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
