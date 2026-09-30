// Link checks shared by the Upload page and /api/import.

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

export function isYouTubeLink(link: string): boolean {
  try {
    return YOUTUBE_HOST.test(new URL(link.trim()).hostname);
  } catch {
    return false;
  }
}

/**
 * YouTube refuses downloads from cloud servers (Vercel included) unless
 * the server fetches through a proxy or with an account's cookies — see
 * YTDLP_PROXY / YTDLP_COOKIES in DEPLOY.md.
 */
export const YOUTUBE_UNAVAILABLE =
  "YouTube links don't work yet — YouTube blocks downloads from our server. " +
  "Download the song another way and upload the file, or paste a link from SoundCloud, Bandcamp or another site.";

/**
 * The links in whatever was pasted: one, or a list — one per line, split
 * by spaces or commas, or run together (a phone pasting several lines into
 * one-line box drops the line breaks). Each once, in order.
 */
export function splitLinks(text: string): string[] {
  let found = text.match(/https?:\/\/.+?(?=https?:\/\/|[\s,]|$)/gi) ?? [];
  // One link typed without its https://.
  const bare = text.trim();
  if (found.length === 0 && /^[^\s,]+\.[^\s,]+$/.test(bare)) found = [`https://${bare}`];
  const links: string[] = [];
  for (const raw of found) {
    try {
      const link = new URL(raw).toString();
      if (!links.includes(link)) links.push(link);
    } catch {
      // Not really a link.
    }
  }
  return links;
}
