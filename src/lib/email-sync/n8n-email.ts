import { createHash } from "node:crypto";
import {
  buildAttachmentSyncError,
  EMAIL_ATTACHMENT_MAX_BYTES,
  emptyAttachmentMetadata,
  getBase64DecodedLength,
  isAttachmentDataFieldName,
  normalizeBase64,
  readAttachmentMetadata,
  rejectByBytes,
  rejectByMetadata,
  type AttachmentSyncError,
} from "./attachment-policy";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };
type UnknownRecord = Record<string, unknown>;

export class EmailWebhookPayloadError extends Error {
  constructor(readonly issues: string[]) {
    super("Invalid n8n email webhook payload");
    this.name = "EmailWebhookPayloadError";
  }
}

export type UploadableEmailAttachment = {
  attachmentKey: string;
  binaryKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileExtension: string | null;
  contentId: string | null;
  contentDisposition: string | null;
  fileSize: number;
  checksumSha256: string;
  data: Buffer;
};

export type NormalizedInboundEmail = {
  syncKey: string;
  source: string;
  messageId: string | null;
  uid: string | null;
  mailbox: string | null;
  subject: string | null;
  fromText: string | null;
  toText: string | null;
  ccText: string | null;
  bccText: string | null;
  replyToText: string | null;
  fromAddress: JsonValue | null;
  toAddress: JsonValue | null;
  ccAddress: JsonValue | null;
  bccAddress: JsonValue | null;
  replyToAddress: JsonValue | null;
  sentAtMs: number | null;
  receivedAtMs: number;
  textPlain: string | null;
  textHtml: string | null;
  snippet: string | null;
  headers: JsonValue | null;
  rawJson: JsonValue;
  attachments: UploadableEmailAttachment[];
  attachmentErrors: AttachmentSyncError[];
};

export function normalizeN8nEmailPayload(
  payload: unknown,
): NormalizedInboundEmail[] {
  const issues: string[] = [];
  const items = extractWebhookItems(payload);

  if (items.length === 0) {
    throw new EmailWebhookPayloadError(["payload must contain at least one email"]);
  }

  const emails = items.map((item, index) =>
    normalizeEmailItem(item, `items[${index}]`, issues),
  );

  if (issues.length > 0) {
    throw new EmailWebhookPayloadError(issues);
  }

  return emails;
}

function extractWebhookItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [payload];
  }

  if (Array.isArray(payload.items)) {
    return payload.items;
  }

  if (Array.isArray(payload.data) && payload.data.every(looksLikeN8nItem)) {
    return payload.data;
  }

  if (isRecord(payload.body)) {
    if (Array.isArray(payload.body.items)) {
      return payload.body.items;
    }

    if (looksLikeN8nItem(payload.body)) {
      return [payload.body];
    }
  }

  return [payload];
}

function looksLikeN8nItem(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    (isRecord(value.json) || isRecord(value.email) || isRecord(value.binary))
  );
}

function normalizeEmailItem(
  item: unknown,
  path: string,
  issues: string[],
): NormalizedInboundEmail {
  if (!isRecord(item)) {
    issues.push(`${path} must be an object`);
    return emptyEmail();
  }

  const json = getEmailJson(item);
  const headers = isRecord(json.headers) ? json.headers : null;
  const rawJson = sanitizeRawJson(json);
  const messageId = firstString(
    json.messageId,
    json.messageID,
    json["message-id"],
    readHeader(headers, "message-id"),
  );
  const uid = firstString(
    json.uid,
    getNested(json, "attributes", "uid"),
    getNested(json, "metadata", "uid"),
  );
  const mailbox = firstString(
    json.mailbox,
    json.folder,
    getNested(json, "metadata", "mailbox"),
  );
  const sentAtMs = firstTimestamp(json.date, json.sentAt, json.sentDate);
  const receivedAtMs =
    firstTimestamp(json.receivedAt, json.receivedDate) ?? Date.now();
  const fromAddress = toJsonValue(json.from ?? json.fromAddress);
  const toAddress = toJsonValue(json.to ?? json.toAddress);
  const ccAddress = toJsonValue(json.cc ?? json.ccAddress);
  const bccAddress = toJsonValue(json.bcc ?? json.bccAddress);
  const replyToAddress = toJsonValue(
    json.replyTo ?? json.replyToAddress ?? json.reply_to,
  );
  const textPlain = firstString(json.textPlain, json.text, json.plainText);
  const textHtml = firstString(json.textHtml, json.html, json.textAsHtml);
  const subject = firstString(json.subject);
  const syncKey = buildEmailSyncKey({
    messageId,
    uid,
    mailbox,
    subject,
    fromAddress,
    sentAtMs,
    rawJson,
  });
  const attachmentErrors: AttachmentSyncError[] = [];
  const attachments = normalizeAttachments({
    syncKey,
    binary: getBinaryData(item),
    jsonAttachments: json.attachments,
    path,
    attachmentErrors,
  });

  return {
    syncKey,
    source: "n8n_email_trigger",
    messageId,
    uid,
    mailbox,
    subject,
    fromText: addressText(fromAddress),
    toText: addressText(toAddress),
    ccText: addressText(ccAddress),
    bccText: addressText(bccAddress),
    replyToText: addressText(replyToAddress),
    fromAddress,
    toAddress,
    ccAddress,
    bccAddress,
    replyToAddress,
    sentAtMs,
    receivedAtMs,
    textPlain,
    textHtml,
    snippet: makeSnippet(textPlain ?? textHtml),
    headers: toJsonValue(json.headers),
    rawJson,
    attachments,
    attachmentErrors,
  };
}

function getEmailJson(item: UnknownRecord): UnknownRecord {
  if (isRecord(item.json)) {
    return item.json;
  }

  if (isRecord(item.email)) {
    return item.email;
  }

  if (isRecord(item.body) && isRecord(item.body.json)) {
    return item.body.json;
  }

  if (isRecord(item.body) && isRecord(item.body.email)) {
    return item.body.email;
  }

  return item;
}

function getBinaryData(item: UnknownRecord): UnknownRecord | null {
  if (isRecord(item.binary)) {
    return item.binary;
  }

  if (isRecord(item.body) && isRecord(item.body.binary)) {
    return item.body.binary;
  }

  if (isRecord(item.attachments) && !Array.isArray(item.attachments)) {
    return item.attachments;
  }

  return null;
}

function normalizeAttachments({
  syncKey,
  binary,
  jsonAttachments,
  path,
  attachmentErrors,
}: {
  syncKey: string;
  binary: UnknownRecord | null;
  jsonAttachments: unknown;
  path: string;
  attachmentErrors: AttachmentSyncError[];
}) {
  const attachments: UploadableEmailAttachment[] = [];

  if (binary) {
    for (const [binaryKey, value] of Object.entries(binary)) {
      appendAttachment({
        attachments,
        attachmentErrors,
        syncKey,
        binaryKey,
        value,
        encoded: isRecord(value) ? value.data : undefined,
        path: `${path}.binary.${binaryKey}`,
      });
    }
  }

  if (Array.isArray(jsonAttachments)) {
    jsonAttachments.forEach((value, index) => {
      const binaryKey = isRecord(value)
        ? firstString(value.binaryKey, value.name) ?? `attachment_${index}`
        : `attachment_${index}`;

      appendAttachment({
        attachments,
        attachmentErrors,
        syncKey,
        binaryKey,
        value,
        encoded: isRecord(value)
          ? value.data ?? value.content ?? value.base64
          : undefined,
        path: `${path}.json.attachments[${index}]`,
      });
    });
  }

  return attachments;
}

function appendAttachment({
  attachments,
  attachmentErrors,
  syncKey,
  binaryKey,
  value,
  encoded,
  path,
}: {
  attachments: UploadableEmailAttachment[];
  attachmentErrors: AttachmentSyncError[];
  syncKey: string;
  binaryKey: string | null;
  value: unknown;
  encoded: unknown;
  path: string;
}) {
  if (!isRecord(value)) {
    attachmentErrors.push(
      buildAttachmentSyncError({
        metadata: emptyAttachmentMetadata(binaryKey),
        path,
        code: "attachment_invalid_data",
        reason: "attachment metadata must be an object",
        maxFileSize: null,
      }),
    );
    return;
  }

  const metadata = readAttachmentMetadata(value, binaryKey, encoded);
  const metadataBlock = rejectByMetadata(metadata);

  if (metadataBlock) {
    attachmentErrors.push(
      buildAttachmentSyncError({ metadata, path, ...metadataBlock }),
    );
    return;
  }

  const data = decodeAttachmentBytes(encoded, value, metadata, path, attachmentErrors);

  if (!data) {
    return;
  }

  const bytesBlock = rejectByBytes(metadata, data);

  if (bytesBlock) {
    attachmentErrors.push(
      buildAttachmentSyncError({
        metadata: { ...metadata, fileSize: data.length },
        path,
        ...bytesBlock,
      }),
    );
    return;
  }

  const checksumSha256 = createHash("sha256").update(data).digest("hex");
  const attachmentKey = createHash("sha256")
    .update(`${syncKey}:${binaryKey ?? attachments.length}:${checksumSha256}`)
    .digest("hex");

  attachments.push({
    attachmentKey,
    binaryKey: metadata.binaryKey,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    fileExtension: metadata.fileExtension,
    contentId: firstString(value.contentId, value.cid, value.id),
    contentDisposition: firstString(value.contentDisposition, value.disposition),
    fileSize: data.length,
    checksumSha256,
    data,
  });
}

function decodeAttachmentBytes(
  encoded: unknown,
  record: UnknownRecord,
  metadata: ReturnType<typeof readAttachmentMetadata>,
  path: string,
  attachmentErrors: AttachmentSyncError[],
) {
  const expectedSize = metadata.fileSize;

  if (expectedSize !== null && expectedSize > EMAIL_ATTACHMENT_MAX_BYTES) {
    attachmentErrors.push(
      buildAttachmentSyncError({
        metadata,
        path,
        code: "attachment_too_large",
        reason: `attachment exceeds ${EMAIL_ATTACHMENT_MAX_BYTES} bytes`,
      }),
    );
    return null;
  }

  if (encoded === undefined || encoded === null) {
    attachmentErrors.push(
      buildAttachmentSyncError({
        metadata,
        path,
        code: "attachment_missing_data",
        reason: "attachment has metadata but no uploadable data",
      }),
    );
    return null;
  }

  if (typeof encoded === "string") {
    const base64 = normalizeBase64(encoded);

    if (base64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      attachmentErrors.push(
        buildAttachmentSyncError({
          metadata,
          path,
          code: "attachment_invalid_data",
          reason: "attachment data is not valid base64",
        }),
      );
      return null;
    }

    if (getBase64DecodedLength(base64) > EMAIL_ATTACHMENT_MAX_BYTES) {
      attachmentErrors.push(
        buildAttachmentSyncError({
          metadata,
          path,
          code: "attachment_too_large",
          reason: `attachment exceeds ${EMAIL_ATTACHMENT_MAX_BYTES} bytes`,
        }),
      );
      return null;
    }

    return Buffer.from(base64, "base64");
  }

  if (Array.isArray(encoded) && encoded.every(isByte)) {
    return Buffer.from(encoded);
  }

  if (
    isRecord(encoded) &&
    encoded.type === "Buffer" &&
    Array.isArray(encoded.data) &&
    encoded.data.every(isByte)
  ) {
    return Buffer.from(encoded.data);
  }

  if (record.data !== encoded) {
    return decodeAttachmentBytes(record.data, record, metadata, path, attachmentErrors);
  }

  attachmentErrors.push(
    buildAttachmentSyncError({
      metadata,
      path,
      code: "attachment_invalid_data",
      reason: "attachment data must be base64 or a byte array",
      maxFileSize: null,
    }),
  );
  return null;
}

function buildEmailSyncKey(input: {
  messageId: string | null;
  uid: string | null;
  mailbox: string | null;
  subject: string | null;
  fromAddress: JsonValue | null;
  sentAtMs: number | null;
  rawJson: JsonValue;
}) {
  if (input.messageId) {
    return `message:${input.messageId.toLowerCase()}`;
  }

  if (input.uid) {
    return `uid:${input.mailbox ?? "mailbox"}:${input.uid}`;
  }

  const fingerprint = JSON.stringify({
    subject: input.subject,
    fromAddress: input.fromAddress,
    sentAtMs: input.sentAtMs,
    rawJson: input.rawJson,
  });

  return `hash:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function readHeader(headers: UnknownRecord | null, name: string): unknown {
  const entry = headers
    ? Object.entries(headers).find(([key]) => key.toLowerCase() === name)
    : null;

  return Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1];
}

function getNested(record: UnknownRecord, ...keys: string[]): unknown {
  let value: unknown = record;

  for (const key of keys) {
    if (!isRecord(value)) {
      return undefined;
    }

    value = value[key];
  }

  return value;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function firstTimestamp(...values: unknown[]): number | null {
  for (const value of values) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.getTime();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized ? (JSON.parse(serialized) as JsonValue) : null;
  } catch {
    return null;
  }
}

function sanitizeRawJson(value: unknown): JsonValue {
  const json = toJsonValue(value);

  if (!isJsonObject(json)) {
    return json ?? {};
  }

  if (!Array.isArray(json.attachments)) {
    return json;
  }

  return {
    ...json,
    attachments: json.attachments.map((attachment) => {
      if (!isJsonObject(attachment)) {
        return attachment;
      }

      const clean: JsonObject = {};
      let stripped = false;

      for (const [key, entry] of Object.entries(attachment)) {
        if (isAttachmentDataFieldName(key)) {
          stripped = true;
          continue;
        }

        clean[key] = entry;
      }

      return stripped ? { ...clean, attachmentDataRemoved: true } : clean;
    }),
  };
}

function addressText(value: JsonValue | null): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(addressText).filter(Boolean).join(", ") || null;
  }

  if (typeof value === "object") {
    const address = firstString(value.address, value.email);
    const name = firstString(value.name);

    if (name && address) {
      return `${name} <${address}>`;
    }

    return address ?? name ?? JSON.stringify(value);
  }

  return String(value);
}

function makeSnippet(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function emptyEmail(): NormalizedInboundEmail {
  const now = Date.now();

  return {
    syncKey: `invalid:${now}`,
    source: "n8n_email_trigger",
    messageId: null,
    uid: null,
    mailbox: null,
    subject: null,
    fromText: null,
    toText: null,
    ccText: null,
    bccText: null,
    replyToText: null,
    fromAddress: null,
    toAddress: null,
    ccAddress: null,
    bccAddress: null,
    replyToAddress: null,
    sentAtMs: null,
    receivedAtMs: now,
    textPlain: null,
    textHtml: null,
    snippet: null,
    headers: null,
    rawJson: {},
    attachments: [],
    attachmentErrors: [],
  };
}

function isJsonObject(value: JsonValue | null): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isByte(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}
