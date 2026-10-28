import { parseReceiptText } from '@/lib/extraction/parse-receipt-text';
import { parseExtractedDocument } from '@/lib/extraction/schema';

const ALFANAR = 'TAX INVOICE INV-99812 Alfanar Fuel Station VAT 300000000000003 TOTAL 125.00 SAR CARD 4242 2025-06-14';

function read(text: string, confidence = 0.9) {
  return parseExtractedDocument(parseReceiptText(text, confidence));
}

describe('receipt text parser', () => {
  it('reads the Alfanar tax invoice line into halalas', () => {
    expect(read(ALFANAR, 0.96)).toMatchObject({
      documentType: 'TAX_INVOICE',
      merchantName: 'Alfanar Fuel Station',
      vatNumber: '300000000000003',
      totalAmount: 12500,
      currency: 'SAR',
      documentDate: '2025-06-14',
      cardLast4: '4242',
      invoiceNumber: 'INV-99812',
      extractionConfidence: 0.96,
    });
  });

  it('reads a multi-line receipt and ignores the subtotal and the VAT line', () => {
    const text = [
      'Alfanar Fuel Station',
      'King Fahd Road, Riyadh',
      'TAX INVOICE',
      'INV-99812',
      'VAT 300000000000003',
      '2025-06-14',
      'VISA ****4242',
      'Subtotal 108.70',
      'VAT 16.30',
      'TOTAL 125.00 SAR',
    ].join('\n');
    expect(read(text)).toMatchObject({
      documentType: 'TAX_INVOICE',
      merchantName: 'Alfanar Fuel Station',
      totalAmount: 12500,
      currency: 'SAR',
      cardLast4: '4242',
      invoiceNumber: 'INV-99812',
    });
  });

  it('reads a US dollar total with a month-first date that cannot be a day', () => {
    const text = ['Blue Bottle Coffee', 'Receipt', '06/14/2025', 'Card ending 1881', 'TOTAL $100.00'].join('\n');
    expect(read(text)).toMatchObject({
      documentType: 'RECEIPT',
      merchantName: 'Blue Bottle Coffee',
      totalAmount: 10000,
      currency: 'USD',
      documentDate: '2025-06-14',
      cardLast4: '1881',
    });
  });

  it('keeps yen in whole yen and dinars in fils', () => {
    expect(read('Sushi Saito\nTOTAL JPY 1000\n2025-06-14')).toMatchObject({
      totalAmount: 1000,
      currency: 'JPY',
    });
    expect(read('Kuwait Fuel\nTOTAL KWD 1.500')).toMatchObject({
      totalAmount: 1500,
      currency: 'KWD',
    });
  });

  it('reads a European decimal comma and a thousands separator', () => {
    expect(read('Cafe de Flore\nTOTAL EUR 18,50')).toMatchObject({
      merchantName: 'Cafe de Flore',
      totalAmount: 1850,
      currency: 'EUR',
    });
    expect(read('Northline\nTOTAL 1,250.00 SAR').totalAmount).toBe(125000);
  });

  it('rounds an extra decimal half up', () => {
    expect(read('Shop\nTOTAL USD 10.005').totalAmount).toBe(1001);
  });

  it('treats an ambiguous numeric date as day/month/year', () => {
    expect(read('Shop\nDate 06/07/2025\nTOTAL 10.00 SAR').documentDate).toBe('2025-07-06');
    expect(read('Shop\n14/06/2025\nTOTAL 10.00 SAR').documentDate).toBe('2025-06-14');
    expect(read('Shop\n14 Jun 2025\nTOTAL 10.00 SAR').documentDate).toBe('2025-06-14');
  });

  it('does not treat the English word all as a currency', () => {
    expect(read('Shop\nall items\nTOTAL 10.00')).toMatchObject({
      currency: null,
      totalAmount: 1000,
    });
  });

  it('returns UNKNOWN when the text has no receipt fields', () => {
    const empty = read('   ', 0.8);
    expect(empty).toMatchObject({ documentType: 'UNKNOWN', totalAmount: null, extractionConfidence: 0 });
    const note = read('Hello\nthis is a note', 0.4);
    expect(note.documentType).toBe('UNKNOWN');
    expect(note.totalAmount).toBeNull();
    expect(note.extractionConfidence).toBe(0.4);
  });

  it('keeps the bill amount when a VAT total is printed under it', () => {
    const text = [
      'PETROLY',
      'SIMPLIFIED TAX INVOICE',
      'Invoice ID: 89342',
      'VAT No: 300064889900003',
      'Date: 25/10/2026',
      'Amount 200.02 SAR',
      'VATABLE : 200.02 SAR',
      'Vat. Total : 26.09 SAR',
    ].join('\n');
    expect(read(text)).toMatchObject({
      documentType: 'TAX_INVOICE',
      merchantName: 'PETROLY',
      vatNumber: '300064889900003',
      totalAmount: 20002,
      currency: 'SAR',
      documentDate: '2026-10-25',
      invoiceNumber: '89342',
    });
  });

  it('reads a station slip whose total decimal and VAT tail are split', () => {
    const text = [
      'ADNOC',
      'SIMPLIFIED JAX INVOICE',
      'Tax Number 310268913400003',
      'Printed 10/25/26 1:09',
      'INV (INV): 12075',
      'Subtotal 695.65',
      'TOTAL 800 00',
      'Change 0.00',
    ].join('\n');
    expect(read(text)).toMatchObject({
      documentType: 'TAX_INVOICE',
      merchantName: 'ADNOC',
      vatNumber: '310268913400003',
      totalAmount: 80000,
      documentDate: '2026-10-25',
      invoiceNumber: '12075',
    });
  });

  it('joins a wrapped VAT tail and keeps the invoice number at the end of the line', () => {
    const text = [
      'PETROLY',
      'SIMPLIFIED TAX INVOICE',
      'Involce ID station copy: 89342',
      'VAT No station: 300064889900',
      '003',
      'Date: 25/10/2026',
      'Amount 200.02 SAR',
      'Vat. Total : 26.09 SAR',
    ].join('\n');
    expect(read(text)).toMatchObject({
      merchantName: 'PETROLY',
      vatNumber: '300064889900003',
      totalAmount: 20002,
      currency: 'SAR',
      documentDate: '2026-10-25',
      invoiceNumber: '89342',
    });
  });

  it('does not build a VAT number by joining a date onto a short digit run', () => {
    const text = ['PETROLY', 'VAT No 300064', '003', 'Date: 25/10/2026', 'Amount 200.02 SAR'].join('\n');
    expect(read(text).vatNumber).toBeNull();
    expect(read(text).totalAmount).toBe(20002);
  });

  it('reads an invoice reference printed on the next line', () => {
    const text = ['Tax Invoice', 'Invoice Ref #', 'INV/2026/20961', 'Amount Due 1,049.00 SAR', 'Issue Date 2026-10-22'].join(
      '\n',
    );
    expect(read(text)).toMatchObject({
      documentType: 'TAX_INVOICE',
      totalAmount: 104900,
      currency: 'SAR',
      documentDate: '2026-10-22',
      invoiceNumber: 'INV/2026/20961',
    });
  });

  it('clamps a confidence that is outside 0 to 1', () => {
    expect(read('Shop\nTOTAL 10.00 SAR', 1.4).extractionConfidence).toBe(1);
    expect(read('Shop\nTOTAL 10.00 SAR', Number.NaN).extractionConfidence).toBe(0);
  });
});
