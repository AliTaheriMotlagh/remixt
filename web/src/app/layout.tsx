import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import MobileTabBar from "@/components/MobileTabBar";
import PreviewBar from "@/components/PreviewBar";
import SplitterStatus from "@/components/SplitterStatus";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Upload a song, auto-split it into vocals and beat stems, and remix them with other tracks in a browser-based studio.";

export const metadata: Metadata = {
  // Absolute URLs for link previews. On Vercel, Next works this out
  // itself; elsewhere set PUBLIC_BASE_URL (e.g. https://remix.example.com).
  metadataBase: process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL) : undefined,
  title: "Remixt — remix vocals and beats from any song",
  description,
  openGraph: {
    siteName: "Remixt",
    title: "Remixt — remix vocals and beats from any song",
    description,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  // Installed to an iPhone's home screen, it opens full-screen like an app.
  appleWebApp: { capable: true, title: "Remixt", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw under the notch and home indicator; globals.css pads with the
  // safe-area insets where it matters. Pinch-zoom stays on.
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <NavBar user={user} isAdmin={isAdmin(user)} />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <PreviewBar />
        <SplitterStatus signedIn={!!user} />
        <MobileTabBar user={user} isAdmin={isAdmin(user)} />
      </body>
    </html>
  );
}
