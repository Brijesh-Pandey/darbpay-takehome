import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExtractionError } from '@/lib/extraction/types';
import type { OcrRead } from '@/lib/extraction/tesseract-reader';

type PaperBox = { left: number; top: number; width: number; height: number };

type Recognition = { text: string; confidence: number };

/** Reads a photo with the macOS Vision text engine. The original bytes stay stored. */
export async function readImageWithVision(file: Buffer): Promise<OcrRead> {
  const prepared = await preparePhoto(file);
  const bin = await visionBinary();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'darb-vision-page-'));
  try {
    const imagePath = path.join(dir, 'page.png');
    await writeFile(imagePath, prepared);
    const primary = await recognize(bin, imagePath);
    const text = await recoverWrappedVat(bin, prepared, dir, primary.text);
    if (text.trim() === '') {
      throw new ExtractionError('UNREADABLE', 'Vision found no text on the photo');
    }
    return { text, confidence: primary.confidence };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function preparePhoto(file: Buffer): Promise<Buffer> {
  try {
    const loaded = await import('sharp');
    const source = loaded.default(file, { failOn: 'none' }).rotate();
    const meta = await source.clone().metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    let next = source.clone();
    if (width >= 120 && height >= 120) {
      const box = await findPaper(source.clone(), width, height);
      if (box !== null) next = source.clone().extract(box);
    }
    const sizedMeta = await next.clone().metadata();
    const sizedWidth = sizedMeta.width ?? 0;
    const sized = sizedWidth > 0 && sizedWidth < 1600 ? next.resize({ width: 1600 }) : next;
    return await sized.png().toBuffer();
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    return file;
  }
}

async function findPaper(
  image: { raw: () => { toBuffer: (options: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> } },
  width: number,
  height: number,
): Promise<PaperBox | null> {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * channels;
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      if (red <= 210 || green <= 210 || blue <= 210) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (count < 500) return null;
  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const boxWidth = Math.min(info.width - left, maxX - minX + pad * 2);
  const boxHeight = Math.min(info.height - top, maxY - minY + pad * 2);
  if (boxWidth < 60 || boxHeight < height * 0.45) return null;
  if (boxWidth > width * 0.82) return null;
  return { left, top, width: boxWidth, height: boxHeight };
}

const VAT_LABEL = /\b(?:vat|trn|tax\s*(?:id|number|no\.?))\b/i;

/** A closer crop recovers a wrapped VAT tail and an amount line the full page dropped. */
async function recoverWrappedVat(bin: string, prepared: Buffer, dir: string, text: string): Promise<string> {
  const needsVat = !new RegExp(`${VAT_LABEL.source}[\\s\\S]{0,40}?\\d{15}(?!\\d)`, 'i').test(text);
  const needsAmount = !hasPayable(text);
  if (!needsVat && !needsAmount) return text;
  const loaded = await import('sharp');
  const meta = await loaded.default(prepared).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 40 || height < 80) return text;
  const sliceHeight = Math.max(140, Math.floor(height * 0.12));
  const step = Math.max(70, Math.floor(sliceHeight * 0.5));
  const vatNumbers: string[] = [];
  const amounts: string[] = [];
  for (let top = 0, index = 0; top < height; top += step, index += 1) {
    const bandHeight = Math.min(sliceHeight, height - top);
    if (bandHeight < 40) break;
    const band = await loaded
      .default(prepared)
      .extract({ left: 0, top, width, height: bandHeight })
      .resize({ height: 900 })
      .png()
      .toBuffer();
    const bandPath = path.join(dir, `band-${index}.png`);
    await writeFile(bandPath, band);
    const read = await recognize(bin, bandPath);
    if (needsVat) {
      const vat = completedVat(read.text);
      if (vat !== null) vatNumbers.push(vat);
    }
    if (needsAmount) {
      for (const line of read.text.split('\n')) {
        if (/\bamount\b/i.test(line) && /\d+[.,]\d{2}/.test(line)) amounts.push(line.trim());
      }
    }
  }
  const extra: string[] = [];
  const vat = mostCommon(vatNumbers);
  if (vat !== null) extra.push(vat);
  const amount = preferredAmount(amounts);
  if (amount !== null) extra.push(amount);
  if (extra.length === 0) return text;
  return `${text}\n${extra.join('\n')}`;
}

function hasPayable(text: string): boolean {
  return text.split('\n').some((line) => {
    if (!/\b(total|amount|amt)\b/i.test(line) || !/\d/.test(line)) return false;
    return !/\b(sub[\s-]*total|vatable|vat\.?\s*total|total\s+vat)\b/i.test(line);
  });
}

function completedVat(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || !VAT_LABEL.test(line)) continue;
    const digits = line.match(/(\d{10,15})(?!\d)/)?.[1];
    if (digits === undefined) continue;
    if (digits.length === 15) return digits;
    const tail = lines[index + 1];
    const following = lines[index + 2];
    if (tail === undefined || following === undefined || !/^\d{1,5}$/.test(tail)) continue;
    if (digits.length + tail.length !== 15) continue;
    return digits + tail;
  }
  return null;
}

function preferredAmount(lines: string[]): string | null {
  const counts = new Map<string, { line: string; count: number }>();
  for (const line of lines) {
    const amount = line.match(/(\d+[.,]\d{2})/)?.[1]?.replace(',', '.');
    if (amount === undefined) continue;
    const current = counts.get(amount);
    if (current === undefined) counts.set(amount, { line, count: 1 });
    else current.count += 1;
  }
  let best: { line: string; count: number } | null = null;
  for (const value of counts.values()) {
    if (best === null || value.count > best.count) best = value;
  }
  return best?.line ?? null;
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

async function recognize(bin: string, imagePath: string): Promise<Recognition> {
  const result = await run(bin, [imagePath]);
  if (result.code !== 0) {
    throw new ExtractionError('UNREADABLE', 'Vision could not read the photo');
  }
  const confidenceMatch = result.stderr.match(/confidence=([0-9.]+)/);
  const confidence = confidenceMatch?.[1] === undefined ? 0 : Number(confidenceMatch[1]);
  return {
    text: result.stdout.replace(/\s+$/g, ''),
    confidence: Number.isFinite(confidence) ? confidence : 0,
  };
}

async function visionBinary(): Promise<string> {
  const dir = path.join(os.tmpdir(), 'darb-vision');
  const bin = path.join(dir, 'vision-ocr');
  const source = path.join(process.cwd(), 'lib/extraction/vision-ocr.swift');
  const sourceStat = await stat(source);
  let fresh = false;
  try {
    const binStat = await stat(bin);
    fresh = binStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    fresh = false;
  }
  if (fresh) return bin;
  await mkdir(dir, { recursive: true });
  const compiled = await run('swiftc', ['-O', '-o', bin, source]);
  if (compiled.code !== 0) {
    throw new ExtractionError(
      'UNREADABLE',
      'Apple Vision could not be compiled. Photos are read on macOS; the mock extractor stays the default.',
    );
  }
  return bin;
}

function run(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error: Error) => reject(error));
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
