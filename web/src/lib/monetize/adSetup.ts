// Setting ads up, step by step (Admin → Ads & earnings, at the top): each
// step is checked from the settings in force and what's waiting, says what
// it does in a line, and opens the place to do it. Pure, so the tests can
// walk an owner from nothing to a paying ad on the radio
// (tests/ad-setup.test.ts).

import type { AppSettings, Group } from "../settings/registry";

export type SetupFacts = {
  /** Ads that would show right now (adStatus "running"). */
  running: number;
  /** Advertisers' ads waiting to be checked. */
  pendingCampaigns: number;
  /** Advertisers' payments waiting to be confirmed. */
  pendingPayments: number;
  /** Approved ads with no money in them. */
  unpaidApproved: number;
};

export type SetupStep = {
  id: string;
  done: boolean;
  /** Not needed to earn (a nice-to-have): shown, but not counted against "ready". */
  optional?: boolean;
  en: string;
  help: string;
  /** Where to do it: a Settings group, another Admin tab, or a page on the site. */
  go: { settings: Group } | { tab: "house" | "money" } | { href: string };
  goLabel: string;
};

/** The settings the steps read (the public ones carry them all). */
export type SetupSettings = Pick<AppSettings, "features" | "payTo" | "payouts" | "audio"> & { network: Pick<AppSettings["network"], "adsense" | "other"> };

export function adSetupSteps(s: SetupSettings, f: SetupFacts): SetupStep[] {
  const f$ = s.features;
  const payTo = !!(s.payTo.en.trim() || s.payTo.fa.trim());
  return [
    {
      id: "switch",
      done: f$.ads,
      en: "Switch paying ads on",
      help: "Settings → Switches → “Paying ads”. While it's off only Remixt's own ads show and nobody is paid.",
      go: { settings: "features" },
      goLabel: "Open switches",
    },
    {
      id: "payTo",
      done: payTo,
      en: "Tell advertisers how to pay you",
      help: "Your card number, IBAN/Sheba or USDT address. Advertisers see it when they add money to an ad.",
      go: { settings: "payTo" },
      goLabel: "Add payment details",
    },
    {
      id: "toman",
      done: s.payouts.tomanRate > 0,
      optional: true,
      en: "Set the Toman rate",
      help: "Toman per dollar, so Persian advertisers can price and pay in Toman.",
      go: { settings: "payouts" },
      goLabel: "Set the rate",
    },
    {
      id: "selfServe",
      done: f$.selfServe && f$.promotions,
      en: "Let advertisers and members make their own ads",
      help: "“Advertisers can make their own ads” and “Members can promote” — then anyone can start at /advertise.",
      go: { settings: "features" },
      goLabel: "Open switches",
    },
    {
      id: "audio",
      done: f$.audioAds,
      en: "Audio ads on the radio and before remixes",
      help: `The radio's first break comes after ${s.audio.radioFirstMinutes} min of listening, then one every ${s.audio.radioEveryMinutes} min.`,
      go: { settings: "audio" },
      goLabel: "Audio rules",
    },
    {
      id: "house",
      done: f$.houseAds && f$.houseRadio,
      en: "Remixt's own ads fill empty spots",
      help: "No spot is ever blank: when no one pays for it, your own promos show (and station IDs on the radio).",
      go: { tab: "house" },
      goLabel: "Remixt ads",
    },
    {
      id: "network",
      done: s.network.adsense || s.network.other,
      optional: true,
      en: "Connect an ad network (AdSense, Yektanet…)",
      help: "Fills empty picture spots with paid network ads. Needs your own domain and the network's approval first.",
      go: { settings: "network" },
      goLabel: "Ad networks",
    },
    {
      id: "review",
      done: f.pendingCampaigns === 0,
      en: f.pendingCampaigns ? `Check ${f.pendingCampaigns} ad${f.pendingCampaigns === 1 ? "" : "s"} waiting` : "No ads waiting to be checked",
      help: "Approve or turn down each new ad below. The advertiser is told either way.",
      go: { tab: "money" },
      goLabel: "Ads to approve ↓",
    },
    {
      id: "payments",
      done: f.pendingPayments === 0,
      en: f.pendingPayments ? `Confirm ${f.pendingPayments} payment${f.pendingPayments === 1 ? "" : "s"}` : "No payments waiting",
      help: "When the money has arrived, press “Payment received”: that's what puts it in the ad's budget. An approved ad with no budget never shows.",
      go: { tab: "money" },
      goLabel: "Payments ↓",
    },
    {
      id: "running",
      done: f.running > 0,
      en: f.running ? `${f.running} paying ad${f.running === 1 ? "" : "s"} showing` : f.unpaidApproved ? `${f.unpaidApproved} approved ad${f.unpaidApproved === 1 ? " has" : "s have"} no budget yet` : "No paying ad showing yet",
      help: f.unpaidApproved && !f.running
        ? "Approved isn't enough: an ad shows once it has money. Confirm its payment, or (your own campaign) give it a budget."
        : "Open the radio or a remix to see it. Each listener's first radio break comes after a few minutes.",
      go: { href: "/radio/remixt-radio" },
      goLabel: "Open the radio",
    },
  ];
}

/** "6 of 8": the steps that count (optional ones aside). */
export function setupProgress(steps: SetupStep[]): { done: number; of: number; ready: boolean } {
  const counted = steps.filter((x) => !x.optional);
  const done = counted.filter((x) => x.done).length;
  return { done, of: counted.length, ready: done === counted.length };
}
