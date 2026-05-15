"use client";

import { useMemo, useState } from "react";
import { type AppSchema } from "@/instant.schema";
import { db } from "@/lib/db";
import { type InstaQLEntity } from "@instantdb/react";

type Email = InstaQLEntity<
  AppSchema,
  "inboundEmails",
  { attachments: { file: {} } }
>;

const inboxQuery = {
  inboundEmails: {
    $: {
      order: { receivedAtMs: "desc" },
      limit: 100,
    },
    attachments: {
      file: {},
    },
  },
} as const;

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isLoading, error, data } = db.useQuery(inboxQuery);
  const emails = data?.inboundEmails ?? [];
  const selectedEmail = useMemo(
    () => emails.find((email) => email.id === selectedId) ?? emails[0] ?? null,
    [emails, selectedId],
  );

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#202124]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#d8d2c7] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b665f]">
              Instant mail sync
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-[#202124]">
              Inbound email
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[#cfc7bb] bg-white px-3 py-2 text-sm text-[#4d4943] shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#2f9e6d]" />
            {emails.length} synced
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error.message}
          </div>
        ) : (
          <section className="grid flex-1 gap-4 py-4 lg:grid-cols-[390px_1fr]">
            <EmailList
              emails={emails}
              isLoading={isLoading}
              selectedId={selectedEmail?.id ?? null}
              onSelect={setSelectedId}
            />
            <EmailDetail email={selectedEmail} isLoading={isLoading} />
          </section>
        )}
      </div>
    </main>
  );
}

function EmailList({
  emails,
  isLoading,
  selectedId,
  onSelect,
}: {
  emails: Email[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <aside className="rounded-md border border-[#d8d2c7] bg-white p-4 shadow-sm">
        <div className="h-5 w-32 animate-pulse rounded bg-[#e6e0d6]" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-md border border-[#ece7df] p-3">
              <div className="h-4 w-2/3 animate-pulse rounded bg-[#e6e0d6]" />
              <div className="h-3 w-full animate-pulse rounded bg-[#eee9e1]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#eee9e1]" />
            </div>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="overflow-hidden rounded-md border border-[#d8d2c7] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#ece7df] px-4 py-3">
        <h2 className="text-sm font-semibold text-[#202124]">Messages</h2>
        <span className="text-xs text-[#6b665f]">Latest 100</span>
      </div>
      <div className="max-h-[calc(100vh-164px)] overflow-y-auto">
        {emails.length === 0 ? (
          <div className="p-5 text-sm leading-6 text-[#6b665f]">
            No messages yet. Point n8n at{" "}
            <code className="rounded bg-[#f0ebe3] px-1.5 py-0.5 text-[#2f4668]">
              /api/webhooks/n8n/email
            </code>
            .
          </div>
        ) : (
          emails.map((email) => (
            <button
              key={email.id}
              type="button"
              onClick={() => onSelect(email.id)}
              className={`block w-full border-b border-[#f0ebe3] px-4 py-3 text-left transition ${
                email.id === selectedId
                  ? "bg-[#edf4f1]"
                  : "bg-white hover:bg-[#faf8f4]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-[#202124]">
                  {email.fromText || "Unknown sender"}
                </p>
                <time className="shrink-0 text-xs text-[#766f65]">
                  {formatShortDate(email.sentAtMs ?? email.receivedAtMs)}
                </time>
              </div>
              <p className="mt-1 truncate text-sm text-[#383b3d]">
                {email.subject || "(no subject)"}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-[#6b665f]">
                  {email.snippet || "No preview text"}
                </p>
                {email.attachmentCount > 0 ? (
                  <span className="shrink-0 rounded bg-[#efe8db] px-1.5 py-0.5 text-xs text-[#725b2d]">
                    {email.attachmentCount}
                  </span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

function EmailDetail({
  email,
  isLoading,
}: {
  email: Email | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <article className="rounded-md border border-[#d8d2c7] bg-white p-6 shadow-sm">
        <div className="h-8 w-2/3 animate-pulse rounded bg-[#e6e0d6]" />
        <div className="mt-5 h-4 w-1/3 animate-pulse rounded bg-[#eee9e1]" />
        <div className="mt-8 space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-[#eee9e1]" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-[#eee9e1]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[#eee9e1]" />
        </div>
      </article>
    );
  }

  if (!email) {
    return (
      <article className="flex min-h-[420px] items-center justify-center rounded-md border border-[#d8d2c7] bg-white p-6 text-sm text-[#6b665f] shadow-sm">
        Waiting for the first synced email.
      </article>
    );
  }

  const attachments = email.attachments ?? [];

  return (
    <article className="overflow-hidden rounded-md border border-[#d8d2c7] bg-white shadow-sm">
      <div className="border-b border-[#ece7df] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-semibold tracking-normal text-[#202124]">
              {email.subject || "(no subject)"}
            </h2>
            <p className="mt-2 text-sm text-[#5f5a52]">
              {email.fromText || "Unknown sender"}
            </p>
          </div>
          <time className="rounded-md border border-[#ded7cb] px-3 py-2 text-sm text-[#4d4943]">
            {formatFullDate(email.sentAtMs ?? email.receivedAtMs)}
          </time>
        </div>
        <dl className="mt-5 grid gap-2 text-sm text-[#4d4943] sm:grid-cols-2">
          <HeaderField label="To" value={email.toText} />
          <HeaderField label="Mailbox" value={email.mailbox} />
          <HeaderField label="Message ID" value={email.messageId} />
          <HeaderField label="UID" value={email.uid} />
        </dl>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
        <div className="min-h-[420px] px-5 py-5">
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-[#2f3335]">
            {email.textPlain || email.snippet || stripHtml(email.textHtml) || "No message body was included."}
          </pre>
        </div>

        <aside className="border-t border-[#ece7df] bg-[#faf8f4] p-4 lg:border-l lg:border-t-0">
          <h3 className="text-sm font-semibold text-[#202124]">Attachments</h3>
          {attachments.length === 0 ? (
            <p className="mt-3 text-sm text-[#6b665f]">No stored attachments.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={attachment.file?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-[#ded7cb] bg-white p-3 text-sm hover:border-[#97b7a5]"
                >
                  <span className="block truncate font-medium text-[#202124]">
                    {attachment.fileName || attachment.binaryKey || "Attachment"}
                  </span>
                  <span className="mt-1 block text-xs text-[#6b665f]">
                    {attachment.mimeType || "file"} · {formatBytes(attachment.fileSize)}
                  </span>
                </a>
              ))}
            </div>
          )}

          {email.attachmentErrorCount > 0 ? (
            <div className="mt-5 rounded-md border border-[#e3c28d] bg-[#fff7e8] p-3">
              <p className="text-sm font-medium text-[#704d16]">
                {email.attachmentErrorCount} attachment issue
              </p>
              <p className="mt-1 text-xs leading-5 text-[#856024]">
                Some attachments were skipped by the server policy.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

function HeaderField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[#faf8f4] px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-[#827a70]">
        {label}
      </dt>
      <dd className="mt-1 truncate text-[#2f3335]">{value || "Not provided"}</dd>
    </div>
  );
}

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatFullDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function stripHtml(value: string | null | undefined) {
  return (
    value
      ?.replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ?? null
  );
}
