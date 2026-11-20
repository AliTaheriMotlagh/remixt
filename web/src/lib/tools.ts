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
import { TOOL_PAGES_FA } from "./toolsFa";

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
  /** The ticks under the tool, when the usual ones (lib/toolsUi.ts points) aren't all true of it. */
  points?: string[];
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
    title: "Drum extractor: isolate the drums from a song",
    description:
      "Isolate the drums from any song: the whole kit on its own, to sample a break, study a groove or hear the kick against the bass. Free, in your browser.",
    h1: "Isolate the drums from any song",
    lead:
      "Remixt pulls the drums out of a finished song and gives you the kit on its own: kick, snare, hats and cymbals as one clean stem. Sample a break, study how a groove is played, or line your own sounds up under it.",
    steps: SPLIT_STEPS({
      name: "Hear the drums alone",
      text: "In the Studio, solo the Drums lane to hear the kit on its own and loop the bar you want. Export it as an MP3 or WAV.",
    }),
    sections: [
      {
        heading: "Hear exactly how a groove is played",
        paragraphs: [
          "With the band gone, every ghost note, hi-hat accent and fill is easy to hear. Loop a bar in the Studio and slow it down without changing the pitch to work out how it's played. Want the opposite — the song without its drums? That's the drum remover.",
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
    related: ["drum-remover", "bass-extractor", "stem-splitter"],
    library: { kind: "drums", label: "Browse drum stems already split" },
    cta: "Split the drums out of a song",
  },
  {
    slug: "drum-remover",
    name: "Drum remover",
    title: "Drum remover: make a drumless version of a song",
    description:
      "Remove the drums from any song for a drumless track to play along to. AI in your browser keeps the band, bass and vocal. Free, as MP3 or WAV.",
    h1: "Remove the drums from any song",
    lead:
      "Remixt's drum remover takes the whole kit out of a finished song and keeps everything else: the vocal, the bass, the guitars and keys. Drop a song above and the drumless version plays as soon as it's split, ready to practise along to or save as a WAV.",
    steps: SPLIT_STEPS({
      name: "Play along, or download it",
      text: "The drumless mix plays as soon as the split is done. Switch any part back on, then download the mix as a WAV or each part as an MP3.",
    }),
    sections: [
      {
        heading: "Practise with the real band",
        paragraphs: [
          "Drumless tracks are how drummers learn songs: the record keeps its feel, its bass line and its vocal cues, and the gap where the drums were is yours to fill. With the original kit gone, you hear your own timing against the band instead of against another drummer.",
          "Slow a hard section down in the Studio without changing its pitch, loop it, and bring it back up to speed once it's under your hands.",
        ],
      },
      {
        heading: "Cleaner than an EQ cut",
        paragraphs: [
          "Turning the lows and highs down only muffles a kit, and takes the bass and the shine of the mix with it. The splitter is a neural network trained to tell drums from everything else, so the bass line and the top end of the song stay where they were.",
        ],
      },
      {
        heading: "For covers, lessons and sessions",
        paragraphs: [
          "Drum teachers make play-along tracks for their students, cover bands rehearse against the original arrangement, and session drummers try a part over a demo before the studio date.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I keep a little of the original drums as a guide?",
        a: "Yes. Switch Drums back on in the tool above before you download, or open the song in the Studio and turn the Drums lane down instead of off.",
      },
      {
        q: "Will a ghost of the drums be left over?",
        a: "On most songs the kit is gone. Loud, washy cymbals in a dense mix can leave a faint trace in the melody part, which disappears under a live kit.",
      },
      ...SHARED_FAQ,
    ],
    related: ["drum-extractor", "bass-extractor", "karaoke-maker"],
    cta: "Remove the drums from a song",
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
  {
    slug: "remix-maker",
    name: "Remix maker",
    title: "Remix maker: make a remix online for free",
    description:
      "Make a remix online: split any song into vocals, drums, bass and melody, then rebuild it in a browser studio with effects, tempo and key changes. Free.",
    h1: "Make a remix of any song, online",
    lead:
      "A remix starts with the parts of a song. Drop one above to split it into vocals, drums, bass and melody and hear each on its own, then open it in Remixt's Studio: a multitrack editor in your browser where you rearrange, retime and reshape those parts into something new.",
    steps: [
      {
        name: "Split the song",
        text: "Drop a song in the tool above. It's split in your browser into vocals, drums, bass and melody, and you can switch each one on and off.",
      },
      {
        name: "Build the remix in the Studio",
        text: "Open the parts as lanes, add a beat or a vocal from another song or the library, change the tempo and key, cut and loop clips, and add effects.",
      },
      {
        name: "Export or publish",
        text: "Export the remix as an MP3 or WAV, or publish it on Remixt with its own page, player and credits to the songs it came from.",
      },
    ],
    sections: [
      {
        heading: "Everything a remix needs, in one tab",
        paragraphs: [
          "The Studio has a lane for each part and a timeline of clips you can cut, loop and move; volume, pan and EQ on every lane; reverb, delay and filters; tempo changes that keep the pitch, and pitch shifts in semitones. It runs in the browser, so there's nothing to install, and your project is there on your next visit.",
        ],
      },
      {
        heading: "Ideas when you're stuck",
        paragraphs: [
          "The AI producer listens to your project and suggests changes — a drop before the chorus, a filter sweep into the verse, a chopped vocal — and can plan a whole new song from several. Every suggestion is made of ordinary edits you can undo or change.",
        ],
      },
      {
        heading: "Remix with other people",
        paragraphs: [
          "Invite people into a shared session with a role each — producer, vocalist, mix engineer — and choose who can edit. When the remix is published, everyone's part is credited.",
        ],
      },
    ],
    faq: [
      {
        q: "Do I need any music software?",
        a: "No. The splitter and the Studio both run in an up-to-date browser on a computer. On a phone, send the song to the split queue and open it in the Studio when it's ready.",
      },
      {
        q: "Can I earn from my remix?",
        a: "Published remixes can show ads if you switch them on, and you're paid a share; the artists of the songs you used are paid theirs too.",
      },
      ...SHARED_FAQ,
    ],
    related: ["mashup-maker", "stem-splitter", "acapella-extractor"],
    library: { kind: "beat", label: "Find a beat to remix in the library" },
    cta: "Make a remix",
  },
  {
    slug: "bpm-key-finder",
    name: "BPM & key finder",
    title: "BPM and key finder: tempo and key of any song",
    description:
      "Find the BPM and key of any song in seconds: tempo, key, Camelot code and the keys it mixes with. Runs in your browser, works on phones, free.",
    h1: "Find the BPM and key of any song",
    lead:
      "Drop a song and Remixt measures its tempo and key right in your browser — no splitting, no upload, a few seconds even on a phone. You get the BPM, the key with its Camelot code, the keys that blend with it and, with a second song, exactly how to match the two.",
    steps: [
      {
        name: "Drop a song",
        text: "Choose an MP3, WAV, M4A, FLAC or OGG file. It's read on your device: nothing is uploaded and nothing is kept.",
      },
      {
        name: "Read the tempo and key",
        text: "The finder listens for the beat and the notes. You get the BPM, the key, its Camelot code and how sure the reading is.",
      },
      {
        name: "Compare a second song",
        text: "Add another song to see how far apart they are: the tempo change and the semitone shift that make them fit, for a mashup or a DJ set.",
      },
    ],
    sections: [
      {
        heading: "How the tempo is found",
        paragraphs: [
          "The finder follows the song's onsets — the moments drums and notes start — tests which beat grid lines up with most of them across the whole song, and sharpens the reading to a hundredth of a BPM. Songs often read at half or double the tempo you feel (70 or 140 for a 140 BPM trap beat); both mix the same way.",
        ],
      },
      {
        heading: "How the key is found",
        paragraphs: [
          "It measures how much of each of the twelve notes sounds through the song (a chromagram) and compares that with the Krumhansl–Kessler profiles of all 24 major and minor keys. A song that borrows chords or changes key reads with lower confidence, and its relative major or minor is the usual second guess.",
        ],
      },
      {
        heading: "Camelot codes for harmonic mixing",
        paragraphs: [
          "DJs mix by the Camelot wheel: 8A is A minor and 8B is C major. The same number means the same notes, and one step either way is a fifth apart and still blends. The finder lists those neighbours, so you know what can come next.",
        ],
      },
    ],
    faq: [
      {
        q: "How accurate is it?",
        a: "Tempo is right on nearly every song with a steady beat; live recordings and songs that change tempo give an average. Key is harder: on clear pop, rock and electronic songs it's usually right or the relative key, and the confidence shown tells you when to trust your ear.",
      },
      {
        q: "Does it need the AI splitter?",
        a: "No. It doesn't load the splitter model, so it starts at once and works on phones and tablets too.",
      },
      SHARED_FAQ[0],
      SHARED_FAQ[2],
    ],
    related: ["mashup-maker", "remix-maker", "stem-splitter"],
    cta: "Find a song's BPM and key",
    points: ["Free", "Runs in your browser", "Nothing uploaded", "Works on phones"],
  },
];

/** The languages the tool pages are written in. English lives at /tools, the rest under /<locale>/tools. */
export const TOOL_LOCALES = ["en", "fa"] as const;
export type ToolLocale = (typeof TOOL_LOCALES)[number];

const PAGES: Record<ToolLocale, ToolPage[]> = { en: TOOL_PAGES, fa: TOOL_PAGES_FA };

export function toolPages(locale: ToolLocale = "en"): ToolPage[] {
  return PAGES[locale];
}

export function toolPage(slug: string, locale: ToolLocale = "en"): ToolPage | undefined {
  return PAGES[locale].find((t) => t.slug === slug);
}

export function toolsHubPath(locale: ToolLocale = "en") {
  return locale === "en" ? "/tools" : `/${locale}/tools`;
}

export function toolPath(slug: string, locale: ToolLocale = "en") {
  return `${toolsHubPath(locale)}/${slug}`;
}

/**
 * Every language's address of one tool page (or of the hub, without a
 * slug), for hreflang: in the page's <head> and in the sitemap. Each page
 * lists all of them, itself included, so the links are reciprocal; English
 * is the default for everyone else.
 */
export function toolLanguages(slug?: string): Record<string, string> {
  const at = (locale: ToolLocale) => (slug ? toolPath(slug, locale) : toolsHubPath(locale));
  const languages: Record<string, string> = {};
  for (const locale of TOOL_LOCALES) languages[locale] = at(locale);
  languages["x-default"] = at("en");
  return languages;
}
