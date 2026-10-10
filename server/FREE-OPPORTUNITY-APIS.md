# Free opportunity APIs

`POST /search` now searches four public job feeds without API keys or paid search credits. This means **the search connector is free**. It does not prove that every employer or application destination is free, so RAM reports the application cost as unverified for each result and must not pay an application, registration, membership, credit, or deposit fee.

| Source | Public endpoint | Search access | Accepted work types | Freshness/rate note |
| --- | --- | --- | --- | --- |
| Himalayas | `https://himalayas.app/jobs/api/search` | No key or authentication | `Contractor`, `Temporary` | Its dataset refreshes every 24 hours; results are cached locally for 24 hours. |
| Jobicy | `https://jobicy.com/api/v2/remote-jobs` | No key or authentication | `contract`, `freelance` | The API exposes jobs from the last 7 days; RAM caches the public feed for 24 hours, below the documented one-hour polling ceiling. |
| Remotive | `https://remotive.com/api/remote-jobs` | Public API; no key required for this read endpoint | `contract`, `freelance` | RAM caches one public feed for 24 hours; Remotive advises no more than four requests a day and requires attribution plus the original Remotive URL. |
| RemoteJobs.org | `https://remotejobs.org/api/v1/jobs` | No account or key; free public JSON | `contract`, `freelance` | Two type-filtered reads per refresh, max 50 each; RAM caches the merged feed for 24 hours and preserves its requested “Powered by” attribution. |

RAM labels these records `REMOTE_CONTRACT_LISTING`. It keeps the source and application URL, company, published employment type, optional salary and location, and a shortened plain-text description. Results with full-time employment types or invalid URLs are excluded. The salary is shown as source salary metadata and is not treated as a project budget.

The feeds are read-only: they discover and present listings; they do not create accounts, apply, contact employers, accept contracts, or process payments. The result card links to the original listing and states that fees/payment terms need review there. New and unselected search results stay in memory; they are not written to the cloud queue. Do not describe a listing as “free to apply” unless the original platform or employer explicitly confirms that no upfront fee, paid credit, subscription, or deposit is required. Any unclear or paid listing is skipped; the owner is never asked to pay to apply.

## Free-first rule

`accessCost: free_public_search` describes only the public feed. Each result is marked `feeStatus: unverified_at_destination` until the original application page's rules are checked. No connector in this file submits an application. A platform can still charge an earned-work commission after a contract; disclose that separately before work is accepted.

## Official documentation

- Himalayas: <https://himalayas.app/docs/remote-jobs-api>
- Jobicy API documentation: <https://github.com/Jobicy/remote-jobs-api>
- Jobicy fair use: preserve attribution and canonical URLs; do not poll more frequently than hourly.
- Remotive API and terms: <https://remotive.com/remote-jobs/api> and <https://github.com/remotive-com/remote-jobs-api>
- RemoteJobs.org API and attribution: <https://remotejobs.org/api-access>

## Search endpoint behavior

Paid Serper/Tavily web search remains optional. When configured, its results are merged only after the existing freelance project filter. If no paid search key exists, free API discovery still works. A failure in one public feed does not discard results from the others. Some providers impose use and attribution conditions; the adapter preserves the source and does not collect signup details to unlock listings.
