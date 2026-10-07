# RAM connection setup

This source update adds Gmail OAuth, a stricter freelance-project filter, and a queued cloud task worker. Gmail still needs Google OAuth credentials and the exact callback URL. The cloud worker needs a Railway Volume mounted at `/data` and `RAM_DATA_DIR=/data`; without that, opportunities are not accepted as cloud jobs. No email key or provider key belongs in Android or GitHub.

See [`docs/GMAIL-SETUP-AR.md`](docs/GMAIL-SETUP-AR.md) for Google Cloud and Railway Gmail setup. Google OAuth testing mode can expire refresh tokens after 7 days, and Gmail API scopes may require Google verification. Check production after deployment: `/capabilities` reports the persistent worker only when `RAM_DATA_DIR=/data` is set and the directory is writable.

## Cloud task worker

Follow [`CLOUD-WORKFLOW-AR-1.21.md`](CLOUD-WORKFLOW-AR-1.21.md). The worker stores task reports and drafts while the Android app is closed. It does not log into freelance platforms, sign contracts, deliver files, send payment claims, or move money. Use one server replica with the JSON volume store. This version does not send push notifications to a powered-off phone.

## Android update continuity

Business package: `com.ram.agent.business`. Version 1.21 sets versionCode 18 and versionName `1.21-cloud-worker`. Reuse the same permanent RAM Business signing key in GitHub Actions; do not generate or publish new signing material.

## Remaining unimplemented business automation

No marketplace login or proposal automation, file delivery, periodic inbox monitor, payment verification, or telephony connection is included. Search results are public listing links only. The owner reviews agreements, deliverables, sending claims, and receipt of funds.
