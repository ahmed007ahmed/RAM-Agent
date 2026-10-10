import test from 'node:test';
import assert from 'node:assert/strict';
import {getPlatformConnector, getPlatformConnectorCatalog} from './platform-connectors.js';

test('catalog covers every freelance platform currently listed in RAM', () => {
  const ids = getPlatformConnectorCatalog().map(item => item.id);
  for (const id of ['upwork','freelancer','fiverr','peopleperhour','guru','contra','mostaql','khamsat','proz','workana','truelancer','toptal']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('registration is not treated as an API connection', () => {
  for (const connector of getPlatformConnectorCatalog()) {
    assert.notEqual(connector.status, 'connected');
    assert.equal(connector.canSubmitProposal, connector.id === 'proz');
  }
});

test('ProZ write access is explicitly gated by approved API access', () => {
  const proz = getPlatformConnector('proz');
  assert.equal(proz.status, 'requires_platform_access');
  assert.match(proz.gate, /Business Enterprise/);
  assert.match(proz.detail, /job\.quote/);
});

test('Upwork connector does not imply automation permission', () => {
  const upwork = getPlatformConnector('upwork');
  assert.equal(upwork.status, 'requires_platform_approval');
  assert.equal(upwork.canReadJobs, false);
  assert.equal(upwork.canSubmitProposal, false);
  assert.match(upwork.detail, /unapproved automation is prohibited/i);
});
