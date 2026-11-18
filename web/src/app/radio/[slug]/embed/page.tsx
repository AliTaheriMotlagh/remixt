import { notFound } from "next/navigation";
import RadioEmbed from "@/components/radio/RadioEmbed";
import { getStation } from "@/lib/radio";

// The station inside an <iframe> (the station's Share card hands out the snippet). No site chrome here (bareView.ts).
export default async function RadioEmbedPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ autoplay?: string }> }) {
  const { slug } = await params;
  const { autoplay } = await searchParams;
  const station = await getStation(slug).catch(() => null);
  if (!station) notFound();
  return (
    <div className="p-2">
      <RadioEmbed slug={station.slug} autoplay={autoplay === "1"} />
    </div>
  );
}

export const metadata = { robots: { index: false } };
