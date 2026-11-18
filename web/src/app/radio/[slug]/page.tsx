import { notFound } from "next/navigation";
import RadioStation from "@/components/radio/RadioStation";
import { getCurrentUser } from "@/lib/auth";
import { getStation } from "@/lib/radio";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const station = await getStation(slug).catch(() => null);
  return pageMetadata({
    title: station ? `${station.name} — live radio` : "Radio",
    description: station?.tagline || "Live radio on Remixt: vote on what plays next and request songs.",
    path: `/radio/${slug}`,
  });
}

export default async function StationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [station, user] = await Promise.all([getStation(slug).catch(() => null), getCurrentUser()]);
  if (!station) notFound();
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-5 sm:py-6">
      <RadioStation slug={station.slug} name={station.name} signedIn={!!user} />
    </div>
  );
}
