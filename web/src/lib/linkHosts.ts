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
