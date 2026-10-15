import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { sha256Hex } from '@/lib/extraction/hash';
import { log } from '@/lib/logger';
import { MediaNotFoundError, type MediaStore } from '@/lib/media/types';
import { emailScope, normalizePhone, whatsappScope } from '@/lib/services/sender-scope';
import {
  decodeAttachment,
  emailPayloadSchema,
  isEmailMediaType,
  MAX_ATTACHMENT_BYTES,
  MAX_EMAIL_BODY_CHARS,
  mediaType,
  type EmailPayload,
  type FieldIssue,
} from '@/lib/webhooks/email-payload';
import {
  isWhatsAppImageType,
  MAX_WHATSAPP_BODY_CHARS,
  whatsappMessages,
  whatsappPayloadSchema,
  type WhatsAppMessage,
} from '@/lib/webhooks/whatsapp-payload';

export type IngestedDocument = { documentId: number; result: 'created' | 'duplicate' };

type Schedule = (documentId: number) => void;

type PreparedAttachment = {
  externalId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
  contentHash: string;
};

export async function ingestEmailRequest(
  request: Request,
  deps: { db: PrismaClient; schedule: Schedule },
): Promise<Response> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }
  if (text.length > MAX_EMAIL_BODY_CHARS) {
    return invalid('INVALID_PAYLOAD', [{ path: 'attachments', message: 'Request body is too large' }]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }

  const payload = emailPayloadSchema.safeParse(parsed);
  if (!payload.success) {
    return invalid('INVALID_PAYLOAD', issuesFrom(payload.error));
  }

  const prepared = prepareAttachments(payload.data);
  if ('issues' in prepared) return invalid('INVALID_PAYLOAD', prepared.issues);

  try {
    const documents = await storeAttachments(deps.db, payload.data, prepared, deps.schedule);
    log.info('email webhook accepted', {
      messageId: payload.data.messageId,
      documents: documents.map((document) => ({ documentId: document.documentId, result: document.result })),
    });
    return Response.json({ documents });
  } catch (error) {
    log.error('email webhook store failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }
}

function prepareAttachments(payload: EmailPayload): PreparedAttachment[] | { issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const prepared: PreparedAttachment[] = [];
  for (const [index, attachment] of payload.attachments.entries()) {
    if (!isEmailMediaType(attachment.contentType)) {
      issues.push({
        path: `attachments.${index}.contentType`,
        message: 'Unsupported media type',
      });
      continue;
    }
    const decoded = decodeAttachment(attachment.contentBase64);
    if ('message' in decoded) {
      issues.push({ path: `attachments.${index}.contentBase64`, message: decoded.message });
      continue;
    }
    prepared.push({
      externalId: `${payload.messageId}#${index}`,
      filename: attachment.filename,
      mimeType: mediaType(attachment.contentType),
      bytes: decoded.bytes,
      contentHash: sha256Hex(decoded.bytes),
    });
  }
  if (issues.length > 0) return { issues };
  return prepared;
}

async function storeAttachments(
  db: PrismaClient,
  payload: EmailPayload,
  attachments: PreparedAttachment[],
  schedule: Schedule,
): Promise<IngestedDocument[]> {
  const scope = emailScope(payload.from);
  const receivedAt = new Date(payload.receivedAt);
  return storeDrafts(
    db,
    attachments.map((attachment) => ({
      source: 'EMAIL' as const,
      externalId: attachment.externalId,
      scope,
      senderIdentifier: payload.from,
      contentHash: attachment.contentHash,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      bytes: attachment.bytes,
      receivedAt,
    })),
    schedule,
  );
}

async function findExisting(db: PrismaClient, externalId: string, scope: string, contentHash: string) {
  return db.document.findFirst({
    where: { OR: [{ externalId }, { scope, contentHash }] },
    select: { id: true, status: true },
  });
}

function issuesFrom(error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

type ReceivedDraft = {
  source: 'EMAIL' | 'WHATSAPP';
  externalId: string;
  scope: string;
  senderIdentifier: string;
  contentHash: string;
  filename: string | null;
  mimeType: string;
  bytes: Buffer;
  receivedAt: Date;
};

export async function ingestWhatsAppRequest(
  request: Request,
  deps: { db: PrismaClient; mediaStore: MediaStore; schedule: Schedule },
): Promise<Response> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }
  if (text.length > MAX_WHATSAPP_BODY_CHARS) {
    return invalid('INVALID_PAYLOAD', [{ path: '', message: 'Request body is too large' }]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid('INVALID_JSON', [{ path: '', message: 'Request body is not valid JSON' }]);
  }

  const payload = whatsappPayloadSchema.safeParse(parsed);
  if (!payload.success) return invalid('INVALID_PAYLOAD', issuesFrom(payload.error));

  const messages = whatsappMessages(payload.data);
  let prepared: { drafts: ReceivedDraft[]; skipped: string[] };
  try {
    prepared = await prepareWhatsApp(messages, deps.mediaStore);
  } catch (error) {
    log.error('whatsapp media lookup failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }

  try {
    const documents = await storeDrafts(deps.db, prepared.drafts, deps.schedule);
    log.info('whatsapp webhook accepted', {
      documents: documents.map((document) => ({ documentId: document.documentId, result: document.result })),
      skipped: prepared.skipped,
    });
    return Response.json({ documents });
  } catch (error) {
    log.error('whatsapp webhook store failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }
}

async function prepareWhatsApp(
  messages: WhatsAppMessage[],
  mediaStore: MediaStore,
): Promise<{ drafts: ReceivedDraft[]; skipped: string[] }> {
  const drafts: ReceivedDraft[] = [];
  const skipped: string[] = [];
  for (const message of messages) {
    const draft = await prepareWhatsAppMessage(message, mediaStore, skipped);
    if (draft !== null) drafts.push(draft);
  }
  return { drafts, skipped };
}

async function prepareWhatsAppMessage(
  message: WhatsAppMessage,
  mediaStore: MediaStore,
  skipped: string[],
): Promise<ReceivedDraft | null> {
  if (message.type !== 'image' || message.image === undefined) {
    skipped.push('NOT_IMAGE');
    return null;
  }
  const phone = normalizePhone(message.from);
  if (phone === null) {
    skipped.push('INVALID_PHONE');
    return null;
  }
  const receivedAt = new Date(Number(message.timestamp) * 1000);
  if (Number.isNaN(receivedAt.getTime())) {
    skipped.push('INVALID_TIMESTAMP');
    return null;
  }

  let media;
  try {
    media = await mediaStore.get(message.image.id);
  } catch (error) {
    if (error instanceof MediaNotFoundError) {
      skipped.push('UNKNOWN_MEDIA');
      return null;
    }
    throw error;
  }
  if (!isWhatsAppImageType(media.mimeType)) {
    skipped.push('UNSUPPORTED_MEDIA');
    return null;
  }
  if (media.bytes.length === 0) {
    skipped.push('EMPTY_MEDIA');
    return null;
  }
  if (media.bytes.length > MAX_ATTACHMENT_BYTES) {
    skipped.push('OVERSIZE');
    return null;
  }

  const mimeType = media.mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? media.mimeType;
  return {
    source: 'WHATSAPP',
    externalId: message.id,
    scope: whatsappScope(phone),
    senderIdentifier: phone,
    contentHash: sha256Hex(media.bytes),
    filename: message.image.id,
    mimeType,
    bytes: media.bytes,
    receivedAt,
  };
}

async function storeDrafts(db: PrismaClient, drafts: ReceivedDraft[], schedule: Schedule): Promise<IngestedDocument[]> {
  const documents: IngestedDocument[] = [];
  const scheduled: number[] = [];
  for (const draft of drafts) {
    const saved = await saveReceivedDocument(db, draft);
    documents.push({ documentId: saved.id, result: saved.result });
    if (saved.status === 'RECEIVED') scheduled.push(saved.id);
  }
  for (const documentId of scheduled) schedule(documentId);
  return documents;
}

async function saveReceivedDocument(
  db: PrismaClient,
  draft: ReceivedDraft,
): Promise<{ id: number; result: 'created' | 'duplicate'; status: string }> {
  const existing = await findExisting(db, draft.externalId, draft.scope, draft.contentHash);
  if (existing !== null) return { id: existing.id, result: 'duplicate', status: existing.status };
  try {
    const created = await db.document.create({
      data: {
        source: draft.source,
        externalId: draft.externalId,
        scope: draft.scope,
        contentHash: draft.contentHash,
        senderIdentifier: draft.senderIdentifier,
        status: 'RECEIVED',
        filename: draft.filename,
        mimeType: draft.mimeType,
        content: new Uint8Array(draft.bytes),
        receivedAt: draft.receivedAt,
      },
    });
    return { id: created.id, result: 'created', status: created.status };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const raced = await findExisting(db, draft.externalId, draft.scope, draft.contentHash);
    if (raced === null) throw error;
    return { id: raced.id, result: 'duplicate', status: raced.status };
  }
}

function invalid(error: 'INVALID_JSON' | 'INVALID_PAYLOAD', issues: FieldIssue[]): Response {
  return Response.json({ error, issues }, { status: 400 });
}
