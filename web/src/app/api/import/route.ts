import { randomUUID } from "crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { checkLink, downloadSong, ImportError } from "@/lib/linkImport";
import { putObject, storageProblem, sweepOld } from "@/lib/storage";

// Fetching a song can take a while on a slow site.
export const maxDuration = 300;

const bodySchema = z.object({ url: z.string().trim().min(1).max(2000) });

// Gets the song behind a pasted link and parks it in storage under
// imports/<user>/, returning an id the browser downloads it by (from
// /api/import/<id>) before splitting it like any file of its own. The
// browser deletes it once it has it; anything left behind is swept.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const problem = storageProblem();
  if (problem) return NextResponse.json({ error: problem }, { status: 503 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a link first" }, { status: 400 });

  try {
    const link = await checkLink(parsed.data.url);
    const song = await downloadSong(link, AbortSignal.timeout((maxDuration - 30) * 1000));
    const id = `${randomUUID()}.${song.ext}`;
    await putObject(`imports/${user.id}/${id}`, song.bytes);
    after(() => sweepOld("imports/", 60 * 60 * 1000).catch(() => {}));
    return NextResponse.json({ id, title: song.title, size: song.bytes.length });
  } catch (err) {
    if (err instanceof ImportError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error("link import failed", err);
    return NextResponse.json({ error: "Couldn't import that link" }, { status: 500 });
  }
}
