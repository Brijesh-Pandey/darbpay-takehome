"use client";

export default function ReviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Review desk</h1>
      <p role="alert" className="mt-4 rounded-md border border-line bg-card px-4 py-3 text-sm leading-6">
        The review desk could not be loaded. Nothing was changed.
      </p>
      {error.digest !== undefined ? <p className="mt-2 text-sm text-muted">Reference {error.digest}</p> : null}
      <button
        type="button"
        className="mt-4 rounded-md border border-line bg-card px-3 py-2 text-sm font-semibold"
        onClick={() => reset()}
      >
        Try again
      </button>
    </main>
  );
}
