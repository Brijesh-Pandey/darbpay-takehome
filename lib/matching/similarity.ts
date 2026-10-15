import { isGenericToken, normalizeMerchant } from '@/lib/matching/normalize';

function jaccard(left: readonly string[], right: readonly string[]): number {
  const rightSet = new Set(right);
  let intersection = 0;
  const leftSet = new Set(left);
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function dice(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length - 2);
}

export function merchantSimilarity(leftName: string, rightName: string): number | null {
  const left = normalizeMerchant(leftName);
  const right = normalizeMerchant(rightName);
  if (left.length === 0 || right.length === 0) return null;

  const leftText = left.join(' ');
  const rightText = right.join(' ');
  let score = Math.max(jaccard(left, right), dice(leftText, rightText));
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  const genericAgainstLonger =
    leftText !== rightText && shorter.length > 0 && shorter.every((token) => isGenericToken(token)) && longer.length > shorter.length;
  if (genericAgainstLonger) score = Math.min(score, 0.99);
  return score;
}
