// Remixt's own ads: what an ad spot shows when no paying campaign fits.
// They earn nobody anything (the card says "From Remixt", not "Sponsored"),
// and they point at things on the site, so an empty spot still helps.
// Every claim must stay true of the app.

export type HouseAd = { id: string; title: string; body: string; cta: string; href: string; tone: "brand" | "vocals" | "beat" | "drums" };

const EN: HouseAd[] = [
  { id: "earn", title: "Your remixes can earn", body: "Ads on your remix pay you, and the artists you used. See how it's shared.", cta: "How you earn", href: "/earnings", tone: "brand" },
  { id: "karaoke", title: "Make a karaoke track", body: "Take the voice out of any song, right in your browser.", cta: "Try it free", href: "/tools/karaoke-maker", tone: "vocals" },
  { id: "radio", title: "Tune in to Remixt Radio", body: "Everyone hears the same song at once. Vote for what plays next.", cta: "Listen", href: "/radio", tone: "beat" },
  { id: "mashup", title: "Make a mashup", body: "One song's vocal over another's beat, matched in tempo and key.", cta: "Open the Studio", href: "/studio", tone: "drums" },
  { id: "claim", title: "Is a song here yours?", body: "Artists get a share of every ad on remixes of their songs. Claim yours.", cta: "Claim your songs", href: "/earnings#claims", tone: "vocals" },
];

const FA: HouseAd[] = [
  { id: "earn", title: "از ریمیکس‌هایت درآمد داشته باش", body: "تبلیغِ صفحهٔ ریمیکس تو، به تو و هنرمندانِ آهنگ‌ها سهم می‌دهد.", cta: "ببین چطور", href: "/earnings", tone: "brand" },
  { id: "karaoke", title: "کارائوکه بساز", body: "صدای خواننده را از هر آهنگی بردار، همین‌جا در مرورگر.", cta: "رایگان امتحان کن", href: "/fa/tools/karaoke-maker", tone: "vocals" },
  { id: "radio", title: "رادیو ریمیکست", body: "همه یک آهنگ را با هم می‌شنوند؛ به آهنگِ بعدی رأی بده.", cta: "گوش بده", href: "/radio", tone: "beat" },
  { id: "claim", title: "آهنگی از تو این‌جاست؟", body: "هنرمند از هر تبلیغ روی ریمیکسِ آهنگش سهم دارد. ادعا کن.", cta: "ثبت آهنگ‌هایم", href: "/earnings#claims", tone: "vocals" },
];

/** One of Remixt's own ads for a spot, varied by the spot's seed so a page doesn't show the same one twice. */
export function houseAd(lang: "en" | "fa", seed: number): HouseAd {
  const list = lang === "fa" ? FA : EN;
  return list[Math.abs(Math.floor(seed)) % list.length];
}
