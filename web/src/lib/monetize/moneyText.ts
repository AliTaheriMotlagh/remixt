// Money and numbers on the money pages, in English (dollars) or Persian
// (Toman at the owner's rate, Persian digits). Pure: the pages share it.

import { formatToman, persianNumber } from "./adRules";
import { formatMoney } from "./policy";

export type Lang = "en" | "fa";

/** "$12.30" — or on Persian pages "۱٬۲۳۰٬۰۰۰ تومان" (dollars still, with a note, until the owner sets a rate). */
export function moneyIn(lang: Lang, rate: number) {
  return (micros: number) => (lang === "fa" && rate > 0 ? formatToman(micros, rate) : formatMoney(micros));
}

/** 1234 → "1,234" or "۱٬۲۳۴". */
export function numIn(lang: Lang) {
  return (n: number) => (lang === "fa" ? persianNumber(n) : Math.round(n).toLocaleString("en-US"));
}

/** A date, written for the page's language. */
export function dateIn(lang: Lang) {
  return (value: string | number | Date) =>
    new Date(value).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** The money pages, in each language: the same page under /… and /fa/…. */
export function moneyPath(lang: Lang, path: string): string {
  return lang === "fa" ? `/fa${path}` : path;
}
