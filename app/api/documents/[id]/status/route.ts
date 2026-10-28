import { getPrisma } from '@/lib/prisma';
import { loadUploadStatus } from '@/lib/uploads/document-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const status = await loadUploadStatus(getPrisma(), documentId);
  if (status === null) return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
  return Response.json(status, { headers: { 'cache-control': 'no-store' } });
}
