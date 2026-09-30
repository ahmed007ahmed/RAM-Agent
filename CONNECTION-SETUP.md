# RAM connection setup

This source update adds Gmail OAuth and a stricter freelance-project filter. It is not a live Gmail connection until Google OAuth credentials, the exact callback URL, and a persistent Railway volume are configured. No email key or message content belongs in Android or GitHub.

See [`docs/GMAIL-SETUP-AR.md`](docs/GMAIL-SETUP-AR.md) for Google Cloud and Railway setup. Google OAuth testing mode can expire refresh tokens after 7 days, and Gmail API scopes may require Google verification. The production Railway service currently has no Gmail OAuth variables and no volume.

## Android update continuity

Business package: `com.ram.agent.business`. This source changes versionCode to 15 and versionName to 1.14-business. Reuse the same permanent RAM Business signing key in GitHub Actions; do not generate or publish new signing material.

## Remaining unimplemented business automation

No cloud database/job queue, periodic inbox monitor, automatic marketplace registration/proposals, work execution/delivery agent, payment verification, or telephony connection is included in this update. Search results are public listing links only. The owner still reviews offers, agreements, deliverables, and receipt of funds.
