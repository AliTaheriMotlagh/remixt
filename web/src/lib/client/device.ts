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

/** What a device reports about itself — read from the browser by deviceClass, given by the tests. */
export type DeviceInfo = {
  userAgent: string;
  maxTouchPoints: number;
  /** A finger, not a mouse, is the main pointer (`pointer: coarse`). */
  coarse: boolean;
  /** The screen's size in CSS pixels, either way round. */
  screen: { width: number; height: number };
  /** navigator.deviceMemory (Chrome; rounded, at most 8), if given. */
  memoryGb: number | null;
  /** navigator.hardwareConcurrency, if given. */
  cores: number | null;
};

export type DeviceKind = "phone" | "tablet" | "computer";

export type DeviceClass = {
  kind: DeviceKind;
  /** iPhone or iPad: the tightest memory (a tab over its share is reloaded) and the page stops when the screen locks. */
  ios: boolean;
  android: boolean;
  memoryGb: number | null;
  cores: number | null;
};

/** The device's class from what it reports (see deviceClass). */
export function classify(info: DeviceInfo): DeviceClass {
  const ua = info.userAgent;
  const iPadOS = /Macintosh/.test(ua) && info.maxTouchPoints > 1;
  const ios = iPadOS || /iPhone|iPad|iPod/.test(ua);
  const android = /Android/i.test(ua);
  const short = Math.min(info.screen.width, info.screen.height);
  let kind: DeviceKind;
  if (/iPhone|iPod/.test(ua) || (android && /Mobile/.test(ua)) || /Mobi/.test(ua)) kind = "phone";
  else if (iPadOS || /iPad/.test(ua) || android) kind = short && short < 600 ? "phone" : "tablet";
  // A touch screen with no OS name to go by: its size decides.
  else if (info.coarse && short > 0) kind = short < 600 ? "phone" : short < 1100 ? "tablet" : "computer";
  else kind = "computer";
  return { kind, ios, android, memoryGb: info.memoryGb, cores: info.cores };
}

/** This device: phone, tablet or computer, and whether it's iOS. */
export function deviceClass(): DeviceClass {
  if (typeof navigator === "undefined") return { kind: "computer", ios: false, android: false, memoryGb: null, cores: null };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const screen = typeof window !== "undefined" && window.screen ? { width: window.screen.width, height: window.screen.height } : { width: 0, height: 0 };
  return classify({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    coarse: typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
    screen,
    memoryGb: nav.deviceMemory && nav.deviceMemory > 0 ? nav.deviceMemory : null,
    cores: nav.hardwareConcurrency && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null,
  });
}
