// What the learner has achieved, saved in localStorage: stars and best score
// per mission, which missions are unlocked, and the rank that follows.
// Every storage access is wrapped: private browsing or a full disk must not
// break the simulator.

import { rankForStars } from "./scoring";

export type MissionRecord = { stars: number; best: number; attempts: number };
export type DjProgress = { version: 1; missions: Record<string, MissionRecord> };

export const PROGRESS_KEY = "remixt-dj-progress-v1";

export const emptyProgress = (): DjProgress => ({ version: 1, missions: {} });

function isRecord(v: unknown): v is MissionRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as MissionRecord;
  return Number.isFinite(r.stars) && Number.isFinite(r.best) && Number.isFinite(r.attempts);
}

export function parseProgress(raw: string | null): DjProgress {
  if (!raw) return emptyProgress();
  try {
    const data = JSON.parse(raw) as { missions?: Record<string, unknown> };
    const missions: Record<string, MissionRecord> = {};
    for (const [id, rec] of Object.entries(data.missions ?? {})) {
      if (isRecord(rec)) missions[id] = { stars: Math.min(3, Math.max(0, Math.round(rec.stars))), best: Math.min(100, Math.max(0, Math.round(rec.best))), attempts: Math.max(0, Math.round(rec.attempts)) };
    }
    return { version: 1, missions };
  } catch {
    return emptyProgress();
  }
}

export function loadProgress(): DjProgress {
  try {
    return parseProgress(globalThis.localStorage?.getItem(PROGRESS_KEY) ?? null);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: DjProgress) {
  try {
    globalThis.localStorage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage is full or blocked: progress just won't persist.
  }
}

export function clearProgress() {
  try {
    globalThis.localStorage?.removeItem(PROGRESS_KEY);
  } catch {
    // Nothing to do.
  }
}

/** Records a finished attempt; keeps the best stars and score. Returns a new object. */
export function recordResult(progress: DjProgress, missionId: string, score: number, stars: number): DjProgress {
  const prev = progress.missions[missionId];
  return {
    version: 1,
    missions: {
      ...progress.missions,
      [missionId]: {
        stars: Math.max(prev?.stars ?? 0, stars),
        best: Math.max(prev?.best ?? 0, score),
        attempts: (prev?.attempts ?? 0) + 1,
      },
    },
  };
}

/** A mission is open when it is the first, or the one before it has at least one star. */
export function isUnlocked(progress: DjProgress, index: number, missionIds: string[]) {
  if (index <= 0) return true;
  return (progress.missions[missionIds[index - 1]]?.stars ?? 0) >= 1;
}

export function totalStars(progress: DjProgress) {
  return Object.values(progress.missions).reduce((t, m) => t + m.stars, 0);
}

export function rankOf(progress: DjProgress) {
  return rankForStars(totalStars(progress));
}

/** The first unlocked mission without a star, else the last. */
export function nextMissionIndex(progress: DjProgress, missionIds: string[]) {
  for (let i = 0; i < missionIds.length; i++) {
    if (isUnlocked(progress, i, missionIds) && (progress.missions[missionIds[i]]?.stars ?? 0) < 1) return i;
  }
  return missionIds.length - 1;
}

// A tiny external store, so React (useSyncExternalStore) can read saved
// progress without a hydration mismatch and see changes from other tabs.

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: DjProgress } = { raw: null, value: emptyProgress() };
const EMPTY = emptyProgress();

// If storage is blocked, progress still lasts for this visit.
let memoryRaw: string | null = null;

function readRaw() {
  try {
    return globalThis.localStorage?.getItem(PROGRESS_KEY) ?? memoryRaw;
  } catch {
    return memoryRaw;
  }
}

export const progressStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROGRESS_KEY || e.key === null) fn();
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(fn);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): DjProgress {
    const raw = readRaw();
    if (raw !== cache.raw) cache = { raw, value: parseProgress(raw) };
    return cache.value;
  },
  getServerSnapshot(): DjProgress {
    return EMPTY;
  },
  save(progress: DjProgress) {
    memoryRaw = JSON.stringify(progress);
    saveProgress(progress);
    for (const l of listeners) l();
  },
  reset() {
    memoryRaw = null;
    clearProgress();
    for (const l of listeners) l();
  },
};
