import { after } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { createDocumentExtractor } from '@/lib/extraction/create-extractor';
import type { DocumentExtractor } from '@/lib/extraction/types';
import { log } from '@/lib/logger';
import { getPrisma } from '@/lib/prisma';
import { ingestEmailRequest } from '@/lib/services/document-ingestion';
import { processDocument, type ProcessDeps } from '@/lib/services/document-processing';

export const runtime = 'nodejs';

type EmailOverrides = {
  db?: PrismaClient;
  extractor?: DocumentExtractor;
  now?: ProcessDeps['now'];
};

export async function POST(request: Request): Promise<Response> {
  return handleEmailPost(request);
}

export async function handleEmailPost(request: Request, overrides: EmailOverrides = {}): Promise<Response> {
  const db = overrides.db ?? getPrisma();
  const extractor = overrides.extractor ?? createDocumentExtractor();
  return ingestEmailRequest(request, {
    db,
    schedule(documentId) {
      after(() =>
        processDocument(documentId, { db, extractor, now: overrides.now }).catch((error: unknown) => {
          log.error('email processing failed', {
            documentId,
            error: error instanceof Error ? error.name : 'unknown',
          });
        }),
      );
    },
  });
}
