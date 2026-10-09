import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CloudOpportunityQueues,QUEUE_CATEGORIES} from './cloud-queues.js';

test('cloud opportunity queue persists and categorizes business leads',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ram-queues-'));
  try{
    let now=1000;
    const queues=new CloudOpportunityQueues(directory,{requireMount:false,now:()=>now++});
    await queues.init();
    const saved=await queues.recordSearch({mode:'LEAD',categories:['DESIGN','FREIGHT'],results:[
      {url:'https://example.com/request',title:'Looking for a website designer',snippet:'Remote redesign',category:'DESIGN'},
      {url:'https://carrier.example/quote',title:'Container freight quote',category:'FREIGHT'}
    ]});
    assert.equal(saved.count,2);
    assert.equal(queues.list({category:'DESIGN'}).items.length,1);
    assert.equal(queues.list({category:'FREIGHT'}).items[0].verification,'UNVERIFIED_SEARCH_RESULT');
    const reloaded=new CloudOpportunityQueues(directory,{requireMount:false});
    await reloaded.init();
    assert.equal(reloaded.list().items.length,2);
    assert.equal(Object.keys(QUEUE_CATEGORIES).length,4);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('cloud queue deduplicates a URL and keeps owner confirmation for status changes',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ram-queues-'));
  try{
    const queues=new CloudOpportunityQueues(directory,{requireMount:false});
    await queues.init();
    await queues.recordSearch({mode:'LEAD',categories:['DESIGN'],results:[{url:'https://example.com/a',title:'Client request',category:'DESIGN'}]});
    const duplicate=await queues.recordSearch({mode:'LEAD',categories:['DESIGN'],results:[{url:'https://example.com/a',title:'Updated client request',category:'DESIGN'}]});
    assert.equal(duplicate.count,0);
    const item=queues.list().items[0];
    await assert.rejects(queues.update({id:item.id,status:'VERIFIED'}),/يلزم تأكيد المستخدم/);
    const updated=await queues.update({id:item.id,status:'VERIFIED',note:'Verified original source',ownerConfirmed:true});
    assert.equal(updated.status,'VERIFIED');
    assert.equal(updated.notes.length,1);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('cloud queue refuses to claim persistent storage without its Railway mount',async()=>{
  const queues=new CloudOpportunityQueues('',{requireMount:true});
  await queues.init();
  assert.equal(queues.list().persistent,false);
  assert.equal((await queues.recordSearch({mode:'LEAD',results:[]})).saved,false);
});
