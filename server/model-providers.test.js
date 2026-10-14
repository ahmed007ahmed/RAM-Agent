import test from 'node:test';
import assert from 'node:assert/strict';
import {modelProvidersStatus,selectedModelProvider,modelProviderChat,testModelProvider} from './model-providers.js';

test('lists optional provider keys without exposing their values',()=>{
  const status=modelProvidersStatus({ANTHROPIC_API_KEY:'secret'});
  assert.equal(status.find(x=>x.id==='anthropic').configured,true);
  assert.equal(JSON.stringify(status).includes('secret'),false);
  assert.equal(selectedModelProvider({RAM_AI_PROVIDER:'anthropic',ANTHROPIC_API_KEY:'secret'}),'anthropic');
});
test('keeps Cloudflare as default and rejects selected provider without a key',()=>{
  assert.equal(selectedModelProvider({}),'cloudflare');
  assert.equal(selectedModelProvider({RAM_AI_PROVIDER:'removed-provider'}),'cloudflare');
});
test('sends Claude API auth server-side and parses reply',async()=>{
  let request;
  const fetchImpl=async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>({content:[{type:'text',text:'تم الاختبار'}],model:'claude-test'})};};
  const result=await modelProviderChat('anthropic',[{role:'system',content:'system'},{role:'user',content:'hello'}],{}, {ANTHROPIC_API_KEY:'secret'},fetchImpl);
  assert.equal(request.opts.headers['x-api-key'],'secret');
  assert.equal(JSON.parse(request.opts.body).system,'system');
  assert.equal(result.reply,'تم الاختبار');
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('supports Gemini response shape',async()=>{
  let geminiRequest;const gemini=await modelProviderChat('gemini',[{role:'user',content:'hi'}],{}, {GEMINI_API_KEY:'k'},async(url,opts)=>{geminiRequest={url,opts};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'gemini ok'}]}}]})};});
  assert.equal(gemini.reply,'gemini ok');
  assert.equal(geminiRequest.opts.headers['x-goog-api-key'],'k');assert.equal(geminiRequest.url.includes('key='),false);
});
test('test performs one provider request and reports success',async()=>{
  const result=await testModelProvider('perplexity',{PERPLEXITY_API_KEY:'k'},async()=>({ok:true,json:async()=>({choices:[{message:{content:'متصل'}}]})}));
  assert.equal(result.ok,true);assert.equal(result.provider,'Perplexity API');
});
