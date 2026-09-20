import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import sql from "@/lib/db";

// The lane effect rack and the project mix settings are stored as JSON
// blobs (remix_lanes.settings_json / remixes.project_json) rather than a
// column per knob. They're validated loosely on purpose: an older remix
// saved before a control existed just falls back to that control's
// default when the Studio loads it.
const laneSettingsSchema = z
  .object({
    fx: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).optional(),
    bpm: z.number().positive().max(400).nullable().optional(),
  })
  .default({});

const laneSchema = z.object({
  stemId: z.string(),
  volume: z.number().min(0).max(1.5).default(1),
  muted: z.boolean().default(false),
  offsetSeconds: z.number().min(0).max(3600).default(0),
  pitchSemitones: z.number().min(-24).max(24).default(0),
  tempoRatio: z.number().min(0.25).max(4).default(1),
  settings: laneSettingsSchema,
});

const projectSchema = z
  .object({
    projectBpm: z.number().min(20).max(300).default(120),
    masterVolume: z.number().min(0).max(1.5).default(1),
    loopEnabled: z.boolean().default(false),
    loopStart: z.number().min(0).default(0),
    loopEnd: z.number().min(0).default(0),
  })
  .default({
    projectBpm: 120,
    masterVolume: 1,
    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
  });

const createSchema = z.object({
  title: z.string().min(1).max(100),
  published: z.boolean().default(false),
  lanes: z.array(laneSchema).min(1, "Add at least one stem to save a remix"),
  project: projectSchema,
});

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner");

  if (owner === "me") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const remixes = await sql`
      SELECT remixes.*, COUNT(remix_lanes.id)::int as lane_count
      FROM remixes
      LEFT JOIN remix_lanes ON remix_lanes.remix_id = remixes.id
      WHERE remixes.owner_id = ${user.id}
      GROUP BY remixes.id
      ORDER BY remixes.updated_at DESC
    `;
    return NextResponse.json({ remixes });
  }

  const remixes = await sql`
    SELECT remixes.*, users.artist_name, users.id as artist_id,
           COUNT(remix_lanes.id)::int as lane_count
    FROM remixes
    JOIN users ON users.id = remixes.owner_id
    LEFT JOIN remix_lanes ON remix_lanes.remix_id = remixes.id
    WHERE remixes.published = true
    GROUP BY remixes.id, users.artist_name, users.id
    ORDER BY remixes.created_at DESC
  `;
  return NextResponse.json({ remixes });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { title, published, lanes, project } = parsed.data;

  const stemIds = lanes.map((l) => l.stemId);
  const found = await sql<{ id: string }[]>`
    SELECT id FROM stems WHERE id IN ${sql(stemIds)}
  `;
  if (found.length !== new Set(stemIds).size) {
    return NextResponse.json({ error: "One or more stems no longer exist" }, { status: 400 });
  }

  const remixId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO remixes (id, owner_id, title, published, project_json)
      VALUES (${remixId}, ${user.id}, ${title}, ${published}, ${JSON.stringify(project)})
    `;

    for (const [index, lane] of lanes.entries()) {
      await tx`
        INSERT INTO remix_lanes
          (id, remix_id, stem_id, lane_order, volume, muted, offset_seconds,
           pitch_semitones, tempo_ratio, settings_json)
        VALUES
          (${randomUUID()}, ${remixId}, ${lane.stemId}, ${index}, ${lane.volume},
           ${lane.muted}, ${lane.offsetSeconds}, ${lane.pitchSemitones}, ${lane.tempoRatio},
           ${JSON.stringify(lane.settings ?? {})})
      `;
    }
  });

  return NextResponse.json({ id: remixId });
}
