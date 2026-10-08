import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudflareAiConfigured,cloudflareChat} from '../server/cloudflare-ai.js';

const env={CLOUDFLARE_ACCOUNT_ID:'account-test',CLOUDFLARE_API_TOKEN:'token-test',CLOUDFLARE_AI_MODEL:'@cf/meta/llama-3.1-8b-instruct'};

test('Cloudflare AI is configured only when account id and token exist',()=>{
  assert.equal(cloudflareAiConfigured(env),true);
  assert.equal(cloudflareAiConfigured({CLOUDFLARE_ACCOUNT_ID:'account-test'}),false);
  assert.equal(cloudflareAiConfigured({CLOUDFLARE_API_TOKEN:'token-test'}),false);
});

test('Cloudflare chat uses the configured model and returns the generated answer',async()=>{
  let request;
  const result=await cloudflareChat([{role:'user',content:'مرحبا'}],{temperature:0.2},env,async(url,options)=>{
    request={url,options};
    return {ok:true,status:200,json:async()=>({model:env.CLOUDFLARE_AI_MODEL,choices:[{message:{content:'أهلًا، كيف أساعدك؟'}}]})};
  });
  assert.match(request.url,/accounts\/account-test\/ai\/v1\/chat\/completions$/);
  assert.equal(request.options.headers.Authorization,'Bearer token-test');
  assert.equal(JSON.parse(request.options.body).model,env.CLOUDFLARE_AI_MODEL);
  assert.equal(result.reply,'أهلًا، كيف أساعدك؟');
  assert.equal(result.provider,'Cloudflare AI');
});

test('Cloudflare Workers AI REST response result.response becomes the chat reply',async()=>{
  const result=await cloudflareChat([{role:'user',content:'مرحبا'}],{},env,async()=>({ok:true,status:200,json:async()=>({success:true,result:{response:'أهلًا بك، كيف أساعدك؟'}})}));
  assert.equal(result.reply,'أهلًا بك، كيف أساعدك؟');
});

test('Cloudflare content blocks and HTTP 200 API errors are handled',async()=>{
  const result=await cloudflareChat([{role:'user',content:'مرحبا'}],{},env,async()=>({ok:true,status:200,json:async()=>({choices:[{message:{content:[{type:'text',text:'مرحبًا'},{type:'text',text:'بك'}]}}]})}));
  assert.equal(result.reply,'مرحبًا\nبك');
  await assert.rejects(()=>cloudflareChat([{role:'user',content:'مرحبا'}],{},env,async()=>({ok:true,status:200,json:async()=>({success:false,errors:[{message:'model unavailable'}]})})),/Cloudflare AI: model unavailable/);
});

test('Cloudflare provider errors keep the real HTTP status for diagnosis',async()=>{
  await assert.rejects(()=>cloudflareChat([{role:'user',content:'مرحبا'}],{},env,async()=>({ok:false,status:401,json:async()=>({errors:[{message:'Invalid API token'}]})})),error=>error.status===401&&/Invalid API token/.test(error.message));
});
