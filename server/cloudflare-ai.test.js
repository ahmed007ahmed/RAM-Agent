import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudflareChat,DEFAULT_CLOUDFLARE_AI_MODEL} from './cloudflare-ai.js';

const env={CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_AI_MODEL:'@cf/zai-org/glm-4.7-flash'};
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

test('reads chat-completions reply from Cloudflare',async()=>{
 const result=await cloudflareChat([{role:'user',content:'hello'}],{},env,async()=>response({choices:[{message:{content:'hi'}}]}));
 assert.equal(result.reply,'hi');assert.equal(result.provider,'Cloudflare AI');
});

test('uses the supported GLM model when no override is configured',async()=>{
 let model='';
 const result=await cloudflareChat([{role:'user',content:'hello'}],{},{CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'token'},async(_url,options)=>{model=JSON.parse(options.body).model;return response({choices:[{message:{content:'hello'}}]});});
 assert.equal(model,DEFAULT_CLOUDFLARE_AI_MODEL);assert.equal(result.model,DEFAULT_CLOUDFLARE_AI_MODEL);
});

test('returns a clear configuration error without making a request',async()=>{
 let called=false;
 await assert.rejects(cloudflareChat([{role:'user',content:'hello'}],{},{},async()=>{called=true;}),/CLOUDFLARE_ACCOUNT_ID وCLOUDFLARE_API_TOKEN/);
 assert.equal(called,false);
});

test('reports upstream model permission and status errors without claiming a reply',async()=>{
 await assert.rejects(cloudflareChat([{role:'user',content:'hello'}],{},env,async()=>response({errors:[{message:'Workers AI permission missing'}]},403)),error=>{assert.match(error.message,/Workers AI permission missing/);assert.equal(error.status,403);return true;});
});

test('retries an empty chat envelope through Cloudflare native Workers AI',async()=>{
 const calls=[];
 const result=await cloudflareChat([{role:'user',content:'hello'}],{},env,async(url)=>{calls.push(String(url));return response(calls.length===1?{choices:[{message:{content:null}}]}:{success:true,result:{response:'مرحبا'}});});
 assert.equal(result.reply,'مرحبا');assert.equal(calls.length,2);assert.match(calls[1],/ai\/run/);
});
