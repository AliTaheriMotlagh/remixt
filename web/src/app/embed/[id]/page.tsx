import { notFound } from "next/navigation";
import EmbedPlayer from "@/components/EmbedPlayer";
import { getRemixCard } from "@/lib/models";

// The page inside the <iframe> other sites embed (the Share menu hands out
// the snippet). Only published remixes; the site's nav bar hides itself here.
export default async function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const remix = await getRemixCard(id);
  if (!remix?.published) notFound();
  return (
    <div className="p-2">
      <EmbedPlayer remixId={remix.id} title={remix.title} artist={remix.artist_name} pageUrl={`/remixes/${remix.id}`} />
    </div>
  );
}

export const metadata = { robots: { index: false } };
