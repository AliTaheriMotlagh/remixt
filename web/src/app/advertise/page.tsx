import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import MemberPage from "@/components/earnings/MemberPage";
import AdvertiserPage from "@/components/earnings/AdvertiserPage";

export const metadata = pageMetadata({
  title: "Advertise on Remixt — picture, audio and promoted remixes",
  description: "Reach people who make and listen to music. Picture ads, audio ads before remixes and on the radio, or promote your own remix. Pay only for real views.",
  path: "/advertise",
  languages: { en: "/advertise", fa: "/fa/advertise" },
});

export default function Page() {
  return (
    <MemberPage lang="en" path="/advertise">
      {() => (
        <Suspense>
          <AdvertiserPage lang="en" />
        </Suspense>
      )}
    </MemberPage>
  );
}
