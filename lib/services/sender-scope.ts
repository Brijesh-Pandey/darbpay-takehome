import type { PrismaClient } from '@prisma/client';

const E164_DIGITS = /^[1-9]\d{7,14}$/;
const SAUDI_LOCAL_MOBILE = /^05\d{8}$/;

export function emailScope(email: string): string {
  return `EMAIL:${email}`;
}

export function whatsappScope(phone: string): string {
  return `WHATSAPP:${phone}`;
}

/**
 * E.164 or null. Separators are removed. A leading + or 00 is a country code.
 * A Saudi mobile `05XXXXXXXX` becomes `+9665XXXXXXXX`. Any other string is
 * treated as a country code without a plus. No other country is assumed.
 */
export function normalizePhone(input: string): string | null {
  const stripped = input.trim().replace(/[\s\-.()]/g, '');
  if (stripped.length === 0) return null;
  let digits = stripped;
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (SAUDI_LOCAL_MOBILE.test(digits)) digits = `966${digits.slice(1)}`;
  if (!E164_DIGITS.test(digits)) return null;
  return `+${digits}`;
}

export async function findEmailClient(db: PrismaClient, email: string): Promise<{ clientId: number } | null> {
  const sender = await db.clientEmailSender.findUnique({ where: { email } });
  if (sender === null) return null;
  return { clientId: sender.clientId };
}
