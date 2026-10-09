import test from 'node:test';
import assert from 'node:assert/strict';
import {testSerperConnection} from './serper.js';
import {testFirecrawlConnection} from './firecrawl.js';
import {testExaConnection} from './exa.js';
import {testN8nConnection} from './n8n.js';
import {placeTwilioTestCall,testTwilioConnection,twilioConfigured,twilioTestCallConfigured} from './twilio.js';

test('Serper connection test calls the real endpoint with its configured key', async () => {
  let request;
  const result = await testSerperConnection({SERPER_API_KEY:'test-secret'}, async (url, options) => {
    request = {url:String(url), options};
    return new Response(JSON.stringify({organic:[{title:'example'}]}), {status:200,headers:{'Content-Type':'application/json'}});
  });
  assert.equal(request.url, 'https://google.serper.dev/search');
  assert.equal(request.options.headers['X-API-KEY'], 'test-secret');
  assert.equal(JSON.parse(request.options.body).num, 1);
  assert.equal(result.ok, true);
  assert.equal(result.resultCount, 1);
  assert.equal(result.provider, 'Serper');
});

test('Serper reports a missing key without making a request', async () => {
  let requested = false;
  const result = await testSerperConnection({}, async () => { requested = true; });
  assert.equal(requested, false);
  assert.equal(result.ok, false);
  assert.match(result.error, /SERPER_API_KEY/);
});

test('Serper rejects an invalid key clearly', async () => {
  await assert.rejects(
    testSerperConnection({SERPER_API_KEY:'bad-key'}, async () => new Response('{}', {status:401})),
    /رفض Serper المفتاح/
  );
});

test('Firecrawl connection test calls its official search endpoint', async () => {
  let request;
  const result = await testFirecrawlConnection({FIRECRAWL_API_KEY:'test-firecrawl-key'}, async (url, options) => {
    request = {url:String(url), options};
    return new Response(JSON.stringify({success:true,data:{web:[{url:'https://example.com'}]}}), {status:200});
  });
  assert.equal(request.url, 'https://api.firecrawl.dev/v2/search');
  assert.equal(request.options.headers.Authorization, 'Bearer test-firecrawl-key');
  assert.equal(result.ok, true);
  assert.equal(result.resultCount, 1);
});

test('Exa connection test calls its official search endpoint', async () => {
  let request;
  const result = await testExaConnection({EXA_API_KEY:'test-exa-key'}, async (url, options) => {
    request = {url:String(url), options};
    return new Response(JSON.stringify({results:[{url:'https://example.com'}]}), {status:200});
  });
  assert.equal(request.url, 'https://api.exa.ai/search');
  assert.equal(request.options.headers['x-api-key'], 'test-exa-key');
  assert.equal(result.ok, true);
  assert.equal(result.resultCount, 1);
});

test('n8n connection test posts a marked, non-action test event', async () => {
  let request;
  const result = await testN8nConnection({
    N8N_WEBHOOK_URL:'https://example.n8n.cloud/webhook/ram',
    N8N_WEBHOOK_SECRET:'a-long-random-test-secret-value'
  }, async (url, options) => {
    request = {url:String(url), options};
    return new Response(null, {status:204});
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, 'https://example.n8n.cloud/webhook/ram');
  assert.equal(body.event, 'ram.connection.test');
  assert.equal(body.test, true);
  assert.equal(body.noExternalActions, true);
  assert.ok(body.testId);
  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
});

test('n8n connection test rejects a non-success HTTP response', async () => {
  await assert.rejects(
    testN8nConnection({
      N8N_WEBHOOK_URL:'https://example.n8n.cloud/webhook/ram',
      N8N_WEBHOOK_SECRET:'a-long-random-test-secret-value'
    }, async () => new Response(null, {status:401})),
    /رفض اختبار الربط/
  );
});

const twilioEnv={TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_AUTH_TOKEN:'test-twilio-auth-token-value',TWILIO_CALLER_ID:'+12025550100',TWILIO_TEST_TO:'+967771234567'};

test('Twilio connection test validates credentials without starting a call', async () => {
  let request;
  const result=await testTwilioConnection(twilioEnv,async(url,options)=>{
    request={url:String(url),options};
    return new Response(JSON.stringify({sid:twilioEnv.TWILIO_ACCOUNT_SID,status:'active'}),{status:200});
  });
  assert.equal(request.url,`https://api.twilio.com/2010-04-01/Accounts/${twilioEnv.TWILIO_ACCOUNT_SID}.json`);
  assert.equal(request.options.method,'GET');
  assert.match(request.options.headers.Authorization,/^Basic /);
  assert.equal(result.ok,true);
  assert.equal(result.accountStatus,'active');
  assert.equal(result.testNumberConfigured,true);
});

test('Twilio configuration requires a valid account SID and E.164 test numbers',()=>{
  assert.equal(twilioConfigured(twilioEnv),true);
  assert.equal(twilioTestCallConfigured(twilioEnv),true);
  assert.equal(twilioTestCallConfigured({...twilioEnv,TWILIO_TEST_TO:'0771234567'}),false);
});

test('Twilio supports an explicit anonymous caller ID mode',()=>{
  assert.equal(twilioTestCallConfigured({...twilioEnv,TWILIO_CALLER_ID:'anonymous'}),true);
  assert.equal(twilioTestCallConfigured({...twilioEnv,TWILIO_CALLER_ID:'private number'}),false);
});

test('Twilio test call is blocked unless confirmed and calls only the Railway test number',async()=>{
  let requested=false;
  await assert.rejects(placeTwilioTestCall(twilioEnv,{confirmed:false},async()=>{requested=true;}),/يلزم تأكيد/);
  assert.equal(requested,false);
  let request;
  const result=await placeTwilioTestCall(twilioEnv,{confirmed:true},async(url,options)=>{
    request={url:String(url),options};
    return new Response(JSON.stringify({sid:'CA'+'b'.repeat(32),status:'queued'}),{status:201});
  });
  const body=new URLSearchParams(request.options.body);
  assert.equal(request.options.method,'POST');
  assert.equal(body.get('To'),twilioEnv.TWILIO_TEST_TO);
  assert.equal(body.get('From'),twilioEnv.TWILIO_CALLER_ID);
  assert.equal(body.get('TimeLimit'),'30');
  assert.match(body.get('Twiml'),/مكالمة اختبار من رام/);
  assert.equal(result.ok,true);
  assert.equal(result.status,'queued');
});

test('Twilio private caller ID mode requests anonymous caller ID',async()=>{
  let request;
  const result=await placeTwilioTestCall({...twilioEnv,TWILIO_CALLER_ID:'anonymous'},{confirmed:true},async(url,options)=>{
    request={url:String(url),options};
    return new Response(JSON.stringify({sid:'CA'+'c'.repeat(32),status:'queued'}),{status:201});
  });
  assert.equal(new URLSearchParams(request.options.body).get('From'),'anonymous');
  assert.equal(result.callerIdMode,'private');
});
