import { after } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { createDocumentExtractor } from '@/lib/extraction/create-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';
import { log } from '@/lib/logger';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';
import type { MediaStore } from '@/lib/media/types';
import { getPrisma } from '@/lib/prisma';
import { ingestWhatsAppRequest } from '@/lib/services/document-ingestion';
import { processDocument, type ProcessDeps } from '@/lib/services/document-processing';

export const runtime = 'nodejs';

const defaultMediaStore = new FixtureMediaStore();

type WhatsAppOverrides = {
  db?: PrismaClient;
  extractor?: DocumentExtractor;
  mediaStore?: MediaStore;
  now?: ProcessDeps['now'];
};

export async function POST(request: Request): Promise<Response> {
  return handleWhatsAppPost(request);
}

export async function handleWhatsAppPost(request: Request, overrides: WhatsAppOverrides = {}): Promise<Response> {
  const db = overrides.db ?? getPrisma();
  const extractor = overrides.extractor ?? createDocumentExtractor();
  const mediaStore = overrides.mediaStore ?? defaultMediaStore;
  return ingestWhatsAppRequest(request, {
    db,
    mediaStore,
    schedule(documentId) {
      after(() =>
        processDocument(documentId, { db, extractor, now: overrides.now }).catch((error: unknown) => {
          log.error('whatsapp processing failed', {
            documentId,
            error: error instanceof Error ? error.name : 'unknown',
          });
        }),
      );
    },
  });
}
