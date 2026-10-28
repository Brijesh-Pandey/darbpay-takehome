"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { confirmMatch, rejectMatch } from "@/lib/actions/review";
import { outcomeFromAction, type ReviewNotice } from "@/lib/review/format";
import type { ReviewDocumentView } from "@/lib/review/queue";
import { DocumentCard } from "./document-card";

type ReviewTab = "needs-review" | "unmatched" | "attached";

export function ReviewBoard({
  active,
  needsReview,
  unmatched,
  matched,
}: {
  active: ReviewTab;
  needsReview: ReviewDocumentView[];
  unmatched: ReviewDocumentView[];
  matched: ReviewDocumentView[];
}) {
  const router = useRouter();
  const confirm = useAction(confirmMatch);
  const reject = useAction(rejectMatch);
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const [reloadNote, setReloadNote] = useState<string | null>(null);
  const lock = useRef(false);
  const busy = pending || isRefreshing || confirm.isPending || reject.isPending;
  const documents = active === "unmatched" ? unmatched : active === "attached" ? matched : needsReview;

  function reloadQueue() {
    setReloadNote(null);
    startRefresh(() => {
      router.refresh();
      setReloadNote("Reloaded from the database.");
    });
  }

  async function onDecide(kind: "confirm" | "reject", matchId: number) {
    if (lock.current || busy) return;
    lock.current = true;
    setPending(true);
    try {
      const result =
        kind === "confirm" ? await confirm.executeAsync({ matchId }) : await reject.executeAsync({ matchId });
      setNotice(outcomeFromAction(result));
      if (result?.data !== undefined) {
        startRefresh(() => {
          router.refresh();
        });
      }
    } catch {
      setNotice({ tone: "error", text: "The decision could not be saved. Nothing was changed." });
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  return (
    <main className="flex flex-col gap-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Review desk</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Confirm or reject a candidate while it is still open. Attached receipts were matched automatically.
            Unmatched documents stay visible so a rejected receipt, or one with no close charge, is not lost.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={reloadQueue}
            disabled={busy}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          {isRefreshing ? (
            <p role="status" className="text-xs text-muted">
              Reading the saved queue.
            </p>
          ) : reloadNote !== null ? (
            <p role="status" className="text-xs text-accent">
              {reloadNote}
            </p>
          ) : null}
        </div>
      </header>
      <nav aria-label="Document status" className="flex flex-wrap gap-1 border-b border-line">
        <TabLink href="/review" selected={active === "needs-review"} count={needsReview.length} label="Needs review" />
        <TabLink
          href="/review?tab=attached"
          selected={active === "attached"}
          count={matched.length}
          label="Attached"
        />
        <TabLink
          href="/review?tab=unmatched"
          selected={active === "unmatched"}
          count={unmatched.length}
          label="Unmatched"
        />
      </nav>
      {notice !== null ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className="rounded-md border border-line bg-card px-4 py-3 text-sm leading-6"
        >
          {notice.text}
        </p>
      ) : null}
      {documents.length === 0 ? (
        <EmptyState tab={active} />
      ) : (
        <div className="flex flex-col gap-4">
          {documents.map((document) => (
            <DocumentCard key={document.id} document={document} busy={busy} onDecide={onDecide} />
          ))}
        </div>
      )}
    </main>
  );
}

function TabLink({
  href,
  selected,
  count,
  label,
}: {
  href: string;
  selected: boolean;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "page" : undefined}
      className={
        selected
          ? "-mb-px inline-flex items-center gap-2 border-b-2 border-accent px-3 py-2 text-sm font-semibold"
          : "-mb-px inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted"
      }
    >
      {label}
      <span className="rounded bg-canvas px-1.5 py-0.5 text-xs tabular-nums text-ink">{count}</span>
    </Link>
  );
}

function EmptyState({ tab }: { tab: ReviewTab }) {
  if (tab === "attached") {
    return (
      <div className="rounded-lg border border-dashed border-line bg-card px-6 py-14 text-center">
        <p className="text-base font-semibold">No attached receipts</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          A receipt that matches one charge clearly is attached on its own and listed here.
        </p>
      </div>
    );
  }
  if (tab === "unmatched") {
    return (
      <div className="rounded-lg border border-dashed border-line bg-card px-6 py-14 text-center">
        <p className="text-base font-semibold">No unmatched documents</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          A receipt with no plausible charge, an unknown sender, or a fully rejected set of candidates is listed here.
          It is considered again when a new transaction arrives.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-line bg-card px-6 py-14 text-center">
      <p className="text-base font-semibold">Nothing is waiting for a decision</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
        Receipts the matcher cannot attach on its own appear here, with the charges a reviewer can confirm or reject.
      </p>
    </div>
  );
}
