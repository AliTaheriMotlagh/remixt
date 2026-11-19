import { pageMetadata } from "@/lib/seo";
import EarningsPage from "@/components/earnings/EarningsPage";

export const metadata = pageMetadata({
  title: "Earn from your remixes — how ads pay artists",
  description: "Ads on a remix pay its remixers, the artists of the songs it uses and Remixt. See the shares, claim your songs and get paid.",
  path: "/earnings",
  languages: { en: "/earnings", fa: "/fa/earnings" },
});

export default function Page() {
  return <EarningsPage lang="en" />;
}
