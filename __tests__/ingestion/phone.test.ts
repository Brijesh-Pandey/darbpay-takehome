import { normalizePhone, whatsappScope } from '@/lib/services/sender-scope';

describe('normalizePhone', () => {
  it('turns the sample sender into E.164', () => {
    expect(normalizePhone('966551234567')).toBe('+966551234567');
    expect(normalizePhone('+966551234567')).toBe('+966551234567');
    expect(normalizePhone('00966551234567')).toBe('+966551234567');
    expect(normalizePhone('0551234567')).toBe('+966551234567');
    expect(normalizePhone('+966 55 123 4567')).toBe('+966551234567');
    expect(normalizePhone('055-123-4567')).toBe('+966551234567');
  });

  it('rejects numbers that are not a country code or a Saudi mobile', () => {
    expect(normalizePhone('not-a-phone')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('05')).toBeNull();
    expect(normalizePhone('+012345678')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('does not add a country code to a non-Saudi local number', () => {
    expect(normalizePhone('5551234567')).toBe('+5551234567');
  });

  it('builds the WhatsApp scope from the normalized number', () => {
    expect(whatsappScope('+966551234567')).toBe('WHATSAPP:+966551234567');
  });
});