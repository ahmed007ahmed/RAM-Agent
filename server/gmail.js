import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.metadata',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
];

export function gmailConfigured(env = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GMAIL_REDIRECT_URI && env.GMAIL_ALLOWED_EMAIL && env.GMAIL_TOKEN_ENCRYPTION_KEY && env.GMAIL_TOKEN_FILE);
}

function encryptionKey(value) {
  if (!/^[a-f\d]{64}$/i.test(value || '')) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters');
  return Buffer.from(value, 'hex');
}

export function makeOAuthState(secret, now = Date.now()) {
  if (!secret || secret.length < 24) throw new Error('OAuth signing secret is not configured');
  const payload = Buffer.from(JSON.stringify({iat: now, nonce: randomBytes(18).toString('base64url')})).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state, secret, now = Date.now()) {
  if (!state || typeof state !== 'string' || state.length > 1000 || !secret || secret.length < 24) return false;
  const [payload, signature, extra] = state.split('.');
  if (!payload || !signature || extra) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isSafeInteger(parsed.iat) && now >= parsed.iat && now - parsed.iat <= 10 * 60 * 1000 && typeof parsed.nonce === 'string' && parsed.nonce.length >= 16;
  } catch { return false; }
}

export function encryptRefreshToken(token, keyHex) {
  if (typeof token !== 'string' || !token || token.length > 8192) throw new Error('Invalid refresh token');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return JSON.stringify({v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64')});
}

export function decryptRefreshToken(encoded, keyHex) {
  const record = JSON.parse(encoded);
  if (record?.v !== 1) throw new Error('Unsupported encrypted token format');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyHex), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8');
}

export async function saveRefreshToken(file, token, key) {
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await mkdir(dirname(file), {recursive: true, mode: 0o700});
  try {
    await writeFile(tmp, encryptRefreshToken(token, key), {mode: 0o600, flag: 'wx'});
    await rename(tmp, file);
  } catch (error) {
    await import('node:fs/promises').then(fs => fs.rm(tmp, {force: true})).catch(() => {});
    throw error;
  }
}

export async function loadRefreshToken(file, key) {
  return decryptRefreshToken(await readFile(file, 'utf8'), key);
}

function encodeHeader(value, label) {
  const safe = String(value || '').trim();
  if (!safe || /[\r\n]/.test(safe)) throw new Error(`Invalid ${label}`);
  return safe;
}

export function makeRawEmail({to, subject, body, fromName = 'RAM · إنجاز القابضة'}) {
  const recipient = encodeHeader(to, 'recipient');
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient)) throw new Error('Invalid recipient email');
  const title = encodeHeader(subject, 'subject');
  if (title.length > 240 || String(body || '').trim().length < 1 || String(body).length > 30000) throw new Error('Invalid email content');
  const safeName = String(fromName).replace(/[\r\n]/g, '').slice(0, 100);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(title, 'utf8').toString('base64')}?=`;
  const mime = [
    `To: ${recipient}`,
    `Subject: ${encodedSubject}`,
    `From: =?UTF-8?B?${Buffer.from(safeName, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(body), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trim(),
    ''
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export function safeMessage(message) {
  const headers = message?.payload?.headers || [];
  const header = name => String(headers.find(h => String(h.name).toLowerCase() === name.toLowerCase())?.value || '').slice(0, 500);
  return {
    id: String(message?.id || ''),
    threadId: String(message?.threadId || ''),
    from: header('From'),
    to: header('To'),
    subject: header('Subject') || '(بدون عنوان)',
    date: header('Date'),
    snippet: String(message?.snippet || '').slice(0, 1000),
    unread: (message?.labelIds || []).includes('UNREAD')
  };
}
