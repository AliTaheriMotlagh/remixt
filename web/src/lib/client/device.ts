// What the device can take. Phones (iOS above all) kill a tab outright —
// the page just reloads — once it holds more memory than they allow, and
// Safari doesn't say how much memory there is, so a phone is treated as
// tight on memory whatever it reports.

/** The device's memory in GB, as the browser reports it (Chrome rounds it, others don't say: 4). */
export function deviceGb(): number {
  const gb = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return gb && gb > 0 ? gb : 4;
}

/** A phone or tablet, or a computer with little memory. */
export function isConstrainedDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (iPadOS || /iPhone|iPad|iPod|Android|Mobi/i.test(ua)) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory !== undefined && memory <= 2;
}
