import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { AI_MODELS, aiKeyStatuses, checkAiKey, deleteAiKey, isModelFor, isProvider, looksLikeKey, saveAiKey, setAiModel, type AiProvider } from "@/lib/aiKeys";
import { sharedAi, sharedQuestionsLeft } from "@/lib/aiShared";

// The person's own API keys for the AI co-producer — Anthropic and/or
// OpenRouter — saved on their account (encrypted, see lib/aiKeys.ts). GET
// says which are saved (a hint of each, never the key), PUT saves or
// replaces one after checking the provider accepts it, PATCH changes a
// provider's model, DELETE removes one (?provider=).
//
// A key is only turned away when the provider says it's no good. When the
// provider can't be reached to ask (a slow or blocked network, an outage),
// it's saved all the same, and the person is told it couldn't be checked:
// refusing it then lost the key, and the person had no way to save it.

export async function GET() {
  const user = await getCurrentUser();
  // The site's free AI, when it offers one: how many questions a day, and how many are left today.
  const shared = sharedAi();
  if (!user) return NextResponse.json({ signedIn: false, saved: {}, models: AI_MODELS, shared: shared ? { limit: shared.dailyQuestions, left: null } : null });
  const left = shared ? await sharedQuestionsLeft(user.id, shared).catch(() => shared.dailyQuestions) : null;
  // A database hiccup doesn't make a signed-in person look signed out (their keys would seem gone, and "On my account" greyed out).
  const saved = await aiKeyStatuses(user.id).catch(() => null);
  return NextResponse.json({
    signedIn: true,
    saved: saved ?? {},
    ...(saved ? {} : { error: "Couldn't read the keys saved on your account just now — try again in a moment" }),
    models: AI_MODELS,
    shared: shared ? { limit: shared.dailyQuestions, left } : null,
  });
}

const putSchema = z.object({ provider: z.string().refine(isProvider), key: z.string().trim().min(20).max(400), model: z.string() });

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
  const checked = await checkAiKey(provider, key, model);
  if (checked.ok === false) return NextResponse.json({ error: checked.error }, { status: checked.status });
  try {
    const saved = await saveAiKey(user.id, provider, key, model);
    return NextResponse.json({ saved: true, provider, ...saved, ...(checked.ok === "unchecked" ? { warning: checked.warning } : {}) });
  } catch (error) {
    // No secret to encrypt it with (see aiKeys.ts), or the database is down: said plainly, not as a bare 500.
    const missingSecret = error instanceof Error && /AI_KEY_SECRET|SESSION_SECRET/.test(error.message);
    return NextResponse.json(
      { error: missingSecret ? "This server can't keep keys yet — its admin needs to set AI_KEY_SECRET (see DEPLOY.md). Keep it in this browser meanwhile." : "Couldn't save the key to your account just now — try again" },
      { status: 500 }
    );
  }
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
