import { pageMetadata } from "@/lib/seo";

// The page itself is a client component, which can't export metadata.
export const metadata = pageMetadata({
  title: "Log in",
  description: "Log in to Remixt to upload songs, save remixes and follow artists.",
  path: "/login",
  noindex: true,
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
