// What the advertiser page sends, checked the same way by every route that takes it.
import { z } from "zod";
import { FORMATS, TOPIC_IDS } from "./adRules";
import { PLACEMENTS } from "./policy";

export const draftSchema = z.object({
  name: z.string().trim().max(80).default(""),
  advertiser: z.string().trim().max(60).default(""),
  title: z.string().trim().max(80).default(""),
  body: z.string().trim().max(200).default(""),
  cta: z.string().trim().max(24).default("Learn more"),
  link: z.string().trim().max(500).default(""),
  format: z.enum(FORMATS),
  topic: z.string().refine((t) => TOPIC_IDS.includes(t), "Choose what the ad is about"),
  lang: z.enum(["any", "en", "fa"]).default("any"),
  placements: z.array(z.enum(PLACEMENTS as unknown as [string, ...string[]])).max(4).default([]),
  cpmMicros: z.number().int().positive().max(1_000_000_000),
  endsAt: z.string().datetime().nullable().default(null),
  promoteTarget: z.string().max(80).nullable().default(null),
});
