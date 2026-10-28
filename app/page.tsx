import Link from "next/link";

export default function HomePage() {
  return (
    <main className="max-w-2xl pb-16">
      <p className="text-sm font-medium text-muted">Operations</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Receipt and invoice matching</h1>
      <p className="mt-4 text-base leading-7 text-muted">
        Email invoices and WhatsApp receipt photos are matched to card transactions. A clear match is attached
        automatically. The review desk holds everything that still needs a person, and anything that could not be
        attached.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/upload" className="inline-flex rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white">
          Upload a bill
        </Link>
        <Link
          href="/review"
          className="inline-flex rounded-md border border-line bg-card px-4 py-2.5 text-sm font-semibold"
        >
          Open review desk
        </Link>
      </div>
      <dl className="mt-12 divide-y divide-line border-y border-line">
        <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
          <dt className="text-sm font-semibold">Needs review</dt>
          <dd className="text-sm leading-6 text-muted">
            One or more charges are plausible. Confirm the right one, or reject a candidate that does not belong.
          </dd>
        </div>
        <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
          <dt className="text-sm font-semibold">Unmatched</dt>
          <dd className="text-sm leading-6 text-muted">
            No charge was close enough, the sender is unknown, or every candidate was rejected. These are considered
            again when a new transaction arrives.
          </dd>
        </div>
      </dl>
    </main>
  );
}
