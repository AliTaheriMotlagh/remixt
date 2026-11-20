// The guides (/guides/<slug>): how-to articles for the questions people ask
// before they need a tool — "how to make a remix", "how to match keys". Each
// answers its own question in full (no keyword-swapped twins), shows how to
// do it with Remixt's real tools, and links to them.
//
// Everything said here must stay true of the app, like lib/tools.ts: the
// splitter (vocals, drums, bass, melody; in the browser), the Studio (lanes,
// clips, tempo and key matching, pitch in semitones, effects, Export lane as
// MP3 or WAV from the lane's start, publishing), the DJ decks (sync, key
// match, Camelot codes, stem kills, Auto-mix, set recording) and the BPM and
// key finder. Pure data, so tests/guides.test.ts can check it.

export type GuideStep = { name: string; text: string };
export type GuideSection = { heading: string; paragraphs: string[]; steps?: GuideStep[] };

export type Guide = {
  slug: string;
  /** Short name: cards, breadcrumbs, the footer. */
  name: string;
  /** The tab title; the layout adds " · Remixt", so it stays ≤ 51 characters. */
  title: string;
  /** The search snippet: 70–160 characters. */
  description: string;
  h1: string;
  /** The answer in a paragraph: what the rest of the page explains. */
  lead: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  /** The tool pages that do what the guide explains (slugs in lib/tools.ts), the main one first. */
  tools: string[];
  /** Other guides to read next. */
  related: string[];
  /** Minutes to read, shown on the card. */
  minutes: number;
  /** When the text last changed (YYYY-MM-DD), for Article dateModified. */
  updated: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-make-a-remix",
    name: "How to make a remix",
    title: "How to make a remix: a step-by-step guide",
    description:
      "How to make a remix of any song, step by step: get the stems, choose what to keep, match tempo and key, build a new arrangement, then mix and share it.",
    h1: "How to make a remix of any song",
    lead:
      "A remix keeps something recognisable from a song — usually the vocal — and puts it in a new setting: a different beat, tempo, structure or genre. The work comes down to five steps: get the song's parts, choose what to keep, make the new parts fit in tempo and key, build an arrangement, and mix it so it sounds finished.",
    sections: [
      {
        heading: "1. Get the parts of the song",
        paragraphs: [
          "Official stems are rare, so most remixes start by separating a finished song. An AI splitter rebuilds each instrument from the mix instead of filtering it, which keeps the vocal clean enough to sit on a new beat.",
        ],
        steps: [
          { name: "Split the song", text: "Drop the song on the stem splitter or the remix maker. It's separated in your browser into vocals, drums, bass and melody." },
          { name: "Listen to each part alone", text: "Switch the parts on and off to hear what's really there: a hook you hadn't noticed, a bass line worth keeping, an ad-lib for a drop." },
        ],
      },
      {
        heading: "2. Decide what the remix keeps",
        paragraphs: [
          "The vocal is the usual anchor: listeners recognise a song by its voice and its hook. Some remixes keep only the chorus; others keep the whole vocal and replace everything under it. A beat-led remix can do the opposite and keep the original groove under a new vocal.",
          "Pick a direction before you start moving clips: a slower, sadder version, a club edit at 124 BPM, a drill flip. It decides the tempo, the key and which parts you'll need from elsewhere.",
        ],
      },
      {
        heading: "3. Make the new parts fit",
        paragraphs: [
          "Two things decide whether parts from different places work together: tempo and key. Measure both with the BPM and key finder. Within about 8% the vocal can be stretched to the beat's tempo without sounding processed; a song at half or double the tempo lines up as it is.",
          "In the Studio, put the vocal on a lane over the new beat and Remixt matches the tempo and key for you, then lines the vocal's phrases up with the beat's downbeats. Shift the pitch by hand in semitones if you'd rather move the beat than the voice.",
        ],
      },
      {
        heading: "4. Build a new arrangement",
        paragraphs: [
          "A remix shouldn't follow the original's structure bar for bar. Cut the vocal into clips and rearrange them: open with the hook, loop a line as a build, leave a gap before the drop. Clips can be cut, moved and looped on the timeline.",
          "Contrast keeps a remix alive: take the drums out for a breakdown, filter the beat before the chorus, double a line with an echo. If you're stuck, the AI producer suggests edits like these for your project, and each one can be undone.",
        ],
      },
      {
        heading: "5. Mix, export and share",
        paragraphs: [
          "Balance the vocal against the beat first, then use EQ to give each part its own space — the vocal around the middle, the beat's lows under it. Add reverb and delay to glue a borrowed vocal into its new room.",
          "Export the remix as an MP3 or WAV, or publish it on Remixt with its own page and player. Published remixes credit the songs they came from, can be shared and embedded, and can be played on Remixt radio.",
        ],
      },
    ],
    faq: [
      {
        q: "Is it legal to remix a song?",
        a: "Remixing for practice and private listening is generally fine. Publishing or selling a remix of someone else's song needs permission from the rights holders; many remixes are shared under platform licences or with the artist's blessing. Rights holders can ask Remixt to take anything down.",
      },
      {
        q: "How long does a remix take?",
        a: "A simple vocal-over-new-beat remix takes minutes once the song is split. A full rework with a new arrangement and a careful mix is a few hours, like any production.",
      },
    ],
    tools: ["remix-maker", "stem-splitter", "bpm-key-finder", "mashup-maker"],
    related: ["how-to-make-a-mashup", "how-to-match-bpm", "how-to-match-keys"],
    minutes: 6,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-isolate-vocals",
    name: "How to isolate vocals",
    title: "How to isolate vocals from any song",
    description:
      "How to isolate vocals from a song: why old phase tricks fail, how AI source separation works, and how to clean up what's left for a usable vocal.",
    h1: "How to isolate vocals from a song",
    lead:
      "To isolate a vocal from a finished song you need to separate it from everything mixed with it. The old way — cancelling whatever sits in the centre of the stereo mix — rarely works. The way that does is AI source separation: a neural network that has learned what voices sound like and rebuilds the vocal on its own.",
    sections: [
      {
        heading: "Why phase cancellation falls short",
        paragraphs: [
          "Classic vocal removers subtract the left channel from the right. Anything panned dead centre disappears — but so do the kick, the snare and the bass, which are usually centred too, and the vocal's stereo reverb stays behind. Flip the trick around to keep the centre and you get a muddy mono mix, not a vocal.",
          "It also needs the original instrumental to be perfectly aligned if you try to cancel it out, and commercial instrumentals are often mixed differently from the vocal version.",
        ],
      },
      {
        heading: "How AI source separation works",
        paragraphs: [
          "Models such as Demucs are trained on thousands of songs where the separate tracks are known. Given a mix, they predict what each source sounded like on its own — vocals, drums, bass and the rest — and rebuild each one, rather than subtracting frequencies.",
          "Remixt runs this model in your browser, using the graphics card where WebGPU is available and every processor core where it isn't. The song never leaves your device.",
        ],
        steps: [
          { name: "Open the acapella extractor", text: "Drop the song in the tool on the page; the model downloads once and stays on your device." },
          { name: "Listen to the vocal alone", text: "When the split is done the vocal plays on its own; switch the instrumental on to compare." },
          { name: "Save it", text: "Download the vocal as an MP3, or take it into the Studio to clean it up and export it as a WAV." },
        ],
      },
      {
        heading: "Cleaning up the result",
        paragraphs: [
          "Even a good separation can leave traces: a hi-hat in the gaps, the reverb tail of a guitar. In the Studio, an EQ cut above the voice's range tames hats, a cut below about 100 Hz removes kick and bass bleed, and trimming the silent stretches between phrases removes most of what's left.",
          "Backing vocals and harmonies come out with the lead, because the model hears them all as voices. If two singers take turns, Remove a singer in the Studio can silence one of them.",
        ],
      },
      {
        heading: "What makes a vocal hard to isolate",
        paragraphs: [
          "Heavy distortion, a voice doubled by a lead instrument in the same range, choirs and very wet mixes are the hardest cases. Lo-fi sources (a phone recording, a low-bitrate MP3) lose detail the model can't put back, so start from the best copy of the song you have.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I isolate vocals without uploading my song?",
        a: "Yes. Remixt's splitter runs in your browser, so the original file stays on your device. Only stems you choose to save to your library are stored.",
      },
      {
        q: "Will the isolated vocal have reverb on it?",
        a: "Yes: reverb and delay that were on the voice in the mix come out with it, because they're part of how it sounds. That usually helps it sit in a new mix.",
      },
    ],
    tools: ["acapella-extractor", "vocal-remover", "stem-splitter"],
    related: ["how-to-create-an-acapella", "how-to-make-a-remix", "how-to-use-stems-in-a-daw"],
    minutes: 5,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-create-an-acapella",
    name: "How to create an acapella",
    title: "How to create an acapella from a song",
    description:
      "How to make an acapella that's ready to use: separate the vocal, clean the gaps, label its tempo and key, and export a WAV that lines up with any beat.",
    h1: "How to create an acapella you can use",
    lead:
      "An acapella is more than a separated vocal: it's a vocal that's clean between phrases, labelled with its tempo and key, and exported so it lines up from the first beat. That's what lets you — or another producer — drop it on a beat and start working at once.",
    sections: [
      {
        heading: "Start from the best source",
        paragraphs: [
          "Separation can only keep what's in the file. A lossless file (WAV or FLAC) or a high-bitrate MP3 gives a noticeably cleaner acapella than a video rip. Use the album version: radio edits and live versions often carry crowd noise or a different mix.",
        ],
        steps: [
          { name: "Split the song", text: "Drop it on the acapella extractor; the vocal comes out on its own in your browser." },
          { name: "Check it end to end", text: "Listen through once with the vocal alone, noting any bleed, before you start cleaning." },
        ],
      },
      {
        heading: "Clean the gaps, not the voice",
        paragraphs: [
          "Most of what makes an acapella sound separated lives in the silences: a cymbal between lines, a ghost of the snare. Cutting those stretches to silence in the Studio does more than any filter, and leaves the voice itself untouched.",
          "Then shape the voice gently: a high-pass around 80–100 Hz for low rumble, and a small cut where bleed collects. Leave the vocal's own reverb alone: taking it out is harder than adding a new one later.",
        ],
      },
      {
        heading: "Label its tempo and key",
        paragraphs: [
          "An acapella without a tempo is hard to use. Measure the original song with the BPM and key finder: the vocal keeps the song's tempo and key, and the Camelot code tells DJs and producers at a glance what it fits with. Put both in the file name — \"Song (Acapella) 92 BPM 8A.wav\" — so nobody has to measure again.",
        ],
      },
      {
        heading: "Export it so it lines up",
        paragraphs: [
          "Keep the vocal lane where it starts, at the very beginning of the song, and use Export lane as a WAV. The file then starts at the song's first sample, so anyone who knows the original's tempo can drop it at bar one and it stays on the grid.",
          "Before you share it, test it the way others will use it: put it over a different beat in the mashup maker. Bleed you didn't hear on its own shows up quickly against new drums, and a vocal that starts late or drifts tells you the export moved.",
          "Want to share it with the community instead? Save the split to your library: Remixt keeps the vocal as a stem others can find, preview and drop into the Studio.",
        ],
      },
    ],
    faq: [
      {
        q: "What's the difference between an acapella and a vocal stem?",
        a: "A vocal stem is any vocal track. An acapella is a vocal meant to be used on its own: clean between phrases, starting on the beat grid, and labelled with tempo and key.",
      },
      {
        q: "Should an acapella be dry or wet?",
        a: "Producers prefer dry, but a separated vocal keeps the reverb that was on it. Leave it as it is and let the new mix's reverb blend with it; heavy de-reverb usually costs more clarity than it gains.",
      },
    ],
    tools: ["acapella-extractor", "bpm-key-finder", "mashup-maker"],
    related: ["how-to-isolate-vocals", "how-to-make-a-mashup", "how-to-match-keys"],
    minutes: 5,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-dj-with-stems",
    name: "How to DJ using stems",
    title: "How to DJ using stems: a practical guide",
    description:
      "How to DJ with stems: kill a vocal for an instant instrumental, swap basslines in a blend, build live mashups and keep two songs in key and in time.",
    h1: "How to DJ using stems",
    lead:
      "A stem DJ treats each song as four parts — vocals, drums, bass and melody — instead of one finished mix. That turns an ordinary transition into an arrangement: the next song's drums under this one's vocal, the bass handed over on the downbeat, a live acapella over a new beat.",
    sections: [
      {
        heading: "What stems change in a mix",
        paragraphs: [
          "With a stereo track you can only fade and EQ. With stems you choose what plays: kill the vocal on the outgoing song so two vocals never clash, keep the incoming drums alone for eight bars of build, or drop the melody for a stripped-down breakdown.",
          "Songs from your Remixt library load onto the DJ decks as their stems, with a kill button for each part on both decks — Vocals, Drums, Bass and Melody, or Vocals and Beat for a song split in two. Split a song first with the stem splitter to get all four.",
        ],
      },
      {
        heading: "Four moves to learn first",
        paragraphs: ["Each of these works on any two songs that are in time and in a compatible key."],
        steps: [
          { name: "The instant instrumental", text: "Kill the vocal on the playing deck under a talk-over, or to let the next song's vocal come in early." },
          { name: "The bass swap", text: "Blend both songs with the incoming bass killed, then swap on a downbeat: one bass out, the other in. Two basses at once is what makes blends muddy." },
          { name: "Drums-first intro", text: "Bring in only the next song's drums under the current one, then the rest of it on the phrase." },
          { name: "The live mashup", text: "Kill everything but the vocal on one deck and everything but the beat on the other, and play them together as long as it works." },
        ],
      },
      {
        heading: "Keep the songs in time and in key",
        paragraphs: [
          "Stems make clashes more obvious, not less: an acapella over the wrong key sounds wrong at once. Sync locks the tempos and beats; key match shifts the incoming song to sit with the playing one. Each deck shows its key as a Camelot code, so you can plan which songs follow which.",
          "Before a set, run your songs through the BPM and key finder and note tempo and Camelot code, so you can pick neighbours on the wheel without guessing.",
        ],
      },
      {
        heading: "Practise, then record",
        paragraphs: [
          "Auto-mix plays a whole transition while showing each step on the same controls you use, which is a quick way to learn what a good blend sounds like. When you're ready, record the set and save it as an MP3 to share.",
        ],
      },
    ],
    faq: [
      {
        q: "Do I need a controller to DJ with stems?",
        a: "No. Remixt's decks work with a mouse, a keyboard or a touch screen, and also take a MIDI controller if you have one.",
      },
      {
        q: "Do stems cost sound quality?",
        a: "All four stems together sound close to the original. A part on its own can show small traces of the others, which disappear in a busy club mix.",
      },
    ],
    tools: ["stem-splitter", "bpm-key-finder", "acapella-extractor"],
    related: ["how-to-match-bpm", "how-to-match-keys", "how-to-make-a-mashup"],
    minutes: 5,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-match-bpm",
    name: "How to match BPM between songs",
    title: "How to match the BPM of two songs",
    description:
      "How to match the BPM of two songs: measure both tempos, use half and double time, stretch without changing pitch, and line the beats up on the downbeat.",
    h1: "How to match the BPM between two songs",
    lead:
      "Two songs play in time when their tempos match and their beats line up. Matching takes three steps: measure both tempos, choose which song moves (and by how much, counting half and double time), and stretch it without changing its pitch — then line up the downbeats.",
    sections: [
      {
        heading: "Measure both tempos",
        paragraphs: [
          "Drop both songs on the BPM and key finder. It reads each tempo from where the hits land across the whole song, to a hundredth of a BPM, and shows the speed change that brings the second song to the first.",
        ],
        steps: [
          { name: "Drop the first song", text: "This is the song whose tempo you'll keep — usually the beat." },
          { name: "Drop the second", text: "The finder shows the percentage to speed it up or slow it down, and whether half or double time is closer." },
        ],
      },
      {
        heading: "Half time and double time",
        paragraphs: [
          "A 70 BPM ballad and a 140 BPM trap beat are already in time: one beat of the ballad is two of the trap. The finder checks the half and double tempos and picks the smallest change, so you don't stretch a song 100% when 0% would do.",
        ],
      },
      {
        heading: "How far can you stretch?",
        paragraphs: [
          "Modern time-stretching changes tempo without changing pitch, but every percent costs a little naturalness. Up to about 8% is hard to hear on most material; voices give themselves away sooner than drums. Beyond that, move the song with fewer exposed vocals, or meet in the middle and stretch both.",
          "In the Studio, a vocal placed over a beat is stretched to the beat's tempo automatically; on the DJ decks, Sync does the same live.",
        ],
      },
      {
        heading: "A worked example",
        paragraphs: [
          "Say the vocal is from a 92 BPM song and the beat runs at 100 BPM. Moving the vocal all the way is an 8.7% stretch — right at the edge of what a voice hides. Meeting in the middle at 96 BPM means the vocal speeds up 4.3% and the beat slows down 4%, and neither change is easy to hear.",
          "Now take an 85 BPM ballad and a 170 BPM drum and bass track. They look twice as far apart, but one beat of the ballad is exactly two of the drum and bass: at double time they're already matched, and nothing needs stretching at all. The finder spots this for you and says so.",
        ],
      },
      {
        heading: "Line up the downbeats",
        paragraphs: [
          "Matching tempo keeps two songs from drifting apart; they also need to start together. Line up the first beat of a bar in each — the downbeat — not just any beat, or the phrases will land a beat out. The Studio places a vocal's phrases on the beat's downbeats for you.",
        ],
      },
    ],
    faq: [
      {
        q: "What if a song changes tempo?",
        a: "Live recordings and older songs drift. The finder reports an average; for a long blend, choose a section with a steady tempo, or let the DJ decks' sync follow the beat as it goes.",
      },
      {
        q: "Does matching BPM change the key?",
        a: "Not with time-stretching: Remixt changes tempo and pitch separately. Old turntable-style speed changes move both together.",
      },
    ],
    tools: ["bpm-key-finder", "mashup-maker", "remix-maker"],
    related: ["how-to-match-keys", "how-to-make-a-mashup", "how-to-dj-with-stems"],
    minutes: 4,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-match-keys",
    name: "How to match keys when remixing",
    title: "How to match keys when remixing",
    description:
      "How to match keys in a remix or mashup: find each song's key, read the Camelot wheel, choose the smallest pitch shift, and check it by ear on the chorus.",
    h1: "How to match keys when remixing",
    lead:
      "A vocal over a beat in a clashing key sounds wrong even to people who can't say why. Matching keys means finding each song's key, seeing how far apart they are on the Camelot wheel, and shifting one of them by the fewest semitones that puts them on shared notes.",
    sections: [
      {
        heading: "Find each song's key",
        paragraphs: [
          "The BPM and key finder measures how much each of the twelve notes sounds through a song and compares that with all 24 major and minor keys. It shows the key, its Camelot code and how confident the reading is — a low confidence means a song borrows chords or changes key, and your ear has the final say.",
        ],
      },
      {
        heading: "Read the Camelot wheel",
        paragraphs: [
          "The Camelot wheel numbers the keys so compatible ones sit next to each other. 8A is A minor, 8B is C major: the same number shares the same notes, so a minor key and its relative major always fit. One step either way (7 or 9) is a fifth apart and shares six of seven notes, which still blends well.",
          "Two or more steps apart, the songs share fewer notes and long overlaps start to rub. That's when to shift.",
        ],
      },
      {
        heading: "Shift by the fewest semitones",
        paragraphs: [
          "Every semitone of shift costs some naturalness, especially on a voice. Moving a vocal two semitones is usually transparent; four starts to sound processed. So the best shift isn't always to the exact key: landing on a Camelot neighbour can save several semitones.",
          "Add the second song in the finder and it shows that shift, worked out the same way the Studio does it. In the Studio itself, the key is matched when you put a vocal over a beat, and every lane has its own pitch control in semitones if you'd rather move the beat.",
        ],
        steps: [
          { name: "Measure both songs", text: "Drop them on the BPM and key finder: key and Camelot code for each." },
          { name: "Read the shift", text: "The finder shows the semitones that put the second song with the first; 0 means they already fit." },
          { name: "Check by ear", text: "Play the chorus — the most exposed notes — before trusting any number." },
        ],
      },
      {
        heading: "When the numbers disagree with your ear",
        paragraphs: [
          "Key detection reads the whole song, but what matters is the section you use. A verse in a minor key and a chorus that lifts to its relative major read as one key; a song with a key change reads as an average. If a match the numbers like still sounds wrong, try one semitone either way and trust what you hear.",
        ],
      },
    ],
    faq: [
      {
        q: "Should I move the vocal or the beat?",
        a: "Usually the beat: listeners notice a pitched voice sooner than pitched instruments. Drums aren't tuned to a key, so shifting a beat mostly moves its bass and melody.",
      },
      {
        q: "What does it mean when two keys are 'relative'?",
        a: "They use the same seven notes with a different home note — A minor and C major, for example. They share a Camelot number and mix without any shift.",
      },
    ],
    tools: ["bpm-key-finder", "mashup-maker", "acapella-extractor"],
    related: ["how-to-match-bpm", "how-to-make-a-mashup", "how-to-dj-with-stems"],
    minutes: 5,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-make-a-mashup",
    name: "How to make a mashup",
    title: "How to make a mashup of two songs",
    description:
      "How to make a mashup: pick two songs that fit, take the vocal from one and the beat from the other, match tempo and key, and arrange it so it feels new.",
    h1: "How to make a mashup",
    lead:
      "A mashup puts the vocal of one song over the music of another. The craft is in choosing two songs that want to be together, making them agree in tempo and key, and arranging the result so it feels like a song of its own rather than two playing at once.",
    sections: [
      {
        heading: "Choose two songs that fit",
        paragraphs: [
          "The best mashups pair songs with something in common — a similar mood, a lyric that answers the other song, or a surprising contrast that still feels right. Check the numbers before you fall in love: tempos within about 8% (or half or double), and keys on the same or a neighbouring Camelot number, give you a mashup that needs little processing.",
        ],
        steps: [
          { name: "Measure both", text: "Drop both songs on the BPM and key finder to see the tempo change and pitch shift they need." },
          { name: "Pick the vocal and the beat", text: "Usually the song with the stronger hook gives the vocal and the one with the stronger groove gives the beat." },
        ],
      },
      {
        heading: "Split, match and line up",
        paragraphs: [
          "On the mashup maker, drop the vocal song in the first slot and the beat song in the second. Both are split in your browser; the beat's tempo is matched to the vocal and you can slide the vocal's start until the phrases land, then download the result as a WAV.",
          "For more control, open both in the Studio. A vocal placed over a beat is matched in tempo and key and its phrases are set on the beat's downbeats, so the chorus lands where the beat lifts.",
        ],
      },
      {
        heading: "Arrange it like a song",
        paragraphs: [
          "Don't run both songs start to finish. Open with a recognisable piece of the beat, bring the vocal in on a phrase, and save the biggest moment — the vocal's chorus over the beat's drop — for the middle. Mute the beat's own vocal bleed, and borrow a line from the second song's vocal for a breakdown if it fits.",
        ],
      },
      {
        heading: "Mix the two into one",
        paragraphs: [
          "Two songs mastered separately rarely sit together straight away. Turn the beat down a little under the vocal, cut the beat's low-mids where the voice lives, and send both to the same reverb so they sound like one room. Then publish it with credits to both songs, or export an MP3 to share.",
        ],
      },
    ],
    faq: [
      {
        q: "What makes a mashup sound bad?",
        a: "Usually keys that clash, two vocals fighting, or a vocal stretched too far from its own tempo. Measure first and fix the key; most of the rest is arrangement.",
      },
      {
        q: "Can I make a mashup of more than two songs?",
        a: "Yes. In the Studio, the AI producer can plan a new song from several: who sings which part, which beat plays under it, at one tempo and one key.",
      },
    ],
    tools: ["mashup-maker", "bpm-key-finder", "acapella-extractor", "vocal-remover"],
    related: ["how-to-match-keys", "how-to-match-bpm", "how-to-make-a-remix"],
    minutes: 5,
    updated: "2026-11-20",
  },
  {
    slug: "how-to-use-stems-in-a-daw",
    name: "How to use stems in a DAW",
    title: "How to use stems in a DAW",
    description:
      "How to use stems in Ableton, FL Studio, Logic or any DAW: export lined-up WAVs, set the project tempo, import at bar one and mix the parts like a session.",
    h1: "How to use stems in a DAW",
    lead:
      "Stems are only useful in a DAW if they line up. Export every part from the same split, starting at the song's first sample, as WAV; set your project to the song's tempo; and drop them all at the start of bar one. From there they behave like any multitrack session.",
    sections: [
      {
        heading: "Export stems that line up",
        paragraphs: [
          "Split the song with the stem splitter, then open it in Remixt's Studio. Leave every lane where it starts, at zero, and use Export lane on each as a WAV. Each file begins at the song's first sample and runs its full length, so they stay in sync however you import them.",
          "Use WAV rather than MP3 for stems: MP3 encoders can add a few milliseconds of silence at the start, which shifts a part off the others.",
        ],
        steps: [
          { name: "Split the song", text: "Vocals, drums, bass and melody, separated in your browser." },
          { name: "Export each lane as a WAV", text: "In the Studio, Export lane on each part without moving it." },
          { name: "Note the tempo and key", text: "The BPM and key finder gives both, to set up the project." },
        ],
      },
      {
        heading: "Set up the project",
        paragraphs: [
          "Set the project tempo to the song's BPM before importing, and turn off automatic warping or tempo detection on import (Ableton's Warp, for example) — the stems are already at the right tempo, and a guessed warp can shift them.",
          "Drag all the stems in together and place them at the start of bar one. If the song has a pickup before its first downbeat, nudge the whole group so the first downbeat lands on a bar line, keeping their relative positions.",
        ],
      },
      {
        heading: "File details that save headaches",
        paragraphs: [
          "Remixt exports at 44.1 kHz, the CD rate every DAW plays as it is. In a 48 kHz project the DAW converts the files on import, which is fine; just let it, rather than playing them at the wrong rate.",
          "Name each file with its part, tempo and key — \"Song – Drums – 92 BPM 8A.wav\" — and colour the tracks by part when they land: one colour for vocals, one for drums, one for bass, one for melody. It takes a minute and makes a session with a dozen stems from different songs readable at a glance.",
        ],
      },
      {
        heading: "Mix them like a session",
        paragraphs: [
          "Put each stem on its own track and treat them like a band's recording: EQ the bass and kick so they don't fight, compress the vocal on its own, add sends for reverb and delay. Separated stems can carry small traces of each other, so gentle filtering helps more than heavy processing.",
          "For a remix, keep only the stems you need and build new parts around them; for practice, mute your instrument's stem and play along.",
        ],
      },
    ],
    faq: [
      {
        q: "Which DAWs can use these stems?",
        a: "Any of them: Ableton Live, FL Studio, Logic Pro, Pro Tools, Reaper, GarageBand and others all import WAV files.",
      },
      {
        q: "Why are my stems out of sync after importing?",
        a: "Usually automatic warping or tempo detection on import, or MP3 files with encoder delay. Re-import the WAVs with warping off and all of them placed at the same start point.",
      },
    ],
    tools: ["stem-splitter", "bpm-key-finder", "drum-extractor", "bass-extractor"],
    related: ["how-to-make-a-remix", "how-to-isolate-vocals", "how-to-match-bpm"],
    minutes: 4,
    updated: "2026-11-20",
  },
];

export function guide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export const GUIDES_PATH = "/guides";

export function guidePath(slug: string): string {
  return `${GUIDES_PATH}/${slug}`;
}

/** The guides that explain a tool page's job, for "Learn more" on that page. */
export function guidesForTool(slug: string): Guide[] {
  return GUIDES.filter((g) => g.tools.includes(slug));
}
