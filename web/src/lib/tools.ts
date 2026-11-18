// The tool pages (/tools/<slug>): one page for each thing people search for
// when they want a song taken apart — "vocal remover", "acapella",
// "karaoke", "stems", "drums", "bass", "mashup". Each one answers its own
// search with its own words, steps and questions (pages that only swap a
// keyword are treated as doorway pages and hurt the whole site), and sends
// people to the same real tool: the in-browser splitter and the Studio.
//
// Everything said here must stay true of the app. Facts it relies on:
// splitter.ts (htdemucs, ≤15 min, WebGPU or every CPU core), stemKinds.ts
// (vocals, beat, drums, bass, "other" shown as Melody), UploadManager
// (MP3/WAV/M4A/FLAC/OGG/AAC/Opus or a link), LaneInspector ("Export lane",
// pitch), the export (MP3 or WAV), the lyrics panel and "Remove a singer".
//
// Pure data, so tests/seo.test.ts can check lengths, links and uniqueness.

import type { StemKind } from "./stemKinds";

export type ToolStep = { name: string; text: string };
export type ToolSection = { heading: string; paragraphs: string[] };
export type ToolFaq = { q: string; a: string };

export type ToolPage = {
  slug: string;
  /** Short name: link text, cards, breadcrumbs. */
  name: string;
  /** The tab title; the layout adds " · Remixt", so it stays ≤ 51 characters. */
  title: string;
  /** The search snippet: 70–160 characters. */
  description: string;
  h1: string;
  /** The first paragraph: says plainly what the page does. */
  lead: string;
  /** One line under each step of "How to". */
  steps: ToolStep[];
  sections: ToolSection[];
  faq: ToolFaq[];
  /** Other tool pages to link to (slugs). */
  related: string[];
  /** Stems of this kind already in the library, if the page has one. */
  library?: { kind: StemKind; label: string };
  /** The main button's words. */
  cta: string;
};

/** Said on every page, so it's written once. */
const SHARED_FAQ: ToolFaq[] = [
  {
    q: "Is it free?",
    a: "Yes. Splitting, the Studio and exporting are free. The AI runs on your own device, so there is no per-song server cost to charge you for.",
  },
  {
    q: "Does my song get uploaded?",
    a: "The original file never leaves your device: it's split in your browser. Only the separated stems are saved to your library, so you can use them again in the Studio.",
  },
  {
    q: "Which songs can I use?",
    a: "Songs you have the right to use: your own music, tracks you've licensed, or songs for private practice. Rights holders can ask for anything shared on Remixt to be taken down.",
  },
];

const SPLIT_STEPS = (last: ToolStep): ToolStep[] => [
  {
    name: "Add a song",
    text: "Upload an MP3, WAV, M4A, FLAC, OGG, AAC or Opus file up to 15 minutes long, or paste a link to the song.",
  },
  {
    name: "Let the AI split it",
    text: "The splitter runs in your browser and separates vocals, drums, bass and melody. The model downloads once (about 200 MB) and is kept for next time.",
  },
  last,
];

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "vocal-remover",
    name: "Vocal remover",
    title: "Free vocal remover: remove vocals from any song",
    description:
      "Remove vocals from any song online for free. AI splits the voice from the music in your browser, so you get a clean instrumental as an MP3 or WAV.",
    h1: "Remove vocals from any song",
    lead:
      "Remixt's vocal remover takes the singing out of a song and leaves the music: drums, bass, keys, guitars and everything else. It uses an AI model that was trained to tell voices from instruments, and it runs right in your browser: nothing to install, nothing to pay.",
    steps: SPLIT_STEPS({
      name: "Download the instrumental",
      text: "Open the song in the Studio, keep the Beat lane, and use Export lane to save the instrumental as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "An instrumental, not a phase trick",
        paragraphs: [
          "Old vocal removers cancel whatever sits in the middle of the stereo mix. That also wipes out the kick, the snare and the bass, and leaves the reverb of the voice behind. Remixt uses Demucs, a neural network for source separation, which rebuilds the music without the voice instead of subtracting the centre.",
          "The result keeps the full stereo width and the low end, so it works as a backing track you can actually perform over.",
        ],
      },
      {
        heading: "What people use it for",
        paragraphs: [
          "Singers make backing tracks to rehearse or perform covers. Producers sample a beat without the original vocal. Content creators get music they can talk over. Teachers slow a part down and play along without the lead vocal getting in the way.",
        ],
      },
      {
        heading: "Better than a plain instrumental",
        paragraphs: [
          "Because the song stays split in your library, you can go further than a karaoke file: turn the bass up, take the drums out, change the key, or put a vocal from a different song on top and make a remix.",
        ],
      },
    ],
    faq: [
      {
        q: "How good is the instrumental?",
        a: "On most commercial songs the voice is gone or nearly gone. Heavily processed vocals, big choirs and vocals that share a frequency range with a lead instrument can leave a faint trace. The Studio's lane volume and EQ help clean what's left.",
      },
      {
        q: "Can I keep the backing vocals?",
        a: "The splitter treats every voice as vocals, so backing singers are removed with the lead. To keep a quiet guide vocal, leave the Vocals lane in the mix and turn it down.",
      },
      ...SHARED_FAQ,
    ],
    related: ["acapella-extractor", "karaoke-maker", "stem-splitter"],
    library: { kind: "beat", label: "Browse instrumentals already split" },
    cta: "Remove vocals from a song",
  },
  {
    slug: "acapella-extractor",
    name: "Acapella extractor",
    title: "Acapella extractor: isolate vocals from a song",
    description:
      "Get the acapella from any song for free. Isolate the vocals from the music with AI in your browser, then use the clean voice in a remix or export it.",
    h1: "Get the acapella from any song",
    lead:
      "Most songs never get an official acapella. Remixt's acapella extractor isolates the vocals from a finished mix, so you can sample the voice, remix it over a new beat, study the harmonies or check the lyrics line by line.",
    steps: SPLIT_STEPS({
      name: "Use or export the vocal",
      text: "Drop the Vocals lane on any beat in the Studio, or use Export lane to save the acapella as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "Made for remixing",
        paragraphs: [
          "An acapella on its own is only half a remix. In the Studio you can put it straight over the beat of another song: Remixt finds the tempo and key of both and stretches and shifts the vocal to fit, so it lands on the beat without hand-warping.",
        ],
      },
      {
        heading: "Lyrics that follow the voice",
        paragraphs: [
          "Remixt looks up the song's lyrics and times each line to where it's sung in the vocal, so you can see exactly which phrase you're cutting or looping. Lines in right-to-left languages such as Persian and Arabic display correctly.",
        ],
      },
      {
        heading: "More than one singer?",
        paragraphs: [
          "Remove a singer, in the Studio, finds where each voice sings in a duet or a featured verse and silences the one you choose. It works best when the singers take turns rather than sing at the same moment.",
        ],
      },
    ],
    faq: [
      {
        q: "Will the acapella have reverb on it?",
        a: "The vocal keeps the reverb and delay that were on it in the original mix, because they're part of the voice's sound. That usually helps it sit in a new mix.",
      },
      {
        q: "Can I find acapellas others have already made?",
        a: "Yes. Vocals split by the community are in the library, ready to preview and drop into the Studio.",
      },
      ...SHARED_FAQ,
    ],
    related: ["vocal-remover", "mashup-maker", "karaoke-maker"],
    library: { kind: "vocals", label: "Browse acapellas already split" },
    cta: "Extract an acapella",
  },
  {
    slug: "karaoke-maker",
    name: "Karaoke maker",
    title: "Karaoke maker: turn any song into karaoke",
    description:
      "Turn any song into karaoke online: AI removes the lead vocal, lyrics are synced line by line, and you can change the key to suit your voice. Free.",
    h1: "Turn any song into karaoke",
    lead:
      "A karaoke track needs three things: the music without the singer, the words at the right time, and a key you can actually sing in. Remixt does all three in your browser, from any song you add.",
    steps: SPLIT_STEPS({
      name: "Sing along",
      text: "Open the song in the Studio. Lyrics appear in time with the music; mute or lower the Vocals lane and shift the pitch to your range.",
    }),
    sections: [
      {
        heading: "Synced lyrics, found for you",
        paragraphs: [
          "Remixt searches for the song's lyrics and ranks the results by how well their timing fits the vocal it just separated. You can fix any line by typing over it: the line keeps its time.",
        ],
      },
      {
        heading: "Change the key without changing the speed",
        paragraphs: [
          "Every lane in the Studio has its own pitch control in semitones. Move the music down two steps for a lower voice, or up for a higher one; the tempo stays the same.",
        ],
      },
      {
        heading: "Keep a guide vocal",
        paragraphs: [
          "Learning a song? Leave the original vocal in at a low level as a guide, then take it out completely when you know the words.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I record a karaoke video?",
        a: "The Studio makes short social clips with the lyrics on screen, karaoke-style, over the song's artwork or your own photo.",
      },
      {
        q: "What if the lyrics are wrong or missing?",
        a: "Edit them right in the lyrics panel. You can paste your own words and Remixt places them along the vocal.",
      },
      ...SHARED_FAQ,
    ],
    related: ["vocal-remover", "acapella-extractor", "stem-splitter"],
    library: { kind: "beat", label: "Browse instrumentals already split" },
    cta: "Make a karaoke track",
  },
  {
    slug: "stem-splitter",
    name: "Stem splitter",
    title: "AI stem splitter: vocals, drums, bass & melody",
    description:
      "Split any song into stems online: vocals, drums, bass and melody, separated by AI in your browser. Mix, mute and export each stem for free.",
    h1: "Split a song into stems with AI",
    lead:
      "Remixt's stem splitter separates a finished song into its parts: vocals, drums, bass and melody (keys, guitars, synths and everything else), plus the full beat without the voice. Each stem lands on its own lane in a multitrack studio.",
    steps: SPLIT_STEPS({
      name: "Work with the stems",
      text: "Mute, solo, re-balance or replace any stem in the Studio, then export your mix or a single stem as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "The model behind it",
        paragraphs: [
          "The splitter is Demucs (the hybrid transformer version), an open music source separation model, converted to run in the browser. It uses your graphics card through WebGPU when the browser has it, and every CPU core when it doesn't. A typical song takes a few minutes on a laptop.",
        ],
      },
      {
        heading: "Five stems from every song",
        paragraphs: [
          "Vocals and Beat give you the classic acapella and instrumental pair. Drums, Bass and Melody are the beat taken apart, for producers who want to rebuild a groove, practise a part or sample a single instrument.",
        ],
      },
      {
        heading: "Split on a phone",
        paragraphs: [
          "Splitting is heavy work for a phone. Queue a song from your phone and a computer — yours or a helper's — splits it; you get a notification when the stems are in your library.",
        ],
      },
    ],
    faq: [
      {
        q: "How long can a song be?",
        a: "Up to 15 minutes per song.",
      },
      {
        q: "Do I have to install anything?",
        a: "No. It runs in Chrome, Edge, Safari and Firefox on a computer. The model downloads once and is cached in your browser.",
      },
      ...SHARED_FAQ,
    ],
    related: ["drum-extractor", "bass-extractor", "vocal-remover"],
    cta: "Split a song into stems",
  },
  {
    slug: "drum-extractor",
    name: "Drum extractor",
    title: "Drum extractor: isolate or remove the drums",
    description:
      "Isolate the drums from any song, or remove them for a drumless practice track. AI drum separation in your browser, free, with MP3 or WAV export.",
    h1: "Isolate or remove the drums from a song",
    lead:
      "Remixt splits the drums out of a finished song. Keep only the drums to study a groove or sample a break, or keep everything except the drums to get a drumless track you can play along to.",
    steps: SPLIT_STEPS({
      name: "Keep or drop the drums",
      text: "In the Studio, solo the Drums lane to hear the kit alone, or mute it for a drumless mix. Export either as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "Drumless tracks for drummers",
        paragraphs: [
          "Practising along to a record is the fastest way to learn a song, but the original drummer is in the way. Take the drums out and you're the drummer, with the band, the bass and the vocal still there.",
        ],
      },
      {
        heading: "Drum stems for producers",
        paragraphs: [
          "Isolated drums let you sample a break, check how a groove sits against the bass, or layer your own kit underneath. Remixt shows the song's tempo, so loops line up on the bar.",
        ],
      },
    ],
    faq: [
      {
        q: "Does it separate the kick, snare and cymbals?",
        a: "No: the whole kit comes out as one Drums stem. Use the Studio's EQ on that lane to bring out the kick or tame the cymbals.",
      },
      {
        q: "Can I slow the track down to practise?",
        a: "Yes. The Studio changes tempo without changing pitch, so you can learn a part slowly and speed it back up.",
      },
      ...SHARED_FAQ,
    ],
    related: ["bass-extractor", "stem-splitter", "vocal-remover"],
    library: { kind: "drums", label: "Browse drum stems already split" },
    cta: "Split the drums out of a song",
  },
  {
    slug: "bass-extractor",
    name: "Bass extractor",
    title: "Bass extractor: isolate or remove the bass line",
    description:
      "Isolate the bass line from any song to learn it by ear, or remove it for a bassless backing track. AI bass separation in your browser, free.",
    h1: "Isolate or remove the bass from a song",
    lead:
      "The bass is the hardest part of a mix to hear clearly. Remixt separates it from the rest of the song, so you can hear the bass line on its own — or take it out and play it yourself.",
    steps: SPLIT_STEPS({
      name: "Solo it or play over it",
      text: "Solo the Bass lane to learn the line, or mute it for a bassless backing track. Export either as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "Learn bass lines by ear",
        paragraphs: [
          "On its own, a bass line is easy to follow note by note. Pair it with the drums for the rhythm section only, and slow it down without changing the pitch while you work it out.",
        ],
      },
      {
        heading: "Bassless backing tracks",
        paragraphs: [
          "Keep vocals, drums and melody and drop the bass: a full-band backing track with a gap where you play. Shift the key in semitones if you want to practise in another one.",
        ],
      },
    ],
    faq: [
      {
        q: "Does it work on electronic music and 808s?",
        a: "Yes. Synth bass and 808s go to the Bass stem. Very low kick drums sometimes share a little energy with the bass; the lane's EQ helps separate them.",
      },
      ...SHARED_FAQ,
    ],
    related: ["drum-extractor", "stem-splitter", "karaoke-maker"],
    library: { kind: "bass", label: "Browse bass stems already split" },
    cta: "Split the bass out of a song",
  },
  {
    slug: "mashup-maker",
    name: "Mashup maker",
    title: "Mashup maker: put any vocal over any beat",
    description:
      "Make a mashup online: take the vocal from one song and the beat from another. Tempo and key are matched automatically. Free, in your browser.",
    h1: "Make a mashup from any two songs",
    lead:
      "A mashup is a vocal from one song over the music of another. Remixt splits both songs, finds their tempo and key, and fits them together, so you spend your time choosing what sounds good rather than warping audio by hand.",
    steps: [
      {
        name: "Add two songs",
        text: "Upload them or pick split songs from the library: one for the vocal, one for the beat.",
      },
      {
        name: "Match them",
        text: "Put the vocal and the beat in the Studio. Remixt matches the tempo and key, and lines the vocal up with the beat's bars.",
      },
      {
        name: "Mix and share",
        text: "Shape the mix with effects and the AI producer's ideas, export an MP3 or WAV, or publish the remix with its own page and player.",
      },
    ],
    sections: [
      {
        heading: "Automatic tempo and key matching",
        paragraphs: [
          "Two songs rarely share a tempo or key. Remixt measures both and stretches and shifts the vocal to the beat without changing its character, then places its phrases on the beat's downbeats.",
        ],
      },
      {
        heading: "A new song from several",
        paragraphs: [
          "With more than two songs in the Studio, the AI producer can plan a whole new song: who sings which part, which beat plays under it, drops on the choruses, one tempo and one key, mixed and mastered to streaming loudness.",
        ],
      },
      {
        heading: "Publish it",
        paragraphs: [
          "Published remixes get their own page with a player, cover art and credits to the songs they came from, and can be shared, embedded, entered in challenges and played on Remixt radio.",
        ],
      },
    ],
    faq: [
      {
        q: "What makes two songs work together?",
        a: "Close tempos (or one at half or double the other) and related keys. Remixt shows how far apart two songs are, and fixes both.",
      },
      ...SHARED_FAQ,
    ],
    related: ["acapella-extractor", "vocal-remover", "stem-splitter"],
    library: { kind: "vocals", label: "Pick a vocal from the library" },
    cta: "Make a mashup",
  },
];

export function toolPage(slug: string): ToolPage | undefined {
  return TOOL_PAGES.find((t) => t.slug === slug);
}

export function toolPath(slug: string) {
  return `/tools/${slug}`;
}
