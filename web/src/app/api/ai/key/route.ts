import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_MODELS, aiKeyStatus, deleteAiKey, isAiModel, looksLikeKey, saveAiKey, setAiModel } from "@/lib/aiKeys";

// The person's own Anthropic API key for the AI co-producer, saved on their
// account (encrypted — see lib/aiKeys.ts). GET says whether one is saved
// (a hint of it, never the key), PUT saves or replaces it after checking
// Anthropic accepts it, PATCH changes the model, DELETE removes it.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ signedIn: false, saved: false, models: AI_MODELS });
  const status = await aiKeyStatus(user.id);
  return NextResponse.json({ signedIn: true, saved: !!status, hint: status?.hint ?? null, model: status?.model ?? null, models: AI_MODELS });
}

const putSchema = z.object({
  key: z.string().trim().min(20).max(400),
  model: z.string().refine(isAiModel),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a key to your account" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !looksLikeKey(parsed.data.key)) {
    return NextResponse.json({ error: "That doesn't look like an Anthropic API key (it starts with sk-ant-)" }, { status: 400 });
  }
  const { key, model } = parsed.data as { key: string; model: (typeof AI_MODELS)[number]["id"] };
  // Checked with Anthropic before it's kept, so a typo shows up now, not mid-chat.
  try {
    await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15_000 }).models.retrieve(model);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json({ error: "Anthropic didn't accept that key — check it in the Claude Console" }, { status: 400 });
    }
    if (error instanceof Anthropic.NotFoundError) {
      return NextResponse.json({ error: "That key works, but can't use this model — pick another" }, { status: 400 });
    }
    return NextResponse.json({ error: "Couldn't reach Anthropic to check the key — try again" }, { status: 502 });
  }
  const saved = await saveAiKey(user.id, key, model);
  return NextResponse.json({ saved: true, ...saved });
}

const patchSchema = z.object({ model: z.string().refine(isAiModel) });

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  await setAiModel(user.id, parsed.data.model as (typeof AI_MODELS)[number]["id"]);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await deleteAiKey(user.id);
  return NextResponse.json({ saved: false });
}
