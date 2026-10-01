# RAM communication and AI quality update

This update changes the server prompt and reply handling so RAM uses the recent conversation, answers in concise natural paragraphs, avoids repeated Markdown symbols and punctuation, and drafts project-specific outreach grounded in the project details supplied to it.

## Files

- `AIService.java` → `app/src/main/java/com/ram/agent/AIService.java`
- `MainActivity.java` → `app/src/main/java/com/ram/agent/MainActivity.java`
- `server.js` → `server/server.js`
- `response-format.mjs` → `server/response-format.mjs`

Keep the two server files together in the `server` folder. The app already sends recent conversation messages to `/chat`; the server now uses them as context.

## Required server settings

- `OPENROUTER_API_KEY`: server-side API key.
- `OPENROUTER_MODEL`: a capable, non-free model available to this OpenRouter account, written as its provider/model identifier. The old `openrouter/free` fallback has been removed because its model can change and produce inconsistent results. RAM returns a configuration error until this is set.
- `TAVILY_API_KEY`: needed for real web search.
- `ELEVENLABS_API_KEY`: needed for spoken replies.

Never place provider keys in Android source code or expose them in the app.

## Project outreach

RAM can draft a tailored application in chat when the conversation contains the actual project title, description and link. The server also provides `POST /proposal` with JSON such as:

```json
{
  "language": "English",
  "senderName": "Ahmed",
  "company": "Enjaz Holding",
  "project": {
    "title": "Arabic-English article editing",
    "description": "Edit and translate short articles for our website.",
    "url": "https://example.com/project",
    "budget": "Published budget, if any",
    "verifiedSamples": "Only list samples that are actually available"
  }
}
```

The response contains a subject and message body marked `draftOnly: true`. This package does not connect Gmail or send email. No message is sent by generating a draft; an authenticated mail integration and recipient details must be configured before automatic sending can work.

## Deploy and verify

Replace the listed files in the existing `ahmed007ahmed/RAM-Agent` repository, set the server variables above in its deployment environment, then deploy that service. Verify the app is pointed at the correct server URL in Settings. Test `/chat`, `/search`, and `/proposal` after deployment.

This workspace update is source code only. It has not been deployed to Railway or connected to a mailbox, and no client has been contacted. The existing Railway project and user credentials were not available here. Do not count a drafted message as an application or income.
