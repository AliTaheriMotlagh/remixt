import { NextRequest, NextResponse } from "next/server";
import { currentAdmin, deleteTracks, isAdmin } from "@/lib/admin";
import sql from "@/lib/db";
import { memberActivity } from "@/lib/analyticsStore";
import { problemsOfUser } from "@/lib/feedbackStore";
import { formatMoney } from "@/lib/monetize/policy";

// GET: everything about one member, for Admin → Users (admin only): who they
// are, what they made and shared, their money, and their trail on the site
// (devices, places, sessions, the last pages and events).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentAdmin())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const [user] = await sql<{ id: string; email: string; artist_name: string; bio: string; avatar_color: string; created_at: string }[]>`
    SELECT id, email, artist_name, bio, avatar_color, created_at FROM users WHERE id = ${id}
  `;
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [made] = await sql<Record<string, number>[]>`
    SELECT
      (SELECT count(*) FROM tracks WHERE owner_id = ${id})::int AS songs,
      (SELECT count(*) FROM tracks WHERE owner_id = ${id} AND visibility <> 'public')::int AS private_songs,
      (SELECT count(*) FROM track_shares ts JOIN tracks t ON t.id = ts.track_id WHERE t.owner_id = ${id})::int AS shares_given,
      (SELECT count(*) FROM track_shares WHERE user_id = ${id})::int AS shared_with_them,
      (SELECT count(*) FROM remixes WHERE owner_id = ${id})::int AS remixes,
      (SELECT count(*) FROM remixes WHERE owner_id = ${id} AND published)::int AS published,
      (SELECT coalesce(sum(play_count), 0) FROM remixes WHERE owner_id = ${id})::int AS plays,
      (SELECT count(*) FROM remix_likes l JOIN remixes r ON r.id = l.remix_id WHERE r.owner_id = ${id})::int AS likes_received,
      (SELECT count(*) FROM follows WHERE followee_id = ${id})::int AS followers,
      (SELECT count(*) FROM follows WHERE follower_id = ${id})::int AS following,
      (SELECT count(*) FROM remix_comments WHERE user_id = ${id})::int AS comments,
      (SELECT count(*) FROM project_members WHERE user_id = ${id})::int AS projects,
      (SELECT count(*) FROM reports WHERE status IS DISTINCT FROM 'resolved' AND (target_id = ${id} OR target_id IN (SELECT id FROM remixes WHERE owner_id = ${id}) OR target_id IN (SELECT id FROM tracks WHERE owner_id = ${id})))::int AS open_reports
  `.catch(() => [{}]);
  const [money] = await sql<{ earned: string; paid: string; waiting: string }[]>`
    SELECT coalesce(sum(micros), 0)::bigint AS earned,
           coalesce(sum(micros) FILTER (WHERE payout_id IS NOT NULL), 0)::bigint AS paid,
           coalesce(sum(micros) FILTER (WHERE available_at > now()), 0)::bigint AS waiting
    FROM earnings WHERE user_id = ${id}
  `.catch(() => [{ earned: "0", paid: "0", waiting: "0" }]);
  const recentWork = await sql<{ kind: string; id: string; title: string; created_at: string; state: string }[]>`
    (SELECT 'song' AS kind, id, title, created_at, visibility AS state FROM tracks WHERE owner_id = ${id} ORDER BY created_at DESC LIMIT 10)
    UNION ALL
    (SELECT 'remix', id, title, created_at, CASE WHEN published THEN 'published' ELSE 'private' END FROM remixes WHERE owner_id = ${id} ORDER BY created_at DESC LIMIT 10)
    ORDER BY created_at DESC LIMIT 15
  `;
  const [activity, trouble] = await Promise.all([memberActivity(id).catch(() => null), problemsOfUser(id).catch(() => null)]);
  return NextResponse.json(
    {
      user: { ...user, admin: isAdmin(user) },
      made,
      money: { earned: formatMoney(Number(money.earned)), paid: formatMoney(Number(money.paid)), waiting: formatMoney(Number(money.waiting)) },
      recentWork,
      activity,
      trouble,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Deletes an account with everything it owns: its songs (and their stem
// files) and its remixes. Admins can't be deleted from here — take them out
// of ADMIN_EMAILS first.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;

  const [user] = await sql<{ id: string; email: string }[]>`SELECT id, email FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.id === admin.id || isAdmin(user)) {
    return NextResponse.json({ error: "Admins can't be deleted here" }, { status: 400 });
  }

  const tracks = await sql<{ id: string }[]>`SELECT id FROM tracks WHERE owner_id = ${id}`;
  const songs = await deleteTracks(tracks.map((t) => t.id));
  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true, songs });
}
