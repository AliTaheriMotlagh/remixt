"use client";

import { create } from "zustand";
import type { RemixComment } from "@/lib/social";

/** The comments shown under a remix, shared with its waveform (which marks the timed ones). */
export const useRemixComments = create<{ comments: RemixComment[] }>(() => ({ comments: [] }));
