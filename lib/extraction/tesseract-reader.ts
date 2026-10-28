import { ExtractionError } from '@/lib/extraction/types';
import { readImageWithVision } from '@/lib/extraction/vision-reader';

/** A text layer is not an OCR score, so it stays under the 0.60 auto-match gate. */
export const PDF_TEXT_CONFIDENCE = 0.59;

export type OcrRead = {
  text: string;
  confidence: number;
};

const IMAGES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/x-ms-bmp',
  'image/pbm',
]);

let queue: Promise<unknown> = Promise.resolve();

export function mediaKind(mimeType: string): 'image' | 'pdf' | 'unsupported' {
  const type = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'application/pdf') return 'pdf';
  if (IMAGES.has(type)) return 'image';
  return 'unsupported';
}

/** Reads a photo with Apple Vision, or the text layer of a digital PDF. */
export async function readDocument(file: Buffer, mimeType: string): Promise<OcrRead> {
  const kind = mediaKind(mimeType);
  if (kind === 'unsupported') {
    throw new ExtractionError('UNREADABLE', 'OCR reads a JPEG, PNG, WEBP, BMP, or a PDF with a text layer');
  }
  if (file.length === 0) {
    throw new ExtractionError('UNREADABLE', 'The file is empty');
  }
  if (kind === 'pdf') return readPdf(file);
  return enqueue(() => readImage(file));
}

async function readImage(file: Buffer): Promise<OcrRead> {
  try {
    return await readImageWithVision(file);
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError('UNREADABLE', 'Vision could not read the image');
  }
}

async function readPdf(file: Buffer): Promise<OcrRead> {
  let text = '';
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(file));
    const extracted = await extractText(pdf, { mergePages: true });
    text = extracted.text;
  } catch {
    throw new ExtractionError('UNREADABLE', 'The PDF could not be read');
  }
  if (text.replace(/\s/g, '').length < 8) {
    throw new ExtractionError('UNREADABLE', 'This PDF has no text layer. Send a photo of the page.');
  }
  return { text, confidence: PDF_TEXT_CONFIDENCE };
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
