import {createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import path from 'node:path';

const AUTH_URL = 'https://www.proz.com/oauth/authorize';
const TOKEN_URL = 'https://www.proz.com/oauth/token';
const API_ROOT = 'https://api.proz.com/v2/';
const TOKEN_PATH = '/data/proz-oauth.enc';
const SUBMISSIONS_PATH = '/data/ram-proz-submissions.json';

export function prozConfigured(env = process.env) {
  return Boolean(env.PROZ_CLIENT_ID && env.PROZ_CLIENT_SECRET && env.PROZ_REDIRECT_URI &&
    env.PROZ_TOKEN_ENCRYPTION_KEY && env.RAM_DATA_DIR === '/data' && env.RAM_API_TOKEN);
}

export function makeProzOAuthState(secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  const nonce = randomBytes(18).toString('base64url');
  const payload = `${timestamp}.${nonce}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyProzOAuthState(state, secret, now = Date.now()) {
  const [timestamp, nonce, signature, ...extra] = String(state || '').split('.');
  if (!timestamp || !nonce || !signature || extra.length || !/^\d{10}$/.test(timestamp)) return false;
  const age = Math.floor(now / 1000) - Number(timestamp);
  if (age < 0 || age > 600) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${nonce}`).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createProzAuthorizationUrl(state, env = process.env) {
  if (!env.PROZ_CLIENT_ID || !env.PROZ_REDIRECT_URI) throw new Error('إعداد OAuth لمنصة ProZ غير مكتمل.');
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({client_id:env.PROZ_CLIENT_ID, redirect_uri:env.PROZ_REDIRECT_URI,
    response_type:'code', scope:'public job.quote', state}).toString();
  return url.toString();
}

function encryptionKey(env) {
  if (!env.PROZ_TOKEN_ENCRYPTION_KEY || env.PROZ_TOKEN_ENCRYPTION_KEY.length < 24) throw new Error('مفتاح تشفير رمز ProZ غير مهيأ.');
  return createHash('sha256').update(env.PROZ_TOKEN_ENCRYPTION_KEY).digest();
}

function encryptTokens(tokens, env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptTokens(value, env) {
  const [version, ivText, tagText, dataText, ...extra] = String(value || '').split('.');
  if (version !== 'v1' || !ivText || !tagText || !dataText || extra.length) throw new Error('ملف تفويض ProZ غير صالح.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8'));
}

async function saveTokens(tokens, env) {
  if (env.RAM_DATA_DIR !== '/data') throw new Error('اربط تخزين Railway الدائم على /data قبل حفظ تفويض ProZ.');
  await mkdir('/data', {recursive:true});
  await writeFile(TOKEN_PATH, encryptTokens(tokens, env), {mode:0o600});
}

async function loadTokens(env) {
  try { return decryptTokens(await readFile(TOKEN_PATH, 'utf8'), env); }
  catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('حساب ProZ غير مربوط بعد.'), {status:409});
    throw error;
  }
}

async function tokenRequest(body, env, fetchImpl) {
  const basic = Buffer.from(`${env.PROZ_CLIENT_ID}:${env.PROZ_CLIENT_SECRET}`).toString('base64');
  const response = await fetchImpl(TOKEN_URL, {method:'POST', signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Basic ${basic}`, 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json'},
    body:new URLSearchParams(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw Object.assign(new Error('تعذر إكمال تفويض ProZ أو تجديده.'), {status:response.status || 502});
  return data;
}

export async function exchangeProzCode(code, env = process.env, fetchImpl = globalThis.fetch) {
  if (!prozConfigured(env)) throw Object.assign(new Error('أكمل متغيرات OAuth وVolume RAM_DATA_DIR=/data في Railway.'), {status:503});
  const token = await tokenRequest({grant_type:'authorization_code', code:String(code), redirect_uri:env.PROZ_REDIRECT_URI}, env, fetchImpl);
  if (!token.refresh_token) throw Object.assign(new Error('لم يُرجع ProZ رمز تحديث؛ أعد التفويض مع الموافقة الكاملة.'), {status:502});
  if (!String(token.scope || '').split(/\s+/).includes('job.quote')) throw Object.assign(new Error('ProZ لم يمنح صلاحية job.quote، لذلك لم يُحفظ الربط.'), {status:403});
  await saveTokens({refresh_token:token.refresh_token, scope:token.scope, connected_at:new Date().toISOString()}, env);
  return {connected:true, scope:token.scope};
}

export async function getProzAccessToken(env = process.env, fetchImpl = globalThis.fetch) {
  if (!prozConfigured(env)) throw Object.assign(new Error('أكمل إعداد OAuth وRAM_DATA_DIR=/data في Railway.'), {status:503});
  const stored = await loadTokens(env);
  const fresh = await tokenRequest({grant_type:'refresh_token', refresh_token:stored.refresh_token}, env, fetchImpl);
  if (fresh.refresh_token) stored.refresh_token = fresh.refresh_token;
  stored.scope = fresh.scope || stored.scope;
  await saveTokens(stored, env);
  return fresh.access_token;
}

async function prozRequest(accessToken, endpoint, {method='GET', body, fetchImpl=globalThis.fetch} = {}) {
  const url = new URL(endpoint, API_ROOT);
  const response = await fetchImpl(url, {method, signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${accessToken}`, Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {})},
    ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(response.status === 401 ? 'انتهى تفويض ProZ؛ أعد ربط الحساب.' : response.status === 403 ? 'ProZ رفض العملية؛ تحقق من عضوية Business Enterprise وصلاحية الحساب أو أهلية هذه الوظيفة.' : `رفض ProZ الطلب (${response.status}).`), {status:response.status || 502, upstreamStatus:response.status});
  return data;
}

export async function testProzConnection(accessToken, fetchImpl = globalThis.fetch) {
  const data = await prozRequest(accessToken, 'user', {fetchImpl});
  return {ok:true, connected:true, platform:'ProZ.com', identity:data.user || data, checkedAt:new Date().toISOString()};
}

export async function searchProzJobs(accessToken, {query='', languagePairs='', page=1, perPage=50} = {}, fetchImpl = globalThis.fetch) {
  const url = new URL('job-postings', API_ROOT);
  url.searchParams.set('status', 'open');
  url.searchParams.set('i_can_quote', 'true');
  url.searchParams.set('per_page', String(Math.min(Math.max(Number(perPage) || 50, 1), 100)));
  url.searchParams.set('page', String(Math.min(Math.max(Number(page) || 1, 1), 1000)));
  if (query) url.searchParams.set('q', String(query).slice(0, 160));
  if (languagePairs) url.searchParams.set('language_pairs', String(languagePairs).slice(0, 100));
  const data = await prozRequest(accessToken, url.toString(), {fetchImpl});
  const jobs = Array.isArray(data.data) ? data.data : Array.isArray(data.job_postings) ? data.job_postings : [];
  return {jobs:jobs.map(job => ({id:job.id, title:job.summary || '', type:job.type || '', url:job.web_url || '', description:job.description || '', languagePairs:job.language_pairs || [], deadline:job.delivery_deadline || null, status:job.status || '', eligibility:'ProZ API filter i_can_quote=true; ProZ may include listings that become eligible later. Verify platform eligibility before quoting.'})), links:data._links || {}, count:jobs.length};
}

function validateQuote(jobId, quote) {
  if (!/^\d{1,12}$/.test(String(jobId || ''))) throw Object.assign(new Error('معرف وظيفة ProZ غير صالح.'), {status:400});
  if (!quote || typeof quote !== 'object') throw Object.assign(new Error('بيانات العرض غير مكتملة.'), {status:400});
  const title = String(quote.title || '').trim();
  const message = String(quote.message || '').trim();
  const languagePair = String(quote.language_pair || '').trim();
  const amount = Number(quote.rate?.amount);
  const currency = String(quote.rate?.currency || '').toUpperCase();
  const unit = String(quote.rate?.unit || '');
  const allowedUnits = new Set(['word','hour','page','line','char']);
  if (!title || title.length > 200 || !message || message.length > 8000 || !/^[A-Za-z.]{3}_[A-Za-z.]{3}$/.test(languagePair) || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !allowedUnits.has(unit)) {
    throw Object.assign(new Error('العرض يحتاج عنوانًا ورسالة وزوج لغات صحيحًا وسعرًا موجبًا بعملة ووحدة مدعومتين.'), {status:400});
  }
  return {title, message, language_pair:languagePair, rate:{amount,currency,unit},
    ...(quote.pricing_info ? {pricing_info:String(quote.pricing_info).slice(0,2000)} : {}),
    ...(quote.proposed_completion_time ? {proposed_completion_time:new Date(quote.proposed_completion_time).toISOString()} : {}),
    ...(quote.timing_info ? {timing_info:String(quote.timing_info).slice(0,2000)} : {}),
    ...(['show_full_name','show_email','show_phone','show_cv'].reduce((out,key)=>{if(typeof quote[key]==='boolean')out[key]=quote[key];return out;},{})),
    ...(quote.sample_translation ? {sample_translation:String(quote.sample_translation).slice(0,8000)} : {})};
}

export async function submitProzQuote(accessToken, jobId, quote, fetchImpl = globalThis.fetch) {
  const payload = validateQuote(jobId, quote);
  const posting = await prozRequest(accessToken, `job-posting/${jobId}`, {fetchImpl});
  const job = posting.job_posting || posting;
  if (String(job.status || '').toLowerCase() !== 'open') throw Object.assign(new Error('هذه الوظيفة لم تعد مفتوحة؛ رام لم يرسل العرض.'), {status:409});
  const existing = await prozRequest(accessToken, `job-quotes?quote_uuid=me&job_posting_ids=${encodeURIComponent(jobId)}`, {fetchImpl});
  const quotes = Array.isArray(existing.job_quotes) ? existing.job_quotes : Array.isArray(existing.data) ? existing.data : [];
  if (quotes.some(item => String(item.job_posting_id) === String(jobId))) throw Object.assign(new Error('يوجد عرض سابق على هذه الوظيفة؛ لم يرسل رام عرضًا مكررًا.'), {status:409});
  const response = await prozRequest(accessToken, `job-posting/${jobId}/quotes`, {method:'POST', body:payload, fetchImpl});
  const created = response.job_quote || response;
  return {submitted:true, platform:'ProZ.com', jobId:String(jobId), quoteId:created.id ?? null, submittedAt:created.submitted_at || new Date().toISOString(), url:job.web_url || null};
}

// Keep a minimal cloud audit record after the provider confirms submission.
// Proposal text, pricing details, and OAuth tokens are deliberately excluded.
export async function recordProzSubmission(result, env = process.env) {
  if (env.RAM_DATA_DIR !== '/data' || !result?.submitted || !/^\d{1,12}$/.test(String(result.jobId || ''))) throw new Error('لا يمكن تسجيل عرض ProZ في سجل التخزين الدائم.');
  await mkdir('/data', {recursive:true});
  let rows=[];
  try { const raw=await readFile(SUBMISSIONS_PATH,'utf8'); const saved=JSON.parse(raw); if(Array.isArray(saved))rows=saved; }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  const entry={platform:'ProZ.com',jobId:String(result.jobId),quoteId:String(result.quoteId||''),submittedAt:String(result.submittedAt||new Date().toISOString()),url:String(result.url||'').slice(0,2048)};
  const existing=rows.find(row=>String(row.jobId)===entry.jobId);
  if(existing)return existing;
  rows.push(entry);
  const temp=`${SUBMISSIONS_PATH}.${process.pid}.tmp`;
  await writeFile(temp,JSON.stringify(rows.slice(-500)),{encoding:'utf8',mode:0o600});
  await rename(temp,SUBMISSIONS_PATH);
  return entry;
}

export async function listProzSubmissions(env = process.env) {
  if(env.RAM_DATA_DIR!=='/data')throw Object.assign(new Error('التخزين الدائم غير متاح.'),{status:503});
  try { const rows=JSON.parse(await readFile(SUBMISSIONS_PATH,'utf8')); return Array.isArray(rows)?rows.slice(-500):[]; }
  catch(error) { if(error.code==='ENOENT')return []; throw error; }
}
