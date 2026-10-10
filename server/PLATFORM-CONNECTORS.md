# RAM platform connectors: verified state

This file distinguishes platform registration from an actual API connection.
The API catalog is returned by GET /platform-connectors and is also included
in POST /capabilities. The RAM bearer token is required for both endpoints.

## Current status

- **ProZ.com**: its official API documents reading job postings and submitting
  quotes (job.quote scope). API support is currently listed for Business
  Enterprise members. No OAuth credentials are configured in this update, so
  this is a verified connector target, not a live connection.
- **Upwork**: key approval is required and current criteria include $25,000 in
  lifetime earnings/spend and a 90% Job Success Score for freelancers. The
  API is limited to personal/internal use, and approval does not authorize
  actions outside the approved scope. No scraper, browser session, or
  background page polling is used.
- **Freelancer.com**: its public API is marketed for applications accessing
  and hiring its freelancer workforce. That does not establish freelancer
  job-search or bid permissions, so RAM does not enable it for earning work.
- **Fiverr, PeoplePerHour, Guru, Contra, Mostaql, Khamsat, Workana,
  Truelancer, and Toptal**: RAM has not verified an official public API that
  permits a freelancer account to search and submit applications. They remain
  manual until the platform confirms an eligible API and its permitted use.

## Security and activation

The catalog never reports connected based on a local “registered” flag.
Do not put platform passwords, one-time codes, browser cookies, API secrets,
or OAuth tokens in the app, workflow JSON, or Git. Before adding a platform
adapter, obtain its official API credentials and confirm the allowed
freelancer-side scopes. Tokens must be stored encrypted on the server, and
RAM must respect each platform's rate limits and terms.

This package does not promise that a platform will grant access, that a client
will accept a quote, or that work will produce income.

## Public free opportunity feeds

The app also has read-only public feed adapters for Himalayas and Jobicy. These
are no-key APIs for discovering public remote contract listings, not APIs for
submitting a proposal to Upwork/Fiverr/other freelancer marketplaces. See
`FREE-OPPORTUNITY-APIS.md` for type filters, caching, attribution, and API links.
