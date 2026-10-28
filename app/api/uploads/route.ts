import { handleEmailPost } from '@/app/api/webhooks/email/route';
import { prepareUploadedReceipt } from '@/lib/uploads/prepare-upload';
import type { FieldIssue } from '@/lib/webhooks/email-payload';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return invalid([{ path: 'file', message: 'Expected a file upload' }]);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return invalid([{ path: 'file', message: 'Choose a bill to upload' }]);

  const prepared = await prepareUploadedReceipt(file);
  if ('issues' in prepared) return invalid(prepared.issues);
  return handleEmailPost(prepared.request);
}

function invalid(issues: FieldIssue[]): Response {
  return Response.json({ error: 'INVALID_PAYLOAD', issues }, { status: 400 });
}
