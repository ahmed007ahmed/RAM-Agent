import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudflareChat} from './cloudflare-ai.js';

const env = {
  CLOUDFLARE_ACCOUNT_ID:'test-account',
  CLOUDFLARE_API_TOKEN:'test-token',
  CLOUDFLARE_AI_MODEL:'@cf/zai-org/glm-4.7-flash'
};

function mockFetch(body, status=200) {
  let request;
  const fetchImpl=async(url,options)=>{request={url:String(url),options,body:JSON.parse(options.body)};return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});};
  return {fetchImpl,get request(){return request;}};
}

test('parses the OpenAI compatible chat completion shape and sends the configured model',async()=>{
  const mock=mockFetch({choices:[{message:{role:'assistant',content:'ابدأ بخطوة واضحة.'},finish_reason:'stop'}]});
  const result=await cloudflareChat([{role:'user',content:'ابدأ العمل'}],{},env,mock.fetchImpl);
  assert.equal(result.reply,'ابدأ بخطوة واضحة.');
  assert.equal(mock.request.body.model,env.CLOUDFLARE_AI_MODEL);
  assert.match(mock.request.url,/\/ai\/v1\/chat\/completions$/);
});

test('parses the native Workers AI result.response shape',async()=>{
  const mock=mockFetch({success:true,result:{response:'رد من Workers AI'}});
  const result=await cloudflareChat([{role:'user',content:'اختبار'}],{},env,mock.fetchImpl);
  assert.equal(result.reply,'رد من Workers AI');
});

test('parses multipart text content from a chat completion',async()=>{
  const mock=mockFetch({choices:[{message:{content:[{type:'text',text:'جزء أول'},{type:'text',text:'جزء ثان'}]}}]});
  const result=await cloudflareChat([{role:'user',content:'اختبار'}],{},env,mock.fetchImpl);
  assert.equal(result.reply,'جزء أول\nجزء ثان');
});

test('returns diagnostic metadata when the provider sends no text',async()=>{
  const mock=mockFetch({choices:[{message:{role:'assistant',content:''},finish_reason:'length'}]});
  await assert.rejects(cloudflareChat([{role:'user',content:'اختبار'}],{},env,mock.fetchImpl),error=>{
    assert.equal(error.status,502);
    assert.match(error.message,/finish_reason=length/);
    assert.match(error.message,/response_fields=choices/);
    assert.doesNotMatch(error.message,/test-token/);
    return true;
  });
});
