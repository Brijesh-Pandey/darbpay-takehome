import { getPrisma } from '@/lib/prisma';

function isPreviewableImage(mimeType: string, content: Uint8Array): boolean {
  if (!mimeType.startsWith('image/') || content.length < 12) return false;
  const png = content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47;
  const jpeg = content[0] === 0xff && content[1] === 0xd8;
  const webp = content[0] === 0x52 && content[1] === 0x49 && content[2] === 0x46 && content[3] === 0x46;
  return png || jpeg || webp;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return new Response('Not found', { status: 404 });
  }
  const row = await getPrisma().document.findUnique({
    where: { id: documentId },
    select: { content: true, mimeType: true },
  });
  if (row === null || !isPreviewableImage(row.mimeType, row.content)) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(Buffer.from(row.content), {
    headers: {
      'content-type': row.mimeType,
      'cache-control': 'no-store',
    },
  });
}
