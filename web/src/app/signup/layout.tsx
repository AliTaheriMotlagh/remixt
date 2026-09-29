import { pageMetadata } from "@/lib/seo";

// The page itself is a client component, which can't export metadata.
export const metadata = pageMetadata({
  title: "Create a free artist account",
  description:
    "Join Remixt free: split songs into vocals and beats in your browser, remix them with other tracks, and publish under your artist name.",
  path: "/signup",
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
