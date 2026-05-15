export const EMAIL_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

export type AttachmentRejectCode =
  | "attachment_blocked_active_content"
  | "attachment_blocked_archive"
  | "attachment_blocked_executable"
  | "attachment_invalid_data"
  | "attachment_missing_data"
  | "attachment_too_large";

export type AttachmentMetadata = {
  binaryKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileExtension: string | null;
  fileSize: number | null;
};

export type AttachmentSyncError = AttachmentMetadata & {
  path: string;
  code: AttachmentRejectCode;
  reason: string;
  maxFileSize: number | null;
};

type AttachmentRecord = Record<string, unknown>;

const DATA_FIELD_NAMES = new Set(["base64", "content", "data"]);

const BLOCKED_EXTENSIONS = new Set([
  "7z",
  "app",
  "bat",
  "bin",
  "cmd",
  "com",
  "deb",
  "dll",
  "dmg",
  "exe",
  "gz",
  "hta",
  "html",
  "iso",
  "jar",
  "js",
  "lnk",
  "msi",
  "php",
  "ps1",
  "py",
  "rar",
  "reg",
  "sh",
  "svg",
  "tar",
  "vb",
  "vbs",
  "xlsm",
  "zip",
]);

const BLOCKED_MIME_TYPES = new Set([
  "application/javascript",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-msdownload",
  "image/svg+xml",
  "text/html",
  "text/javascript",
]);

export function isAttachmentDataFieldName(value: string) {
  return DATA_FIELD_NAMES.has(value);
}

export function readAttachmentMetadata(
  record: AttachmentRecord,
  binaryKey: string | null,
  dataValue?: unknown,
): AttachmentMetadata {
  const fileName = firstString(record.fileName, record.filename, record.name);
  const explicitExtension = firstString(record.fileExtension, record.extension);

  return {
    binaryKey,
    fileName,
    mimeType: normalizeMimeType(
      firstString(record.mimeType, record.contentType) ??
        mimeTypeFromDataUrl(dataValue),
    ),
    fileExtension: inferExtension(explicitExtension, fileName),
    fileSize: firstNumber(record.fileSize, record.size, record.length),
  };
}

export function emptyAttachmentMetadata(
  binaryKey: string | null,
): AttachmentMetadata {
  return {
    binaryKey,
    fileName: null,
    mimeType: null,
    fileExtension: null,
    fileSize: null,
  };
}

export function buildAttachmentSyncError({
  metadata,
  path,
  code,
  reason,
  maxFileSize = EMAIL_ATTACHMENT_MAX_BYTES,
}: {
  metadata: AttachmentMetadata;
  path: string;
  code: AttachmentRejectCode;
  reason: string;
  maxFileSize?: number | null;
}): AttachmentSyncError {
  return {
    ...metadata,
    path,
    code,
    reason,
    maxFileSize,
  };
}

export function rejectByMetadata(
  metadata: AttachmentMetadata,
): Pick<AttachmentSyncError, "code" | "reason"> | null {
  if (metadata.mimeType?.startsWith("video/")) {
    return {
      code: "attachment_blocked_active_content",
      reason: "video attachments are not accepted by the email sync",
    };
  }

  if (
    (metadata.fileExtension && BLOCKED_EXTENSIONS.has(metadata.fileExtension)) ||
    (metadata.mimeType && BLOCKED_MIME_TYPES.has(metadata.mimeType))
  ) {
    return {
      code: metadata.fileExtension === "zip" ? "attachment_blocked_archive" : "attachment_blocked_active_content",
      reason: "attachment type is blocked",
    };
  }

  return null;
}

export function rejectByBytes(
  metadata: AttachmentMetadata,
  data: Buffer,
): Pick<AttachmentSyncError, "code" | "reason"> | null {
  if (data.length > EMAIL_ATTACHMENT_MAX_BYTES) {
    return {
      code: "attachment_too_large",
      reason: `attachment exceeds ${EMAIL_ATTACHMENT_MAX_BYTES} bytes`,
    };
  }

  if (startsWithBytes(data, [0x4d, 0x5a]) || startsWithBytes(data, [0x7f, 0x45, 0x4c, 0x46])) {
    return {
      code: "attachment_blocked_executable",
      reason: "attachment content matches an executable signature",
    };
  }

  const sample = data.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.startsWith("<script") ||
    sample.startsWith("<svg") ||
    sample.startsWith("#!")
  ) {
    return {
      code: "attachment_blocked_active_content",
      reason: "attachment content matches active content",
    };
  }

  if (
    startsWithBytes(data, [0x50, 0x4b, 0x03, 0x04]) &&
    (metadata.fileExtension === null || metadata.fileExtension === "zip")
  ) {
    return {
      code: "attachment_blocked_archive",
      reason: "archive attachments are blocked",
    };
  }

  return null;
}

export function normalizeBase64(value: string) {
  return value
    .replace(/^data:[^,]+,/, "")
    .replace(/\s/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
}

export function getBase64DecodedLength(base64: string) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizeMimeType(value: string | null) {
  return value?.split(";")[0]?.trim().toLowerCase() || null;
}

function mimeTypeFromDataUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.match(/^data:([^;,]+)[;,]/i)?.[1] ?? null;
}

function inferExtension(explicit: string | null, fileName: string | null) {
  const normalizedExplicit = normalizeExtension(explicit);

  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  return normalizeExtension(fileName?.match(/\.([A-Za-z0-9][A-Za-z0-9_-]{0,31})$/)?.[1] ?? null);
}

function normalizeExtension(value: string | null) {
  const normalized = value?.trim().replace(/^\.+/, "").toLowerCase();
  return normalized && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(normalized)
    ? normalized
    : null;
}

function startsWithBytes(data: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => data[index] === byte);
}

function firstString(...values: unknown[]) {
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

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }

  return null;
}
