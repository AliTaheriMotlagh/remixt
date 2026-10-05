// What the live code on the server (lib/live.ts) and in the browser share:
// plain constants, with nothing that touches the database.

export const LIVE_REACTIONS = ["🔥", "❤️", "👏", "🎧", "🙌", "😍", "🤯", "💃"] as const;
export type LiveReaction = (typeof LIVE_REACTIONS)[number];

export const CHAT_MAX = 200;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 400;
