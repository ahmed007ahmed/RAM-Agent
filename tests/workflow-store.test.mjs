import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WorkflowStore} from '../server/workflow-store.js';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ram-workflow-'));
  t.after(() => fs.rm(directory, {recursive:true, force:true}));
  const store = new WorkflowStore(directory);
  assert.equal(await store.init(), true);
  return {directory, store};
}

const opportunity = (extra = {}) => ({
  id:'task-1', title:'ترجمة صفحة منتج', source:'https://example.com/project/1',
  category:'TRANSLATION', details:'Translate this product page to Arabic.', ownerConfirmed:true,
  amount:2500, currency:'USD', ...extra
});

test('selected opportunity is durably queued and resumes after server restart', async t => {
  const {directory, store} = await fixture(t);
  await store.start(opportunity());
  assert.equal(store.get('task-1').runState.plan, 'QUEUED');
  const restarted = new WorkflowStore(directory);
  assert.equal(await restarted.init(), true);
  assert.equal(restarted.get('task-1').title, 'ترجمة صفحة منتج');
  assert.equal(restarted.get('task-1').runState.plan, 'QUEUED');
  await restarted.processNext(async (_job, kind) => ({content:`مسودة ${kind}`}));
  assert.equal(restarted.get('task-1').drafts.plan, 'مسودة plan');
  assert.equal(restarted.get('task-1').runState.sample, 'QUEUED');
  await restarted.processNext(async (_job, kind) => ({content:`مسودة ${kind}`}));
  assert.equal(restarted.get('task-1').drafts.sample, 'مسودة sample');
});

test('final deliverable waits for owner-confirmed agreement and stays a draft', async t => {
  const {store} = await fixture(t);
  await store.start(opportunity());
  await assert.rejects(store.update({id:'task-1', stage:'IN_PROGRESS', agreement:'scope'}));
  await store.update({id:'task-1', stage:'IN_PROGRESS', ownerConfirmed:true, agreement:'Translate 2 pages'});
  assert.equal(store.get('task-1').runState.deliverable, 'QUEUED');
  await store.processNext(async (_job, kind) => ({content:`${kind} content`}));
  await store.processNext(async (_job, kind) => ({content:`${kind} content`}));
  const job = store.get('task-1');
  assert.equal(job.drafts.deliverable, 'deliverable content');
  assert.equal(job.stage, 'IN_PROGRESS');
  await assert.rejects(store.update({id:'task-1', stage:'DELIVERED', ownerConfirmed:true, proof:''}));
});

test('unsafe source URLs and unconfirmed selection are rejected', async t => {
  const {store} = await fixture(t);
  await assert.rejects(store.start(opportunity({source:'javascript:alert(1)'})));
  await assert.rejects(store.start(opportunity({source:'https://user:pass@example.com/task'})));
  await assert.rejects(store.start(opportunity({ownerConfirmed:false})));
});

test('failed draft can only be requeued after owner confirmation', async t => {
  const {store} = await fixture(t);
  await store.start(opportunity());
  await store.processNext(async () => { throw new Error('provider unavailable'); });
  assert.equal(store.get('task-1').runState.plan, 'FAILED');
  await assert.rejects(store.retry({id:'task-1', ownerConfirmed:false}));
  await store.retry({id:'task-1', ownerConfirmed:true});
  assert.equal(store.get('task-1').runState.plan, 'QUEUED');
});
