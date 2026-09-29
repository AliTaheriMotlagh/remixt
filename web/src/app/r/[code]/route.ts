import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// Short links: /r/<first 8 characters of a remix id> → the remix page.
// Short enough to read out or put in a bio; ids are random, so eight hex
// characters are unique in practice — if two ever match, the older wins.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(code)) return new NextResponse("Not found", { status: 404 });
  const [remix] = await sql<{ id: string }[]>`
    SELECT id FROM remixes WHERE id LIKE ${code + "%"} AND published ORDER BY created_at ASC LIMIT 1
  `;
  if (!remix) return new NextResponse("Not found", { status: 404 });
  // Temporary, so browsers don't remember it if the remix is later deleted.
  return NextResponse.redirect(new URL(`/remixes/${remix.id}`, req.url), 307);
}
