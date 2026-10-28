"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const onReview = pathname.startsWith("/review");
  const onUpload = pathname.startsWith("/upload");
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-wide">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="size-6">
          <rect width="32" height="32" rx="7" fill="#16382f" />
          <path
            fill="#f4f5f7"
            fillRule="evenodd"
            d="M8.5 8h8.2c4.2 0 7.3 2.8 7.3 8s-3.1 8-7.3 8H8.5V8Zm3.6 3.2v9.6h4.4c2.4 0 3.9-1.6 3.9-4.8s-1.5-4.8-3.9-4.8h-4.4Z"
          />
        </svg>
        Darb
      </Link>
      <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className={pathname === "/" ? "rounded-md bg-white px-3 py-1.5 font-semibold" : "rounded-md px-3 py-1.5 text-muted"}
        >
          Overview
        </Link>
        <Link
          href="/upload"
          aria-current={onUpload ? "page" : undefined}
          className={onUpload ? "rounded-md bg-white px-3 py-1.5 font-semibold" : "rounded-md px-3 py-1.5 text-muted"}
        >
          Upload
        </Link>
        <Link
          href="/review"
          aria-current={onReview ? "page" : undefined}
          className={onReview ? "rounded-md bg-white px-3 py-1.5 font-semibold" : "rounded-md px-3 py-1.5 text-muted"}
        >
          Review
        </Link>
      </nav>
    </header>
  );
}
