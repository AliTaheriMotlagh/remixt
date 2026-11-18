import { NextRequest, NextResponse } from "next/server";
import { getStation, readFeed } from "@/lib/radio";

// For other apps and games: what's on the station now, open to any site
// (CORS). Poll it every few seconds; `position` and `endsAt` say where the
// song is, `listenUrl` and `embedUrl` are what to open or frame to hear it.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };

export function OPTIONS() {
  return new NextResponse(null, { headers: cors });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!(await getStation(slug))) return NextResponse.json({ error: "No station at this address" }, { status: 404, headers: cors });
  const feed = await readFeed(slug, { sessionId: "public-api", user: null, heartbeat: false });
  if (!feed) return NextResponse.json({ error: "No station at this address" }, { status: 404, headers: cors });
  const origin = req.nextUrl.origin;
  const abs = (url: string | null) => (url ? new URL(url, origin).href : null);
  const now = feed.now;
  return NextResponse.json(
    {
      station: { slug: feed.station.slug, name: feed.station.name, tagline: feed.station.tagline },
      serverNow: feed.serverNow,
      now: now
        ? {
            title: now.title,
            artist: now.artist,
            kind: now.kind,
            cover: abs(now.cover),
            duration: now.duration,
            startedAt: now.startsAt,
            endsAt: now.endsAt,
            position: now.startsAt ? Math.max(0, (feed.serverNow - now.startsAt) / 1000) : 0,
            chosenBy: now.source,
            requestedBy: now.requestedBy,
          }
        : null,
      vote: feed.station.settings.voting ? feed.vote.choices.map((c) => ({ title: c.title, artist: c.artist, votes: c.votes, cover: abs(c.cover) })) : [],
      history: feed.history.slice(0, 5).map((h) => ({ title: h.title, artist: h.artist, startedAt: h.startsAt })),
      listeners: feed.listeners,
      listenUrl: `${origin}/radio/${feed.station.slug}`,
      embedUrl: `${origin}/radio/${feed.station.slug}/embed`,
    },
    { headers: cors }
  );
}
