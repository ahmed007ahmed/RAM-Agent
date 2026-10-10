import test from 'node:test';
import assert from 'node:assert/strict';
import {workflowStartError} from './workflow-start-policy.js';

test('cloud persistence requires the owner start command and an active worker start',()=>{
  assert.equal(workflowStartError({stage:'IN_PROGRESS',ownerConfirmed:true,executionStarted:true,startedAt:1234}),'');
  assert.match(workflowStartError({stage:'SELECTED',ownerConfirmed:true,executionStarted:true,startedAt:1234}),/لا تُحفظ المهمة/);
  assert.match(workflowStartError({stage:'IN_PROGRESS',ownerConfirmed:true,executionStarted:false,startedAt:1234}),/لا تُحفظ المهمة/);
  assert.match(workflowStartError({stage:'IN_PROGRESS',ownerConfirmed:false,executionStarted:true,startedAt:1234}),/لا تُحفظ المهمة/);
  assert.match(workflowStartError({stage:'IN_PROGRESS',ownerConfirmed:true,executionStarted:true,startedAt:'bad'}),/لا تُحفظ المهمة/);
});
