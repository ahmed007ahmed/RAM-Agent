# Free opportunity APIs

`POST /search` now searches two verified public job feeds without API keys or paid search credits:

| Source | Public endpoint | Free access | Accepted work types | Freshness/rate note |
| --- | --- | --- | --- | --- |
| Himalayas | `https://himalayas.app/jobs/api/search` | No key or authentication | `Contractor`, `Temporary` | Its dataset refreshes every 24 hours; results are cached locally for 24 hours. |
| Jobicy | `https://jobicy.com/api/v2/remote-jobs` | No key or authentication | `contract`, `freelance` | The API exposes jobs from the last 7 days; RAM caches the public feed for 24 hours, below the documented one-hour polling ceiling. |

RAM labels these records `REMOTE_CONTRACT_LISTING`. It keeps the source and application URL, company, published employment type, optional salary and location, and a shortened plain-text description. Results with full-time employment types or invalid URLs are excluded. The salary is shown as source salary metadata and is not treated as a project budget.

The feeds are read-only: they discover and present listings; they do not create accounts, apply, contact employers, accept contracts, or process payments. The result card links to the original listing and states that fees/payment terms need review there. New and unselected search results stay in memory; they are not written to the cloud queue.

## Official documentation

- Himalayas: <https://himalayas.app/docs/remote-jobs-api>
- Jobicy API documentation: <https://github.com/Jobicy/remote-jobs-api>
- Jobicy fair use: preserve attribution and canonical URLs; do not poll more frequently than hourly.

## Search endpoint behavior

Paid Serper/Tavily web search remains optional. When configured, its results are merged only after the existing freelance project filter. If no paid search key exists, free API discovery still works. A failure in one public feed does not discard results from the other.
