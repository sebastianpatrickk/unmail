# Unmail

InstantDB-backed inbound email sync for n8n.

## Development

```bash
npm run dev
```

The app runs at `http://127.0.0.1:3000` by default.

## n8n Webhook

Send email trigger payloads to:

```text
POST /api/webhooks/n8n/email
```

Authentication accepts either header:

```text
Authorization: Bearer $N8N_EMAIL_WEBHOOK_SECRET
x-webhook-secret: $N8N_EMAIL_WEBHOOK_SECRET
```

The webhook accepts a single n8n item, an array of items, or `{ "items": [...] }`.
Attachments are uploaded to Instant Storage and linked to the synced email.

## Required Environment

```bash
NEXT_PUBLIC_INSTANT_APP_ID=
INSTANT_APP_ADMIN_TOKEN=
N8N_EMAIL_WEBHOOK_SECRET=
```

For the self-hosted Instant instance, the app defaults to
`https://instant-api.sebastianpatrickk.site`. Override it with
`NEXT_PUBLIC_INSTANT_API_URI` for the browser client and `INSTANT_API_URI` for
server-side admin calls.

## Instant Schema

Push schema and permissions after logging into the Instant CLI:

```bash
npx instant-cli login
npx instant-cli push schema --yes
npx instant-cli push perms --yes
```
