"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { UploadStatus } from "@/lib/uploads/document-status";

type Accepted = {
  documents: Array<{ documentId: number; result: "created" | "duplicate" }>;
};

type IssueBody = {
  issues?: Array<{ path: string; message: string }>;
};

const EXAMPLES = [
  {
    id: "harbor-sar" as const,
    title: "Harbor Coffee",
    detail: "SAR 86.50 · same currency",
    expect: "Should attach on its own",
  },
  {
    id: "blue-usd" as const,
    title: "Blue Bottle",
    detail: "USD 100.00 · different currency",
    expect: "Should wait for review",
  },
];

export function UploadDesk() {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localKind, setLocalKind] = useState<"image" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duplicate, setDuplicate] = useState(false);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTimer() {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }

  async function watch(documentId: number, token: number, created: boolean) {
    const started = Date.now();
    setElapsed(0);
    stopTimer();
    timer.current = setInterval(() => {
      if (run.current !== token) return;
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);

    try {
      while (run.current === token && Date.now() - started < 90_000) {
        const response = await fetch(`/api/documents/${documentId}/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("missing");
        const body = (await response.json()) as UploadStatus;
        if (run.current !== token) return;
        setStatus(body);
        if (body.phase !== "reading") return;
        await new Promise((resolve) => setTimeout(resolve, created ? 700 : 0));
        if (!created) return;
      }
    } finally {
      if (run.current === token) stopTimer();
    }
  }

  async function accept(response: Response, token: number) {
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as IssueBody | null;
      const message = body?.issues?.[0]?.message ?? "The bill could not be stored.";
      if (run.current === token) setError(message);
      return;
    }
    const body = (await response.json()) as Accepted;
    const saved = body.documents[0];
    if (saved === undefined) {
      if (run.current === token) setError("The bill could not be stored.");
      return;
    }
    if (run.current !== token) return;
    setDuplicate(saved.result === "duplicate");
    await watch(saved.documentId, token, saved.result === "created");
  }

  async function submitExample(example: "harbor-sar" | "blue-usd") {
    if (busy) return;
    const token = ++run.current;
    setBusy(true);
    setError(null);
    setStatus(null);
    setDuplicate(false);
    setLocalPreview(null);
    setLocalKind(null);
    try {
      const response = await fetch("/api/uploads/example", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ example }),
      });
      await accept(response, token);
    } catch {
      if (run.current === token) setError("The bill could not be stored.");
    } finally {
      if (run.current === token) setBusy(false);
    }
  }

  async function submitFile(file: File) {
    if (busy) return;
    const token = ++run.current;
    setBusy(true);
    setError(null);
    setStatus(null);
    setDuplicate(false);
    setLocalKind(file.type === "application/pdf" ? "pdf" : "image");
    setLocalPreview(file.type === "application/pdf" ? null : URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: form });
      await accept(response, token);
    } catch {
      if (run.current === token) setError("The bill could not be stored.");
    } finally {
      if (run.current === token) setBusy(false);
    }
  }

  const stillReading = status === null || status.phase === "reading";
  const showingPdf = status?.mimeType === "application/pdf" || (status === null && localKind === "pdf");
  const previewSrc = showingPdf ? null : status?.preview === true ? `/api/documents/${status.id}/file` : localPreview;
  const outcome = outcomeText(status);
  const reviewHref = status?.status === "MATCHED" ? "/review?tab=attached" : "/review";

  return (
    <main className="flex flex-col gap-6 pb-16">
      <header className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Upload a bill</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          The file is stored as mail from Northline Logistics ({"billing@alfanar-fuel.com.sa"}), then the page is read
          and compared with that client&apos;s card charges.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.id}
            type="button"
            data-testid={`upload-${example.id}`}
            disabled={busy}
            onClick={() => void submitExample(example.id)}
            className="rounded-lg border border-line bg-card px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="block text-sm font-semibold">{example.title}</span>
            <span className="mt-1 block text-sm text-muted">{example.detail}</span>
            <span className="mt-2 block text-xs font-medium text-accent">{example.expect}</span>
          </button>
        ))}
      </div>

      <label className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-dashed border-line bg-card px-4 py-3 text-sm">
        <span className="font-semibold">Or choose a PNG, JPEG, WEBP, or PDF</span>
        <span className="text-muted">Up to 10 MiB. The same bytes from this mailbox are stored once.</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="mt-2 text-sm"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) void submitFile(file);
          }}
        />
      </label>

      {error !== null ? (
        <p className="rounded-md border border-line bg-card px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {status !== null || busy || previewSrc !== null ? (
        <section className="grid gap-5 rounded-lg border border-line bg-card p-5 lg:grid-cols-[18rem_1fr]" aria-live="polite">
          <div>
            {previewSrc !== null ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSrc}
                  alt="Uploaded bill"
                  data-testid="upload-preview"
                  className="max-h-80 w-full rounded-md border border-line bg-canvas object-contain object-left"
                />
              </>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-md border border-line bg-canvas px-4 text-center text-sm text-muted">
                {showingPdf ? "PDF files are read from their text. There is no page image." : "Waiting for the page"}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted" data-testid="upload-phase">
              {status === null || status.phase === "reading" ? `Reading the page · ${elapsed}s` : phaseLabel(status)}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight" data-testid="upload-outcome">
              {outcome}
            </h2>
            {duplicate ? (
              <p className="mt-2 text-sm text-muted">This file was already stored for this mailbox, so it was not read again.</p>
            ) : null}
            {status !== null && !stillReading ? (
              <>
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Field term="Merchant" value={status.merchantName} />
                  <Field term="Amount read" value={status.amount} testId="upload-amount" />
                  <Field term="Date" value={status.documentDate} />
                  <Field term="Card" value={status.cardLast4} />
                  <Field term="Invoice" value={status.invoiceNumber} />
                  <Field term="VAT number" value={status.vatNumber} />
                  <Field term="Type" value={status.documentType} />
                  <Field term="Confidence" value={status.extractionConfidence} />
                </dl>
                {status.match !== null ? (
                  <div className="mt-4 rounded-md bg-canvas px-3 py-3 text-sm">
                    <p className="font-semibold">Charge it was compared with</p>
                    <p className="mt-1">
                      {status.match.transactionMerchant} ·{" "}
                      <span data-testid="upload-charge-amount">{status.match.transactionAmount}</span>
                    </p>
                    <p className="mt-1 text-muted">
                      Card {status.match.transactionCard} · {status.match.transactionDate} · score{" "}
                      {status.match.confidenceLabel} · {status.match.statusLabel}
                    </p>
                    {status.match.flagLabels.length > 0 ? (
                      <p className="mt-2 font-medium" data-testid="upload-flags">
                        {status.match.flagLabels.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {status.rawText.trim() !== "" ? (
                  <pre
                    data-testid="upload-raw"
                    className="mt-4 max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-5"
                  >
                    {status.rawText}
                  </pre>
                ) : null}
                <Link href={reviewHref} className="mt-4 inline-flex text-sm font-semibold text-accent">
                  Open this result on the review desk
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">
                The file is stored. The reader is pulling out the merchant, amount, date, invoice, and VAT number,
                then the matcher scores those fields against open charges.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Field({ term, value, testId }: { term: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="font-medium" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

function phaseLabel(status: UploadStatus): string {
  if (status.status === "MATCHED") return "Attached";
  if (status.status === "NEEDS_REVIEW") return "Needs review";
  if (status.status === "UNMATCHED") return "Unmatched";
  if (status.status === "FAILED") return "Could not read";
  return status.status;
}

function outcomeText(status: UploadStatus | null): string {
  if (status === null || status.phase === "reading") return "Reading the page";
  if (status.status === "MATCHED") return `${status.merchantName} was attached automatically`;
  if (status.status === "NEEDS_REVIEW" && status.match?.flagLabels.some((flag) => flag.includes("Converted")) === true) {
    return `${status.amount} was converted and left for review`;
  }
  if (status.status === "NEEDS_REVIEW") return `${status.merchantName} needs a person`;
  if (status.status === "FAILED") return status.reason;
  return status.reason;
}
