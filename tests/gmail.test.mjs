import test from 'node:test';
import assert from 'node:assert/strict';
import {decryptRefreshToken, encryptRefreshToken, gmailConfigured, makeOAuthState, makeRawEmail, safeMessage, verifyOAuthState} from '../server/gmail.js';

const secret = 'connection-signing-secret-at-least-24';
const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('OAuth state is signed, expires, and detects changes', () => {
  const now = 1_800_000_000_000;
  const state = makeOAuthState(secret, now);
  assert.equal(verifyOAuthState(state, secret, now + 1000), true);
  assert.equal(verifyOAuthState(state, 'another-secret-at-least-24-chars', now + 1000), false);
  assert.equal(verifyOAuthState(`${state}x`, secret, now + 1000), false);
  assert.equal(verifyOAuthState(state, secret, now + 10 * 60 * 1000 + 1), false);
});

test('Gmail refresh token is encrypted and authenticated', () => {
  const encrypted = encryptRefreshToken('refresh-token-secret', key);
  assert.doesNotMatch(encrypted, /refresh-token-secret/);
  assert.equal(decryptRefreshToken(encrypted, key), 'refresh-token-secret');
  assert.throws(() => decryptRefreshToken(encrypted, 'ff'.repeat(32)));
  const changed = JSON.parse(encrypted); changed.data = Buffer.from('corrupt').toString('base64');
  assert.throws(() => decryptRefreshToken(JSON.stringify(changed), key));
});

test('mail composer blocks header injection and builds UTF-8 MIME', () => {
  const raw = makeRawEmail({to:'client@example.org', subject:'عرض إنجاز القابضة', body:'مرحبًا، مرفق العرض.'});
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /client@example\.org/);
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.throws(() => makeRawEmail({to:'victim@example.org\r\nBcc: copy@example.org', subject:'Hi', body:'Hello'}));
  assert.throws(() => makeRawEmail({to:'client@example.org', subject:'Hi\nBcc: copy@example.org', body:'Hello'}));
});

test('mail composer attaches a bounded UTF-8 text deliverable', () => {
  const encoded = Buffer.from('المخرج النهائي').toString('base64');
  const raw = makeRawEmail({to:'client@example.org', subject:'تسليم العمل', body:'راجِع المرفق', attachments:[{filename:'RAM-deliverable-job123.txt', mimeType:'text/plain', contentBase64:encoded}]});
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /filename="RAM-deliverable-job123\.txt"/);
  assert.match(mime, new RegExp(encoded));
  assert.throws(() => makeRawEmail({to:'client@example.org', subject:'Hi', body:'Hello', attachments:[{filename:'../evil.txt', mimeType:'text/plain', contentBase64:encoded}]}));
  assert.throws(() => makeRawEmail({to:'client@example.org', subject:'Hi', body:'Hello', attachments:[{filename:'report.pdf', mimeType:'application/pdf', contentBase64:encoded}]}));
  assert.throws(() => makeRawEmail({to:'client@example.org', subject:'Hi', body:'Hello', attachments:[{filename:'report.txt', mimeType:'text/plain', contentBase64:'%%%'}]}));
  assert.throws(() => makeRawEmail({to:'client@example.org', subject:'Hi', body:'Hello', attachments:[{filename:'report.txt', mimeType:'text/plain', contentBase64:Buffer.alloc(512 * 1024 + 1).toString('base64')}]}));
});

test('Gmail summaries include only safe, bounded message metadata', () => {
  const result = safeMessage({id:'abc',threadId:'t1',labelIds:['UNREAD'],snippet:'s'.repeat(1200),payload:{headers:[{name:'From',value:'Client <client@example.org>'},{name:'Subject',value:'Quote'}]}});
  assert.equal(result.id,'abc'); assert.equal(result.unread,true); assert.equal(result.subject,'Quote');
  assert.equal(result.snippet.length,1000); assert.equal(result.to,'');
});

test('Gmail requires all server-side OAuth and persistent storage settings', () => {
  assert.equal(gmailConfigured({}), false);
  assert.equal(gmailConfigured({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GMAIL_REDIRECT_URI:'https://example.org/callback',GMAIL_ALLOWED_EMAIL:'owner@example.org',GMAIL_TOKEN_ENCRYPTION_KEY:key,GMAIL_TOKEN_FILE:'/data/gmail-token.enc'}), true);
});
