// Where an ad stands, and why it isn't showing yet — said the same way to
// the advertiser (/advertise) and the owner (Admin → Ads & earnings), like
// an ad platform's delivery column. Pure: the server's choice of what
// runs (store.pickCampaign) and this must agree, and the tests check they do
// (tests/ad-status.test.ts).
//
// An ad goes through four steps: made → checked by Remixt → paid for → shows.
// It shows only when all of these hold:
//   approved · not paused · started and not ended · money left for one more
//   view · its sound uploaded (audio) · that kind of ad switched on.

import type { Format } from "./adRules";

export type DeliveryState =
  | "draft"
  | "review"
  | "rejected"
  | "needsSound"
  | "needsMoney"
  | "checkingPayment"
  | "spent"
  | "paused"
  | "scheduled"
  | "ended"
  | "switchedOff"
  | "running";

export type Tone = "good" | "wait" | "act" | "bad" | "off";

/** What the advertiser can do about it (a button on their page). */
export type NextAction = "submit" | "pay" | "resume" | "edit" | "upload" | null;

export type DeliveryInput = {
  format: Format;
  review: "draft" | "pending" | "approved" | "rejected";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  budget_micros: number;
  spent_micros: number;
  cpm_micros: number;
  /** An audio ad's sound, once uploaded. */
  audio_key?: string | null;
};

export type Switches = { ads: boolean; audioAds: boolean; promotions: boolean };

export type Delivery = {
  state: DeliveryState;
  tone: Tone;
  /** 0 made · 1 checked · 2 paid · 3 showing: the step it's waiting on (3 and running = all done). */
  step: 0 | 1 | 2 | 3;
  action: NextAction;
  en: { label: string; why: string };
  fa: { label: string; why: string };
};

/** The four steps, as the tracker under each ad shows them. */
export const DELIVERY_STEPS = [
  { en: "Made", fa: "ساخته شد" },
  { en: "Checked", fa: "بررسی شد" },
  { en: "Paid", fa: "پرداخت شد" },
  { en: "Showing", fa: "در حال نمایش" },
] as const;

/** What one paid view takes from the budget (the same sum the server uses). */
export function costOfOneView(cpmMicros: number): number {
  return Math.max(1, cpmMicros / 1000);
}

/** Whether what's left covers one more view. */
export function hasMoneyLeft(c: Pick<DeliveryInput, "budget_micros" | "spent_micros" | "cpm_micros">): boolean {
  return c.spent_micros + costOfOneView(c.cpm_micros) <= c.budget_micros;
}

/** Roughly how many more paid views the money left buys. */
export function viewsLeft(c: Pick<DeliveryInput, "budget_micros" | "spent_micros" | "cpm_micros">): number {
  return Math.max(0, Math.floor((c.budget_micros - c.spent_micros) / costOfOneView(c.cpm_micros)));
}

function make(state: DeliveryState, tone: Tone, step: Delivery["step"], action: NextAction, en: [string, string], fa: [string, string]): Delivery {
  return { state, tone, step, action, en: { label: en[0], why: en[1] }, fa: { label: fa[0], why: fa[1] } };
}

/**
 * Where this ad stands. `paymentPending`: the advertiser said they paid and
 * Remixt hasn't checked it yet. `switches`: the owner's switches in Admin →
 * Settings (an ad can be fine and still not show while its kind is off).
 */
export function deliveryStatus(c: DeliveryInput, o: { now: number; paymentPending?: boolean; switches?: Switches }): Delivery {
  const paid = c.budget_micros > 0;
  const money = hasMoneyLeft(c);
  const sw = o.switches ?? { ads: true, audioAds: true, promotions: true };

  if (c.review === "draft") {
    return make("draft", "act", 0, c.format === "audio" && !c.audio_key ? "upload" : "submit",
      ["Draft", c.format === "audio" && !c.audio_key ? "Add its sound, then send it for review." : "Not sent yet. Send it for review when it's ready."],
      ["پیش‌نویس", c.format === "audio" && !c.audio_key ? "صدایش را اضافه کنید، بعد برای بررسی بفرستید." : "هنوز فرستاده نشده. وقتی آماده بود برای بررسی بفرستید."]);
  }
  if (c.review === "rejected") {
    return make("rejected", "bad", 0, "edit",
      ["Turned down", "Read our note, change the ad, and send it again."],
      ["رد شد", "یادداشت ما را بخوانید، تبلیغ را اصلاح کنید و دوباره بفرستید."]);
  }
  if (c.format === "audio" && !c.audio_key) {
    return make("needsSound", "act", c.review === "pending" ? 1 : 2, "upload",
      ["Needs its sound", "An audio ad can't play without its sound file. Upload it."],
      ["صدا لازم است", "تبلیغ صوتی بدون فایل صدا پخش نمی‌شود. آن را بارگذاری کنید."]);
  }
  if (c.review === "pending") {
    return make("review", "wait", 1, paid ? null : o.paymentPending ? null : "pay",
      ["Being checked", paid || o.paymentPending
        ? "Remixt checks every ad before it runs, usually within a day."
        : "Remixt checks every ad, usually within a day. Add money now and it starts the moment it's approved."],
      ["در حال بررسی", paid || o.paymentPending
        ? "ریمیکست هر تبلیغ را پیش از نمایش بررسی می‌کند، معمولاً تا یک روز."
        : "ریمیکست هر تبلیغ را معمولاً تا یک روز بررسی می‌کند. همین حالا اعتبار اضافه کنید تا به محض تأیید نمایش داده شود."]);
  }
  // Approved from here on.
  if (!money) {
    if (o.paymentPending) {
      return make("checkingPayment", "wait", 2, null,
        ["Checking your payment", "We're confirming your payment arrived. It starts showing as soon as we do."],
        ["بررسی پرداخت", "در حال تأیید رسیدن پرداخت شما هستیم. بلافاصله پس از آن نمایش شروع می‌شود."]);
    }
    if (paid && c.spent_micros > 0) {
      return make("spent", "act", 2, "pay",
        ["Budget used up", "Every view you paid for was shown. Add money to keep it running."],
        ["اعتبار تمام شد", "همهٔ بازدیدهایی که پرداخت کرده بودید نمایش داده شد. برای ادامه اعتبار اضافه کنید."]);
    }
    return make("needsMoney", "act", 2, "pay",
      ["Approved — add money", "It's approved but has no budget yet, so it can't show. Add money and it starts."],
      ["تأیید شد — اعتبار اضافه کنید", "تأیید شده اما هنوز اعتباری ندارد، پس نمایش داده نمی‌شود. اعتبار اضافه کنید تا شروع شود."]);
  }
  if (!c.active) {
    return make("paused", "off", 3, "resume", ["Paused", "You paused it. Resume to show it again."], ["متوقف", "شما متوقفش کردید. برای نمایش دوباره ادامه دهید."]);
  }
  if (c.ends_at && new Date(c.ends_at).getTime() <= o.now) {
    return make("ended", "off", 3, "edit", ["Ended", "Its end date has passed. Change the date to run it again."], ["تمام شد", "تاریخ پایانش گذشته. برای اجرای دوباره تاریخ را تغییر دهید."]);
  }
  if (c.starts_at && new Date(c.starts_at).getTime() > o.now) {
    return make("scheduled", "wait", 3, null, ["Starts soon", "It's ready and starts on its start date."], ["به‌زودی", "آماده است و از تاریخ شروعش نمایش داده می‌شود."]);
  }
  const off = !sw.ads || (c.format === "audio" && !sw.audioAds) || (c.format === "promote" && !sw.promotions);
  if (off) {
    return make("switchedOff", "off", 3, null,
      ["On hold by Remixt", "This kind of ad is switched off on Remixt for now. Your money is safe and it shows again when it's back."],
      ["متوقف از سوی ریمیکست", "این نوع تبلیغ فعلاً در ریمیکست خاموش است. اعتبار شما محفوظ است و پس از روشن شدن دوباره نمایش داده می‌شود."]);
  }
  return make("running", "good", 3, null,
    ["Showing", c.format === "audio" ? "Playing before remixes and in radio breaks." : c.format === "promote" ? "First in the lists, marked Promoted." : "Showing in the places you chose."],
    ["در حال نمایش", c.format === "audio" ? "پیش از ریمیکس‌ها و در وقفه‌های رادیو پخش می‌شود." : c.format === "promote" ? "در بالای فهرست‌ها با برچسب ویژه." : "در جاهایی که انتخاب کردید نمایش داده می‌شود."]);
}
