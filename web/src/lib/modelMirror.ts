// The models the browser runs, and this app's own copy of each (see
// app/api/model/[name]/route.ts) for when the browser can't reach where a
// model normally comes from. Shared by the route and the workers.

/** Each mirrored slice is at most this big (under Vercel's 4.5 MB response cap). */
export const MIRROR_SLICE_BYTES = 4 * 1024 * 1024;

/** On a mirrored slice: the whole file's size. */
export const MODEL_SIZE_HEADER = "X-Model-Bytes";

export const SPLITTER_MODEL_URL =
  process.env.NEXT_PUBLIC_DEMUCS_MODEL_URL ||
  "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";

export const BEAT_MODEL_URL =
  process.env.NEXT_PUBLIC_BEAT_MODEL_URL ||
  "https://raw.githubusercontent.com/danigb/beat-this-rs/089b509247e6fdcec666511c0dcf0d5f39c21e73/models/beat_this_small.onnx";

/** Name on this app → where the route fetches it from. Nothing else can be relayed. */
export const MODEL_MIRRORS: Record<string, string> = {
  "htdemucs.onnx": SPLITTER_MODEL_URL,
  "beat-this-small.onnx": BEAT_MODEL_URL,
};

/** This app's copy of a model, or null when the model is already served from here. */
export function mirrorFor(url: string, origin: string): string | null {
  if (url.startsWith("/") || url.startsWith(origin)) return null;
  const name = Object.keys(MODEL_MIRRORS).find((n) => MODEL_MIRRORS[n] === url);
  return name ? `${origin}/api/model/${name}` : null;
}
