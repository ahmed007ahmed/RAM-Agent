const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const TEST_QUERY = 'site:upwork.com/freelance-jobs/apply freelance project';

export async function testSerperConnection(env = process.env, fetchImpl = fetch) {
  const apiKey = String(env.SERPER_API_KEY || '').trim();
  if (!apiKey) {
    return {ok:false, provider:'Serper', error:'أضف SERPER_API_KEY في متغيرات خدمة RAM-Agent على Railway.'};
  }

  let response;
  try {
    response = await fetchImpl(SERPER_ENDPOINT, {
      method:'POST',
      signal:AbortSignal.timeout(20000),
      headers:{'Content-Type':'application/json','X-API-KEY':apiKey},
      body:JSON.stringify({q:TEST_QUERY,num:1})
    });
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw Object.assign(new Error(timeout ? 'انتهت مهلة الاتصال بـSerper. أعد المحاولة.' : 'تعذر الوصول إلى Serper من Railway.'), {status:502});
  }

  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error('رفض Serper المفتاح. تحقق من SERPER_API_KEY في Railway.'), {status:502});
  }
  if (response.status === 429) {
    throw Object.assign(new Error('وصل حساب Serper إلى حد الطلبات أو لا توجد حصة متاحة.'), {status:429});
  }
  if (!response.ok) {
    throw Object.assign(new Error(`أعاد Serper حالة HTTP ${response.status}. تحقق من الحساب والمفتاح.`), {status:502});
  }

  let data;
  try { data = await response.json(); }
  catch { throw Object.assign(new Error('رد Serper ليس JSON صالحًا.'), {status:502}); }
  const resultCount = Array.isArray(data.organic) ? data.organic.length : 0;
  return {ok:true, provider:'Serper', resultCount, checkedAt:new Date().toISOString(), note:'تم طلب بحث مباشر بمفتاح Railway. قد تكون النتائج صفرًا من دون أن يعني ذلك أن المفتاح معطل.'};
}
