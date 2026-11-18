import { notFound, redirect } from "next/navigation";
import RadioConsole from "@/components/radio/RadioConsole";
import { getCurrentUser } from "@/lib/auth";
import { canManage, getStation } from "@/lib/radio";

export const metadata = { title: "Radio console", robots: { index: false } };

// The station's console: its DJ (the owner) and the admins only.
export default async function RadioConsolePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [station, user] = await Promise.all([getStation(slug).catch(() => null), getCurrentUser()]);
  if (!station) notFound();
  if (!user) redirect(`/login?next=/radio/${slug}/console`);
  if (!canManage(user, station)) redirect(`/radio/${slug}`);
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-6">
      <RadioConsole slug={station.slug} />
    </div>
  );
}
