// A page's shape while it loads: a title, a line, then rows or cards.
// Calm (no spinner), the same width as real pages, and announced to
// screen readers once. Motion is a soft shimmer, still under reduced motion.

type Shape = "rows" | "cards";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

export default function PageSkeleton({ shape = "rows", wide = false }: { shape?: Shape; wide?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`mx-auto w-full ${wide ? "max-w-7xl" : "max-w-6xl"} px-4 py-8 sm:px-6 sm:py-12`}
    >
      <span className="sr-only">Loading…</span>
      <>
          <Bar className="h-8 w-48" />
          <Bar className="mt-3 h-4 w-full max-w-lg" />
          {shape === "cards" ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="skeleton aspect-[16/9] w-full rounded-xl" />
                  <Bar className="mt-3 h-5 w-3/4" />
                  <Bar className="mt-2 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-8 space-y-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
                  <div className="skeleton h-11 w-11 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Bar className="h-4 w-2/5" />
                    <Bar className="h-3 w-1/4" />
                  </div>
                  <Bar className="hidden h-9 w-1/3 sm:block" />
                </div>
              ))}
            </div>
          )}
      </>
    </div>
  );
}
