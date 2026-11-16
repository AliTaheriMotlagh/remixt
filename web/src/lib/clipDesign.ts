// How a social clip looks: its shape, its background and every element on
// it (the brand, the song's name, who made it, the visualizer, the lyrics,
// the progress bar, the link, a caption, a photo), each one placed, sized,
// coloured and shown or hidden by the user in the clip editor. Pure (no
// DOM), so the editor, the renderer (lib/client/socialClip.ts) and the
// tests share it.
//
// Positions are the element's centre as a fraction of the frame, so a
// design survives being drawn at any resolution; switching the shape lays
// the elements out again for it (see layoutFor) and keeps everything else.

export type ClipFormat = "story" | "portrait" | "square" | "wide";

export const CLIP_FORMATS: Record<ClipFormat, { label: string; hint: string; width: number; height: number }> = {
  story: { label: "9:16", hint: "Reels · TikTok · Shorts · Stories", width: 1080, height: 1920 },
  portrait: { label: "4:5", hint: "Instagram & X feed", width: 1080, height: 1350 },
  square: { label: "1:1", hint: "Feed post", width: 1080, height: 1080 },
  wide: { label: "16:9", hint: "X · YouTube", width: 1920, height: 1080 },
};

export const CLIP_FORMAT_ORDER: ClipFormat[] = ["story", "portrait", "square", "wide"];

export type ElementId = "brand" | "title" | "artist" | "visualizer" | "photo" | "lyrics" | "caption" | "progress" | "link";

/** Drawn in this order — later ones on top, and picked first by a tap. */
export const ELEMENT_ORDER: ElementId[] = ["visualizer", "photo", "brand", "title", "artist", "caption", "lyrics", "progress", "link"];

export const ELEMENT_INFO: Record<ElementId, { label: string; text: boolean }> = {
  brand: { label: "Remixt logo", text: false },
  title: { label: "Song title", text: true },
  artist: { label: "Artist", text: true },
  visualizer: { label: "Visualizer", text: false },
  photo: { label: "Photo", text: false },
  lyrics: { label: "Lyrics", text: false },
  caption: { label: "Caption", text: true },
  progress: { label: "Progress bar", text: false },
  link: { label: "Link", text: true },
};

export type ClipFont = "modern" | "heavy" | "classic" | "mono";

export const CLIP_FONTS: Record<ClipFont, { label: string; family: string; weight: number }> = {
  modern: { label: "Modern", family: "system-ui, -apple-system, 'Segoe UI', Tahoma, Vazirmatn, sans-serif", weight: 700 },
  heavy: { label: "Heavy", family: "Impact, 'Arial Black', 'Helvetica Neue', Tahoma, Vazirmatn, sans-serif", weight: 900 },
  classic: { label: "Classic", family: "Georgia, 'Times New Roman', 'Iowan Old Style', Tahoma, serif", weight: 700 },
  mono: { label: "Mono", family: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", weight: 600 },
};

export type VisualizerStyle = "bars" | "mirror" | "wave" | "circle";
export const VISUALIZER_STYLES: { id: VisualizerStyle; label: string }[] = [
  { id: "bars", label: "Bars" },
  { id: "mirror", label: "Mirror" },
  { id: "wave", label: "Wave" },
  { id: "circle", label: "Circle" },
];

export type LyricsStyle = "karaoke" | "lines" | "words";
export const LYRICS_STYLES: { id: LyricsStyle; label: string; hint: string }[] = [
  { id: "karaoke", label: "Karaoke", hint: "The line fills with colour as it's sung" },
  { id: "lines", label: "Lines", hint: "The line being sung, bright, between the ones around it" },
  { id: "words", label: "Word by word", hint: "Each word appears as it's sung" },
];

export type ClipElement = {
  visible: boolean;
  /** Centre, as a fraction of the frame's width and height. */
  x: number;
  y: number;
  /** 1 = its usual size. */
  scale: number;
  color: string;
  /** Second colour: the sung part of the lyrics, the visualizer's other end. */
  accent: string;
  font: ClipFont;
  /** A dark plate behind it, so it reads over any background. */
  plate: boolean;
  /** What it says (title, artist, caption, link). */
  text: string;
  /** The visualizer's or the lyrics' style. */
  style: string;
};

export type ClipBackground = {
  kind: "gradient" | "solid" | "photo";
  /** Top-left to bottom-right. */
  colors: [string, string, string];
  /** The photo darkened by this much (0–0.85), so what's on it reads. */
  dim: number;
  /** The photo blurred, in px at 1080. */
  blur: number;
  /** A soft glow that breathes with the music. */
  glow: boolean;
};

export type ClipDesign = {
  format: ClipFormat;
  background: ClipBackground;
  elements: Record<ElementId, ClipElement>;
};

/** Where each element sits on each shape (centre x, y; scale). */
type Spot = { x: number; y: number; scale: number };
const LAYOUTS: Record<ClipFormat, Record<ElementId, Spot>> = {
  story: {
    brand: { x: 0.5, y: 0.085, scale: 1 },
    title: { x: 0.5, y: 0.225, scale: 1 },
    artist: { x: 0.5, y: 0.262, scale: 1 },
    visualizer: { x: 0.5, y: 0.37, scale: 1 },
    photo: { x: 0.5, y: 0.37, scale: 1 },
    lyrics: { x: 0.5, y: 0.6, scale: 1 },
    caption: { x: 0.5, y: 0.77, scale: 1 },
    progress: { x: 0.5, y: 0.845, scale: 1 },
    link: { x: 0.5, y: 0.915, scale: 1 },
  },
  portrait: {
    brand: { x: 0.5, y: 0.075, scale: 0.8 },
    title: { x: 0.5, y: 0.19, scale: 0.9 },
    artist: { x: 0.5, y: 0.238, scale: 0.9 },
    visualizer: { x: 0.5, y: 0.36, scale: 0.8 },
    photo: { x: 0.5, y: 0.37, scale: 0.75 },
    lyrics: { x: 0.5, y: 0.62, scale: 0.9 },
    caption: { x: 0.5, y: 0.79, scale: 0.85 },
    progress: { x: 0.5, y: 0.86, scale: 1 },
    link: { x: 0.5, y: 0.93, scale: 0.85 },
  },
  square: {
    brand: { x: 0.5, y: 0.085, scale: 0.7 },
    title: { x: 0.5, y: 0.2, scale: 0.8 },
    artist: { x: 0.5, y: 0.255, scale: 0.8 },
    visualizer: { x: 0.5, y: 0.4, scale: 0.7 },
    photo: { x: 0.5, y: 0.41, scale: 0.6 },
    lyrics: { x: 0.5, y: 0.64, scale: 0.8 },
    caption: { x: 0.5, y: 0.79, scale: 0.75 },
    progress: { x: 0.5, y: 0.86, scale: 1 },
    link: { x: 0.5, y: 0.935, scale: 0.75 },
  },
  wide: {
    brand: { x: 0.1, y: 0.12, scale: 0.6 },
    title: { x: 0.5, y: 0.13, scale: 0.85 },
    artist: { x: 0.5, y: 0.205, scale: 0.85 },
    visualizer: { x: 0.5, y: 0.4, scale: 0.75 },
    photo: { x: 0.17, y: 0.5, scale: 0.7 },
    lyrics: { x: 0.5, y: 0.64, scale: 0.85 },
    caption: { x: 0.5, y: 0.79, scale: 0.75 },
    progress: { x: 0.5, y: 0.87, scale: 1.2 },
    link: { x: 0.88, y: 0.935, scale: 0.7 },
  },
};

const element = (patch: Partial<ClipElement>): ClipElement => ({
  visible: true,
  x: 0.5,
  y: 0.5,
  scale: 1,
  color: "#ffffff",
  accent: "#22d3ee",
  font: "modern",
  plate: false,
  text: "",
  style: "",
  ...patch,
});

/** The elements of a fresh design, before a template or the song's words are applied. */
function baseElements(format: ClipFormat): Record<ElementId, ClipElement> {
  const spot = LAYOUTS[format];
  return {
    brand: element({ ...spot.brand }),
    title: element({ ...spot.title }),
    artist: element({ ...spot.artist, color: "#c4c4d4", font: "modern" }),
    visualizer: element({ ...spot.visualizer, color: "#ec4899", accent: "#06b6d4", style: "bars" }),
    photo: element({ ...spot.photo, visible: false }),
    lyrics: element({ ...spot.lyrics, color: "#ffffff", accent: "#f472b6", style: "karaoke" }),
    caption: element({ ...spot.caption, visible: false, text: "", color: "#ffffff", plate: true }),
    progress: element({ ...spot.progress, color: "#ec4899", accent: "#06b6d4" }),
    link: element({ ...spot.link, color: "#e5e5f0", font: "mono" }),
  };
}

export type ClipTemplate = {
  id: string;
  label: string;
  background: Omit<ClipBackground, "kind" | "dim" | "blur"> & { kind?: "gradient" | "solid" };
  /** Changes to elements (colours, fonts, styles, plates), on top of the base look. */
  elements: Partial<Record<ElementId, Partial<ClipElement>>>;
};

/** Ready-made looks: one tap sets the background, colours, fonts and styles (text and positions are kept). */
export const CLIP_TEMPLATES: ClipTemplate[] = [
  {
    id: "neon",
    label: "Neon",
    background: { colors: ["#1b0b24", "#0a0a0f", "#04202a"], glow: true },
    elements: {
      visualizer: { color: "#ec4899", accent: "#06b6d4", style: "bars" },
      lyrics: { color: "#ffffff", accent: "#f472b6", font: "modern", style: "karaoke", plate: false },
      progress: { color: "#ec4899", accent: "#06b6d4" },
      title: { color: "#ffffff", font: "modern" },
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    background: { colors: ["#ff6a3d", "#c2185b", "#3a0d4a"], glow: false },
    elements: {
      visualizer: { color: "#ffffff", accent: "#ffd166", style: "mirror" },
      lyrics: { color: "#ffffff", accent: "#ffd166", font: "heavy", style: "words", plate: false },
      progress: { color: "#ffffff", accent: "#ffd166" },
      title: { color: "#ffffff", font: "heavy" },
      artist: { color: "#ffe7d6" },
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    background: { colors: ["#021b33", "#06406b", "#0aa2c0"], glow: true },
    elements: {
      visualizer: { color: "#7dd3fc", accent: "#a7f3d0", style: "wave" },
      lyrics: { color: "#e0f2fe", accent: "#5eead4", font: "modern", style: "lines", plate: false },
      progress: { color: "#7dd3fc", accent: "#a7f3d0" },
      title: { color: "#ffffff", font: "modern" },
      artist: { color: "#bae6fd" },
    },
  },
  {
    id: "mono",
    label: "Mono",
    background: { kind: "solid", colors: ["#0b0b0b", "#0b0b0b", "#0b0b0b"], glow: false },
    elements: {
      visualizer: { color: "#ffffff", accent: "#9ca3af", style: "circle" },
      lyrics: { color: "#ffffff", accent: "#facc15", font: "heavy", style: "karaoke", plate: false },
      progress: { color: "#ffffff", accent: "#ffffff" },
      title: { color: "#ffffff", font: "heavy" },
      artist: { color: "#a3a3a3" },
      link: { color: "#a3a3a3" },
    },
  },
  {
    id: "paper",
    label: "Paper",
    background: { kind: "solid", colors: ["#f4efe6", "#f4efe6", "#f4efe6"], glow: false },
    elements: {
      visualizer: { color: "#1f2937", accent: "#b45309", style: "bars" },
      lyrics: { color: "#111827", accent: "#b45309", font: "classic", style: "lines", plate: false },
      progress: { color: "#1f2937", accent: "#b45309" },
      title: { color: "#111827", font: "classic" },
      artist: { color: "#4b5563", font: "classic" },
      link: { color: "#4b5563" },
      brand: { color: "#111827" },
      caption: { color: "#ffffff" },
    },
  },
  {
    id: "studio",
    label: "Studio",
    background: { colors: ["#0f172a", "#111827", "#1e1b4b"], glow: false },
    elements: {
      visualizer: { color: "#a78bfa", accent: "#22d3ee", style: "mirror" },
      lyrics: { color: "#ffffff", accent: "#a78bfa", font: "mono", style: "karaoke", plate: true },
      progress: { color: "#a78bfa", accent: "#22d3ee" },
      title: { color: "#ffffff", font: "mono" },
      artist: { color: "#c7d2fe", font: "mono" },
    },
  },
];

/** The template a design starts from. */
export const DEFAULT_TEMPLATE = CLIP_TEMPLATES[0];

/** A design with `template`'s look applied: its background and colours, the text and positions kept. */
export function applyTemplate(design: ClipDesign, template: ClipTemplate): ClipDesign {
  const elements = { ...design.elements };
  for (const id of Object.keys(elements) as ElementId[]) {
    const base = baseElements(design.format)[id];
    const look = template.elements[id] ?? {};
    const { color, accent, font, plate, style } = { ...base, ...look };
    elements[id] = { ...elements[id], color, accent, font, plate, style };
  }
  const photo = design.background.kind === "photo";
  return {
    ...design,
    background: {
      ...design.background,
      kind: photo ? "photo" : (template.background.kind ?? "gradient"),
      colors: template.background.colors,
      glow: template.background.glow,
    },
    elements,
  };
}

/** A fresh design on `format`. */
export function defaultDesign(format: ClipFormat = "story"): ClipDesign {
  const plain: ClipDesign = {
    format,
    background: { kind: "gradient", colors: DEFAULT_TEMPLATE.background.colors, dim: 0.45, blur: 0, glow: true },
    elements: baseElements(format),
  };
  return applyTemplate(plain, DEFAULT_TEMPLATE);
}

/** The same design on another shape: laid out again for it, everything else kept. */
export function layoutFor(design: ClipDesign, format: ClipFormat): ClipDesign {
  if (design.format === format) return design;
  const spot = LAYOUTS[format];
  const elements = { ...design.elements };
  for (const id of Object.keys(elements) as ElementId[]) {
    elements[id] = { ...elements[id], ...spot[id] };
  }
  return { ...design, format, elements };
}

/** One element put back where its shape has it, at its usual size. */
export function resetPlace(design: ClipDesign, id: ElementId): ClipDesign {
  return setElement(design, id, { ...LAYOUTS[design.format][id] });
}

export function setElement(design: ClipDesign, id: ElementId, patch: Partial<ClipElement>): ClipDesign {
  return { ...design, elements: { ...design.elements, [id]: { ...design.elements[id], ...patch } } };
}

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 3;
export const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** A centre kept on the frame (an element dragged off the edge stays reachable). */
export const clampPosition = (v: number) => Math.min(0.98, Math.max(0.02, v));

/** Within this much of the frame's centre lines, a dragged element snaps to them. */
export const SNAP = 0.015;

/** A dragged centre, snapped to the middle when it's close; which lines it snapped to. */
export function snapPosition(x: number, y: number): { x: number; y: number; snapX: boolean; snapY: boolean } {
  const snapX = Math.abs(x - 0.5) < SNAP;
  const snapY = Math.abs(y - 0.5) < SNAP;
  return { x: snapX ? 0.5 : clampPosition(x), y: snapY ? 0.5 : clampPosition(y), snapX, snapY };
}

/** Text, filled in from the song, for elements the user hasn't typed into. */
export function withWords(design: ClipDesign, words: { title: string; artist: string; link: string }): ClipDesign {
  const e = design.elements;
  return {
    ...design,
    elements: {
      ...e,
      title: { ...e.title, text: e.title.text || words.title },
      artist: { ...e.artist, text: e.artist.text || words.artist },
      link: { ...e.link, text: e.link.text || words.link },
    },
  };
}

/**
 * A stored design, checked — anything missing or wrong falls back to the
 * default, so an older or damaged copy never breaks the editor. Text isn't
 * kept from one song to the next (see forStorage).
 */
export function readDesign(raw: unknown): ClipDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ClipDesign>;
  const format = value.format && value.format in CLIP_FORMATS ? value.format : "story";
  const base = defaultDesign(format);
  const bg = (value.background ?? {}) as Partial<ClipBackground>;
  const color = (c: unknown, fallback: string) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback);
  const num = (n: unknown, fallback: number, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback);
  const background: ClipBackground = {
    // A photo isn't stored: it comes back as the gradient.
    kind: bg.kind === "solid" ? "solid" : "gradient",
    colors: Array.isArray(bg.colors) && bg.colors.length === 3
      ? (bg.colors.map((c, i) => color(c, base.background.colors[i])) as [string, string, string])
      : base.background.colors,
    dim: num(bg.dim, base.background.dim, 0, 0.85),
    blur: num(bg.blur, base.background.blur, 0, 40),
    glow: typeof bg.glow === "boolean" ? bg.glow : base.background.glow,
  };
  const elements = { ...base.elements };
  const stored = (value.elements ?? {}) as Partial<Record<ElementId, Partial<ClipElement>>>;
  for (const id of Object.keys(elements) as ElementId[]) {
    const s = stored[id];
    if (!s || typeof s !== "object") continue;
    const b = elements[id];
    elements[id] = {
      ...b,
      visible: id === "photo" ? false : typeof s.visible === "boolean" ? s.visible : b.visible,
      x: num(s.x, b.x, 0, 1),
      y: num(s.y, b.y, 0, 1),
      scale: num(s.scale, b.scale, MIN_SCALE, MAX_SCALE),
      color: color(s.color, b.color),
      accent: color(s.accent, b.accent),
      font: s.font && s.font in CLIP_FONTS ? s.font : b.font,
      plate: typeof s.plate === "boolean" ? s.plate : b.plate,
      style: typeof s.style === "string" && s.style.length < 20 ? s.style : b.style,
      text: id === "caption" && typeof s.text === "string" ? s.text.slice(0, 120) : "",
    };
  }
  return { format, background, elements };
}

/** What's kept for next time: the look, not this song's words (the caption is kept: it's the user's own). */
export function forStorage(design: ClipDesign): ClipDesign {
  const elements = { ...design.elements };
  for (const id of ["title", "artist", "link"] as const) elements[id] = { ...elements[id], text: "" };
  return { ...design, elements };
}
