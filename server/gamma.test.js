import test from 'node:test';
import assert from 'node:assert/strict';
import {gammaConfigured,createGamma,gammaGenerationStatus,testGamma} from './gamma.js';

test('Gamma create uses its documented API key header and protects the key',async()=>{
 let request;const fetchImpl=async(url,opts)=>{request={url,opts};return {ok:true,json:async()=>({generationId:'abcd1234',status:'pending'})};};
 const result=await createGamma({inputText:'A test',format:'document',numCards:1}, {GAMMA_API_KEY:'secret'},fetchImpl);
 assert.equal(request.opts.headers['X-API-KEY'],'secret');assert.equal(request.url,'https://public-api.gamma.app/v1.0/generations');
 assert.equal(result.generationId,'abcd1234');assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('Gamma status accepts valid generation id and returns export links',async()=>{
 const result=await gammaGenerationStatus('abcd1234',{GAMMA_API_KEY:'key'},async()=>({ok:true,json:async()=>({status:'completed',gammaUrl:'https://gamma.app/docs/x',exportUrl:'https://gamma.app/export/x.pdf',credits:{deducted:2}})}));
 assert.equal(result.status,'completed');assert.equal(result.exportUrl,'https://gamma.app/export/x.pdf');
});
test('Gamma test creates only when explicitly invoked and missing key is clear',async()=>{
 assert.equal(gammaConfigured({}),false);await assert.rejects(()=>testGamma({}),/GAMMA_API_KEY/);
});
