import MemberPage from "@/components/earnings/MemberPage";
import RemixAdPanel from "@/components/earnings/RemixAdPanel";

export const metadata = { title: "تبلیغ یک ریمیکس", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberPage lang="fa" path={`/earnings/remix/${id}`}>{(rate) => <RemixAdPanel remixId={id} lang="fa" rate={rate} />}</MemberPage>;
}
