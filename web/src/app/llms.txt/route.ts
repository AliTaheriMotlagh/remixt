import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";
import { TOOL_PAGES, toolPages, toolPath } from "@/lib/tools";
import { GUIDES, guidePath } from "@/lib/guides";

// /llms.txt (llmstxt.org): a plain summary of the site and its main pages for
// AI assistants and AI search, which read this instead of the app's markup.
export function GET() {
  const tools = TOOL_PAGES.map((t) => `- [${t.name}](${absoluteUrl(toolPath(t.slug))}): ${t.description}`);
  const guides = GUIDES.map((g) => `- [${g.h1}](${absoluteUrl(guidePath(g.slug))}): ${g.description}`);
  const toolsFa = toolPages("fa").map((t) => `- [${t.name}](${absoluteUrl(toolPath(t.slug, "fa"))}): ${t.description}`);
  const body = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Songs are split by an AI model (Demucs) that runs in the visitor's own browser, so the original file never leaves their device. Every song gives vocals and a beat, plus drums, bass and melody. Splitting, the Studio and exporting (MP3 or WAV) are free.",
    "",
    "## Tools",
    "",
    ...tools,
    "",
    "## Guides",
    "",
    ...guides,
    "",
    "## Tools in Persian (فارسی)",
    "",
    ...toolsFa,
    "",
    "## Main pages",
    "",
    `- [Remix studio](${absoluteUrl("/studio")}): a multitrack studio in the browser — vocal from one song over the beat of another, tempo and key matched automatically, effects, AI producer, export.`,
    `- [Library](${absoluteUrl("/library")}): vocals, beats, drums and bass already split, to preview and remix.`,
    `- [Remixes](${absoluteUrl("/remixes")}): remixes and mashups published by the community.`,
    `- [Radio](${absoluteUrl("/radio")}): live stations where listeners vote on the next song.`,
    `- [DJ decks](${absoluteUrl("/dj")}): two decks for your own split songs, with stem kills and an Auto DJ.`,
    `- [Examples](${absoluteUrl("/examples")}): hear real splits and vocal-to-beat matching.`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
