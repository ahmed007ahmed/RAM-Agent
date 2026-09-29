(function(root){
'use strict';
const stages=['NEW','SELECTED','IN_PROGRESS','DELIVERED','PAYMENT_PENDING','PAYMENT_REPORTED','RECEIVED'];
const labels={NEW:'فرصة للمراجعة',SELECTED:'الاختيار اليومي',IN_PROGRESS:'جارٍ إنجاز العمل',DELIVERED:'تم التسليم',PAYMENT_PENDING:'متابعة المستحقات',PAYMENT_REPORTED:'إشعار تحويل ينتظر تأكيدك',RECEIVED:'مكتمل وتم تأكيد الاستلام'};
function cents(value){if(value===''||value===null||value===undefined)return null;let s=String(value).trim();if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('أدخل مبلغًا موجبًا بدقة منزلتين دون فواصل');let n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n<=0)throw Error('المبلغ غير صالح');return n;}
function url(value){try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch(e){return false;}}
function next(job,action,info={},now=Date.now()){
 const j=JSON.parse(JSON.stringify(job)); const expected=stages[stages.indexOf(j.stage)+1];
 if(action!==expected)throw Error('انتقال غير مسموح بين مراحل العمل');
 if(action==='SELECTED'&&!info.approved)throw Error('يلزم تأكيد اختيار الفرصة');
 if(action==='IN_PROGRESS'&&!String(info.agreement||'').trim())throw Error('دوّن الاتفاق مع العميل ونطاق العمل أولًا');
 if(action==='DELIVERED'&&!String(info.proof||'').trim())throw Error('أدخل رابط التسليم أو مرجع رسالة التسليم');
 if(action==='PAYMENT_PENDING') {if(!info.dueAt||!Number.isFinite(Number(info.dueAt)))throw Error('حدد تاريخ الاستحقاق حسب الاتفاق');j.dueAt=Number(info.dueAt);}
 if(action==='PAYMENT_REPORTED'&&!String(info.reference||'').trim())throw Error('دوّن مرجع إشعار التحويل دون اعتباره استلامًا');
 if(action==='RECEIVED'){
  if(info.confirmedByOwner!==true)throw Error('تأكيد صاحب الحساب مطلوب');
  if(!['BANK','WESTERN_UNION','MONEYGRAM','USDT'].includes(info.method))throw Error('اختر وسيلة الاستلام');
  if(!['USD','EUR','GBP','AED','SAR','YER','USDT'].includes(info.currency))throw Error('اختر عملة الاستلام');
  const received=cents(info.amount);if(received===null)throw Error('أدخل المبلغ المستلم فعليًا');
  j.receipt={amount:received,currency:info.currency,method:info.method,reference:String(info.reference||''),confirmedAt:now,confirmedByOwner:true};
 }
 j.stage=action;j.updatedAt=now;j.events=(j.events||[]).concat([{at:now,stage:action,note:String(info.note||info.proof||info.agreement||info.reference||''),actor:'OWNER'}]);
 if(action==='SELECTED')j.selectedAt=now;
 if(action==='DELIVERED')j.deliveryProof=info.proof;
 return j;
}
function overdue(j,now=Date.now()){return ['PAYMENT_PENDING','PAYMENT_REPORTED'].includes(j.stage)&&Number.isFinite(j.dueAt)&&now>=j.dueAt+86400000;}
function legalQueue(jobs,now=Date.now()){return jobs.filter(j=>j.stage!=='RECEIVED'&&(j.legalOpen||overdue(j,now)));}
function sorted(jobs,currency,basis){return jobs.filter(j=>(!currency||j.currency===currency)&&(!basis||j.basis===basis)).slice().sort((a,b)=>{if(a.currency!==b.currency)return a.currency.localeCompare(b.currency);if(a.basis!==b.basis)return a.basis.localeCompare(b.basis);return (b.amount??-1)-(a.amount??-1);});}
function totals(jobs,received){let sums={};for(const j of jobs){const r=received?j.receipt:j;if(received&&j.stage!=='RECEIVED')continue;if(!received&&!['PAYMENT_PENDING','PAYMENT_REPORTED'].includes(j.stage))continue;if(r?.amount===null||r?.amount===undefined)continue;const k=r.currency+(received?'':' / '+j.basis);sums[k]=(sums[k]||0)+r.amount;}return sums;}
root.RamCore={stages,labels,cents,next,overdue,legalQueue,sorted,totals,url};
if(typeof module!=='undefined')module.exports=root.RamCore;
})(globalThis);
