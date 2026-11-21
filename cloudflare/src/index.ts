import { Container, getContainer } from "@cloudflare/containers";

// Every setting the app reads. Each is passed to the container when set
// (as a `wrangler secret` or a var in wrangler.jsonc).
const KEYS = [
  "DATABASE_URL", "SESSION_SECRET", "PUBLIC_BASE_URL", "ADMIN_EMAILS",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL",
  "CAPTCHA_SECRET", "AI_KEY_SECRET", "AI_SHARED_ANTHROPIC_KEY", "AI_SHARED_MODEL",
  "AI_SHARED_DAILY_QUESTIONS", "GENIUS_ACCESS_TOKEN", "YTDLP_PROXY", "YTDLP_COOKIES",
  "MUSIC_SITES", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION", "YANDEX_VERIFICATION",
  "STORAGE_LIMIT_GB",
] as const;

type Env = { REMIXT: DurableObjectNamespace<Remixt> } & Partial<Record<(typeof KEYS)[number], string>>;

export class Remixt extends Container<Env> {
  defaultPort = 3000;
  // Sleep after an hour without visitors; the next visit wakes it (a few seconds).
  sleepAfter = "1h";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    const vars: Record<string, string> = {};
    for (const k of KEYS) if (env[k]) vars[k] = env[k]!;
    this.envVars = vars;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.remixt.app") {
      url.hostname = "remixt.app";
      return Response.redirect(url.toString(), 301);
    }
    // One shared instance: the app keeps live rooms (radio, DJ) in memory.
    return getContainer(env.REMIXT, "main").fetch(request);
  },
};
