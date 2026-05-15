import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "@instantdb/admin";
import { getInstantAdminDb } from "@/lib/instant-admin";
import {
  EmailWebhookPayloadError,
  normalizeN8nEmailPayload,
  type NormalizedInboundEmail,
  type UploadableEmailAttachment,
} from "@/lib/email-sync/n8n-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingSyncedEmail = {
  id: string;
  createdAtMs?: number | null;
  attachments?: Array<{
    id: string;
    attachmentKey?: string | null;
    file?: { id: string } | null;
  }>;
};

export async function POST(request: Request) {
  const auth = verifyWebhookSecret(request);

  if (!auth.ok) {
    return json({ error: auth.error }, auth.status);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  let emails: NormalizedInboundEmail[];

  try {
    emails = normalizeN8nEmailPayload(payload);
  } catch (error) {
    if (error instanceof EmailWebhookPayloadError) {
      return json(
        { error: "invalid_payload", issues: error.issues },
        400,
      );
    }

    throw error;
  }

  try {
    const db = getInstantAdminDb();
    const saved = [];

    for (const email of emails) {
      saved.push(await syncEmail(db, email));
    }

    return json({
      ok: true,
      received: emails.length,
      saved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "sync_failed";
    return json({ error: "sync_failed", message }, 500);
  }
}

async function syncEmail(
  db: ReturnType<typeof getInstantAdminDb>,
  email: NormalizedInboundEmail,
) {
  const now = Date.now();
  const existing = await findExistingEmail(db, email.syncKey);
  const uploadedAttachments = [];

  for (const attachment of email.attachments) {
    const storagePath = storagePathForAttachment(email, attachment);
    const upload = await db.storage.uploadFile(storagePath, attachment.data, {
      contentType: attachment.mimeType ?? undefined,
      contentDisposition: attachment.contentDisposition ?? undefined,
      fileSize: attachment.fileSize,
    });

    uploadedAttachments.push({
      ...attachment,
      storagePath,
      fileId: upload.data.id,
    });
  }

  const attachmentLookups = uploadedAttachments.map((attachment) =>
    lookup("attachmentKey", attachment.attachmentKey),
  );
  const currentAttachmentKeys = new Set(
    uploadedAttachments.map((attachment) => attachment.attachmentKey),
  );
  const staleAttachments =
    existing?.attachments?.filter(
      (attachment) =>
        attachment.attachmentKey &&
        !currentAttachmentKeys.has(attachment.attachmentKey),
    ) ?? [];
  const emailTx = db.tx.inboundEmails.lookup("syncKey", email.syncKey).update({
    source: email.source,
    messageId: email.messageId,
    uid: email.uid,
    mailbox: email.mailbox,
    subject: email.subject,
    fromText: email.fromText,
    toText: email.toText,
    ccText: email.ccText,
    bccText: email.bccText,
    replyToText: email.replyToText,
    fromAddress: email.fromAddress,
    toAddress: email.toAddress,
    ccAddress: email.ccAddress,
    bccAddress: email.bccAddress,
    replyToAddress: email.replyToAddress,
    sentAtMs: email.sentAtMs,
    receivedAtMs: email.receivedAtMs,
    textPlain: email.textPlain,
    textHtml: email.textHtml,
    snippet: email.snippet,
    headers: email.headers,
    rawJson: email.rawJson,
    attachmentCount: uploadedAttachments.length,
    attachmentErrorCount: email.attachmentErrors.length,
    attachmentErrors:
      email.attachmentErrors.length > 0 ? email.attachmentErrors : null,
    createdAtMs: existing?.createdAtMs ?? now,
    updatedAtMs: now,
  });

  await db.transact([
    attachmentLookups.length > 0
      ? emailTx.link({ attachments: attachmentLookups })
      : emailTx,
    ...uploadedAttachments.map((attachment) =>
      db.tx.inboundEmailAttachments
        .lookup("attachmentKey", attachment.attachmentKey)
        .update({
          binaryKey: attachment.binaryKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileExtension: attachment.fileExtension,
          contentId: attachment.contentId,
          contentDisposition: attachment.contentDisposition,
          fileSize: attachment.fileSize,
          checksumSha256: attachment.checksumSha256,
          storagePath: attachment.storagePath,
          createdAtMs: now,
          updatedAtMs: now,
        })
        .link({
          email: lookup("syncKey", email.syncKey),
          file: attachment.fileId,
        }),
    ),
    ...staleAttachments.flatMap((attachment) => [
      db.tx.inboundEmailAttachments[attachment.id].delete(),
      ...(attachment.file?.id ? [db.tx.$files[attachment.file.id].delete()] : []),
    ]),
  ]);

  return {
    syncKey: email.syncKey,
    messageId: email.messageId,
    attachments: uploadedAttachments.length,
    attachmentErrors: email.attachmentErrors.length,
  };
}

async function findExistingEmail(
  db: ReturnType<typeof getInstantAdminDb>,
  syncKey: string,
) {
  const data = (await db.query({
    inboundEmails: {
      $: {
        where: { syncKey },
        limit: 1,
      },
      attachments: {
        file: {},
      },
    },
  })) as { inboundEmails: ExistingSyncedEmail[] };

  return data.inboundEmails[0] ?? null;
}

function storagePathForAttachment(
  email: NormalizedInboundEmail,
  attachment: UploadableEmailAttachment,
) {
  const emailKeyHash = createHash("sha256").update(email.syncKey).digest("hex");
  const extension = attachment.fileExtension
    ? `.${attachment.fileExtension}`
    : "";
  const readableName = slugify(
    attachment.fileName?.replace(/\.[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/, "") ??
      attachment.binaryKey ??
      "attachment",
  );

  return `inbound-emails/${emailKeyHash}/${attachment.attachmentKey}-${readableName}${extension}`;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "attachment"
  );
}

function verifyWebhookSecret(
  request: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.N8N_EMAIL_WEBHOOK_SECRET;

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        error: "webhook_secret_not_configured",
      };
    }

    return { ok: true };
  }

  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const provided = bearerToken ?? request.headers.get("x-webhook-secret");

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  return { ok: true };
}

function safeEqual(value: string, expected: string) {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return (
    valueBuffer.length === expectedBuffer.length &&
    timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
