import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_MODELS, aiKeyStatuses, deleteAiKey, isModelFor, isProvider, looksLikeKey, saveAiKey, setAiModel, type AiProvider } from "@/lib/aiKeys";
import { checkOpenRouterKey } from "@/lib/openrouter";

// The person's own API keys for the AI co-producer — Anthropic and/or
// OpenRouter — saved on their account (encrypted, see lib/aiKeys.ts). GET
// says which are saved (a hint of each, never the key), PUT saves or
// replaces one after checking the provider accepts it, PATCH changes a
// provider's model, DELETE removes one (?provider=).

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ signedIn: false, saved: {}, models: AI_MODELS });
  return NextResponse.json({ signedIn: true, saved: await aiKeyStatuses(user.id), models: AI_MODELS });
}

const putSchema = z.object({ provider: z.string().refine(isProvider), key: z.string().trim().min(20).max(400), model: z.string() });

/** Checks the key with its provider: null when it's accepted, else what to tell the person. */
async function check(provider: AiProvider, key: string, model: string): Promise<{ error: string; status: number } | null> {
  if (provider === "openrouter") {
    const result = await checkOpenRouterKey(key);
    if (result === "ok") return null;
    return result === "invalid"
      ? { error: "OpenRouter didn't accept that key — check it at openrouter.ai/keys", status: 400 }
      : { error: "Couldn't reach OpenRouter to check the key — try again", status: 502 };
  }
  try {
    await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15_000 }).models.retrieve(model);
    return null;
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return { error: "Anthropic didn't accept that key — check it in the Claude Console", status: 400 };
    }
    if (error instanceof Anthropic.NotFoundError) return { error: "That key works, but can't use this model — pick another", status: 400 };
    return { error: "Couldn't reach Anthropic to check the key — try again", status: 502 };
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a key to your account" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const provider = parsed.data.provider as AiProvider;
  const { key, model } = parsed.data;
  if (!looksLikeKey(provider, key)) {
    return NextResponse.json(
      { error: provider === "anthropic" ? "That doesn't look like an Anthropic API key (it starts with sk-ant-)" : "That doesn't look like an OpenRouter key (it starts with sk-or-)" },
      { status: 400 }
    );
  }
  if (!isModelFor(provider, model)) return NextResponse.json({ error: "Pick a model" }, { status: 400 });
  // Checked with the provider before it's kept, so a typo shows up now, not mid-chat.
  const problem = await check(provider, key, model);
  if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });
  const saved = await saveAiKey(user.id, provider, key, model);
  return NextResponse.json({ saved: true, provider, ...saved });
}

const patchSchema = z.object({ provider: z.string().refine(isProvider), model: z.string() });

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  const provider = parsed.data?.provider as AiProvider | undefined;
  if (!parsed.success || !provider || !isModelFor(provider, parsed.data.model)) return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  await setAiModel(user.id, provider, parsed.data.model);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const provider = req.nextUrl.searchParams.get("provider") ?? "anthropic";
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  await deleteAiKey(user.id, provider);
  return NextResponse.json({ saved: false });
}
