const SOURCES = Object.freeze([
  {id: 'himalayas', name: 'Himalayas', endpoint: 'https://himalayas.app/jobs/api/search', authentication: 'none', fee: 'free', types: ['Contractor', 'Temporary']},
  {id: 'jobicy', name: 'Jobicy', endpoint: 'https://jobicy.com/api/v2/remote-jobs', authentication: 'none', fee: 'free', types: ['contract', 'freelance']}
]);

const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 80;
const MAX_QUERY = 160;
const TERMS = [
  [/ترجم|ترجمة|لغوي|translation/i, 'translation'],
  [/تصميم|جرافيك|اعلان|إعلان|graphic|design/i, 'design'],
  [/هندس|cad|معماري|مخطط/i, 'engineering'],
  [/موقع|صفحة|ويب|برمج|website|web developer/i, 'web development'],
  [/لوجست|شحن|حاوي|تخليص|logistics|shipping/i, 'logistics'],
  [/توريد|مورد|شراء|مشتريات|sourcing|procurement/i, 'sourcing'],
  [/بحث|دراسة|research/i, 'research']
];

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
    verifiedEmploymentType: true, feeStatus: 'unknown'
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
    verifiedEmploymentType: true, feeStatus: 'unknown'
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

export function getFreeOpportunitySources() {
  return SOURCES.map(source => ({...source, status: 'ready', use: 'read_only_search', submitsApplications: false}));
}

export async function searchFreeOpportunityFeeds(query, {maxResults = 10, fetchImpl = globalThis.fetch} = {}) {
  const search = cleanQuery(query);
  const limit = Math.min(Math.max(Number(maxResults) || 10, 1), 20);
  const providers = [
    ['Himalayas', () => getHimalayas(search, fetchImpl)],
    ['Jobicy', () => getJobicy(search, fetchImpl)]
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
    if (terms.length && item.source === 'Jobicy' && !terms.some(term => text.includes(term))) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url); return true;
  });
  return {query: search, results: unique.slice(0, limit).map((item, index) => ({...item, id: index + 1, retrievedAt: new Date().toISOString()})), errors, sources: getFreeOpportunitySources()};
}

export function resetFreeOpportunityCacheForTests() { cache.clear(); }
