// Measures a 16-bit WAV like a mastering engineer's meters would:
// integrated loudness (BS.1770, gated), loudness range, sample peak, crest,
// tonal balance by band, stereo width, and loudness over time.
//   node scripts/measure-wav.mjs a.wav [b.wav ...]
import fs from "node:fs";

function readWav(file) {
  const b = fs.readFileSync(file);
  let at = 12;
  let fmt = null;
  let data = null;
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4);
    const size = b.readUInt32LE(at + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(at + 10), rate: b.readUInt32LE(at + 12), bits: b.readUInt16LE(at + 22) };
    if (id === "data") data = b.subarray(at + 8, Math.min(b.length, at + 8 + size));
    at += 8 + size + (size % 2);
  }
  const frames = Math.floor(data.length / (fmt.channels * 2));
  const ch = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) ch[c][i] = data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
  return { ...fmt, frames, ch };
}

function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kWeight(x, fs_) {
  // BS.1770 pre-filter (high shelf) then RLB high-pass, coefficients for any rate.
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs_), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const s = biquad(x, (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / fs_);
  a0 = 1 + K / Q + K * K;
  return biquad(s, 1 / a0, -2 / a0, 1 / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
}
const db = (p) => 10 * Math.log10(Math.max(p, 1e-12));

function loudness(wav) {
  const k = wav.ch.map((c) => kWeight(c, wav.rate));
  const block = Math.round(0.4 * wav.rate), hop = Math.round(0.1 * wav.rate);
  const powers = [];
  for (let s = 0; s + block <= wav.frames; s += hop) {
    let p = 0;
    for (const c of k) { let sum = 0; for (let i = s; i < s + block; i++) sum += c[i] * c[i]; p += sum / block; }
    powers.push(p);
  }
  const abs = powers.filter((p) => -0.691 + db(p) > -70);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = -0.691 + db(mean(abs)) - 10;
  const gated = abs.filter((p) => -0.691 + db(p) > rel);
  const integrated = -0.691 + db(mean(gated));
  // Short-term (3 s) for the range and the curve.
  const st = [];
  const n3 = 30;
  for (let i = 0; i + n3 <= powers.length; i += 10) st.push(-0.691 + db(mean(powers.slice(i, i + n3))));
  const stGated = st.filter((v) => v > -70 && v > integrated - 20).sort((a, b) => a - b);
  const lra = stGated.length ? stGated[Math.floor(stGated.length * 0.95)] - stGated[Math.floor(stGated.length * 0.1)] : 0;
  return { integrated, lra, st };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
const BANDS = [[20, 60, "sub"], [60, 120, "bass"], [120, 250, "lowmid"], [250, 500, "mud"], [500, 2000, "mid"], [2000, 4000, "presence"], [4000, 8000, "high"], [8000, 16000, "air"]];
function bands(wav) {
  const n = 4096;
  const mono = new Float32Array(wav.frames);
  for (const c of wav.ch) for (let i = 0; i < wav.frames; i++) mono[i] += c[i] / wav.ch.length;
  const acc = new Float64Array(BANDS.length);
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  let count = 0;
  for (let s = 0; s + n <= wav.frames; s += n * 4) {
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    for (let k = 1; k < n / 2; k++) {
      const f = (k * wav.rate) / n;
      const b = BANDS.findIndex(([lo, hi]) => f >= lo && f < hi);
      if (b >= 0) acc[b] += re[k] * re[k] + im[k] * im[k];
    }
    count++;
  }
  const total = acc.reduce((a, b) => a + b, 0);
  return Object.fromEntries(BANDS.map(([, , name], i) => [name, +(db(acc[i] / Math.max(total, 1e-20))).toFixed(1)]));
}

for (const file of process.argv.slice(2)) {
  const wav = readWav(file);
  let peak = 0, sum = 0, clipped = 0, lr = 0, ll = 0, rr = 0;
  const L = wav.ch[0], R = wav.ch[1] ?? wav.ch[0];
  for (let i = 0; i < wav.frames; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sum += (L[i] * L[i] + R[i] * R[i]) / 2;
    lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i];
  }
  const rms = Math.sqrt(sum / wav.frames);
  const loud = loudness(wav);
  console.log(
    JSON.stringify({
      file: file.split("/").pop(),
      seconds: +(wav.frames / wav.rate).toFixed(1),
      lufs: +loud.integrated.toFixed(1),
      lra: +loud.lra.toFixed(1),
      peakDb: +(20 * Math.log10(peak)).toFixed(2),
      clipped,
      crestDb: +(20 * Math.log10(peak / rms)).toFixed(1),
      correlation: +(lr / Math.sqrt(ll * rr || 1)).toFixed(2),
      bands: bands(wav),
      shortTerm: loud.st.filter((_, i) => i % 10 === 0).map((v) => Math.round(v)),
    })
  );
}
