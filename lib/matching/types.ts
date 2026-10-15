export type DocumentKind = 'RECEIPT' | 'TAX_INVOICE' | 'UNKNOWN';

export type SignalName = 'amount' | 'merchant' | 'cardLast4' | 'date';

export type MatchFlag = 'TIP' | 'CARD_MISMATCH' | 'ALREADY_CONFIRMED';

export type MatchOutcome = 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED';

export type MatchReason =
  | 'UNKNOWN_DOCUMENT'
  | 'AMOUNT_UNUSABLE'
  | 'NO_CANDIDATE'
  | 'AUTO'
  | 'AMBIGUOUS'
  | 'ALREADY_CONFIRMED'
  | 'TIP'
  | 'CARD_MISMATCH'
  | 'DATE_DISAGREES'
  | 'LOW_EXTRACTION_CONFIDENCE'
  | 'BELOW_THRESHOLD';

export type ExtractedFields = {
  documentType: DocumentKind;
  merchantName: string | null;
  totalAmount: number | null;
  currency: string | null;
  documentDate: string | null;
  cardLast4: string | null;
  extractionConfidence: number;
};

export type CandidateTransaction = {
  id: number;
  clientId: number;
  driverPhone: string | null;
  merchantName: string;
  amount: number;
  currency: string;
  transactionAt: Date;
  cardLast4: string | null;
  hasConfirmedDocument: boolean;
};

export type MatchScope =
  | { kind: 'EMAIL'; clientId: number }
  | { kind: 'WHATSAPP'; driverPhone: string };

export type MatchCandidate = {
  transactionId: number;
  confidence: number;
  signals: Partial<Record<SignalName, number>>;
  flags: MatchFlag[];
};

export type MatchResult = {
  outcome: MatchOutcome;
  reason: MatchReason;
  candidates: MatchCandidate[];
};
