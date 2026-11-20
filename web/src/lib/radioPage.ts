// What the radio's front page (components/radio/RadioHome.tsx) says that the
// server also needs: its questions (shown, and as FAQ structured data) and
// the station limit it names. Pure, so both sides can import it.

/** Stations one account may run (admins: any number). Enforced in lib/radio.ts createStation. */
export const STATIONS_PER_ACCOUNT = 5;

export const RADIO_FAQ = [
  {
    q: "Is Remixt radio free?",
    a: "Yes. Listening, voting and requesting are free, and so is running your own station. Stations may play a short break now and then.",
  },
  {
    q: "Does everyone hear the same thing?",
    a: "Yes. A station keeps one clock: every listener hears the same moment of the same song, so a vote or a request changes the radio for everyone at once.",
  },
  {
    q: "How are the changes between songs mixed?",
    a: "Each station picks a style — AutoMix, bass swap, filter sweep, echo out, riser, tape stop or a smooth blend — or leaves it on Auto, which picks the best for each pair of songs by their tempos. The change is mixed into the song itself, so a phone plays it exactly the same.",
  },
  {
    q: "Can I put a station on my site or stream?",
    a: "Yes. Every station has an embeddable player, a page made to be captured by OBS for YouTube or Twitch, and a public API of what's playing.",
  },
];
