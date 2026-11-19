"use client";

// The browser's half of lib/captcha.ts: fetch a challenge, find the number
// in the background while the visitor fills the form, hand it in with it.
// Nothing to tick or click. Only the hashing is done here — WebCrypto in
// batches, so the page stays responsive on a slow phone.

import { useCallback, useEffect, useRef } from "react";

type Challenge = { algorithm: "SHA-256"; salt: string; challenge: string; maxnumber: number; signature: string };

const BATCH = 400;

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

/** Finds the number behind `c`; null if there's none up to its maxnumber (never, for one of ours). */
export async function solve(c: Challenge, signal?: AbortSignal): Promise<number | null> {
  for (let from = 0; from <= c.maxnumber; from += BATCH) {
    if (signal?.aborted) return null;
    const tries = Array.from({ length: Math.min(BATCH, c.maxnumber - from + 1) }, (_, i) => from + i);
    const hashes = await Promise.all(tries.map((n) => sha256Hex(c.salt + n)));
    const found = hashes.indexOf(c.challenge);
    if (found >= 0) return tries[found];
  }
  return null;
}

async function freshToken(signal?: AbortSignal): Promise<string> {
  const c = (await fetch("/api/captcha", { cache: "no-store", signal }).then((r) => r.json())) as Challenge;
  const number = await solve(c, signal);
  if (number === null) throw new Error("Couldn't check you're a person — reload the page");
  return btoa(JSON.stringify({ ...c, number }));
}

/**
 * For a form that needs the check. `send(token)` makes the request; it's
 * sent once more with a fresh answer when the server says the check failed
 * (an answer run out while the form sat open, or used already).
 */
export function useCaptcha() {
  const pending = useRef<Promise<string> | null>(null);
  const start = useCallback(() => {
    const job = freshToken();
    job.catch(() => {
      if (pending.current === job) pending.current = null;
    });
    pending.current = job;
    return job;
  }, []);

  // Started as the form appears, so it's usually ready before the button is pressed.
  useEffect(() => {
    if (!pending.current) start();
  }, [start]);

  return useCallback(
    async (send: (token: string) => Promise<Response>): Promise<Response> => {
      const token = await (pending.current ?? start());
      pending.current = null;
      let res = await send(token);
      if (res.status === 403) {
        const body = (await res.clone().json().catch(() => null)) as { captcha?: boolean } | null;
        if (body?.captcha) res = await send(await start().finally(() => (pending.current = null)));
      }
      // Ready for the next try (a wrong password, say). A form that went through needs none.
      if (!res.ok) start();
      return res;
    },
    [start]
  );
}
