# Unmail

InstantDB-backed inbound email sync for n8n.

## Development

```bash
pnpm dev
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

Instant CLI commands are wired to the custom API instance and app id in
`package.json`.

```bash
pnpm instant:push:schema
pnpm instant:push:perms
```

Other helpers:

```bash
pnpm instant:push
pnpm instant:pull
pnpm instant:query '{ inboundEmails: { $: { limit: 1 } } }'
pnpm instant:explorer
```
