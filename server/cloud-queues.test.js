import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CloudOpportunityQueues,QUEUE_CATEGORIES} from './cloud-queues.js';

test('search results are returned as ephemeral and never saved to cloud',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ram-queues-'));
  try{
    const queues=new CloudOpportunityQueues(directory,{requireMount:false});
    await queues.init();
    const saved=await queues.recordSearch({mode:'LEAD',categories:['DESIGN','FREIGHT'],results:[
      {url:'https://example.com/request',title:'Looking for a website designer',snippet:'Remote redesign',category:'DESIGN'},
      {url:'https://carrier.example/quote',title:'Container freight quote',category:'FREIGHT'}
    ]});
    assert.equal(saved.saved,false);
    assert.equal(saved.ephemeralResults,2);
    assert.equal(saved.reason,'UNSTARTED_OPPORTUNITIES_NOT_STORED');
    assert.equal(queues.list({category:'DESIGN'}).items.length,0);
    const reloaded=new CloudOpportunityQueues(directory,{requireMount:false});
    await reloaded.init();
    assert.equal(reloaded.list().items.length,0);
    assert.equal(Object.keys(QUEUE_CATEGORIES).length,4);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('upgrade removes previously persisted unstarted search leads',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ram-queues-'));
  try{
    const file=path.join(directory,'ram-opportunity-queues.json');
    await fs.writeFile(file,JSON.stringify({version:1,updatedAt:10,lastRun:{at:10},items:[{id:'old-lead',url:'https://example.com/a',title:'Unstarted lead'}]}));
    const queues=new CloudOpportunityQueues(directory,{requireMount:false});
    await queues.init();
    assert.equal(queues.list().items.length,0);
    const persisted=JSON.parse(await fs.readFile(file,'utf8'));
    assert.deepEqual(persisted.items,[]);
    assert.equal(persisted.lastRun,null);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('cloud queue refuses to claim persistent storage without its Railway mount',async()=>{
  const queues=new CloudOpportunityQueues('',{requireMount:true});
  await queues.init();
  assert.equal(queues.list().persistent,false);
  assert.equal((await queues.recordSearch({mode:'LEAD',results:[]})).saved,false);
});
