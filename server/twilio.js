const ACCOUNT_SID_RE = /^AC[0-9a-fA-F]{32}$/;
const E164_RE = /^\+[1-9][0-9]{7,14}$/;
const PRIVATE_CALLER_ID = 'anonymous';

function validCallerId(value) {
  return E164_RE.test(String(value || '')) || String(value || '').toLowerCase() === PRIVATE_CALLER_ID;
}

export function twilioConfigured(env = process.env) {
  return Boolean(ACCOUNT_SID_RE.test(String(env.TWILIO_ACCOUNT_SID || '')) && String(env.TWILIO_AUTH_TOKEN || '').length >= 16);
}

export function twilioTestCallConfigured(env = process.env) {
  return twilioConfigured(env) && validCallerId(env.TWILIO_CALLER_ID) && E164_RE.test(String(env.TWILIO_TEST_TO || ''));
}

export function maskPhone(phone) {
  const value = String(phone || '');
  return E164_RE.test(value) ? `${value.slice(0, Math.max(3, value.length - 4))}••••` : null;
}

function authHeader(env) {
  return `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`;
}

async function parseResponse(response) {
  return response.json().catch(() => ({}));
}

function providerError(data, status) {
  const code = Number(data?.code) || status;
  const message = code === 20003 ? 'رفض Twilio بيانات الحساب؛ تحقق من Account SID وAuth Token.'
    : code === 21211 ? 'رقم الاختبار غير صالح؛ استخدم رقمًا دوليًا بصيغة +967….'
    : code === 21214 || code === 21219 ? 'قد يكون حساب Twilio التجريبي لم يوثّق رقم الاختبار أو رقم المتصل. وثّق الرقم في لوحة Twilio.'
    : code === 20008 ? 'حساب Twilio غير نشط أو لا يملك رصيدًا يسمح بالاتصال.'
    : 'رفض Twilio الطلب. راجع حالة الحساب وأذونات الاتصال الدولي في لوحة Twilio.';
  return Object.assign(new Error(message), {status: status === 401 || status === 403 ? 502 : 400, providerCode: code});
}

export async function testTwilioConnection(env = process.env, fetchImpl = fetch) {
  if (!twilioConfigured(env)) throw Object.assign(new Error('أضف TWILIO_ACCOUNT_SID وTWILIO_AUTH_TOKEN في Railway.'), {status: 503});
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}.json`;
  const response = await fetchImpl(url, {method:'GET', signal:AbortSignal.timeout(15000), headers:{Authorization:authHeader(env), Accept:'application/json'}});
  const data = await parseResponse(response);
  if (!response.ok || data?.sid !== env.TWILIO_ACCOUNT_SID) throw providerError(data, response.status);
  return {
    ok:true,
    provider:'Twilio',
    accountStatus:String(data.status || 'unknown'),
    callerIdConfigured:validCallerId(env.TWILIO_CALLER_ID),
    callerIdMode:String(env.TWILIO_CALLER_ID || '').toLowerCase() === PRIVATE_CALLER_ID ? 'private' : 'number',
    testNumberConfigured:E164_RE.test(String(env.TWILIO_TEST_TO || '')),
    testNumberMasked:maskPhone(env.TWILIO_TEST_TO)
  };
}

export async function placeTwilioTestCall(env = process.env, {confirmed = false} = {}, fetchImpl = fetch) {
  if (confirmed !== true) throw Object.assign(new Error('لم يبدأ الاتصال؛ يلزم تأكيد المكالمة من رام.'), {status:400});
  if (!twilioConfigured(env)) throw Object.assign(new Error('أضف TWILIO_ACCOUNT_SID وTWILIO_AUTH_TOKEN في Railway.'), {status:503});
  const callerId = String(env.TWILIO_CALLER_ID || '');
  const to = String(env.TWILIO_TEST_TO || '');
  if (!validCallerId(callerId)) throw Object.assign(new Error('اجعل TWILIO_CALLER_ID رقم Twilio موثقًا بصيغة دولية، أو اكتب anonymous لمحاولة إخفاء الرقم.'), {status:503});
  if (!E164_RE.test(to)) throw Object.assign(new Error('أضف رقمك أنت للاختبار في TWILIO_TEST_TO بصيغة دولية مثل +967….'), {status:503});
  const twiml = '<Response><Say language="ar-XA" voice="Google.ar-XA-Standard-B">هذه مكالمة اختبار من رام للتحقق من اتصال Twilio. لم يتم تفعيل المحادثة الذكية الحية بعد. انتهى الاختبار.</Say><Hangup/></Response>';
  const body = new URLSearchParams({To:to, From:callerId, Twiml:twiml, TimeLimit:'30'});
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Calls.json`;
  const response = await fetchImpl(url, {method:'POST', signal:AbortSignal.timeout(20000), headers:{Authorization:authHeader(env), 'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json'}, body});
  const data = await parseResponse(response);
  if (!response.ok || !data?.sid) throw providerError(data, response.status);
  return {ok:true, provider:'Twilio', callSid:String(data.sid), status:String(data.status || 'queued'), callerIdMode:callerId.toLowerCase() === PRIVATE_CALLER_ID ? 'private' : 'number', testNumberMasked:maskPhone(to), message:callerId.toLowerCase() === PRIVATE_CALLER_ID ? 'قبل Twilio طلب المكالمة مع طلب إخفاء هوية المتصل. ظهورها كرقم خاص يعتمد على شركة الهاتف والبلد.' : 'قبل Twilio طلب المكالمة. سيصل اتصال قصير إلى رقم الاختبار المحدد في Railway.'};
}
