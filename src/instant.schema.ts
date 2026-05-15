// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
    inboundEmails: i.entity({
      syncKey: i.string().unique().indexed(),
      source: i.string().indexed(),
      messageId: i.string().indexed().optional(),
      uid: i.string().indexed().optional(),
      mailbox: i.string().indexed().optional(),
      subject: i.string().optional(),
      fromText: i.string().optional(),
      toText: i.string().optional(),
      ccText: i.string().optional(),
      bccText: i.string().optional(),
      replyToText: i.string().optional(),
      fromAddress: i.json().optional(),
      toAddress: i.json().optional(),
      ccAddress: i.json().optional(),
      bccAddress: i.json().optional(),
      replyToAddress: i.json().optional(),
      sentAtMs: i.number().indexed().optional(),
      receivedAtMs: i.number().indexed(),
      textPlain: i.string().optional(),
      textHtml: i.string().optional(),
      snippet: i.string().optional(),
      headers: i.json().optional(),
      rawJson: i.json(),
      attachmentCount: i.number(),
      attachmentErrorCount: i.number(),
      attachmentErrors: i.json().optional(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
    inboundEmailAttachments: i.entity({
      attachmentKey: i.string().unique().indexed(),
      binaryKey: i.string().optional(),
      fileName: i.string().optional(),
      mimeType: i.string().optional(),
      fileExtension: i.string().optional(),
      contentId: i.string().optional(),
      contentDisposition: i.string().optional(),
      fileSize: i.number(),
      checksumSha256: i.string().indexed(),
      storagePath: i.string().unique().indexed(),
      createdAtMs: i.number().indexed(),
      updatedAtMs: i.number().indexed(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
    inboundEmailAttachments: {
      forward: {
        on: "inboundEmails",
        has: "many",
        label: "attachments",
      },
      reverse: {
        on: "inboundEmailAttachments",
        has: "one",
        label: "email",
      },
    },
    inboundEmailAttachmentFiles: {
      forward: {
        on: "inboundEmailAttachments",
        has: "one",
        label: "file",
      },
      reverse: {
        on: "$files",
        has: "many",
        label: "emailAttachments",
      },
    },
  },
  rooms: {
    todos: {
      presence: i.entity({}),
    },
  },
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
