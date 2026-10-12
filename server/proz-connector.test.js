import test from 'node:test';
import assert from 'node:assert/strict';
import {createProzAuthorizationUrl, makeProzOAuthState, verifyProzOAuthState, searchProzJobs, submitProzQuote} from './proz-connector.js';

const sampleQuote = {title:'Arabic to English translation', message:'I can deliver the requested translation by the stated deadline.', language_pair:'ara_eng', rate:{amount:0.08,currency:'USD',unit:'word'}, show_full_name:true};

test('ProZ OAuth asks only for public read and quote scopes and validates short-lived state',()=>{
  const secret='test-secret';
  const now=1_800_000_000_000;
  const state=makeProzOAuthState(secret,now);
  assert.equal(verifyProzOAuthState(state,secret,now+1000),true);
  assert.equal(verifyProzOAuthState(state+'x',secret,now),false);
  assert.equal(verifyProzOAuthState(state,secret,now+601_000),false);
  const url=createProzAuthorizationUrl(state,{PROZ_CLIENT_ID:'client',PROZ_REDIRECT_URI:'https://ram.example/proz/callback'});
  const parsed=new URL(url);
  assert.equal(parsed.origin,'https://www.proz.com');
  assert.equal(parsed.searchParams.get('scope'),'public job.quote');
});

test('ProZ job search uses official quote eligibility filter and bounded paging',async()=>{
  let request;
  const result=await searchProzJobs('token',{query:'translation',languagePairs:'ara_eng',page:2,perPage:500},async(url,options)=>{
    request={url:String(url),options};
    return new Response(JSON.stringify({data:[{id:12,summary:'Arabic translation',type:'translation',status:'open',web_url:'https://www.proz.com/job/12'}],_links:{next:{href:'next'}}}),{status:200});
  });
  const parsed=new URL(request.url);
  assert.equal(parsed.pathname,'/v2/job-postings');
  assert.equal(parsed.searchParams.get('i_can_quote'),'true');
  assert.equal(parsed.searchParams.get('per_page'),'100');
  assert.equal(parsed.searchParams.get('language_pairs'),'ara_eng');
  assert.equal(request.options.headers.Authorization,'Bearer token');
  assert.equal(result.jobs[0].id,12);
  assert.equal(result.count,1);
});

test('ProZ quote requires valid price data, an open job, and blocks duplicate submission',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    const path=new URL(url).pathname;
    calls.push({path,options});
    if(path.endsWith('/job-posting/12'))return new Response(JSON.stringify({job_posting:{id:12,status:'open',web_url:'https://www.proz.com/job/12'}}),{status:200});
    if(path.endsWith('/job-quotes'))return new Response(JSON.stringify({job_quotes:[]}),{status:200});
    if(path.endsWith('/job-posting/12/quotes'))return new Response(JSON.stringify({job_quote:{id:991,submitted_at:'2026-10-10T01:00:00Z'}}),{status:201});
    throw new Error(`unexpected path ${path}`);
  };
  const result=await submitProzQuote('token','12',sampleQuote,fetchImpl);
  assert.equal(result.submitted,true);
  assert.equal(result.quoteId,991);
  const payload=JSON.parse(calls[2].options.body);
  assert.equal(payload.rate.amount,0.08);
  assert.equal(payload.show_full_name,true);
  await assert.rejects(()=>submitProzQuote('token','12',{...sampleQuote,rate:{amount:0,currency:'USD',unit:'word'}},fetchImpl),/سعرًا موجبًا/);

  await assert.rejects(()=>submitProzQuote('token','12',sampleQuote,async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/job-posting/12'))return new Response(JSON.stringify({job_posting:{id:12,status:'open'}}),{status:200});
    if(path.endsWith('/job-quotes'))return new Response(JSON.stringify({job_quotes:[{job_posting_id:12,id:991}]}),{status:200});
    throw new Error('duplicate quote should block POST');
  }),/عرض سابق/);
});

test('ProZ refuses a closed listing before quote submission',async()=>{
  await assert.rejects(()=>submitProzQuote('token','12',sampleQuote,async()=>new Response(JSON.stringify({job_posting:{id:12,status:'closed'}}),{status:200})),/لم يرسل العرض/);
});
