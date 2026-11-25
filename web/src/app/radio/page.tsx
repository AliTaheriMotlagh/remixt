import RadioHome from "@/components/radio/RadioHome";
import { getCurrentUser } from "@/lib/auth";
import { listStations } from "@/lib/radio";
import { RADIO_FAQ } from "@/lib/radioPage";
import { JsonLd, breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/seo";
import AdCard from "@/components/ads/AdCard";

export const metadata = pageMetadata({
  title: "Live radio stations, mixed like a DJ",
  description:
    "Live radio of songs and remixes, every change mixed like a DJ. Everyone hears the same moment, votes on the next song and sends requests. Start your own.",
  path: "/radio",
});

export default async function RadioPage() {
  const user = await getCurrentUser();
  // The stations come with the page (no spinner, and search engines see them); the page keeps them fresh.
  const stations = await listStations(user?.id ?? null).catch(() => null);
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-8">
      <JsonLd data={[faqJsonLd(RADIO_FAQ), breadcrumbJsonLd([{ name: "Radio", path: "/radio" }])]} />
      <RadioHome signedIn={!!user} initial={stations} />
      <AdCard placement="site" className="mt-10" />
    </div>
  );
}
