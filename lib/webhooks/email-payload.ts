import { z } from 'zod';

export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EMAIL_BODY_CHARS = 15 * 1024 * 1024;

export const EMAIL_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;

const emailAddress = z.string().trim().toLowerCase().email();

export const emailPayloadSchema = z
  .object({
    messageId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .refine((value) => !value.includes('#'), 'messageId cannot contain #'),
    from: emailAddress,
    to: emailAddress,
    subject: z.string().max(500),
    receivedAt: z.string().datetime(),
    attachments: z
      .array(
        z
          .object({
            filename: z.string().trim().min(1).max(255),
            contentType: z.string().trim().min(1).max(255),
            contentBase64: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ATTACHMENTS),
  })
  .strict();

export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export type FieldIssue = { path: string; message: string };

export function mediaType(contentType: string): string {
  const [type] = contentType.split(';');
  return (type ?? '').trim().toLowerCase();
}

export function isEmailMediaType(contentType: string): boolean {
  return EMAIL_MEDIA_TYPES.some((allowed) => allowed === mediaType(contentType));
}

export function decodeAttachment(contentBase64: string): { bytes: Buffer } | { message: string } {
  const maxEncoded = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4;
  if (contentBase64.length > maxEncoded) return { message: 'Attachment is larger than 10 MiB' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) {
    return { message: 'Attachment is not valid base64' };
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length === 0) return { message: 'Attachment is empty' };
  if (bytes.length > MAX_ATTACHMENT_BYTES) return { message: 'Attachment is larger than 10 MiB' };
  return { bytes };
}
