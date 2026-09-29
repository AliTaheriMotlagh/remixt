import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getAiSettings, saveAiSettings } from "@/lib/aiKeys";

// The signed-in user's AI producer settings: which service, which model,
// and their own API keys. Keys go in here and are never sent back out —
// GET returns only their last four characters (and how much of the shared
// free AI they have left today).

const modelName = z.string().trim().max(100).regex(/^[\w.:/-]*$/, "Invalid model name");

const keyValue = z.string().max(500).optional();

const updateSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini", "groq", "free"]),
  models: z.object({ anthropic: modelName, openai: modelName, gemini: modelName, groq: modelName }),
  keys: z
    .object({ anthropic: keyValue, openai: keyValue, gemini: keyValue, groq: keyValue })
    .default({}),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  return NextResponse.json(await getAiSettings(user.id));
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await saveAiSettings(user.id, parsed.data);
  return NextResponse.json(await getAiSettings(user.id));
}
