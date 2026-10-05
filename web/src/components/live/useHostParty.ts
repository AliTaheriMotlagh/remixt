"use client";

import { useCallback, useMemo, useRef } from "react";
import { audioEngine } from "@/lib/client/audioEngine";
import { useStudioStore } from "@/lib/client/studioStore";
import type { LiveEvent, Audience } from "@/lib/live";
import type { PartyMusic, PartyPerson } from "@/lib/client/party/partyWorld";
import { readBands, type PartyHandle } from "./PartyStage";

/**
 * The host's view of their own party: the crowd from the audience list,
 * the beat from their own transport, and what the room sends (reactions,
 * chat) played into the scene.
 */
export function useHostParty() {
  const party = useRef<PartyHandle>(null);
  const bands = useRef(new Uint8Array(256));

  const music = useCallback((): PartyMusic => {
    const s = useStudioStore.getState();
    const bpm = s.projectBpm || 120;
    const levels = s.isPlaying ? readBands(audioEngine.getAnalyser(), bands.current) : { low: 0, mid: 0, high: 0 };
    return { playing: s.isPlaying, beats: (s.playhead * bpm) / 60, bpm, ...levels };
  }, []);

  const onReactions = useCallback((bursts: { emoji: string; count: number; userId: string | null }[]) => {
    for (const b of bursts) for (let i = 0; i < Math.min(b.count, 3); i++) party.current?.react(b.emoji, b.userId);
  }, []);

  const onChat = useCallback((events: LiveEvent[]) => {
    for (const e of events) party.current?.say(e.is_host ? "__dj" : e.user_id, e.body);
  }, []);

  return { party, music, onReactions, onChat };
}

/** The audience as people on the dance floor. */
export function useCrowd(audience: Audience | null) {
  return useMemo(() => {
    const people: PartyPerson[] = (audience?.signedIn ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color }));
    return { people, guests: audience?.guests ?? 0 };
  }, [audience]);
}
