# Free opportunity APIs

`POST /search` now searches four public job feeds without API keys or paid search credits. This means **the search connector is free**. It does not prove that every employer or application destination is free, so RAM reports the application cost as unverified for each result and must not pay an application, registration, membership, credit, or deposit fee.

| Source | Public endpoint | Search access | Accepted work types | Freshness/rate note |
| --- | --- | --- | --- | --- |
| Himalayas | `https://himalayas.app/jobs/api/search` | No key or authentication | `Contractor`, `Temporary` | Its dataset refreshes every 24 hours; results are cached locally for 24 hours. |
| Jobicy | `https://jobicy.com/api/v2/remote-jobs` | No key or authentication | `contract`, `freelance` | The API exposes jobs from the last 7 days; RAM caches the public feed for 24 hours, below the documented one-hour polling ceiling. |
| Remotive | `https://remotive.com/api/remote-jobs` | Public API; no key required for this read endpoint | `contract`, `freelance` | RAM caches one public feed for 24 hours; Remotive advises no more than four requests a day and requires attribution plus the original Remotive URL. |
| RemoteJobs.org | `https://remotejobs.org/api/v1/jobs` | No account or key; free public JSON | `contract`, `freelance` | Two type-filtered reads per refresh, max 50 each; RAM caches the merged feed for 24 hours and preserves its requested “Powered by” attribution. |

RAM labels these records `REMOTE_CONTRACT_LISTING`. It keeps the source and application URL, company, published employment type, optional salary and location, and a shortened plain-text description. Results with full-time employment types or invalid URLs are excluded. The salary is shown as source salary metadata and is not treated as a project budget.

## Additional income sources shown in the RAM app

The Opportunities screen now shows the four live, read-only API feeds above with links to their endpoints and documentation. Jobicy and RemoteJobs.org are explicitly identified as free public search APIs. The app also points to Khamsat and Mostaql as service-listing/project-bidding marketplaces, and Toloka as a project-based task platform. These marketplace links are directories for the owner to inspect; RAM does not claim they expose an official application API, and account eligibility, payout availability, commissions, and any task-specific conditions must be checked on each official site. The app must never label an application as free unless its destination confirms that.

A specific listing is not hard-coded into the app because job ads close or change. RAM should retrieve current ads at search time, retain their canonical source URLs, and display the current listing details instead of treating yesterday's example as an open job.

## Broad work domains and execution guidance

RAM assigns each result one or more domain labels so discovery can span translation, writing/editing, graphic design/advertising, websites, engineering/CAD/3D, logistics/freight, supplier sourcing, research/data, virtual assistance, customer support/sales, marketing/social media, video/audio, automation/QA, tutoring, e-commerce, real estate, travel/hospitality, recruiting, legal-document assistance, and finance administration. These labels are not hard exclusions. They tell RAM to assess the requested deliverable, gather context, use available AI/tools, produce as much of the work as possible, and identify any missing access, software, client input, or specialist verification.

Each label includes an execution guide, not a claim that every external action is already integrated. RAM can create digital deliverables with available tools; technical/engineering outputs should be validated to the client's requirements. Freight, property, and supplier work can include lead research, matching, quote comparisons, and coordination; booking, contracts, payments, and communications require the relevant official account/API access. Legal and accounting assistance can prepare/organize material but must not represent itself as licensed advice. For an unclassified task RAM should assess it and attempt what it can rather than rejecting it solely because no label matches.

These four sources remain read-only job feeds. The new domain labels broaden classification, not the connected-source count; they do not unlock freelancer-side application APIs or submit proposals.

The feeds are read-only: they discover and present listings; they do not create accounts, apply, contact employers, accept contracts, or process payments. The result card links to the original listing and states that fees/payment terms need review there. New and unselected search results stay in memory; they are not written to the cloud queue. Do not describe a listing as “free to apply” unless the original platform or employer explicitly confirms that no upfront fee, paid credit, subscription, or deposit is required. Any unclear or paid listing is skipped; the owner is never asked to pay to apply.

## Payment phases

**Starting phase:** use free connectors only. Do not pay an application fee, deposit, membership, subscription, API charge, or credits to access work. Each result remains `feeStatus: unverified_at_destination` until the original destination is checked; skip it if the required upfront fee cannot be established as zero.

**After recurring daily income begins:** RAM may research opportunities that require a guarantee, subscription, or small fee and report the exact cost, refund terms, expected net payout, break-even number of jobs, and risks. This phase changes what RAM may consider, not permission to spend automatically. Do not purchase or commit money until the owner has set a spending limit and confirms that specific charge. Platform commissions taken from earned payment must be disclosed separately.

## Official documentation

- Himalayas: <https://himalayas.app/docs/remote-jobs-api>
- Jobicy API documentation: <https://github.com/Jobicy/remote-jobs-api>
- Jobicy fair use: preserve attribution and canonical URLs; do not poll more frequently than hourly.
- Remotive API and terms: <https://remotive.com/remote-jobs/api> and <https://github.com/remotive-com/remote-jobs-api>
- RemoteJobs.org API and attribution: <https://remotejobs.org/api-access>

## Search endpoint behavior

Paid Serper/Tavily web search remains optional. When configured, its results are merged only after the existing freelance project filter. If no paid search key exists, free API discovery still works. A failure in one public feed does not discard results from the others. Some providers impose use and attribution conditions; the adapter preserves the source and does not collect signup details to unlock listings.
