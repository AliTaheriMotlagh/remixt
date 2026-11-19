// Bits of the "how the money is shared" text that more than one page says.
export { AUDIO, FREQUENCY } from "./adRules";

export const UNCLAIMED_NOTE = {
  en: (years: number) => `Money nobody claims within ${years} years goes to Remixt (never while a claim is being checked).`,
  fa: (years: string) => `پولی که ظرف ${years} سال کسی ادعایش نکند به ریمیکست می‌رسد (هرگز تا وقتی ادعایی در حال بررسی است).`,
};
