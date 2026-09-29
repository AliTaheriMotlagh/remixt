import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/admin";
import { createChallenge, listChallenges } from "@/lib/challenges";
import sql from "@/lib/db";

export async function GET() {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ challenges: await listChallenges() });
}

const schema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1000).default(""),
  vocalStemId: z.string().max(64),
  beatStemId: z.string().max(64),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export async function POST(req: NextRequest) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;
  if (input.endsAt <= input.startsAt) return NextResponse.json({ error: "It has to end after it starts" }, { status: 400 });
  const stems = await sql<{ id: string; kind: string }[]>`
    SELECT stems.id, stems.kind FROM stems JOIN tracks ON tracks.id = stems.track_id
    WHERE stems.id IN ${sql([input.vocalStemId, input.beatStemId])} AND tracks.status = 'ready'
  `;
  const vocal = stems.find((s) => s.id === input.vocalStemId);
  const beat = stems.find((s) => s.id === input.beatStemId);
  if (vocal?.kind !== "vocals" || !beat || beat.kind === "vocals") {
    return NextResponse.json({ error: "Pick one vocal stem and one beat (or drums/bass/melody) stem" }, { status: 400 });
  }
  const id = await createChallenge({ ...input, createdBy: admin.id });
  return NextResponse.json({ id });
}
