import { NextRequest, NextResponse } from "next/server";
import { ImportError, checkHost, checkLink } from "@/lib/linkImport";
import { lyricsFromFile, lyricsFromHtml, lyricsLinkFrom } from "@/lib/lyricsImport";

// Lyrics from a link: a song's page on Genius (or its embed code), a
// lyrics site, a Persian lyrics blog, or an .lrc/.srt/.txt file on the web.
// The page is fetched here — a browser can't read other sites — and only
// the words are sent back.
//
//   POST { link }   a URL, or embed code with one in it
//
// Only public web addresses are fetched (checkLink/checkHost, on every
// redirect too), with a size and time limit. A site that turns this
// server away is reported as such, so the singer can copy the words by hand.

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;

/** The page's text, following redirects one by one so each hop is checked. */
async function fetchPage(link: string): Promise<{ url: string; type: string; body: string }> {
  let url = link;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkHost(new URL(url).hostname);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "RemixtStudio/1.0 (lyrics import for a singer's own use)",
        Accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "Accept-Language": "en,fa;q=0.8",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).href;
      if (!/^https?:$/.test(new URL(url).protocol)) throw new ImportError("That link goes somewhere that can't be read");
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 503) {
      throw new ImportError("That site didn't let the Studio read the page. Open it, copy the words, and tap Paste.");
    }
    if (res.status === 404) throw new ImportError("That page wasn't found — check the link");
    if (!res.ok) throw new ImportError(`That site answered with an error (${res.status}) — try again, or copy the words and Paste them`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text|html|xml|json|octet-stream|subrip|vtt/i.test(type) && type) throw new ImportError("That link isn't a page with lyrics on it");
    // Read up to the limit, no further.
    const reader = res.body?.getReader();
    if (!reader) return { url, type, body: "" };
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size >= MAX_BYTES) {
        void reader.cancel();
        break;
      }
    }
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(/charset=([\w-]+)/i.exec(type)?.[1] ?? "utf-8");
    } catch {
      // A charset the runtime doesn't know.
      decoder = new TextDecoder("utf-8");
    }
    return { url, type, body: decoder.decode(Buffer.concat(chunks)) };
  }
  throw new ImportError("That link redirects too many times");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { link?: unknown } | null;
  const pasted = typeof body?.link === "string" ? body.link.slice(0, 8000) : "";
  const found = lyricsLinkFrom(pasted);
  if (!found) return NextResponse.json({ error: "Paste a link to the lyrics page, or its embed code" }, { status: 400 });
  try {
    const link = await checkLink(found);
    const page = await fetchPage(link);
    const path = new URL(page.url).pathname.toLowerCase();
    const isFile = /\.(lrc|srt|vtt|txt)$/.test(path) || /^text\/(plain|vtt)|subrip/i.test(page.type);
    if (isFile) {
      const text = lyricsFromFile(page.body);
      if (!text) throw new ImportError("That file is empty");
      const name = decodeURIComponent(path.split("/").pop() ?? "").replace(/\.\w+$/, "").replace(/[_-]+/g, " ").trim();
      return NextResponse.json({ title: name || "Lyrics", artist: "", text, source: new URL(page.url).hostname.replace(/^www\./, "") });
    }
    const lyrics = lyricsFromHtml(page.body, page.url);
    if (!lyrics) {
      throw new ImportError("Couldn't find lyrics on that page. Copy the words from it and tap Paste instead.");
    }
    return NextResponse.json(lyrics);
  } catch (err) {
    if (err instanceof ImportError) return NextResponse.json({ error: err.message }, { status: 422 });
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "That site took too long to answer — try again, or copy the words and Paste them" : "Couldn't open that link — check it, or copy the words and Paste them" },
      { status: 502 }
    );
  }
}
