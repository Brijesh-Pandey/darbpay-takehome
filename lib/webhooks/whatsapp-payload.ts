import { z } from 'zod';

export const MAX_WHATSAPP_BODY_CHARS = 1024 * 1024;
export const MAX_WHATSAPP_MESSAGES = 20;
export const WHATSAPP_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const imageSchema = z.object({
  id: z.string().trim().min(1).max(200),
  mime_type: z.string().trim().min(1).max(255),
  sha256: z.string().trim().min(1).max(128),
});

const messageSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    from: z.string().trim().min(1).max(40),
    timestamp: z.string().regex(/^\d{1,13}$/),
    type: z.string().trim().min(1).max(32),
    image: imageSchema.optional(),
  })
  .superRefine((message, ctx) => {
    if (message.type === 'image' && message.image === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['image'], message: 'An image message needs an image' });
    }
  });

export const whatsappPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                messages: z.array(messageSchema).max(MAX_WHATSAPP_MESSAGES).optional(),
              }),
            }),
          )
          .max(10),
      }),
    )
    .max(10),
});

export type WhatsAppPayload = z.infer<typeof whatsappPayloadSchema>;
export type WhatsAppMessage = WhatsAppPayload['entry'][number]['changes'][number]['value']['messages'] extends
  | Array<infer Message>
  | undefined
  ? Message
  : never;

export function whatsappMessages(payload: WhatsAppPayload): WhatsAppMessage[] {
  return payload.entry.flatMap((entry) => entry.changes.flatMap((change) => change.value.messages ?? []));
}

export function isWhatsAppImageType(mimeType: string): boolean {
  const [type] = mimeType.split(';');
  const normalized = (type ?? '').trim().toLowerCase();
  return WHATSAPP_IMAGE_TYPES.some((allowed) => allowed === normalized);
}
