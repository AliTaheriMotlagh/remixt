"use client";

import { useEffect, useState } from "react";
import { aiMatchPair, type PairMatch } from "@/lib/client/aiMatch";
import { PROVIDERS, useAiSettings, type AiProvider } from "@/lib/client/aiSettings";
import { useStudioStore, type StudioLane } from "@/lib/client/studioStore";

/** Provider, key and model — kept in this browser only. */
function AiSettingsForm({ onDone }: { onDone: () => void }) {
  const settings = useAiSettings();
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [keys, setKeys] = useState(settings.keys);
  const [models, setModels] = useState(settings.models);
  const info = PROVIDERS[provider];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2.5">
      <div className="flex flex-wrap gap-3 text-xs">
        {(Object.keys(PROVIDERS) as AiProvider[]).map((id) => (
          <label key={id} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ai-provider"
              checked={provider === id}
              onChange={() => setProvider(id)}
              className="accent-brand"
            />
            {PROVIDERS[id].label}
            {keys[id] && <span className="text-success">·key set</span>}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        API key
        <input
          type="password"
          autoComplete="off"
          value={keys[provider]}
          placeholder={info.keyHint}
          onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })}
          className="input !py-1 text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted">
        Model
        <input
          list={`ai-models-${provider}`}
          value={models[provider]}
          onChange={(e) => setModels({ ...models, [provider]: e.target.value })}
          className="input !py-1 text-xs"
        />
        <datalist id={`ai-models-${provider}`}>
          {info.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </label>
      <p className="text-[10px] leading-relaxed text-muted">
        Your key is saved in this browser only and sent straight to {provider === "anthropic" ? "Anthropic" : "OpenAI"} —
        never to Remixt. Each match is one request billed to your account.{" "}
        <a href={info.keyUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
          Get a key
        </a>
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            settings.save({ provider, keys, models });
            onDone();
          }}
          className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-strong"
        >
          Save
        </button>
        {keys[provider] && (
          <button
            onClick={() => setKeys({ ...keys, [provider]: "" })}
            className="nudge"
            title="Remove this key from the browser (press Save)"
          >
            forget key
          </button>
        )}
        <button onClick={onDone} className="nudge">
          cancel
        </button>
      </div>
    </div>
  );
}

/**
 * "✨ AI" on a lane: pick the lane of the other kind to pair it with,
 * optionally say what you want ("chorus first", "come in after 8 bars"),
 * and the chosen language model arranges the vocal on the beat.
 */
export default function LaneAiPanel({ lane }: { lane: StudioLane }) {
  const lanes = useStudioStore((s) => s.lanes);
  const applyLanePatches = useStudioStore((s) => s.applyLanePatches);
  const settings = useAiSettings();
  const partners = lanes.filter((l) => l.kind !== lane.kind);
  const [partnerId, setPartnerId] = useState<string>("");
  const [request, setRequest] = useState("");
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PairMatch | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);

  // Saved settings live in localStorage, which only exists after hydration.
  useEffect(() => useAiSettings.getState().hydrate(), []);

  const partner = partners.find((l) => l.laneId === partnerId) ?? partners[0];
  const hasKey = !!settings.keys[settings.provider].trim();
  const providerName = settings.provider === "anthropic" ? "Claude" : "ChatGPT";

  async function handleMatch() {
    if (!partner) return;
    setError(null);
    setResult(null);
    try {
      const [vocal, beat] = lane.kind === "vocals" ? [lane, partner] : [partner, lane];
      setResult(await aiMatchPair(vocal.laneId, beat.laneId, request, setStage));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI match failed");
    } finally {
      setStage(null);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-brand/40 bg-brand/10 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">✨ AI match</span>
        {partners.length === 0 ? (
          <span className="text-muted">Add a {lane.kind === "vocals" ? "beat" : "vocal"} lane to match this one with.</span>
        ) : (
          <label className="flex items-center gap-1.5 text-muted">
            with
            <select
              value={partner?.laneId ?? ""}
              onChange={(e) => setPartnerId(e.target.value)}
              className="input !w-auto !py-0.5 text-xs"
            >
              {partners.map((p) => (
                <option key={p.laneId} value={p.laneId}>
                  {p.trackTitle}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => setEditingSettings((v) => !v)}
          className="nudge ml-auto"
          title="Choose Claude or ChatGPT and set your API key"
        >
          ⚙ {hasKey ? `${providerName} · ${settings.models[settings.provider]}` : "AI settings"}
        </button>
      </div>

      {editingSettings && <AiSettingsForm onDone={() => setEditingSettings(false)} />}

      {partners.length > 0 && (
        <>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={2}
            placeholder="Optional: what you want — e.g. “start with the chorus”, “vocal in after 8 bars”, “repeat the hook at the end”"
            className="input resize-y text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={hasKey ? handleMatch : () => setEditingSettings(true)}
              disabled={!!stage}
              className="rounded-lg bg-gradient-to-r from-brand to-vocals px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {stage ?? (hasKey ? `Match with ${providerName}` : "Set an API key to start")}
            </button>
            {result && (
              <button
                onClick={() => {
                  applyLanePatches(result.undo.patches, result.undo.projectBpm);
                  setResult(null);
                }}
                className="nudge"
              >
                undo
              </button>
            )}
            <span className="text-[10px] text-muted">
              The model reads the studio&apos;s analysis of both songs (it can&apos;t hear audio) and decides the
              arrangement; pitch is never changed.
            </span>
          </div>
        </>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
      {result && (
        <div className="rounded-lg border border-border bg-surface p-2.5">
          <p className="text-xs leading-relaxed">{result.explanation}</p>
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-muted hover:text-foreground">What changed</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-muted">
              {result.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
          <p className="mt-1 text-[10px] text-muted">
            {result.provider === "anthropic" ? "Claude" : "ChatGPT"} · {result.model}
          </p>
        </div>
      )}
    </div>
  );
}
