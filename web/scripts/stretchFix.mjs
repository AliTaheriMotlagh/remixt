// A fix to signalsmith-stretch's AudioWorklet, made as copy-ort.mjs copies
// it to public/stretch/.
//
// Reading across two of its input buffers, the worklet moves the wrong
// counter (audioSamples by the samples copied, instead of to the buffer's
// end, and inputSamples not at all), so it reads from the wrong place. One
// buffer never crosses; pitchTempo.ts feeds the stem in pieces, to keep a
// phone's memory down, and crosses at every piece.

const crossingBug = `
						audioSamples += count;
						blockSamples += count;
					} else { // we're already past this buffer - skip it
						audioSamples += audioBuffer[0].length;
					}`;

const crossingFix = `
						inputSamples += count;
						blockSamples += count;
					}
					audioSamples = bufferEnd;`;

/** The worklet's source with the fix in. Throws for a version it doesn't know: check whether that one still needs it. */
export function fixStretchWorklet(source) {
  if (source.includes(crossingBug)) return source.replace(crossingBug, crossingFix);
  if (source.includes(crossingFix)) return source;
  throw new Error("signalsmith-stretch changed: check its buffer-crossing read (see scripts/stretchFix.mjs)");
}
