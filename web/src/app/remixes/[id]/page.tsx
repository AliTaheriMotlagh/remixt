import Link from "next/link";
import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import RemixDetailPlayer from "@/components/RemixDetailPlayer";
import RemixOwnerControls from "@/components/RemixOwnerControls";

type RemixRow = {
  id: string;
  title: string;
  published: boolean;
  created_at: string;
  owner_id: string;
  artist_name: string;
  artist_id: string;
};

export default async function RemixDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await sql<RemixRow[]>`
    SELECT remixes.*, users.artist_name, users.id as artist_id
    FROM remixes JOIN users ON users.id = remixes.owner_id
    WHERE remixes.id = ${id}
  `;
  const remix = rows[0];

  if (!remix) notFound();

  const user = await getCurrentUser();
  const isOwner = user?.id === remix.owner_id;

  if (!remix.published && !isOwner) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{remix.title}</h1>
          <p className="mt-1 text-sm text-muted">
            by{" "}
            <Link href={`/artist/${remix.artist_id}`} className="text-brand-strong hover:underline">
              {remix.artist_name}
            </Link>
          </p>
        </div>
        {isOwner && (
          <RemixOwnerControls remixId={remix.id} initialPublished={remix.published} />
        )}
      </div>

      <RemixDetailPlayer remixId={remix.id} user={user} />
    </div>
  );
}
