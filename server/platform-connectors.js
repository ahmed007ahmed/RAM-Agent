// Connector readiness only. A platform is never marked connected from a
// registration checkbox; connection requires a platform-issued token and an
// authenticated API call.
const CATALOG = Object.freeze([
  {
    id: 'upwork', name: 'Upwork', kind: 'official_api_restricted',
    canReadJobs: false, canSubmitProposal: false,
    gate: 'API key approval and eligibility required; use only approved scopes.',
    detail: 'Upwork requires API approval. Current published criteria include verified payment and identity, $25,000 lifetime earnings/spend, 90% JSS for freelancers, and good standing. Its API is for personal/internal use; unapproved automation is prohibited.',
    docs: 'https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork'
  },
  {
    id: 'freelancer', name: 'Freelancer.com', kind: 'official_api_wrong_direction',
    canReadJobs: false, canSubmitProposal: false,
    gate: 'Public API is documented for apps that access/hire its freelancer workforce; worker-side job search and bidding permissions are not verified.',
    detail: 'Do not connect a buyer/workforce API as though it were an API for a freelancer applying to jobs.',
    docs: 'https://developers.freelancer.com/'
  },
  {
    id: 'proz', name: 'ProZ.com', kind: 'official_api_enterprise_gate',
    canReadJobs: true, canSubmitProposal: true,
    gate: 'Requires ProZ API client credentials and API access; ProZ currently states API support is for Business Enterprise members only.',
    detail: 'Official API documents GET /v2/job-postings and POST /v2/job-posting/{id}/quotes with the job.quote scope. Enable only after API access is granted and OAuth is tested.',
    docs: 'https://www.proz.com/api-docs-new/'
  },
  ...[
    ['fiverr', 'Fiverr'], ['peopleperhour', 'PeoplePerHour'], ['guru', 'Guru'],
    ['contra', 'Contra'], ['mostaql', 'مستقل'], ['khamsat', 'خمسات'],
    ['workana', 'Workana'], ['truelancer', 'Truelancer'], ['toptal', 'Toptal']
  ].map(([id, name]) => ({
    id, name, kind: 'official_freelancer_api_unverified',
    canReadJobs: false, canSubmitProposal: false,
    gate: 'No official public API for freelancer-side job search and applications has been verified for RAM. Use the platform website until its developer/support team confirms one.',
    detail: 'RAM does not use page scraping, browser cookies, password login, or click automation for this platform.',
    docs: null
  }))
]);

export function getPlatformConnectorCatalog() {
  return CATALOG.map(item => ({
    ...item,
    status: item.kind === 'official_api_enterprise_gate' ? 'requires_platform_access' :
      item.kind === 'official_api_restricted' ? 'requires_platform_approval' :
      item.kind === 'official_api_wrong_direction' ? 'not_suitable_for_freelancer' :
      'manual_until_official_api_verified'
  }));
}

export function getPlatformConnector(id) {
  return getPlatformConnectorCatalog().find(item => item.id === String(id || '')) || null;
}
