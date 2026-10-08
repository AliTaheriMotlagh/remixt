import { NextResponse } from "next/server";
import { AI_MODELS } from "@/lib/aiKeys";
import { openRouterModels } from "@/lib/openrouter";

// The models the co-producer can run on: Claude's (with an Anthropic key)
// and every OpenRouter model that can use tools (with an OpenRouter key).
// Fetched here rather than in the browser: OpenRouter can't be reached
// from everywhere the Studio is used.

export async function GET() {
  let openrouter: Awaited<ReturnType<typeof openRouterModels>> = [];
  let error: string | null = null;
  try {
    openrouter = await openRouterModels();
  } catch (err) {
    error = err instanceof Error ? err.message : "Couldn't load OpenRouter's models";
  }
  return NextResponse.json(
    { anthropic: AI_MODELS, openrouter, ...(error ? { error } : {}) },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } }
  );
}
