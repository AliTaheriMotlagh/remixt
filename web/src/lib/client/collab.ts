"use client";

import { create } from "zustand";
import { projectToPayload } from "./remixLanes";
import { withoutRecording } from "./studioHistory";
import {
  DEFAULT_FX,
  PROJECT_DEFAULTS,
  useStudioStore,
  type ProjectSettings,
  type StudioLane,
} from "./studioStore";

// Remixing together: several people in the same Studio mix. The server
// keeps the mix as one versioned document (see lib/projects.ts); this side
// pushes local edits (a moment after they stop) and polls for everyone
// else's every couple of seconds.
//
// When two people edit at once, nothing is thrown away wholesale: the two
// versions are merged lane by lane against the version both started from.
// A lane only one of them touched keeps that person's change; if both
// changed the same lane, the one saved first wins. Solo, the playhead and
// play/pause stay per person.

const PUSH_DELAY_MS = 600;
const POLL_MS = 2000;

type SharedLane = Omit<StudioLane, "solo">;
export type SharedState = { lanes: SharedLane[]; project: ProjectSettings };

export type CollabMember = { id: string; artist_name: string; avatar_color: string; online: boolean; owner: boolean };

type Status = {
  projectId: string | null;
  title: string;
  inviteCode: string | null;
  ownerId: string | null;
  members: CollabMember[];
  sync: "connecting" | "synced" | "saving" | "offline" | "ended";
  lastEditor: string | null;
  error: string | null;
};

const idle: Status = {
  projectId: null,
  title: "",
  inviteCode: null,
  ownerId: null,
  members: [],
  sync: "connecting",
  lastEditor: null,
  error: null,
};

export const useCollab = create<Status>(() => idle);

export function sharedOf(state: ReturnType<typeof useStudioStore.getState>): SharedState {
  return {
    lanes: state.lanes.map((lane) => {
      const shared: Partial<StudioLane> = { ...lane };
      delete shared.solo;
      return shared as SharedLane;
    }),
    project: projectToPayload(state),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A shared state from the server, with defaults for anything an older client left out. */
function normalise(raw: unknown): SharedState {
  const state = (raw ?? {}) as Partial<SharedState>;
  return {
    lanes: (Array.isArray(state.lanes) ? state.lanes : []).map((lane) => ({
      ...lane,
      fx: { ...DEFAULT_FX, ...lane.fx },
      xfade: lane.xfade ?? null,
      automation: lane.automation ?? {},
      clips: lane.clips ?? null,
    })),
    project: { ...PROJECT_DEFAULTS, ...state.project },
  };
}

/**
 * Three-way merge of the mix: `base` is the version both sides started
 * from, `local` has this person's edits, `remote` everyone else's.
 */
export function mergeShared(base: SharedState, local: SharedState, remote: SharedState): SharedState {
  const byId = (lanes: SharedLane[]) => new Map(lanes.map((l) => [l.laneId, l]));
  const baseLanes = byId(base.lanes);
  const localLanes = byId(local.lanes);
  const remoteLanes = byId(remote.lanes);

  const lanes: SharedLane[] = [];
  for (const remoteLane of remote.lanes) {
    const was = baseLanes.get(remoteLane.laneId);
    const mine = localLanes.get(remoteLane.laneId);
    if (!mine) {
      // Removed here: stays removed, unless someone else changed it meanwhile.
      if (was && same(was, remoteLane)) continue;
      lanes.push(remoteLane);
      continue;
    }
    const iChanged = !was || !same(was, mine);
    const theyChanged = !was || !same(was, remoteLane);
    lanes.push(iChanged && !theyChanged ? mine : remoteLane);
  }
  for (const mine of local.lanes) {
    if (remoteLanes.has(mine.laneId)) continue;
    const was = baseLanes.get(mine.laneId);
    // Added here: keep it. Removed by someone else: gone, unless edited here since.
    if (!was || !same(was, mine)) lanes.push(mine);
  }

  const project = { ...remote.project };
  for (const key of Object.keys(project) as (keyof ProjectSettings)[]) {
    if (!same(base.project[key], local.project[key])) {
      (project as Record<string, unknown>)[key] = local.project[key];
    }
  }
  return { lanes, project };
}

class CollabSession {
  private version = 0;
  private base: SharedState | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private applying = false;
  private stopped = false;
  private unsubscribe: (() => void) | null = null;

  constructor(readonly projectId: string) {}

  async start() {
    useCollab.setState({ ...idle, projectId: this.projectId });
    const res = await fetch(`/api/projects/${this.projectId}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (this.stopped) return;
    if (!res?.ok || !data?.project) {
      useCollab.setState({ sync: "ended", error: data?.error ?? "Couldn't open the shared session" });
      return;
    }
    this.version = data.project.version;
    this.base = normalise(data.state);
    this.status(data);
    this.apply(this.base, true);

    this.unsubscribe = useStudioStore.subscribe((state, previous) => {
      if (this.applying) return;
      if (
        state.lanes === previous.lanes &&
        state.projectBpm === previous.projectBpm &&
        state.masterVolume === previous.masterVolume &&
        state.loopEnabled === previous.loopEnabled &&
        state.loopStart === previous.loopStart &&
        state.loopEnd === previous.loopEnd &&
        state.markers === previous.markers &&
        state.crossfader === previous.crossfader &&
        state.pads === previous.pads
      ) {
        return;
      }
      this.schedulePush();
    });
    this.pollTimer = setInterval(() => void this.poll(), POLL_MS);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  stop() {
    this.stopped = true;
    this.unsubscribe?.();
    const pending = this.pushTimer !== null;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    // Send anything still waiting before going.
    if (pending && this.base) void this.push();
    useCollab.setState(idle);
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible") void this.poll();
  };

  private status(data: { project: { title: string; invite_code: string; owner_id: string; updated_by_name: string | null }; members: CollabMember[] }) {
    useCollab.setState({
      title: data.project.title,
      inviteCode: data.project.invite_code,
      ownerId: data.project.owner_id,
      members: data.members,
      lastEditor: data.project.updated_by_name,
      error: null,
    });
  }

  private apply(shared: SharedState, initial = false) {
    this.applying = true;
    try {
      withoutRecording(() => useStudioStore.getState().applySharedState(shared.lanes as StudioLane[], shared.project));
    } finally {
      this.applying = false;
    }
    if (initial) useCollab.setState({ sync: "synced" });
  }

  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, PUSH_DELAY_MS);
  }

  private async push(): Promise<void> {
    if (!this.base) return;
    if (this.busy) {
      this.schedulePush();
      return;
    }
    const local = sharedOf(useStudioStore.getState());
    if (same(local, this.base)) return;
    this.busy = true;
    useCollab.setState({ sync: "saving" });
    try {
      const res = await fetch(`/api/projects/${this.projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseVersion: this.version, state: local }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.version) {
        this.version = data.version;
        this.base = local;
        useCollab.setState({ sync: "synced", error: null });
      } else if (res.status === 409 && data?.project) {
        // Someone saved first: fold their changes in, then send ours again.
        this.merge(normalise(data.state), data.project.version);
        this.schedulePush();
      } else if (res.status === 404) {
        this.end();
      } else {
        useCollab.setState({ sync: "offline", error: data?.error ?? "Couldn't save — retrying" });
        this.schedulePush();
      }
    } catch {
      useCollab.setState({ sync: "offline", error: "Offline — your changes will be sent when you're back" });
      this.schedulePush();
    } finally {
      this.busy = false;
    }
  }

  private merge(remote: SharedState, version: number) {
    const base = this.base!;
    const local = sharedOf(useStudioStore.getState());
    const merged = mergeShared(base, local, remote);
    this.base = remote;
    this.version = version;
    if (!same(merged, local)) this.apply(merged);
  }

  private async poll() {
    if (this.stopped || this.busy || document.visibilityState !== "visible") return;
    // Local edits waiting to go out are sent first; the reply brings theirs.
    if (this.pushTimer) return;
    this.busy = true;
    try {
      const res = await fetch(`/api/projects/${this.projectId}?since=${this.version}`);
      if (res.status === 404) {
        this.end();
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.project) return;
      this.status(data);
      if (!data.unchanged && data.project.version !== this.version) {
        this.merge(normalise(data.state), data.project.version);
        // Our side still has edits the others haven't seen.
        if (!same(sharedOf(useStudioStore.getState()), this.base)) this.schedulePush();
      }
      if (useCollab.getState().sync === "offline") useCollab.setState({ sync: "synced", error: null });
    } catch {
      useCollab.setState({ sync: "offline" });
    } finally {
      this.busy = false;
    }
  }

  private end() {
    this.stop();
    useCollab.setState({ ...idle, sync: "ended", error: "This shared session has ended." });
  }
}

let current: CollabSession | null = null;

/** Joins the shared session `projectId` (leaving any other). Returns the function that disconnects. */
export function connectCollab(projectId: string): () => void {
  current?.stop();
  const session = new CollabSession(projectId);
  current = session;
  void session.start();
  return () => {
    session.stop();
    if (current === session) current = null;
  };
}

/** Starts a shared session from the mix that's open; resolves with its id. */
export async function startSharedSession(title: string): Promise<string> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, state: sharedOf(useStudioStore.getState()) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) throw new Error(data?.error ?? "Couldn't start a shared session");
  return data.id as string;
}

export async function joinSharedSession(code: string): Promise<string> {
  const res = await fetch("/api/projects/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) throw new Error(data?.error ?? "Couldn't join that session");
  return data.id as string;
}

export async function leaveSharedSession(projectId: string) {
  await fetch(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => {});
}
