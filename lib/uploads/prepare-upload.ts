import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isEmailMediaType,
  MAX_ATTACHMENT_BYTES,
  mediaType,
  type FieldIssue,
} from '@/lib/webhooks/email-payload';

/** Seeded mailbox for Northline Logistics. An upload is stored as mail from this sender. */
export const UPLOAD_SENDER = 'billing@alfanar-fuel.com.sa';

const UPLOAD_RECIPIENT = 'receipts@darb.example.com';

const EXTENSION_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

export const UPLOAD_EXAMPLES = {
  'harbor-sar': 'harbor-coffee-sar.png',
  'blue-usd': 'blue-bottle-usd.png',
} as const;

export type UploadExample = keyof typeof UPLOAD_EXAMPLES;

export type PreparedUpload = { request: Request };

export async function prepareUploadedReceipt(file: File): Promise<PreparedUpload | { issues: FieldIssue[] }> {
  const filename = safeFilename(file.name);
  const contentType = resolveContentType(file.type, filename);
  if (!isEmailMediaType(contentType)) {
    return { issues: [{ path: 'file', message: 'Use a PNG, JPEG, WEBP, or PDF' }] };
  }
  if (file.size === 0) return { issues: [{ path: 'file', message: 'The file is empty' }] };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { issues: [{ path: 'file', message: 'The file is larger than 10 MiB' }] };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) return { issues: [{ path: 'file', message: 'The file is empty' }] };
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    return { issues: [{ path: 'file', message: 'The file is larger than 10 MiB' }] };
  }

  return { request: emailRequest(filename, contentType, bytes) };
}

export async function prepareExampleReceipt(example: UploadExample): Promise<PreparedUpload> {
  const filename = UPLOAD_EXAMPLES[example];
  const bytes = await readFile(path.join(process.cwd(), 'fixtures', 'demo', filename));
  const file = new File([new Uint8Array(bytes)], filename, { type: 'image/png' });
  const prepared = await prepareUploadedReceipt(file);
  if ('issues' in prepared) throw new Error(prepared.issues.map((issue) => issue.message).join('; '));
  return prepared;
}

function emailRequest(filename: string, contentType: string, bytes: Buffer): Request {
  const payload = {
    messageId: `upload-${randomUUID()}`,
    from: UPLOAD_SENDER,
    to: UPLOAD_RECIPIENT,
    subject: 'Uploaded receipt',
    receivedAt: new Date().toISOString(),
    attachments: [
      {
        filename,
        contentType,
        contentBase64: bytes.toString('base64'),
      },
    ],
  };
  return new Request('http://localhost/api/webhooks/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function resolveContentType(declared: string, filename: string): string {
  const parsed = mediaType(declared);
  if (isEmailMediaType(parsed)) return parsed;
  const extension = path.extname(filename).toLowerCase();
  return EXTENSION_TYPES[extension] ?? parsed;
}

function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() ?? '';
  const cleaned = base.replace(/[^\w.\- ]+/g, '').slice(0, 180).trim();
  return cleaned.length > 0 ? cleaned : 'receipt';
}
