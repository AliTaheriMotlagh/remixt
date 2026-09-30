import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
import MobileTabBar from "@/components/MobileTabBar";
import PreviewBar from "@/components/PreviewBar";
import SplitterStatus from "@/components/SplitterStatus";
import { SplitHelperStatus } from "@/components/SplitQueue";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Absolute URLs for canonical links and link previews (lib/site.ts).
  metadataBase: siteUrl(),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE.toLowerCase()}`,
    // Each page names itself; this adds the brand.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: "music",
  openGraph: {
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
  // Installed to an iPhone's home screen, it opens full-screen like an app.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "black" },
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
        <SplitHelperStatus signedIn={!!user} />
        <MobileTabBar user={user} isAdmin={isAdmin(user)} />
      </body>
    </html>
  );
}
