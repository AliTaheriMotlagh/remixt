import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import HostConsole from "@/components/live/HostConsole";
import LiveReplay from "@/components/live/LiveReplay";
import LiveRoom from "@/components/live/LiveRoom";
import { getCurrentUser } from "@/lib/auth";
import { coverUrl } from "@/lib/cover";
import { getStream, performableRemixes, recap } from "@/lib/live";
import { pageMetadata } from "@/lib/seo";
import { getFollowState } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const stream = await getStream(id).catch(() => null);
  if (!stream) return { title: "Live session", robots: { index: false } };
  const state = stream.status === "live" ? "is live" : stream.status === "scheduled" ? "is going live" : "went live";
  return pageMetadata({
    title: `${stream.title} — ${stream.host_name} ${state}`,
    description: stream.description || `${stream.host_name} ${state} on Remixt: hear the stems played live, chat and send reactions.`,
    path: `/live/${id}`,
    // A session is only worth finding while it's on or coming up.
    noindex: stream.status === "ended",
  });
}

export default async function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [stream, user] = await Promise.all([getStream(id), getCurrentUser()]);
  if (!stream) notFound();
  const cover = stream.remix_id ? coverUrl(stream.remix_id, stream.remix_cover_key) : null;

  // Over: anyone (the host too) can play it back.
  if (stream.status === "ended") {
    const [follow, stats] = await Promise.all([getFollowState(stream.host_id, user?.id ?? null), recap(stream)]);
    return <LiveReplay stream={stream} cover={cover} follow={follow} userId={user?.id ?? null} recap={stats} />;
  }

  // A studio session is run from the Studio itself.
  if (user?.id === stream.host_id && stream.mode === "studio") redirect(`/studio?live=${id}`);

  if (user?.id === stream.host_id && stream.mode === "perform") {
    const remixes = await performableRemixes(user.id);
    return <HostConsole stream={stream} remixes={remixes} cover={cover} />;
  }

  const follow = await getFollowState(stream.host_id, user?.id ?? null);
  return <LiveRoom stream={stream} cover={cover} follow={follow} userId={user?.id ?? null} />;
}
