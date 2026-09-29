import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications, type Notification } from "@/lib/notifications";
import MarkNotificationsRead from "@/components/MarkNotificationsRead";

export const metadata = { title: "Notifications — Remixt" };

function timeAgo(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString();
}

function describe(n: Notification) {
  const remix = n.remix_title ? `“${n.remix_title}”` : "a remix";
  switch (n.type) {
    case "like":
      return <>liked your remix {remix}</>;
    case "comment":
      return (
        <>
          commented on {remix}
          {n.body && <span className="mt-1 block text-muted">“{n.body}”</span>}
        </>
      );
    case "follow":
      return <>started following you</>;
    case "remix":
      return (
        <>
          made {remix} from {n.body ?? (n.track_title ? `your song “${n.track_title}”` : "your work")}
        </>
      );
    case "challenge":
      return <>{n.body ?? "A new remix challenge has started"}</>;
  }
}

function hrefFor(n: Notification) {
  if (n.type === "follow" && n.actor_id) return `/artist/${n.actor_id}`;
  if (n.type === "challenge") return "/challenges";
  return n.remix_id ? `/remixes/${n.remix_id}` : "#";
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  const notifications = await listNotifications(user.id);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <MarkNotificationsRead />
      <h1 className="text-2xl font-bold">Notifications</h1>
      <p className="mt-1 text-sm text-muted">Likes, comments, follows and remixes of your work.</p>

      {notifications.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-muted">
          Nothing yet. Publish a remix and share it — this is where you&apos;ll hear back.
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href={hrefFor(n)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors hover:bg-surface-hover ${
                  n.read_at ? "border-border bg-surface" : "border-brand/50 bg-brand/10"
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: n.actor_color ?? "var(--brand)" }}
                >
                  {(n.actor_name ?? "R").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  {n.actor_name && <span className="font-semibold">{n.actor_name} </span>}
                  {describe(n)}
                </span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
