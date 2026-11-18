import { NextRequest, NextResponse } from "next/server";
import { playLog, stationReport } from "@/lib/radio";
import { noStore, requireManager } from "@/lib/radioRequest";

const csvCell = (v: unknown) => {
  const text = String(v ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// The station's numbers (?days=7|14|30), or every play as CSV (?format=csv) for logs and royalty reports.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await requireManager(slug);
  if ("error" in found) return found.error;
  const q = req.nextUrl.searchParams;
  const days = Math.max(1, Math.min(90, Number(q.get("days")) || 14));
  if (q.get("format") === "csv") {
    const rows = await playLog(found.station, days);
    const lines = [
      ["started (UTC)", "title", "artist", "kind", "id", "seconds", "how it was chosen", "requested by", "votes", "listeners at peak", "skipped"],
      ...rows.map((r) => [
        r.startsAt ? new Date(r.startsAt).toISOString() : "",
        r.title,
        r.artist,
        r.kind,
        r.id,
        Math.round(r.duration),
        r.source,
        r.requestedBy ?? "",
        r.votes,
        r.listenersPeak,
        r.status === "skipped" ? "yes" : "",
      ]),
    ];
    return new NextResponse(lines.map((l) => l.map(csvCell).join(",")).join("\n"), {
      headers: { ...noStore, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${found.station.slug}-plays-${days}d.csv"` },
    });
  }
  return NextResponse.json(await stationReport(found.station, days), { headers: noStore });
}
