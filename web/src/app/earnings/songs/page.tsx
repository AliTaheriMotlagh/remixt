import MemberPage from "@/components/earnings/MemberPage";
import ArtistSongs from "@/components/earnings/ArtistSongs";

export const metadata = { title: "Your songs as an artist", robots: { index: false } };

export default function Page() {
  return <MemberPage lang="en" path="/earnings/songs">{(rate) => <ArtistSongs lang="en" rate={rate} />}</MemberPage>;
}
