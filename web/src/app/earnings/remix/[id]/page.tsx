import MemberPage from "@/components/earnings/MemberPage";
import RemixAdPanel from "@/components/earnings/RemixAdPanel";

export const metadata = { title: "A remix's ads", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberPage lang="en" path={`/earnings/remix/${id}`}>{(rate) => <RemixAdPanel remixId={id} lang="en" rate={rate} />}</MemberPage>;
}
