import test from 'node:test';
import assert from 'node:assert/strict';
import {getConnectorCatalog,getConnectorEnvironmentTemplate} from './connector-catalog.js';

test('free job search connectors need no secrets and are read-only',()=>{
  const items=getConnectorCatalog({}).freeOpportunitySources;
  assert.equal(items.length,4);
  assert.ok(items.every(x=>x.configured && !x.needsVariables && !x.applicationSubmission));
});

test('optional search keys are detected without claiming a successful API test',()=>{
  const catalog=getConnectorCatalog({SERPER_API_KEY:'test'});
  assert.equal(catalog.optionalSearch.find(x=>x.id==='serper').status,'key_present_test_required');
  assert.equal(catalog.optionalSearch.find(x=>x.id==='exa').configured,false);
});

test('shipping credentials never imply the carrier adapter is implemented',()=>{
  const catalog=getConnectorCatalog({FEDEX_API_KEY:'a',FEDEX_API_SECRET:'b',FEDEX_ACCOUNT_NUMBER:'c'});
  const fedex=catalog.shipping.find(x=>x.id==='fedex');
  assert.equal(fedex.credentialsPresent,true);
  assert.equal(fedex.status,'adapter_not_implemented');
  assert.equal(fedex.canBook,false);
  assert.ok(getConnectorEnvironmentTemplate().shipping_reserved_not_active.includes('FEDEX_API_KEY'));
});
