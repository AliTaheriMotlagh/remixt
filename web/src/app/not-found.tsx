import Link from "next/link";
import RemixtMark from "@/components/RemixtMark";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <RemixtMark variant="bars" className="h-20 w-20 opacity-80" />
      <p className="mt-6 font-mono text-sm text-muted">404</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">This track went silent</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        The page you&apos;re after doesn&apos;t exist, or the remix was made private or removed.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <Link
          href="/remixes"
          className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-strong"
        >
          Listen to remixes
        </Link>
        <Link
          href="/library"
          className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold hover:bg-surface-hover"
        >
          Browse vocals &amp; beats
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold hover:bg-surface-hover"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
