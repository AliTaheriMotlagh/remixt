"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import StudioTransport from "./StudioTransport";
import StudioTimeline from "./StudioTimeline";
import StudioLaneRow from "./StudioLaneRow";
import StudioLibraryPanel from "./StudioLibraryPanel";
import BpmSyncPanel from "./BpmSyncPanel";
import SamplePads, { PAD_KEYS } from "./studio/SamplePads";
import VocalRecorder from "./studio/VocalRecorder";
import CollabBar from "./studio/CollabBar";
import {
  connectCollab,
  joinSharedSession,
  leaveSharedSession,
  startSharedSession,
} from "@/lib/client/collab";
import { audioEngine } from "@/lib/client/audioEngine";
import { detectMissingKeys } from "@/lib/client/autoMatch";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import { redo, resetHistory, undo } from "@/lib/client/studioHistory";
import {
  clearDraft,
  markDraftClean,
  markDraftDirty,
  readDraft,
  startDraftAutosave,
  type StudioDraft,
} from "@/lib/client/studioDraft";
import type { User } from "@/lib/auth";

function formatAgo(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function Studio({ user }: { user: User | null }) {
  const searchParams = useSearchParams();
  const remixId = searchParams.get("remix");
  const challengeId = searchParams.get("challenge");
  const projectId = searchParams.get("project");
  const joinCode = searchParams.get("join");
  const router = useRouter();
  const [collabError, setCollabError] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);

  const userId = user?.id ?? null;

  // An invite link (/studio?join=<code>): join, then open the session.
  useEffect(() => {
    if (!joinCode) return;
    if (!userId) {
      router.replace(`/login?next=${encodeURIComponent(`/studio?join=${joinCode}`)}`);
      return;
    }
    let cancelled = false;
    joinSharedSession(joinCode)
      .then((id) => !cancelled && router.replace(`/studio?project=${id}`))
      .catch((err) => !cancelled && setCollabError(err instanceof Error ? err.message : "Couldn't join"));
    return () => {
      cancelled = true;
    };
  }, [joinCode, userId, router]);

  // In a shared session: stay in step with everyone else in it.
  useEffect(() => {
    if (!projectId || !userId) return;
    return connectCollab(projectId);
  }, [projectId, userId]);

  async function startTogether() {
    if (!user) {
      router.push("/login?next=/studio");
      return;
    }
    setStartingSession(true);
    setCollabError(null);
    try {
      const store = useStudioStore.getState();
      const title = store.sourceRemix?.title ?? store.lanes[0]?.trackTitle ?? "Untitled session";
      const id = await startSharedSession(`${title} — together`);
      router.replace(`/studio?project=${id}`);
    } catch (err) {
      setCollabError(err instanceof Error ? err.message : "Couldn't start a shared session");
    } finally {
      setStartingSession(false);
    }
  }

  async function leaveTogether() {
    if (projectId) await leaveSharedSession(projectId);
    router.replace("/studio");
  }
  const challenge = useStudioStore((s) => s.challenge);
  const lanes = useStudioStore((s) => s.lanes);
  const loadRemix = useStudioStore((s) => s.loadRemix);
  const setLoop = useStudioStore((s) => s.setLoop);
  const sourceRemix = useStudioStore((s) => s.sourceRemix);
  const [loadingRemix, setLoadingRemix] = useState(!!remixId);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const remixTitle = sourceRemix?.title ?? null;

  // Unsaved work from a previous visit (a reload, or the phone dropping
  // the tab): offer it back, but only to an empty Studio.
  useEffect(() => {
    if (remixId || challengeId || projectId || joinCode || useStudioStore.getState().lanes.length > 0) return;
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    if (saved) setDraft(saved);
  }, [remixId, challengeId, projectId, joinCode]);

  // A shared session is kept on the server; this browser's draft is for solo work.
  useEffect(() => (projectId ? undefined : startDraftAutosave()), [projectId]);

  // /studio?challenge=<id>: the challenge's vocal and beat, ready to remix.
  useEffect(() => {
    if (!challengeId || useStudioStore.getState().challenge?.id === challengeId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/challenges/${challengeId}`).catch(() => null);
      const data = await res?.json().catch(() => null);
      const found = data?.challenge;
      if (cancelled || !found?.vocal || !found?.beat) return;
      const store = useStudioStore.getState();
      if (
        store.lanes.length > 0 &&
        !window.confirm(`Start the “${found.title}” challenge? This replaces the mix that's open (undo can't bring it back — save it first if you want it).`)
      ) {
        return;
      }
      audioEngine.stop();
      store.clearLanes();
      for (const stem of [found.beat, found.vocal]) store.addStem(stem);
      store.setChallenge({ id: found.id, title: found.title });
      resetHistory();
      markDraftClean();
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  function restoreDraft() {
    if (!draft) return;
    audioEngine.stop();
    loadRemix(draft.lanes, draft.project, draft.sourceRemix);
    useStudioStore.getState().setChallenge(draft.challenge ?? null);
    resetHistory();
    markDraftDirty();
    setDraft(null);
  }

  useEffect(() => {
    if (!remixId) return;
    let cancelled = false;
    async function load() {
      setLoadingRemix(true);
      try {
        const res = await fetch(`/api/remixes/${remixId}`);
        const data = await res.json();
        if (cancelled) return;
        loadRemix(
          (data.lanes as RemixLaneApi[]).map(laneFromApi),
          projectFromApi(data.remix),
          data.remix ? { id: data.remix.id, title: data.remix.title } : null
        );
        // A different project: nothing to undo back into, and nothing unsaved.
        resetHistory();
        markDraftClean();
      } finally {
        if (!cancelled) setLoadingRemix(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remixId]);

  // Lanes load in the background as they're added; once they have, work
  // out each one's key so it can be shown and matched without a click.
  useEffect(() => {
    if (lanes.length > 0) void detectMissingKeys();
  }, [lanes]);

  // Transport shortcuts. They're skipped while a form control has focus so
  // that typing a title or a BPM doesn't start playback.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      // Undo/redo — except while typing, where the text box has its own.
      if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        const typing =
          target?.isContentEditable ||
          target?.tagName === "TEXTAREA" ||
          (target instanceof HTMLInputElement && !["range", "checkbox", "button"].includes(target.type));
        if (!typing && (key === "z" || key === "y")) {
          event.preventDefault();
          if (key === "y" || event.shiftKey) redo();
          else undo();
          return;
        }
      }

      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const state = useStudioStore.getState();
      if (event.code === "Space") {
        event.preventDefault();
        if (state.lanes.length === 0) return;
        if (state.isPlaying) audioEngine.pause();
        else void audioEngine.play().catch(() => {});
      } else if (event.code === "Escape") {
        audioEngine.stop();
      } else if (event.key === "l" || event.key === "L") {
        setLoop({ enabled: !state.loopEnabled });
      } else if (event.key === "Home") {
        audioEngine.seek(0);
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && PAD_KEYS.includes(event.key)) {
        const pad = state.pads[PAD_KEYS.indexOf(event.key)];
        if (pad) {
          event.preventDefault();
          void audioEngine.triggerPad(pad).catch(() => {});
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setLoop]);

  // Leaving the Studio shouldn't leave the mix playing behind you.
  useEffect(() => () => audioEngine.stop(), []);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Studio</h1>
          <p className="mt-1 text-sm text-muted">
            {challenge
              ? `🏁 Challenge: “${challenge.title}” — publish to enter`
              : remixTitle
                ? `Remixing “${remixTitle}” — changes save as a new remix`
                : "Mix vocals from one song with the beat from another."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!projectId && (
            <button
              onClick={startTogether}
              disabled={startingSession || lanes.length === 0}
              className="rounded-lg border border-beat/60 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-beat/15 disabled:opacity-40"
              title="Invite other artists to edit this mix with you, live"
            >
              {startingSession ? "Starting…" : "👥 Remix together"}
            </button>
          )}
          <p className="hidden text-right text-[11px] leading-relaxed text-muted lg:block">
            Space play/pause · Esc stop · L loop · 1–0 pads · ⌘/Ctrl+Z undo<br />
            Drag a clip to move it in time
          </p>
        </div>
      </div>

      {collabError && <p className="mt-3 text-sm text-danger">{collabError}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          {projectId && user && <CollabBar userId={user.id} onLeave={() => void leaveTogether()} />}
          {draft && lanes.length === 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/50 bg-brand/10 px-4 py-3 text-sm">
              <span className="flex-1">
                You have an unsaved mix from {formatAgo(draft.savedAt)} ({draft.lanes.length} lane
                {draft.lanes.length === 1 ? "" : "s"}
                {draft.sourceRemix ? `, from “${draft.sourceRemix.title}”` : ""}).
              </span>
              <button
                onClick={restoreDraft}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong"
              >
                Restore it
              </button>
              <button
                onClick={() => {
                  clearDraft();
                  setDraft(null);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Discard
              </button>
            </div>
          )}
          <StudioTransport
            user={user}
            remixId={sourceRemix?.id ?? null}
            defaultTitle={remixTitle ? `${remixTitle} (remix)` : undefined}
          />
          <BpmSyncPanel />
          <StudioTimeline />

          {loadingRemix ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              Loading remix…
            </div>
          ) : lanes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              No stems yet. Add a vocal and a beat from the panel
              {" "}
              <span className="hidden lg:inline">on the right</span>
              <span className="lg:hidden">below</span> to start mixing.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {lanes.map((lane) => (
                <StudioLaneRow key={lane.laneId} lane={lane} />
              ))}
            </div>
          )}

          <VocalRecorder signedIn={!!user} />
          {lanes.length > 0 && <SamplePads />}
        </div>

        <div className="h-[420px] lg:h-[calc(100vh-220px)] lg:sticky lg:top-40">
          <StudioLibraryPanel />
        </div>
      </div>
    </div>
  );
}
