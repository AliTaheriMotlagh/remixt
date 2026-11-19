import MemberPage from "@/components/earnings/MemberPage";
import ArtistSongs from "@/components/earnings/ArtistSongs";

export const metadata = { title: "آهنگ‌های شما به‌عنوان هنرمند", robots: { index: false } };

export default function Page() {
  return <MemberPage lang="fa" path="/earnings/songs">{(rate) => <ArtistSongs lang="fa" rate={rate} />}</MemberPage>;
}
