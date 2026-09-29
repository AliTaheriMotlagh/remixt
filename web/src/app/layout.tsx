import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";
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
        <NavBar user={user} isAdmin={isAdmin(user)} />
        <div className="flex flex-1 flex-col">{children}</div>
        <PreviewBar />
        <SplitterStatus signedIn={!!user} />
      </body>
    </html>
  );
}
