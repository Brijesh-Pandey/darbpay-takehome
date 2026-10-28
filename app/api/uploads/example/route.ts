import { z } from 'zod';
import { handleEmailPost } from '@/app/api/webhooks/email/route';
import { prepareExampleReceipt } from '@/lib/uploads/prepare-upload';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const exampleSchema = z
  .object({
    example: z.enum(['harbor-sar', 'blue-usd']),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON', issues: [{ path: '', message: 'Request body is not valid JSON' }] }, { status: 400 });
  }

  const body = exampleSchema.safeParse(parsed);
  if (!body.success) {
    return Response.json(
      {
        error: 'INVALID_PAYLOAD',
        issues: body.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const prepared = await prepareExampleReceipt(body.data.example);
    return handleEmailPost(prepared.request);
  } catch (error) {
    log.error('example upload failed', { error: error instanceof Error ? error.name : 'unknown' });
    return Response.json({ error: 'STORE_FAILED' }, { status: 503 });
  }
}
