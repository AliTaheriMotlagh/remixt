"use client";

import { useEffect, useRef, useState } from "react";
import { Cable, X } from "lucide-react";
import type { DjEngine } from "@/lib/client/dj/djEngine";
import { MIDI_ACTIONS, MidiLink, applyMidi, controlKey, learn, loadMidiMap, saveMidiMap, type MidiAction, type MidiMap } from "@/lib/client/dj/djMidi";

/**
 * MIDI controller support, best effort: connect, then map controls by
 * learning (pick an action, move the control). Mappings are remembered.
 */
export default function MidiPanel({ engine }: { engine: DjEngine }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [map, setMap] = useState<MidiMap>({});
  const [learning, setLearning] = useState<MidiAction | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const link = useRef<MidiLink | null>(null);
  const state = useRef({ map, learning });
  useEffect(() => {
    state.current = { map, learning };
  });
  useEffect(() => () => link.current?.close(), []);

  const connect = async () => {
    setError(null);
    const l = new MidiLink();
    try {
      setMap(loadMidiMap());
      await l.open((m) => {
        const key = controlKey(m);
        const { map: current, learning: learn_ } = state.current;
        if (learn_) {
          // Ignore releases while learning: the next press or move is the control.
          if (m.kind === "note" && !m.on) return;
          const next = learn(current, key, learn_);
          setMap(next);
          saveMidiMap(next);
          setLearning(null);
          setLast(`${key} → ${MIDI_ACTIONS.find((a) => a.id === learn_)?.label}`);
          return;
        }
        const action = current[key];
        if (action) applyMidi(engine, action, m);
        else setLast(`${key} (not mapped)`);
      });
      l.onChange = () => setInputs([...l.inputs]);
      link.current = l;
      setInputs([...l.inputs]);
      setOn(true);
    } catch {
      setError("MIDI access was refused or isn't available.");
    }
  };

  if (!MidiLink.supported()) {
    return <p className="text-xs text-muted">MIDI controllers: this browser has no Web MIDI (try a Chromium-based browser on desktop).</p>;
  }

  if (!on) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => void connect()} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 font-semibold hover:bg-surface-hover">
          <Cable /> Connect a MIDI controller
        </button>
        <span className="text-muted">Plug in any DJ controller, then map its controls by learning.</span>
        {error && <span className="text-danger">{error}</span>}
      </div>
    );
  }

  const byAction = new Map(Object.entries(map).map(([k, a]) => [a, k]));
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-muted">
        {inputs.length ? `Connected: ${inputs.join(", ")}` : "No MIDI device found yet: plug one in."} {last && <span className="font-mono">· {last}</span>}
      </p>
      <p className="text-muted">{learning ? "Now move or press the control on your controller…" : "Tap an action, then move the control you want for it. Jog wheels must send relative values."}</p>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
        {MIDI_ACTIONS.map((a) => {
          const mapped = byAction.get(a.id);
          return (
            <div key={a.id} className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${learning === a.id ? "border-drums bg-drums/15" : "border-border"}`}>
              <button type="button" onClick={() => setLearning(learning === a.id ? null : a.id)} className="min-h-8 min-w-0 flex-1 truncate text-left font-semibold">
                {a.label}
                <span className="block truncate font-mono text-[10px] font-normal text-muted">{mapped ?? "—"}</span>
              </button>
              {mapped && (
                <button
                  type="button"
                  aria-label={`Clear ${a.label}`}
                  onClick={() => {
                    const next = { ...map };
                    delete next[mapped];
                    setMap(next);
                    saveMidiMap(next);
                  }}
                  className="flex size-7 items-center justify-center rounded hover:bg-surface-hover"
                >
                  <X />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
