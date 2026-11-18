import { notFound } from "next/navigation";
import RadioBroadcast from "@/components/radio/RadioBroadcast";
import { getStation } from "@/lib/radio";

// The station full screen, for OBS → YouTube Live (see RadioBroadcast).
export default async function RadioBroadcastPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const station = await getStation(slug).catch(() => null);
  if (!station) notFound();
  return <RadioBroadcast slug={station.slug} />;
}

export const metadata = { robots: { index: false } };
