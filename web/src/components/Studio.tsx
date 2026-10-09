"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Flag, Library, SlidersHorizontal, Sparkles, Users } from "lucide-react";
import StudioTransport from "./StudioTransport";
import StudioLibraryPanel from "./StudioLibraryPanel";
import SamplePads from "./studio/SamplePads";
import VocalRecorder from "./studio/VocalRecorder";
import StudioShortcuts from "./studio/StudioShortcuts";
import CollabBar from "./studio/CollabBar";
import Arrangement from "./studio/Arrangement";
import LaneInspector from "./studio/LaneInspector";
import AiProducer from "./studio/AiProducer";
import SplitLaneDialog from "./studio/SplitLaneDialog";
import ContextMenuHost from "./studio/ContextMenu";
import StudioNotice from "./studio/StudioNotice";
import LiveStudioBar, { GoLiveStudioButton } from "./live/LiveStudioBar";
import {
  connectCollab,
  joinSharedSession,
  leaveSharedSession,
  startSharedSession,
} from "@/lib/client/collab";
import { audioEngine } from "@/lib/client/audioEngine";
import { detectMissingKeys, listenForBeats } from "@/lib/client/autoMatch";
import { laneFromApi, projectFromApi, type RemixLaneApi } from "@/lib/client/remixLanes";
import { useStudioStore } from "@/lib/client/studioStore";
import { useStudioView } from "@/lib/client/studioView";
import { resetHistory } from "@/lib/client/studioHistory";
import {
  clearDraft,
  markDraftClean,
  markDraftDirty,
  readDraft,
  startDraftAutosave,
  type StudioDraft,
} from "@/lib/client/studioDraft";
import type { User } from "@/lib/auth";
import { coverUrl } from "@/lib/cover";

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
  /** Stems to open with, e.g. from the examples page: /studio?stems=<id>,<id>. */
  const stemsParam = searchParams.get("stems");
  /** Making this remix live (see components/live/LiveStudioBar). */
  const liveId = searchParams.get("live");
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
  const sourceRemix = useStudioStore((s) => s.sourceRemix);
  const [loadingRemix, setLoadingRemix] = useState(!!remixId);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  // Below desktop width the stem library is a sheet that slides up; on a
  // desktop it can be folded away to give the timeline the room.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryHidden, setLibraryHidden] = useState(false);
  // Briefly ringed after "Add a vocal or beat", so it's clear where to pick from.
  const [libraryFlash, setLibraryFlash] = useState(0);
  const libraryRef = useRef<HTMLElement>(null);

  /** Takes you to the stem library: a sheet on phones; on a desktop, shown, scrolled to and focused. */
  function revealLibrary() {
    if (!window.matchMedia("(min-width: 64rem)").matches) {
      setLibraryOpen(true);
      return;
    }
    setLibraryHidden(false);
    setLibraryFlash((n) => n + 1);
  }

  // Runs once the library is on screen (it may have just been un-hidden).
  useEffect(() => {
    if (!libraryFlash) return;
    const aside = libraryRef.current;
    const rect = aside?.getBoundingClientRect();
    // It's sticky, so usually already in view — only scroll when it isn't.
    if (rect && (rect.top < 0 || rect.top > window.innerHeight)) aside!.scrollIntoView({ block: "nearest", behavior: "smooth" });
    aside?.querySelector<HTMLInputElement>('input[aria-label="Search stems"]')?.focus({ preventScroll: true });
    const timer = setTimeout(() => setLibraryFlash(0), 1600);
    return () => clearTimeout(timer);
  }, [libraryFlash]);
  const remixTitle = sourceRemix?.title ?? null;
  const aiOpen = useStudioView((s) => s.aiOpen);
  const aiSheet = useStudioView((s) => s.aiSheet);

  // Asked for from elsewhere (the AI producer's "Pick from the library").
  const libraryAsk = useStudioView((s) => s.libraryAsk);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the store: the library asked for elsewhere
    if (libraryAsk) revealLibrary();
  }, [libraryAsk]);

  // With the AI producer docked on a desktop narrower than ~1600px, the
  // timeline, the library and the panel don't all fit: the library folds
  // away while the panel is open (Show library brings it back), and comes
  // back when the panel closes — unless the person had hidden it themselves.
  const foldedForAi = useRef(false);
  useEffect(() => {
    const squeezed = window.matchMedia("(min-width: 64rem) and (max-width: 99.999rem)").matches;
    if (aiOpen && squeezed && !libraryHidden) {
      foldedForAi.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- following the AI panel opening
      setLibraryHidden(true);
    } else if (!aiOpen && foldedForAi.current) {
      foldedForAi.current = false;
      setLibraryHidden(false);
    }
    // Only when the panel opens or closes, not when the person toggles the library.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen]);

  // Unsaved work from a previous visit (a reload, or the phone dropping
  // the tab): offer it back, but only to an empty Studio.
  useEffect(() => {
    if (remixId || challengeId || projectId || joinCode || stemsParam || useStudioStore.getState().lanes.length > 0) return;
    const saved = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    if (saved) setDraft(saved);
  }, [remixId, challengeId, projectId, joinCode, stemsParam]);

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

  // /studio?stems=<id>,<id>: start a mix with those stems from the library.
  useEffect(() => {
    const ids = (stemsParam ?? "").split(",").filter((id) => /^[\w-]{8,64}$/.test(id)).slice(0, 8);
    if (!ids.length) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/stems").catch(() => null);
      const data = await res?.json().catch(() => null);
      if (cancelled || !Array.isArray(data?.stems)) return;
      const found = ids
        .map((id) => (data.stems as { id: string }[]).find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s) as unknown as Parameters<ReturnType<typeof useStudioStore.getState>["addStem"]>[0][];
      if (!found.length) return;
      const store = useStudioStore.getState();
      if (store.lanes.length > 0 && !window.confirm("Open these stems? This replaces the mix that's open (save it first if you want it).")) return;
      audioEngine.stop();
      store.clearLanes();
      // The beat first, so the vocal sits on top in the lane list.
      for (const stem of [...found].sort((a, b) => (a.kind === "vocals" ? 1 : 0) - (b.kind === "vocals" ? 1 : 0))) store.addStem(stem);
      resetHistory();
      markDraftDirty();
      // Off the address, so a reload doesn't ask again.
      router.replace("/studio");
    })();
    return () => {
      cancelled = true;
    };
  }, [stemsParam, router]);

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
          data.remix ? { id: data.remix.id, title: data.remix.title, cover: coverUrl(data.remix.id, data.remix.cover_key) } : null
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
    if (lanes.length > 0) void detectMissingKeys().then(listenForBeats);
  }, [lanes]);

  // Leaving the Studio shouldn't leave the mix playing behind you.
  useEffect(() => () => audioEngine.stop(), []);

  // While the library sheet is up, the page behind it stays put.
  useEffect(() => {
    if (!libraryOpen) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setLibraryOpen(false);
    document.addEventListener("keydown", onKeyDown);
    // Rotating a tablet to landscape puts the library back beside the mix.
    const desktop = window.matchMedia("(min-width: 64rem)");
    const onChange = () => desktop.matches && setLibraryOpen(false);
    desktop.addEventListener("change", onChange);
    return () => {
      root.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener("change", onChange);
    };
  }, [libraryOpen]);

  return (
    // With the AI producer docked on the right, the Studio makes room for it.
    <div
      className={`touch-targets mx-auto w-full max-w-[110rem] px-3 py-4 max-lg:pb-[calc(6rem+var(--ai-sheet-h,0px))] sm:px-5 sm:py-5 ${
        aiOpen ? "lg:max-w-none lg:pr-[24.25rem] xl:pr-[28.25rem]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Studio</h1>
          <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">
            {challenge ? (
              <>
                <Flag /> Challenge: “{challenge.title}” — publish to enter
              </>
            ) : remixTitle ? (
              `Remixing “${remixTitle}” — changes save as a new remix`
            ) : (
              "Mix vocals from one song with the beat from another."
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!liveId && !projectId && <GoLiveStudioButton signedIn={!!user} />}
          {!projectId && (
            <button
              onClick={startTogether}
              disabled={startingSession || lanes.length === 0}
              className="rounded-lg border border-beat/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-beat/15 disabled:opacity-40"
              title="Invite other artists to edit this mix with you, live"
            >
              {startingSession ? "Starting…" : (
                <>
                  <Users />
                  <span className="hidden sm:inline"> Remix together</span>
                  <span className="sm:hidden"> Invite</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={() => {
              // The person's own choice now: closing the AI panel leaves it be.
              foldedForAi.current = false;
              setLibraryHidden((v) => !v);
            }}
            aria-pressed={!libraryHidden}
            className="hidden rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground lg:block"
            title={libraryHidden ? "Show the stem library" : "Hide the stem library for a wider timeline"}
          >
            <Library /> {libraryHidden ? "Show library" : "Hide library"}
          </button>
          <StudioShortcuts mode="studio" />
        </div>
      </div>

      {collabError && <p className="mt-3 text-sm text-danger">{collabError}</p>}

      <div className={`mt-4 grid grid-cols-1 gap-5 ${libraryHidden ? "" : "lg:grid-cols-[minmax(0,1fr)_280px]"}`}>
        <div className="flex min-w-0 flex-col gap-3">
          {liveId && user && <LiveStudioBar streamId={liveId} userId={user.id} />}
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

          {loadingRemix ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-muted">
              Loading remix…
            </div>
          ) : lanes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center text-muted sm:p-12">
              <SlidersHorizontal className="mx-auto h-8 w-8 text-brand-strong" />
              <p className="mt-2 font-medium text-foreground">Start with a vocal and a beat</p>
              <p className="mt-1 text-sm">
                Pick them <span className="hidden lg:inline">from the library on the right</span>
                <span className="lg:hidden">from the library</span> — then cut, loop and arrange them here, and ask <Sparkles /> AI for ideas.
              </p>
              <button
                onClick={revealLibrary}
                className="mx-auto mt-4 flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
              >
                + Add a vocal or beat
              </button>
            </div>
          ) : (
            <>
              <Arrangement />
              <LaneInspector />
            </>
          )}

          <VocalRecorder signedIn={!!user} />
          {lanes.length > 0 && <SamplePads />}
        </div>

        {libraryOpen && (
          <div className="fixed inset-0 z-[60] bg-black/55 lg:hidden" onClick={() => setLibraryOpen(false)} />
        )}
        <aside
          ref={libraryRef}
          aria-label="Stem library"
          className={`flex flex-col transition-shadow duration-500 lg:sticky lg:rounded-xl ${
            libraryFlash > 0 ? "shadow-[0_0_0_2px_var(--brand),0_0_32px_-4px_var(--brand)]" : ""
          } lg:top-[calc(var(--header-h)+1.5rem)] lg:h-[calc(100dvh-var(--header-h)-3rem)] ${
            libraryHidden ? "lg:hidden" : ""
          } ${
            libraryOpen
              ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[61] max-lg:mx-auto max-lg:h-[85dvh] max-lg:max-w-2xl max-lg:rounded-t-2xl max-lg:border max-lg:border-b-0 max-lg:border-border max-lg:bg-background max-lg:px-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:shadow-2xl"
              : "max-lg:hidden"
          }`}
          style={libraryOpen ? { animation: "sheet-in 0.2s ease-out" } : undefined}
        >
          <div className="flex items-center justify-between gap-3 py-3 lg:hidden">
            <div>
              <p className="font-semibold">Add stems</p>
              <p className="text-xs text-muted">
                {lanes.length === 0 ? "Pick a vocal and a beat to start" : `${lanes.length} in your mix`}
              </p>
            </div>
            <button
              onClick={() => setLibraryOpen(false)}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Done
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <StudioLibraryPanel />
          </div>
        </aside>
      </div>

      {/* With the AI producer open it floats above its sheet (see .bottom-float) — hidden only when the sheet covers the mix. */}
      {!libraryOpen && !(aiOpen && aiSheet === "full") && (
        <button
          onClick={() => setLibraryOpen(true)}
          className="bottom-float fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-lg shadow-brand/30 hover:bg-brand-strong lg:hidden"
          style={{ marginRight: "env(safe-area-inset-right)" }}
        >
          <span className="text-lg leading-none">+</span> Add stems
        </button>
      )}
      <AiProducer />
      <SplitLaneDialog />
      <ContextMenuHost />
      <StudioNotice />
    </div>
  );
}
