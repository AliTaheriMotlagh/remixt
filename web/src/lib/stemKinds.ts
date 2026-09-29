// The kinds of stem a song is split into. Every song has a vocal and a
// beat (everything but the voice). Songs split since the 4-stem update
// also have the beat's parts on their own — drums, bass, and "other"
// (keys, guitars, synths…), shown as "Melody".

export const STEM_KINDS = ["vocals", "beat", "drums", "bass", "other"] as const;
export type StemKind = (typeof STEM_KINDS)[number];

/** The beat's own parts, split since the 4-stem update. */
export const PART_KINDS = ["drums", "bass", "other"] as const satisfies readonly StemKind[];

export const KIND_INFO: Record<StemKind, { label: string; plural: string; color: string }> = {
  vocals: { label: "Vocals", plural: "Vocals", color: "var(--vocals)" },
  beat: { label: "Beat", plural: "Beats", color: "var(--beat)" },
  drums: { label: "Drums", plural: "Drums", color: "var(--drums)" },
  bass: { label: "Bass", plural: "Bass", color: "var(--bass)" },
  other: { label: "Melody", plural: "Melody", color: "var(--other)" },
};

export function isStemKind(value: unknown): value is StemKind {
  return typeof value === "string" && (STEM_KINDS as readonly string[]).includes(value);
}

/** Anything that isn't a voice plays the backing's role when matching. */
export function isBacking(kind: StemKind) {
  return kind !== "vocals";
}

export function kindColor(kind: StemKind) {
  return KIND_INFO[kind]?.color ?? "var(--beat)";
}

export function kindLabel(kind: StemKind) {
  return KIND_INFO[kind]?.label ?? kind;
}
