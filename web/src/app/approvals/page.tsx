import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requestsFor } from "@/lib/publishConsent";
import ConsentAnswer from "@/components/ConsentAnswer";

export const metadata = { title: "Approvals", robots: { index: false } };

const PART: Record<string, string> = { vocals: "vocals", beat: "beat", drums: "drums", bass: "bass", other: "melody" };

// Requests to publish remixes that use your private songs. Listen first (the
// remix opens for you while it's private), then agree or say no.
export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/approvals");
  const requests = await requestsFor(user.id);
  const open = requests.filter((r) => r.status === "asked");
  const done = requests.filter((r) => r.status !== "asked");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-bold">Approvals</h1>
      <p className="mt-1 text-sm text-muted">
        Someone you shared a private song with wants to publish a remix that uses it. Nothing of yours goes public until you agree — and only
        inside that remix: the song itself stays private.
      </p>

      {open.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-10 text-center text-muted">Nothing waiting for you.</div>
      )}
      <ul className="mt-6 flex flex-col gap-3">
        {open.map((r) => (
          <li key={`${r.remix_id}-${r.track_id}`} className="rounded-2xl border border-brand/40 bg-brand/5 p-4">
            <p className="text-sm">
              <span className="font-semibold">{r.asked_by_name}</span> wants to publish{" "}
              <Link href={`/remixes/${r.remix_id}`} className="font-semibold text-brand-strong hover:underline">“{r.remix_title}”</Link>, which uses
              the {r.parts.map((p) => PART[p] ?? p).join(" and ") || "parts"} of your song <span className="font-semibold">“{r.track_title}”</span>.
            </p>
            <p className="mt-1 text-xs text-muted">
              <Link href={`/remixes/${r.remix_id}`} className="underline">Listen to it first</Link> · asked {new Date(r.created_at).toLocaleDateString()}
            </p>
            <ConsentAnswer remixId={r.remix_id} trackId={r.track_id} status={r.status} />
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold text-muted">Answered</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {done.map((r) => (
              <li key={`${r.remix_id}-${r.track_id}`} className="rounded-xl border border-border bg-surface p-3 text-sm">
                <p>
                  “{r.remix_title}” by {r.asked_by_name} · your “{r.track_title}”
                </p>
                <div className="mt-1">
                  <ConsentAnswer remixId={r.remix_id} trackId={r.track_id} status={r.status} compact />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
