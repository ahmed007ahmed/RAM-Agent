import test from 'node:test';
import assert from 'node:assert/strict';
import {getFreeOpportunitySources, resetFreeOpportunityCacheForTests, searchFreeOpportunityFeeds} from './free-opportunity-connectors.js';

test('free connectors query public APIs without credentials and only return contract types', async () => {
  resetFreeOpportunityCacheForTests();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url: String(url), options});
    if (String(url).startsWith('https://himalayas.app/')) return new Response(JSON.stringify({jobs:[
      {guid:'h1',title:'CAD Contractor',companyName:'A',employmentType:'Contractor',applicationLink:'https://himalayas.app/jobs/1',excerpt:'CAD plans'},
      {guid:'h2',title:'CAD Employee',employmentType:'Full Time',applicationLink:'https://himalayas.app/jobs/2'}
    ]}), {status:200});
    return new Response(JSON.stringify({success:true,jobs:[
      {id:7,jobTitle:'Freelance web designer',companyName:'B',jobType:['Freelance'],url:'https://jobicy.com/jobs/7',jobExcerpt:'Website design'},
      {id:8,jobTitle:'Staff designer',jobType:['Full-Time'],url:'https://jobicy.com/jobs/8'}
    ]}), {status:200});
  };
  const answer = await searchFreeOpportunityFeeds('مشروع تصميم site:upwork.com jobs', {fetchImpl});
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.headers.Accept === 'application/json'));
  assert.ok(calls.every(call => !('Authorization' in call.options.headers)));
  assert.deepEqual(answer.results.map(x => x.source), ['Himalayas', 'Jobicy']);
  assert.ok(answer.results.every(x => x.workType === 'REMOTE_CONTRACT_LISTING' && x.verifiedEmploymentType));
  assert.equal(answer.results[0].employmentType, 'Contractor');
  assert.match(new URL(calls[0].url).searchParams.get('q'), /design/i);
  assert.equal(getFreeOpportunitySources().length, 2);
});

test('provider failures are isolated and cache is reused', async () => {
  resetFreeOpportunityCacheForTests();
  let calls = 0;
  const fetchImpl = async url => {
    calls++;
    if (String(url).startsWith('https://himalayas.app/')) throw new Error('offline');
    return new Response(JSON.stringify({success:true,jobs:[{id:1,jobTitle:'Contract translator',jobType:['Contract'],url:'https://jobicy.com/jobs/1'}]}), {status:200});
  };
  const first = await searchFreeOpportunityFeeds('translator', {fetchImpl});
  const second = await searchFreeOpportunityFeeds('translator', {fetchImpl});
  assert.equal(first.errors.length, 1);
  assert.equal(first.results.length, 1);
  assert.equal(second.results.length, 1);
  assert.equal(calls, 3);
});

test('invalid URLs and non-contract listings are excluded', async () => {
  resetFreeOpportunityCacheForTests();
  const fetchImpl = async url => String(url).startsWith('https://himalayas.app/')
    ? new Response(JSON.stringify({jobs:[{title:'Contractor',employmentType:'Contractor',applicationLink:'javascript:alert(1)'}]}), {status:200})
    : new Response(JSON.stringify({jobs:[{id:2,jobTitle:'Full-time engineer',jobType:['Full-Time'],url:'https://jobicy.com/jobs/2'}]}), {status:200});
  const answer = await searchFreeOpportunityFeeds('engineer', {fetchImpl});
  assert.equal(answer.results.length, 0);
});
