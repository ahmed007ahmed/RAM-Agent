import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {automationStoragePath, automationStorageReady, publicAutomationStatus, readAutomationStore, writeAutomationStore} from './cloud-automation.js';

test('cloud automation state survives a new store read and exposes status counts', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ram-cloud-automation-'));
  const old=process.env.RAM_AUTOMATION_DATA_FILE;
  process.env.RAM_AUTOMATION_DATA_FILE=join(dir,'state.json');
  try {
    assert.equal(automationStorageReady(),true);
    const state=await readAutomationStore();
    state.enabled=true;
    state.config={seed:{title:'CAD design',category:'ENGINEERING',details:'CAD drawings',source:'https://example.com/project'},intervalMinutes:60};
    state.jobs.push({id:'one',title:'CAD plan',url:'https://example.com/one',category:'ENGINEERING',status:'PREPARED_REVIEW_REQUIRED'});
    await writeAutomationStore(state);
    const restored=await readAutomationStore();
    assert.equal(restored.enabled,true);
    assert.equal(restored.config.seed.title,'CAD design');
    assert.equal(publicAutomationStatus(restored).counts.PREPARED_REVIEW_REQUIRED,1);
  } finally {
    if(old===undefined)delete process.env.RAM_AUTOMATION_DATA_FILE;else process.env.RAM_AUTOMATION_DATA_FILE=old;
    await rm(dir,{recursive:true,force:true});
  }
});

test('automation is not reported durable without a Railway volume or explicit data path',()=>{
  assert.equal(automationStorageReady({}),false);
});

test('Railway RAM_DATA_DIR is recognized for the existing volume setting',()=>{
  assert.equal(automationStoragePath({RAM_DATA_DIR:'/data'}),'/data/ram-automation.json');
});
