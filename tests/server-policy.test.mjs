import test from 'node:test';
import assert from 'node:assert/strict';
import {validToken,checkedModel,openRouterModels,maxOutputTokens,rawSearchReply,cleanConversationalReply,createLimiter,classifyFreelanceProject} from '../server/policy.js';
test('missing, short or wrong connection tokens are rejected',()=>{
 const key='test-token-that-is-long-enough';
 assert.equal(validToken('Bearer '+key,key),true);
 for(const [h,k] of [['',key],['Bearer wrong',key],['Bearer tiny','tiny'],['',undefined]])assert.equal(validToken(h,k),false);
});
test('paid AI cannot activate accidentally',()=>{
 assert.match(checkedModel({}),/:free$/);
 assert.throws(()=>checkedModel({OPENROUTER_MODEL:'paid/model'}));
 assert.throws(()=>checkedModel({OPENROUTER_MODEL:'paid/model',ALLOW_PAID_AI:'true'}));
 assert.equal(checkedModel({OPENROUTER_MODEL:'paid/model',ALLOW_PAID_AI:'true',RAM_API_TOKEN:'test-token-that-is-long-enough'}),'paid/model');
 assert.equal(maxOutputTokens('9999999'),2048);assert.equal(maxOutputTokens('invalid'),1024);
});
test('OpenRouter tries configured model then free fallbacks only',()=>{
 assert.deepEqual(openRouterModels({OPENROUTER_MODEL:'qwen/qwen3.8-27b:free'}),['qwen/qwen3.8-27b:free','openrouter/free']);
 assert.deepEqual(openRouterModels({OPENROUTER_MODEL:'qwen/qwen3.8-27b:free',OPENROUTER_FALLBACK_MODELS:'paid/model,google/gemma-4-26b-a4b-it:free'}),['qwen/qwen3.8-27b:free','google/gemma-4-26b-a4b-it:free']);
});
test('source results survive model failure without invented amounts',()=>{
 const result=rawSearchReply([{title:'Actual result',url:'https://example.com/job',snippet:'Budget not listed'}]);
 assert.match(result,/https:\/\/example.com\/job/);assert.match(result,/Budget not listed/);assert.doesNotMatch(result,/\$/);
});
test('internal safety labels are removed while normal conversational text is preserved',()=>{
 assert.equal(cleanConversationalReply('User Safety: safe\nResponse Safety: safe'),'');
 assert.equal(cleanConversationalReply('أفهم المطلوب.\nUser Safety: safe\nسأبدأ بالخطوة الأولى.'),'أفهم المطلوب.\nسأبدأ بالخطوة الأولى.');
});
test('freelance feed accepts remote marketplace projects but excludes regular vacancies',()=>{
 const project=classifyFreelanceProject({title:'Arabic translation project — fixed price',url:'https://www.upwork.com/freelance-jobs/apply/arabic-translation_~01'});
 assert.equal(project.eligible,true);assert.equal(project.workType,'REMOTE_FREELANCE_PROJECT');
 const noisyMarketplaceSnippet=classifyFreelanceProject({title:'Arabic translation project — fixed price',url:'https://www.freelancer.com/projects/translation/arabic-translation',snippet:'Browse full-time jobs too. Typical monthly salary information is shown in this category.'});
 assert.equal(noisyMarketplaceSnippet.eligible,true,'irrelevant category text in the snippet must not hide an actual marketplace project');
 const mostaqlProject=classifyFreelanceProject({title:'ترجمة ملفات من الإنجليزية إلى العربية',url:'https://mostaql.com/project/823022-translation',snippet:'مطلوب مترجم متخصص لترجمة ملفات'});
 assert.equal(mostaqlProject.eligible,true,'Mostaql individual projects use singular /project/ URLs');
 const prozProject=classifyFreelanceProject({title:'Arabic to English translation project',url:'https://www.proz.com/job/1234567',snippet:'Translation project'});
 assert.equal(prozProject.eligible,true,'individual ProZ job pages should pass as marketplace projects');
 const sellerOffer=classifyFreelanceProject({title:'Complete Office CAD Interior Design',url:'https://www.freelancer.com/projects/design/complete-office-cad-interior-design',snippet:'Hello, I can support your ongoing interior projects with accurate 2D drafting and CAD deliverables.'});
 assert.equal(sellerOffer.eligible,false,'a freelancer offer/profile is not a client project request');
 const sellerProfile=classifyFreelanceProject({title:'CAD Interior Design Services',url:'https://www.upwork.com/freelancers/~designer/profile'});
 assert.equal(sellerProfile.eligible,false,'freelancer profile pages are not open client projects');
 const remoteContract=classifyFreelanceProject({title:'Remote freelance CAD project',url:'https://example.com/projects/cad',snippet:'Client budget USD 400 fixed-price'});
 assert.equal(remoteContract.eligible,true);
 const vacancy=classifyFreelanceProject({title:'Remote full-time translation job',url:'https://example.com/jobs/translator',snippet:'Monthly salary USD 2,000'});
 assert.equal(vacancy.eligible,false);assert.equal(vacancy.rejectionReason,'إعلان توظيف أو وظيفة تقليدية');
 assert.equal(classifyFreelanceProject({title:'Remote designer position',url:'https://example.com/jobs/designer'}).eligible,false);
 const jobBoard=classifyFreelanceProject({title:'Web Developer Freelance Jobs: Work Remote & Earn Online',url:'https://example.com/remote-web-developer-jobs',snippet:'Browse 2868 open jobs and land a remote Web Developer job today. See compensation and apply.'});
 assert.equal(jobBoard.eligible,false,'job directory pages are not client-requested freelance project listings');
 assert.equal(jobBoard.rejectionReason,'صفحة تجميع وظائف وليست إعلان مشروع محدد');
});
test('request burst limit resets after its interval',()=>{
 const limiter=createLimiter(2,1000);assert.equal(limiter(1000),true);assert.equal(limiter(1001),true);assert.equal(limiter(1002),false);assert.equal(limiter(2000),true);
});
import {extractAdvertisedPay} from '../server/policy.js';
test('advertised project pay is read only when currency and pay context appear together',()=>{
 const quote=extractAdvertisedPay('Project budget: USD 1,250 for the translation; other text dated 2026.');
 assert.deepEqual({amountCents:quote.amountCents,currency:quote.currency,basis:quote.basis},{amountCents:125000,currency:'USD',basis:'FIXED'});
 const hourly=extractAdvertisedPay('Paid rate: $24 per hour for web design.');assert.equal(hourly.basis,'HOURLY');
 const fee=extractAdvertisedPay('Application fee: $20; budget later TBD.');assert.equal(fee.amountCents,null);
 const unclear=extractAdvertisedPay('The job listing closes on 2026-10-02.');assert.equal(unclear.amountCents,null);
});
