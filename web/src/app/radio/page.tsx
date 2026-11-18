import RadioHome from "@/components/radio/RadioHome";
import { getCurrentUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Radio: vote on what plays next",
  description: "Live radio stations of songs and remixes on Remixt. Everyone hears the same moment; listeners vote on the next song and send requests. Start your own station, embed it, or broadcast it on YouTube Live.",
  path: "/radio",
});

export default async function RadioPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-5 sm:py-8">
      <RadioHome signedIn={!!user} />
    </div>
  );
}
