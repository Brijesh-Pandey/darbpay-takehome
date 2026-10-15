import type { ReviewCandidateView, ReviewDocumentView } from "@/lib/review/queue";

type DocumentCardProps = {
  document: ReviewDocumentView;
  busy: boolean;
  onDecide: (kind: "confirm" | "reject", matchId: number) => void;
};

export function DocumentCard({ document, busy, onDecide }: DocumentCardProps) {
  const heading = document.merchantName === "Not extracted" ? `Document ${document.id}` : document.merchantName;
  const candidateWord = document.openCandidateCount === 1 ? "candidate" : "candidates";
  const statusLabel =
    document.status === "NEEDS_REVIEW"
      ? `Needs review · ${document.openCandidateCount} open ${candidateWord}`
      : "Unmatched";
  return (
    <article className="rounded-lg border border-line bg-card p-5" aria-labelledby={`document-${document.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`document-${document.id}`} className="text-lg font-semibold tracking-tight">
          {heading}
        </h2>
        <p className="rounded-md bg-canvas px-2.5 py-1 text-xs font-medium text-muted">{statusLabel}</p>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{document.reason}</p>
      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Field term="Amount" value={document.amount} numeric />
        <Field term="Receipt date" value={document.documentDate} />
        <Field term="Card last four" value={document.cardLast4} />
        <Field term="Sender" value={`${document.sourceLabel} · ${document.sender}`} />
        <Field term="Document type" value={document.documentType} />
        <Field term="Extraction confidence" value={document.extractionConfidence} numeric />
        <Field term="VAT number" value={document.vatNumber} />
        <Field term="Invoice number" value={document.invoiceNumber} />
        <Field term="Received" value={document.receivedAt} />
        <Field
          term="File"
          value={document.filename === "Not extracted" ? document.mimeType : `${document.filename} · ${document.mimeType}`}
        />
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted">The stored file is a text fixture, so there is no image preview.</p>
      <h3 className="mt-6 text-sm font-semibold">Candidates</h3>
      {document.candidates.length === 0 ? (
        <p className="mt-2 text-sm text-muted">This document has no stored candidates.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {document.candidates.map((candidate) => (
            <li key={candidate.matchId}>
              <CandidateComparison document={document} candidate={candidate} busy={busy} onDecide={onDecide} />
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Field({ term, value, numeric = false }: { term: string; value: string; numeric?: boolean }) {
  return (
    <div className="border-t border-line pt-2">
      <dt className="text-xs text-muted">{term}</dt>
      <dd className={numeric ? "mt-0.5 text-sm tabular-nums" : "mt-0.5 text-sm"}>
        <Shown value={value} />
      </dd>
    </div>
  );
}

function Shown({ value }: { value: string }) {
  if (value === "Not extracted") {
    return <span className="text-muted">Not extracted</span>;
  }
  return value;
}

function CandidateComparison({
  document,
  candidate,
  busy,
  onDecide,
}: {
  document: ReviewDocumentView;
  candidate: ReviewCandidateView;
  busy: boolean;
  onDecide: (kind: "confirm" | "reject", matchId: number) => void;
}) {
  const blockId = `block-${candidate.matchId}`;
  const open = document.actionable && (candidate.canConfirm || candidate.canReject);
  return (
    <section className="rounded-md border border-line p-4" aria-label={`Candidate ${candidate.rank}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">
          Candidate {candidate.rank} · transaction {candidate.transactionId}
        </h4>
        <p className="text-xs tabular-nums text-muted">
          {candidate.statusLabel} · score {candidate.confidenceLabel}
        </p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted">
        The score ranks this charge against the receipt. It does not prove they belong together. {candidate.clientName}.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <caption className="sr-only">Receipt compared with transaction {candidate.transactionId}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="px-3 py-2 font-medium">
                Field
              </th>
              <th scope="col" className="bg-canvas px-3 py-2 font-medium">
                Receipt
              </th>
              <th scope="col" className="bg-accent-soft px-3 py-2 font-medium">
                Transaction
              </th>
            </tr>
          </thead>
          <tbody>
            <CompareRow field="Merchant" receipt={document.merchantName} transaction={candidate.transactionMerchant} />
            <CompareRow field="Amount" receipt={document.amount} transaction={candidate.transactionAmount} />
            <CompareRow field="Date" receipt={document.documentDate} transaction={candidate.transactionDate} />
            <CompareRow field="Card last four" receipt={document.cardLast4} transaction={candidate.transactionCard} />
          </tbody>
        </table>
      </div>
      <h5 className="mt-4 text-xs font-medium text-muted">Why this candidate ranked here</h5>
      <ul className="mt-2 flex flex-wrap gap-2">
        {candidate.signals.map((signal) => (
          <li key={signal.name} className="rounded border border-line px-2 py-1 text-xs">
            {signal.label}: {signal.score === null ? "Not compared" : signal.score}
          </li>
        ))}
      </ul>
      {candidate.flagLabels.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm leading-6 text-muted">
          {candidate.flagLabels.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {candidate.canConfirm ? (
            <button
              type="button"
              className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              aria-label={`Confirm transaction ${candidate.transactionId}`}
              onClick={() => onDecide("confirm", candidate.matchId)}
            >
              Confirm
            </button>
          ) : null}
          {candidate.canReject ? (
            <button
              type="button"
              className="rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              aria-describedby={candidate.blockedReason !== null ? blockId : undefined}
              aria-label={`Reject transaction ${candidate.transactionId}`}
              onClick={() => onDecide("reject", candidate.matchId)}
            >
              Reject
            </button>
          ) : null}
          {candidate.blockedReason !== null ? (
            <p id={blockId} className="text-sm text-muted">
              {candidate.blockedReason}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">This candidate is not open for a decision.</p>
      )}
    </section>
  );
}

function CompareRow({ field, receipt, transaction }: { field: string; receipt: string; transaction: string }) {
  const numeric = field === "Amount";
  return (
    <tr className="border-t border-line">
      <th scope="row" className="px-3 py-2.5 text-left text-sm font-medium">
        {field}
      </th>
      <td className={numeric ? "bg-canvas px-3 py-2.5 tabular-nums" : "bg-canvas px-3 py-2.5"}>
        <Shown value={receipt} />
      </td>
      <td className={numeric ? "bg-accent-soft px-3 py-2.5 tabular-nums" : "bg-accent-soft px-3 py-2.5"}>
        <Shown value={transaction} />
      </td>
    </tr>
  );
}
