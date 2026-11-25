"use client";

import Link from "next/link";
import { useEffect } from "react";
import RemixtMark from "@/components/RemixtMark";
import { reportProblem } from "@/lib/client/problems";

/** Shown instead of a blank page when something on a page throws. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // An error caught here never reaches the window's error handler: the owner hears of it from here.
  useEffect(() => {
    reportProblem({
      kind: "error",
      message: `Page crashed: ${error?.name ?? "Error"}: ${error?.message ?? ""}`,
      path: location.pathname,
      detail: [error?.digest && `digest ${error.digest}`, error?.stack?.split("\n").slice(0, 6).join("\n")].filter(Boolean).join("\n"),
    });
  }, [error]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <RemixtMark variant="bars" className="h-16 w-16 opacity-80" />
      <h1 className="mt-6 text-2xl font-bold">Something went off-beat</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        This page hit an error. Try again — if it keeps happening, head back to the library.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={() => retry()}
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Try again
        </button>
        <Link
          href="/library"
          className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold hover:bg-surface-hover"
        >
          Go to the library
        </Link>
      </div>
      <a href="#feedback" className="mt-6 text-sm text-brand-strong hover:underline">
        Tell us what you were doing →
      </a>
    </div>
  );
}
