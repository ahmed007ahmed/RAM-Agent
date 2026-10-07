# RAM connection setup

This source update adds Gmail OAuth, a stricter freelance-project filter, and a queued cloud task worker. Gmail still needs Google OAuth credentials and the exact callback URL. The cloud worker needs a Railway Volume mounted at `/data` and `RAM_DATA_DIR=/data`; without that, opportunities are not accepted as cloud jobs. No email key or provider key belongs in Android or GitHub.

See [`docs/GMAIL-SETUP-AR.md`](docs/GMAIL-SETUP-AR.md) for Google Cloud and Railway Gmail setup. Google OAuth testing mode can expire refresh tokens after 7 days, and Gmail API scopes may require Google verification. Check production after deployment: `/capabilities` reports the persistent worker only when `RAM_DATA_DIR=/data` is set and the directory is writable.

## Cloud task worker

Follow [`CLOUD-WORKFLOW-AR-1.22.md`](CLOUD-WORKFLOW-AR-1.22.md). The worker stores reports and prepares deliverable drafts while the Android app is closed. The owner opens the listing, registers and signs personally, then records the accepted scope in RAM. A text deliverable can be saved or sent as a Gmail attachment after review and confirmation. Platform upload remains manual. Use one server replica with the JSON volume store; notifications do not reach a powered-off phone.

## Android update continuity

Business package: `com.ram.agent.business`. Version 1.23 sets versionCode 20 and versionName `1.23-cloudflare-n8n-chat`. Reuse the same permanent RAM Business signing key in GitHub Actions; do not generate or publish new signing material.

## Remaining unimplemented business automation

No marketplace login or automatic upload, background inbox monitor, payment verification, or telephony connection is included. Search results are public listing links only. The owner reviews agreements and deliverables; Gmail sending is available only after confirmation. The owner confirms receipt of funds. Chat uses Cloudflare Workers AI only; the n8n webhook is called after an opportunity is selected when the Railway URL and secret variables are present.
