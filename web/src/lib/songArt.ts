// A song's picture when it has no cover: drawn from the song itself — its
// waveform as bars across the middle, over a gradient in two colours that
// come from its title and artist (so a song always gets the same picture,
// and two songs seldom the same one). With no waveform to draw, a record in
// those colours with the song's first letter on its label. An SVG, so it's sharp at any size and
// can be drawn on a canvas too (clips, the lock screen). Pure.

/** A whole number from text, the same every time (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The two colours of a song's picture (hues 0–360), far enough apart to make a gradient. */
export function songHues(title: string, artist = ""): [number, number] {
  const h = hash(`${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`);
  const first = h % 360;
  const second = (first + 40 + ((h >>> 9) % 80)) % 360;
  return [first, second];
}

/** `peaks` (any length) as `count` bars, each the loudest of its stretch, scaled to the loudest bar. */
export function barsOf(peaks: ArrayLike<number>, count: number): number[] {
  if (!peaks.length) return new Array(count).fill(0);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * peaks.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
    let top = 0;
    for (let j = from; j < to && j < peaks.length; j++) top = Math.max(top, Math.abs(peaks[j]));
    out.push(top);
  }
  const loudest = Math.max(...out) || 1;
  return out.map((v) => v / loudest);
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The song's first letter, for a record's label: of its name, not the file's noise ("01 - …", "[HD]"). */
export function songInitial(title: string): string {
  const name = title
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/^[\s\d._-]+/, "")
    .split(/\s+-\s+|_-_| – /)
    .pop()!
    .replace(/[([{].*$/, "")
    .trim();
  const first = Array.from(name).find((ch) => /\p{L}|\p{N}/u.test(ch)) ?? "♪";
  return first.toLocaleUpperCase();
}

/**
 * A record in the song's colours, its first letter on the label — the
 * picture of a song with no cover and no waveform to draw (the radio's
 * songs). Transparent around the disc, so it can spin over a still
 * background (`songDiscSvg`), or sit on its gradient (songArtSvg).
 */
export function songDiscSvg({ title, artist = "" }: { title: string; artist?: string }): string {
  const [a, b] = songHues(title, artist);
  const grooves = Array.from({ length: 9 }, (_, i) => `<circle r="${212 - i * 13}" />`).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escape(title)}">` +
    `<g transform="translate(300 300)">` +
    `<circle r="236" fill="#08080c"/>` +
    `<g fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="2">${grooves}</g>` +
    `<circle r="98" fill="hsl(${a} 72% 52%)"/>` +
    `<circle r="98" fill="none" stroke="hsl(${b} 80% 30%)" stroke-width="6"/>` +
    `<circle r="70" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="2"/>` +
    `<text y="4" text-anchor="middle" dominant-baseline="central" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="88" font-weight="800" fill="#fff">${escape(songInitial(title))}</text>` +
    `<circle cy="-42" r="7" fill="#08080c"/>` +
    `</g></svg>`
  );
}

export function songDiscUrl(song: { title: string; artist?: string }): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(songDiscSvg(song))}`;
}

/** The background a song's drawn picture sits on (CSS), for a disc spinning over it. */
export function songBackdrop(title: string, artist = ""): string {
  const [a, b] = songHues(title, artist);
  return `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22), transparent 60%), linear-gradient(135deg, hsl(${a} 70% 42%), hsl(${b} 75% 22%))`;
}

/** The picture as SVG markup (square, 600 units). */
export function songArtSvg({ title, artist = "", peaks = [] }: { title: string; artist?: string; peaks?: ArrayLike<number> }): string {
  const [a, b] = songHues(title, artist);
  // No waveform to draw (a radio song, a song not opened yet): its record.
  if (!peaks.length) {
    const disc = songDiscSvg({ title, artist }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escape(title)}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="hsl(${a} 70% 42%)"/><stop offset="1" stop-color="hsl(${b} 75% 22%)"/></linearGradient>` +
      `<radialGradient id="l" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="600" height="600" fill="url(#g)"/><rect width="600" height="600" fill="url(#l)"/>` +
      `<g transform="translate(300 300) scale(0.86) translate(-300 -300)">${disc}</g></svg>`
    );
  }
  const bars = barsOf(peaks, 28);
  const width = 600 / bars.length;
  const rects = bars
    .map((v, i) => {
      // A song with no waveform yet: a quiet, even line.
      const height = Math.max(10, (peaks.length ? v : 0.18) * 300);
      return `<rect x="${(i * width + width * 0.2).toFixed(1)}" y="${(300 - height / 2).toFixed(1)}" width="${(width * 0.6).toFixed(1)}" height="${height.toFixed(1)}" rx="${(width * 0.3).toFixed(1)}"/>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escape(title)}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${a} 70% 42%)"/><stop offset="1" stop-color="hsl(${b} 75% 22%)"/></linearGradient>` +
    `<radialGradient id="l" cx="0.3" cy="0.25" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="600" height="600" fill="url(#g)"/><rect width="600" height="600" fill="url(#l)"/>` +
    `<g fill="#fff" fill-opacity="0.82">${rects}</g></svg>`
  );
}

/** The picture as a data: URL, for an <img> or a canvas. */
export function songArtUrl(song: { title: string; artist?: string; peaks?: ArrayLike<number> }): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(songArtSvg(song))}`;
}
