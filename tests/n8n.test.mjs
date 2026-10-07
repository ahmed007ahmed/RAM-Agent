import test from 'node:test';
import assert from 'node:assert/strict';
import {n8nConfigured,notifyN8nOpportunity} from '../server/n8n.js';

const env={N8N_WEBHOOK_URL:'https://n8n.example.test/webhook/ram',N8N_WEBHOOK_SECRET:'a-test-secret-that-is-long-enough'};

test('n8n status requires HTTPS webhook and a sufficiently long secret',()=>{
  assert.equal(n8nConfigured(env),true);
  assert.equal(n8nConfigured({...env,N8N_WEBHOOK_SECRET:'short'}),false);
  assert.equal(n8nConfigured({N8N_WEBHOOK_URL:env.N8N_WEBHOOK_URL}),false);
});

test('selected work dispatches one guarded opportunity event to n8n',async()=>{
  let request;
  const result=await notifyN8nOpportunity({id:'job-1',title:'Translation',source:'https://example.test/project',category:'TRANSLATION',details:'Translate a short document',amount:10000,currency:'USD',basis:'FIXED'},env,async(url,options)=>{
    request={url:String(url),options};
    return {ok:true,status:200};
  });
  const payload=JSON.parse(request.options.body);
  assert.equal(result.triggered,true);
  assert.equal(request.options.headers['X-RAM-Event'],'ram.opportunity.selected');
  assert.equal(payload.idempotencyKey,'job-1');
  assert.equal(payload.guardrails.noPayment,true);
  assert.equal(payload.guardrails.noContractSignature,true);
  assert.equal(payload.job.title,'Translation');
});

test('n8n refuses non-HTTPS webhook URLs',async()=>{
  await assert.rejects(()=>notifyN8nOpportunity({id:'job-1'}, {...env,N8N_WEBHOOK_URL:'http://n8n.example.test/webhook/ram'}, async()=>{throw Error('must not call')}),/HTTPS/);
});
