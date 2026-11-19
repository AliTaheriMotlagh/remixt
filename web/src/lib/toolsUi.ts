// The words around the tool pages' content (lib/tools.ts, lib/toolsFa.ts):
// headings, buttons, the breadcrumb, the hub. One entry per language, so a
// missing translation is a type error, not an English word on a Persian page.

import type { ToolLocale } from "./tools";

export type ToolUi = {
  /** BCP 47, for lang="" and JSON-LD inLanguage. */
  lang: string;
  dir: "ltr" | "rtl";
  /** Open Graph's locale (language_TERRITORY). */
  ogLocale: string;
  /** This language's own name, for the link that switches to it. */
  selfName: string;
  home: string;
  tools: string;
  ctaFree: (cta: string) => string;
  hearFirst: string;
  points: string[];
  howItWorks: string;
  questions: string;
  moreTools: string;
  /** "Or open the [online remix studio] and listen to [remixes made with Remixt]." */
  outro: { before: string; studio: string; middle: string; remixes: string; after: string };
  hub: { title: string; description: string; h1: string; intro: string; listName: string };
  /** Digits as this language writes them (the step numbers). */
  number: (n: number) => string;
};

export const TOOL_UI: Record<ToolLocale, ToolUi> = {
  en: {
    lang: "en",
    dir: "ltr",
    ogLocale: "en_US",
    selfName: "English",
    home: "Home",
    tools: "Tools",
    ctaFree: (cta) => `${cta} — free`,
    hearFirst: "Hear a real split first",
    points: ["Free", "Runs in your browser", "Nothing to install", "MP3 or WAV export"],
    howItWorks: "How it works",
    questions: "Questions",
    moreTools: "More free tools",
    outro: { before: "Or open the ", studio: "online remix studio", middle: " and listen to ", remixes: "remixes made with Remixt", after: "." },
    hub: {
      title: "Free AI music tools: vocal remover, stems & more",
      description:
        "Free AI music tools in your browser: vocal remover, acapella extractor, karaoke maker, stem splitter, drum and bass extractor, and a mashup maker.",
      h1: "Free AI music tools",
      intro:
        "Every tool here uses the same AI splitter, running in your browser: it takes a finished song apart into vocals, drums, bass and melody. Pick what you want to do with the parts.",
      listName: "Remixt music tools",
    },
    number: (n) => String(n),
  },
  fa: {
    lang: "fa",
    dir: "rtl",
    ogLocale: "fa_IR",
    selfName: "فارسی",
    home: "خانه",
    tools: "ابزارها",
    ctaFree: (cta) => `${cta} — رایگان`,
    hearFirst: "اول یک نمونه‌ی واقعی را بشنوید",
    points: ["رایگان", "در مرورگر اجرا می‌شود", "بدون نصب", "خروجی MP3 یا WAV"],
    howItWorks: "چطور کار می‌کند",
    questions: "پرسش‌ها",
    moreTools: "ابزارهای رایگان دیگر",
    outro: {
      before: "یا ",
      studio: "استودیوی ریمیکس آنلاین",
      middle: " را باز کنید و ",
      remixes: "ریمیکس‌هایی که با Remixt ساخته شده‌اند",
      after: " را گوش کنید.",
    },
    hub: {
      title: "ابزارهای رایگان موسیقی با هوش مصنوعی",
      description:
        "ابزارهای رایگان موسیقی در مرورگر: حذف صدای خواننده، جدا کردن آکاپلا، کارائوکه‌ساز، جدا کردن سازها، درامز و بیس، و ماشاپ‌ساز. بدون نصب.",
      h1: "ابزارهای رایگان موسیقی",
      intro:
        "همه‌ی این ابزارها از یک جداکننده‌ی هوش مصنوعی استفاده می‌کنند که در مرورگر شما اجرا می‌شود: یک آهنگ کامل را به صدای خواننده، درامز، بیس و ملودی تقسیم می‌کند. انتخاب کنید با بخش‌ها چه کار می‌خواهید بکنید.",
      listName: "ابزارهای موسیقی Remixt",
    },
    number: (n) => n.toLocaleString("fa-IR"),
  },
};
