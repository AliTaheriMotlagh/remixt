import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bidiRuns, hasRtl } from "./rtlText";

// Text for the share cards (opengraph-image.tsx), in any language people
// name their remixes in — Persian and Arabic included.

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | null = null;

/**
 * Vazirmatn (assets/fonts, SIL Open Font License): Persian and Arabic
 * letters with their joined forms, plus Latin. The renderer's own font
 * has no Persian, and the Google font it would fetch for it makes the
 * renderer throw — so a Persian title used to break the whole card.
 */
export function cardFonts() {
  fonts ??= Promise.all(
    ([["Regular", 400], ["Bold", 700]] as const).map(async ([file, weight]) => ({
      name: "Vazirmatn",
      data: await readFile(join(process.cwd(), `assets/fonts/Vazirmatn-${file}.ttf`)),
      weight,
      style: "normal" as const,
    }))
  ).catch((err) => {
    fonts = null; // try again next time
    throw err;
  });
  return fonts;
}

/**
 * A line (or lines) of text that may be right to left: words laid out in
 * flex rows the right way round, wrapping like text (see rtlText.ts).
 * Plain left-to-right text is passed through untouched.
 */
export function CardText({ text, wordGap }: { text: string; /** px between words, ~0.27 × the font size */ wordGap: number }) {
  if (!hasRtl(text)) return <>{text}</>;
  const { rtl, runs } = bidiRuns(text);
  const row = (reverse: boolean, wrap: boolean) =>
    ({ display: "flex", flexDirection: reverse ? "row-reverse" : "row", flexWrap: wrap ? "wrap" : "nowrap", columnGap: wordGap }) as const;
  return (
    <div style={row(rtl, true)}>
      {runs.flatMap((run, r) =>
        run.rtl === rtl
          ? // Going the line's way: each word on its own, so the line can wrap between them.
            run.words.map((word, w) => <span key={`${r}-${w}`}>{word}</span>)
          : // Going the other way (a Latin name in a Persian title, or the reverse): kept together.
            [
              <span key={r} style={row(run.rtl, false)}>
                {run.rtl ? run.words.map((word, w) => <span key={w}>{word}</span>) : run.words.join(" ")}
              </span>,
            ]
      )}
    </div>
  );
}
