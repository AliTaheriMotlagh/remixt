import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import NavBar from "@/components/NavBar";
import NavProgress from "@/components/NavProgress";
import IsolationBoundary from "@/components/IsolationBoundary";
import FeedbackDialog from "@/components/FeedbackDialog";
import AnalyticsBeacon from "@/components/AnalyticsBeacon";
import MobileTabBar from "@/components/MobileTabBar";
import PreviewBar from "@/components/PreviewBar";
import SplitterStatus from "@/components/SplitterStatus";
import PresenceHeartbeat from "@/components/PresenceHeartbeat";
import InstallPrompt from "@/components/InstallPrompt";
import UpdatePrompt from "@/components/UpdatePrompt";
import ConnectionNotice from "@/components/ConnectionNotice";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { mailReady } from "@/lib/mail";
import { planFor } from "@/lib/billing/store";
import { BackgroundActivity } from "@/components/UploadActivity";
import FooterGate from "@/components/FooterGate";
import SiteFooter from "@/components/SiteFooter";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings/server";
import { publicSettings } from "@/lib/settings/registry";
import { SettingsProvider } from "@/components/SettingsProvider";
import { isAdmin } from "@/lib/admin";
import { SITE_CREATOR, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Persian (and Arabic) script: Geist has none, and its size-adjusted Arial
// fallback draws Persian letters unjoined — titles, artists and lyrics came
// out as separate letters. Vazirmatn's Arabic-script cut (variable, every
// weight, 46 KB; assets/fonts, SIL OFL) is limited to those letters by
// unicode-range, so it goes first in the stack without touching Latin text,
// and with no preload a page with no Persian never downloads it.
const vazirmatn = localFont({
  src: "../../assets/fonts/Vazirmatn-arabic.woff2",
  variable: "--font-vazirmatn",
  weight: "100 900",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  // next/font only takes literals here. The Arabic blocks with Persian's extra
  // letters, presentation forms and the joiners Persian needs (ZWNJ U+200C,
  // ZWJ, LRM/RLM) — Google Fonts' "arabic" subset, which the file was cut to.
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200F, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC",
    },
  ],
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
  authors: [{ name: SITE_CREATOR.name, url: SITE_CREATOR.url }],
  creator: SITE_CREATOR.name,
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
  // Search consoles' ownership checks, as meta tags (Google also has its
  // file in public/). Each is left out while its variable is unset.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.YANDEX_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined,
  },
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
  const [user, settings, canMail] = await Promise.all([getCurrentUser(), getSettings(), mailReady().catch(() => false)]);
  const plan = await planFor(user).catch(() => "free" as const);
  // Signed in with an address not yet confirmed (and the site can send the link).
  const unconfirmed = !!user && !user.email_verified_at && canMail && settings.features.requireVerifiedEmail;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${vazirmatn.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SettingsProvider value={publicSettings(settings)} plan={plan}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <NavProgress />
        <IsolationBoundary />
        {settings.network.adsenseClient && <meta name="google-adsense-account" content={settings.network.adsenseClient} />}
        {/* AdSense's site check looks for its snippet in the page's own HTML. NetworkSlot reuses this tag (same id). */}
        {/^ca-pub-\d+$/.test(settings.network.adsenseClient) && (
          <script id="adsbygoogle-js" async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${settings.network.adsenseClient}`} crossOrigin="anonymous" />
        )}
        <NavBar user={user} isAdmin={isAdmin(user)} />
        {unconfirmed && <VerifyEmailBanner email={user!.email} />}
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <FooterGate>
          <SiteFooter />
        </FooterGate>
        <PreviewBar />
        <PresenceHeartbeat />
        <AnalyticsBeacon />
        <InstallPrompt />
        <UpdatePrompt />
        <ConnectionNotice />
        <SplitterStatus signedIn={!!user} />
        <BackgroundActivity signedIn={!!user} userId={user?.id ?? null} />
        <FeedbackDialog signedIn={!!user} />
        <MobileTabBar user={user} isAdmin={isAdmin(user)} />
        </SettingsProvider>
      </body>
    </html>
  );
}
