import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const remixRows = await sql`
    SELECT remixes.*, users.artist_name, users.id as artist_id
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.id = ${id}
  `;
  const remix = remixRows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lanes = await sql`
    SELECT remix_lanes.*, stems.kind, stems.file_url, stems.peaks_json,
           tracks.title as track_title, tracks.duration as track_duration,
           tracks.bpm as track_bpm, users.artist_name as stem_artist_name
    FROM remix_lanes
    JOIN stems ON stems.id = remix_lanes.stem_id
    JOIN tracks ON tracks.id = stems.track_id
    JOIN users ON users.id = tracks.owner_id
    WHERE remix_lanes.remix_id = ${id}
    ORDER BY remix_lanes.lane_order ASC
  `;

  return NextResponse.json({ remix, lanes });
}

const patchSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  published: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const rows = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM remixes WHERE id = ${id}
  `;
  const remix = rows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { title, published } = parsed.data;
  await sql`
    UPDATE remixes SET
      title = COALESCE(${title ?? null}, title),
      published = COALESCE(${published ?? null}, published),
      updated_at = now()
    WHERE id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const rows = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM remixes WHERE id = ${id}
  `;
  const remix = rows[0];
  if (!remix) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (remix.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await sql`DELETE FROM remixes WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
