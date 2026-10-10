const SOURCES = Object.freeze([
  {id: 'himalayas', name: 'Himalayas', endpoint: 'https://himalayas.app/jobs/api/search', docsUrl: 'https://himalayas.app/docs/remote-jobs-api', authentication: 'none', accessCost: 'free_public_search', applicationCost: 'unverified_per_listing', types: ['Contractor', 'Temporary']},
  {id: 'jobicy', name: 'Jobicy', endpoint: 'https://jobicy.com/api/v2/remote-jobs', docsUrl: 'https://jobicy.com/jobs-rss-feed', authentication: 'none', accessCost: 'free_public_search', applicationCost: 'unverified_per_listing', types: ['contract', 'freelance']},
  {id: 'remotive', name: 'Remotive', endpoint: 'https://remotive.com/api/remote-jobs', docsUrl: 'https://remotive.com/remote-jobs/api', authentication: 'none', accessCost: 'free_public_search', applicationCost: 'unverified_per_listing', types: ['contract', 'freelance']},
  {id: 'remotejobs', name: 'RemoteJobs.org', endpoint: 'https://remotejobs.org/api/v1/jobs', docsUrl: 'https://remotejobs.org/api-access', authentication: 'none', accessCost: 'free_public_search', applicationCost: 'unverified_per_listing', types: ['contract', 'freelance']}
]);

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 80;
const MAX_QUERY = 160;
// These labels guide the agent's attempt; they are not hard exclusions.
const DOMAIN_RULES = Object.freeze([
  {id:'translation', pattern:/ترجم|translation|translator|locali[sz]ation|proofread/i, execution:'ai_execute_with_available_tools'},
  {id:'writing_content', pattern:/كتابة|تحرير|مقال|محتوى|copywrit|content|editing|editor/i, execution:'ai_execute_with_available_tools'},
  {id:'graphic_design_ads', pattern:/تصميم|جرافيك|اعلان|إعلان|graphic|design|branding|banner|logo/i, execution:'ai_execute_with_available_tools'},
  {id:'web_design_development', pattern:/موقع|صفحة|ويب|برمج|website|web developer|frontend|backend|wordpress|shopify/i, execution:'ai_execute_with_available_tools'},
  {id:'engineering_cad_3d', pattern:/هندس|cad|معماري|مخطط|3d|modeling|render|solidworks|autocad|revit/i, execution:'ai_execute_with_tools_and_validate_output'},
  {id:'logistics_freight', pattern:/لوجست|شحن|حاوي|تخليص|logistics|shipping|freight|cargo|dispatch/i, execution:'ai_research_match_quote_and_coordinate'},
  {id:'supplier_sourcing', pattern:/توريد|مورد|شراء|مشتريات|sourcing|procurement|supplier|vendor/i, execution:'ai_find_compare_and_coordinate'},
  {id:'research_data', pattern:/بحث|دراسة|بيانات|research|market analysis|data analysis|data entry|spreadsheet|excel/i, execution:'ai_execute_with_available_tools'},
  {id:'virtual_assistance', pattern:/مساعد افتراضي|إدارة بريد|مواعيد|virtual assistant|administrative|email management|scheduling/i, execution:'ai_execute_with_connected_account_permissions'},
  {id:'customer_support_sales', pattern:/خدمة العملاء|دعم العملاء|مبيعات|sales|customer support|customer service|lead generation/i, execution:'ai_draft_and_respond_with_authorized_account'},
  {id:'marketing_social_media', pattern:/تسويق|سوشال|وسائل التواصل|marketing|social media|seo|advertising/i, execution:'ai_execute_with_available_tools'},
  {id:'video_audio', pattern:/مونتاج|فيديو|صوت|تحرير فيديو|video editing|audio editing|subtitles|captioning/i, execution:'ai_execute_with_available_tools'},
  {id:'automation_qa', pattern:/أتمتة|اختبار برمجيات|ضمان الجودة|automation|qa tester|software testing|workflow/i, execution:'ai_execute_with_available_tools'},
  {id:'education_tutoring', pattern:/تدريس|تعليم|تدريب|tutoring|teaching|course|instruction/i, execution:'ai_execute_with_available_tools'},
  {id:'ecommerce', pattern:/تجارة إلكترونية|متجر|منتجات|e-?commerce|product listing|catalog|amazon|ebay/i, execution:'ai_research_create_and_manage_with_access'},
  {id:'real_estate', pattern:/عقارات|إيجار|بيع عقار|real estate|property|rental|listing/i, execution:'ai_research_match_and_coordinate'},
  {id:'travel_hospitality', pattern:/سفر|سياحة|فندق|حجوزات|travel|tourism|hotel|booking|hospitality/i, execution:'ai_research_plan_and_book_with_authorized_access'},
  {id:'recruiting_hr', pattern:/توظيف|موارد بشرية|recruiting|recruiter|human resources|hr assistant/i, execution:'ai_search_screen_and_coordinate'},
  {id:'legal_document_support', pattern:/عقود|مستندات قانونية|legal document|contract review|paralegal/i, execution:'ai_draft_documents_for_professional_review'},
  {id:'finance_admin', pattern:/مسك دفاتر|فواتير|محاسبة إدارية|bookkeeping|invoicing|accounting assistant/i, execution:'ai_assist_with_records_and_reconcile_for_review'}
]);
const TERMS = [
  [/ترجم|ترجمة|لغوي|translation|translator/i, 'translation translator'],
  [/كتابة|تحرير|مقال|محتوى|copywriting|content/i, 'writing content'],
  [/تصميم|جرافيك|اعلان|إعلان|graphic|design|branding/i, 'design'],
  [/هندس|cad|معماري|مخطط|ثلاثي الأبعاد|3d|modeling/i, 'engineering cad 3d'],
  [/موقع|صفحة|ويب|برمج|website|web developer|wordpress/i, 'web development'],
  [/لوجست|شحن|حاوي|تخليص|logistics|shipping|freight|cargo/i, 'logistics freight'],
  [/توريد|مورد|شراء|مشتريات|sourcing|procurement|supplier/i, 'supplier sourcing'],
  [/بحث|دراسة|research|تحليل بيانات|data entry/i, 'research data'],
  [/مساعد افتراضي|إدارة بريد|مواعيد|virtual assistant/i, 'virtual assistance'],
  [/خدمة العملاء|دعم العملاء|مبيعات|sales|customer support/i, 'customer support sales'],
  [/تسويق|سوشال|وسائل التواصل|marketing|social media/i, 'marketing social media'],
  [/مونتاج|فيديو|صوت|video editing|audio editing|subtitles/i, 'video audio'],
  [/أتمتة|اختبار برمجيات|automation|qa tester|workflow/i, 'automation qa'],
  [/تدريس|تعليم|تدريب|tutoring|teaching/i, 'education tutoring'],
  [/تجارة إلكترونية|متجر|منتجات|e-?commerce|product listing|catalog/i, 'ecommerce product listing'],
  [/عقارات|إيجار|بيع عقار|real estate|property|rental/i, 'real estate property'],
  [/سفر|سياحة|فندق|حجوزات|travel|tourism|hotel|booking/i, 'travel hospitality'],
  [/توظيف|موارد بشرية|recruiting|recruiter|human resources/i, 'recruiting human resources'],
  [/عقود|مستندات قانونية|legal document|contract review|paralegal/i, 'legal document support'],
  [/مسك دفاتر|فواتير|محاسبة إدارية|bookkeeping|invoicing|accounting assistant/i, 'finance admin']
];

function classifyOpportunity(job) {
  const text = `${job.title || ''} ${job.snippet || ''}`;
  const matches = DOMAIN_RULES.filter(rule => rule.pattern.test(text));
  return matches.length
    ? matches.map(({id, execution}) => ({id, execution}))
    : [{id:'other_or_unclassified', execution:'ai_assess_then_attempt_with_available_tools'}];
}

function cleanQuery(value) {
  let text = String(value || '').slice(0, 2000);
  for (const [pattern, replacement] of TERMS) text = text.replace(pattern, replacement);
  text = text.replace(/\bsite:[^\s)]+/gi, ' ')
    .replace(/\b(?:OR|AND|NOT)\b/gi, ' ')
    .replace(/[()"']/g, ' ')
    .replace(/\b(?:freelance|freelancer|project|client|budget|remote|work|jobs?|site|com|apply|fixed|price|contractor|opportunity|opportunities)\b|مشروع|فرص(?:ة|ا|)?|عمل\s+عن\s+بعد|عن\s+بعد/gi, ' ')
    .replace(/[^\p{L}\p{N}\s+#.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, MAX_QUERY);
}

function plainText(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim().slice(0, 4000);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function cached(key) {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.at >= CACHE_TTL_MS) return null;
  return entry.value;
}

function setCache(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, {at: Date.now(), value});
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function mapHimalayas(job) {
  const type = String(job?.employmentType || '').trim();
  if (!['contractor', 'temporary'].includes(type.toLowerCase())) return null;
  const url = safeUrl(job.applicationLink);
  if (!url) return null;
  const snippet = plainText(job.excerpt || job.description);
  return {
    id: `himalayas:${String(job.guid || url)}`, title: String(job.title || 'Remote contract opportunity').slice(0, 300),
    company: String(job.companyName || ''), url, applicationUrl: url, snippet,
    employmentType: type, workType: 'REMOTE_CONTRACT_LISTING', source: 'Himalayas',
    sourceHome: 'https://himalayas.app/', sourceAttribution: 'Source: Himalayas',
    publishedAt: job.pubDate ? (typeof job.pubDate === 'number' ? new Date(job.pubDate).toISOString() : String(job.pubDate)) : null,
    locationRestrictions: Array.isArray(job.locationRestrictions) ? job.locationRestrictions.map(x => String(x.name || x)).slice(0, 20) : [],
    salary: job.minSalary != null || job.maxSalary != null ? {min: job.minSalary ?? null, max: job.maxSalary ?? null, period: String(job.salaryPeriod || 'annual'), currency: String(job.currency || '')} : null,
    verifiedEmploymentType: true, feeStatus: 'unverified_at_destination', upfrontFeeEvidence: null
  };
}

function mapJobicy(job) {
  const types = Array.isArray(job?.jobType) ? job.jobType.map(x => String(x).trim()) : [];
  const matchedType = types.find(type => ['contract', 'freelance'].includes(type.toLowerCase()));
  if (!matchedType) return null;
  const url = safeUrl(job.url);
  if (!url || !/^https:\/\/(?:www\.)?jobicy\.com\//i.test(url)) return null;
  const snippet = plainText(job.jobExcerpt || job.jobDescription);
  return {
    id: `jobicy:${String(job.id || url)}`, title: String(job.jobTitle || 'Remote contract opportunity').slice(0, 300),
    company: String(job.companyName || ''), url, applicationUrl: url, snippet,
    employmentType: matchedType, workType: 'REMOTE_CONTRACT_LISTING', source: 'Jobicy',
    sourceHome: 'https://jobicy.com/', sourceAttribution: 'Source: Jobicy',
    publishedAt: job.pubDate || null, locationRestrictions: job.jobGeo ? [String(job.jobGeo)] : [],
    salary: job.salaryMin != null || job.salaryMax != null ? {min: job.salaryMin ?? null, max: job.salaryMax ?? null, period: String(job.salaryPeriod || ''), currency: String(job.salaryCurrency || '')} : null,
    verifiedEmploymentType: true, feeStatus: 'unverified_at_destination', upfrontFeeEvidence: null
  };
}

function mapRemotive(job) {
  const type = String(job?.job_type || '').trim();
  if (!['contract', 'freelance'].includes(type.toLowerCase())) return null;
  const url = safeUrl(job.url);
  if (!url || !/^https:\/\/(?:www\.)?remotive\.com\//i.test(url)) return null;
  return {
    id: `remotive:${String(job.id || url)}`, title: String(job.title || 'Remote contract opportunity').slice(0, 300),
    company: String(job.company_name || ''), url, applicationUrl: url,
    snippet: plainText(job.description), employmentType: type, workType: 'REMOTE_CONTRACT_LISTING',
    source: 'Remotive', sourceHome: 'https://remotive.com/', sourceAttribution: 'Source: Remotive · data may be delayed up to 24 hours',
    publishedAt: job.publication_date || null,
    locationRestrictions: job.candidate_required_location ? [String(job.candidate_required_location)] : [],
    salary: job.salary ? {text: plainText(job.salary), currency: 'as stated by source'} : null,
    verifiedEmploymentType: true, feeStatus: 'unverified_at_destination', upfrontFeeEvidence: null
  };
}

function mapRemoteJobs(job) {
  const type = String(job?.type || '').trim();
  if (!['contract', 'freelance'].includes(type.toLowerCase())) return null;
  const url = safeUrl(job.url);
  if (!url || !/^https:\/\/(?:www\.)?remotejobs\.org\//i.test(url)) return null;
  const applyUrl = safeUrl(job.apply_url) || url;
  return {
    id: `remotejobs:${String(job.id || url)}`, title: String(job.title || 'Remote contract opportunity').slice(0, 300),
    company: String(job.company?.name || job.company_name || ''), url, applicationUrl: applyUrl,
    snippet: plainText(job.description), employmentType: type, workType: 'REMOTE_CONTRACT_LISTING',
    source: 'RemoteJobs.org', sourceHome: 'https://remotejobs.org/',
    sourceAttribution: 'Powered by RemoteJobs.org · Source: RemoteJobs.org',
    publishedAt: job.posted_at || null,
    locationRestrictions: job.location ? [String(job.location)] : [],
    salary: job.salary_min != null || job.salary_max != null ? {
      min: job.salary_min ?? null, max: job.salary_max ?? null,
      text: String(job.salary_text || ''), currency: String(job.salary_currency || '')
    } : null,
    verifiedEmploymentType: true, feeStatus: 'unverified_at_destination', upfrontFeeEvidence: null
  };
}

async function getHimalayas(query, fetchImpl) {
  const key = `himalayas:${query.toLowerCase()}`;
  const old = cached(key); if (old) return old;
  const url = new URL('https://himalayas.app/jobs/api/search');
  url.searchParams.set('employment_type', 'Contractor');
  if (query) url.searchParams.set('q', query);
  url.searchParams.set('sort', 'recent');
  const data = await fetchJson(url, fetchImpl);
  if (!Array.isArray(data?.jobs)) throw new Error('Unexpected Himalayas response');
  const jobs = data.jobs.map(mapHimalayas).filter(Boolean);
  setCache(key, jobs);
  return jobs;
}

async function getJobicy(query, fetchImpl) {
  // Fair-use rule: poll Jobicy no more than hourly, irrespective of category/query.
  const key = 'jobicy:feed';
  const old = cached(key); if (old) return old;
  const url = new URL('https://jobicy.com/api/v2/remote-jobs');
  url.searchParams.set('count', '100');
  const data = await fetchJson(url, fetchImpl);
  if (data?.success === false || !Array.isArray(data?.jobs)) throw new Error(data?.error || 'Unexpected Jobicy response');
  const jobs = data.jobs.map(mapJobicy).filter(Boolean);
  setCache(key, jobs);
  return jobs;
}

async function getRemotive(query, fetchImpl) {
  // Remotive advises a maximum of four API reads a day; one cached full feed is enough.
  const key = 'remotive:feed';
  const old = cached(key); if (old) return old;
  const url = new URL('https://remotive.com/api/remote-jobs');
  url.searchParams.set('limit', '100');
  const data = await fetchJson(url, fetchImpl);
  if (!Array.isArray(data?.jobs)) throw new Error('Unexpected Remotive response');
  const jobs = data.jobs.map(mapRemotive).filter(Boolean);
  setCache(key, jobs);
  return jobs;
}

async function getRemoteJobs(query, fetchImpl) {
  const key = 'remotejobs:contract-freelance';
  const old = cached(key); if (old) return old;
  // Their documented API accepts one type per request; query each eligible type
  // and merge, while limiting to the published 50-result maximum per request.
  const batches = await Promise.all(['contract', 'freelance'].map(async type => {
    const url = new URL('https://remotejobs.org/api/v1/jobs');
    url.searchParams.set('type', type);
    url.searchParams.set('limit', '50');
    if (query) url.searchParams.set('q', query);
    const data = await fetchJson(url, fetchImpl);
    if (!Array.isArray(data?.data)) throw new Error('Unexpected RemoteJobs.org response');
    return data.data.map(mapRemoteJobs).filter(Boolean);
  }));
  const jobs = [...batches[0], ...batches[1]];
  setCache(key, jobs);
  return jobs;
}

export function getFreeOpportunitySources() {
  return SOURCES.map(source => ({...source, status: 'adapter_implemented', liveTestRequired: true, connected: false, use: 'read_only_search', submitsApplications: false, feePolicy: 'search_is_free; listing_application_cost_must_be_checked_on_original_site', neverPayToApply: true}));
}

export async function searchFreeOpportunityFeeds(query, {maxResults = 10, fetchImpl = globalThis.fetch} = {}) {
  const search = cleanQuery(query);
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), 20);
  const providers = [
    ['Himalayas', () => getHimalayas(search, fetchImpl)],
    ['Jobicy', () => getJobicy(search, fetchImpl)],
    ['Remotive', () => getRemotive(search, fetchImpl)],
    ['RemoteJobs.org', () => getRemoteJobs(search, fetchImpl)]
  ];
  const settled = await Promise.allSettled(providers.map(([, run]) => run()));
  const results = [];
  const errors = [];
  settled.forEach((item, index) => {
    if (item.status === 'fulfilled') results.push(...item.value);
    else errors.push({source: providers[index][0], error: item.reason?.message || 'request failed'});
  });
  const terms = search.toLowerCase().split(/\s+/).filter(term => term.length >= 3);
  const seen = new Set();
  const unique = results.filter(item => {
    const text = `${item.title} ${item.company} ${item.snippet} ${item.employmentType}`.toLowerCase();
    if (terms.length && ['Jobicy', 'Remotive'].includes(item.source) && !terms.some(term => text.includes(term))) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url); return true;
  });
  return {query: search, results: unique.slice(0, limit).map((item, index) => ({...item, id: index + 1, domains: classifyOpportunity(item), retrievedAt: new Date().toISOString()})), errors, sources: getFreeOpportunitySources()};
}

export function resetFreeOpportunityCacheForTests() { cache.clear(); }
