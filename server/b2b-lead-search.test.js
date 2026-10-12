import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLeadSearches,classifyLeadType} from './b2b-lead-search.js';

test('freight search separates public shipper demand from carrier partnership leads',()=>{
  const searches=buildLeadSearches('FREIGHT','air cargo Yemen to Jeddah');
  assert.deepEqual(searches.map(item=>item.leadSide),['SHIPPER','CARRIER']);
  assert.ok(searches.every(item=>item.query.includes('air cargo Yemen to Jeddah')));
  assert.match(searches[0].query,/RFQ|quote/i);
  assert.match(searches[1].query,/partner|commission/i);
});

test('sourcing search separates purchase requests from suppliers for the requested product',()=>{
  const searches=buildLeadSearches('SOURCING','solar water pumps 200 units');
  assert.deepEqual(searches.map(item=>item.leadSide),['BUYER','SUPPLIER']);
  assert.ok(searches.every(item=>item.query.includes('solar water pumps 200 units')));
  assert.match(searches[0].query,/buyer|purchase request|RFQ/i);
  assert.match(searches[1].query,/manufacturer|supplier/i);
});

test('specific extra search terms are bounded and unsupported categories are rejected',()=>{
  assert.equal(buildLeadSearches('SOURCING','x'.repeat(500))[0].query.length,300+'public buyer purchase request RFQ request for quotation importer seeking to buy product quantity sourcing procurement tender'.length+1);
  assert.deepEqual(buildLeadSearches('UNKNOWN','product'),[]);
  assert.equal(classifyLeadType('FREIGHT','SHIPPER'),'SHIPPER');
  assert.equal(classifyLeadType('SOURCING','BUYER'),'BUYER');
});
