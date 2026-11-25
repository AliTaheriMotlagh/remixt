import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings/server";
import { SITE_NAME } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description: `What ${SITE_NAME} keeps about you, why, who else sees it (ads, payments, email) and how to have it removed.`,
  path: "/privacy",
});

// Written from what the code does (lib/analyticsStore, lib/feedbackStore,
// lib/auth, the ad networks in lib/monetize/network). Change it when they change.
export default async function PrivacyPage() {
  const { network, features } = await getSettings();
  const networks = [network.adsense && "Google AdSense", network.other && (network.otherName || "an advertising network")].filter(Boolean) as string[];
  return (
    <article className="prose-legal mx-auto w-full max-w-3xl px-4 py-10 text-sm leading-relaxed sm:px-6 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:ps-5">
      <h1 className="text-2xl font-bold">Privacy policy</h1>
      <p className="text-muted">Last changed 25 November 2026.</p>

      <h2>Songs you split</h2>
      <p>
        The splitter runs in your own browser. A song you split there never leaves your device unless you choose to upload or publish it. Songs you
        upload are stored so you (and, if you make them public, others) can use them; private songs are shown only to you and the people you share them with.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Your email, artist name, profile and a hash of your password (never the password itself).</li>
        <li>One cookie, <code>remix_session</code>, keeps you signed in. It&apos;s needed for the site to work and isn&apos;t used for ads.</li>
        <li>What you make and share: songs, remixes, comments, likes, follows.</li>
        <li>If you earn money: your earnings, payout requests and the payout details you give us (for example a PayPal address or bank account).</li>
      </ul>

      <h2>How the site is used</h2>
      <p>
        {features.analytics
          ? "We count page views, visits, where visitors come from and their device type on our own servers, without cookies and without storing your network address. Browsers that send Do Not Track or Global Privacy Control are not counted. These records are deleted after about 13 months."
          : "Usage statistics are switched off."}
      </p>
      <p>
        When something goes wrong in your browser (a script error, a page that doesn&apos;t load, the server failing a request, repeated clicks that got no
        answer) your browser tells us what went wrong, on which page, and on what kind of device, so we can fix it. If you are signed in this is linked
        to your account. These reports are deleted after 30 days. Feedback you send through the Feedback box is kept until it has been dealt with.
      </p>

      <h2>Ads</h2>
      <p>
        Free accounts and visitors see ads. Ads we sell directly and Remixt&apos;s own ads are served by us and set no cookies; we count when an ad was
        seen, on which page, without storing who you are beyond an anonymous id kept in your browser.
      </p>
      {networks.length > 0 ? (
        <p>
          Some ad spots are filled by {networks.join(" and ")}. Third-party vendors, including Google, use cookies to serve ads based on your prior
          visits to this and other websites. Google&apos;s use of advertising cookies lets it and its partners serve ads to you based on your visits to
          this and other sites. You can opt out of personalised advertising in{" "}
          <a href="https://adssettings.google.com" className="text-brand-strong underline" rel="noopener">
            Google&apos;s Ads Settings
          </a>{" "}
          or at{" "}
          <a href="https://www.aboutads.info/choices" className="text-brand-strong underline" rel="noopener">
            aboutads.info
          </a>
          . Visitors in the European Economic Area, the UK and Switzerland are asked for consent first.{" "}
          <a href="https://policies.google.com/technologies/partner-sites" className="text-brand-strong underline" rel="noopener">
            How Google uses information from sites that use its services
          </a>
          .
        </p>
      ) : (
        <p>No outside ad networks run on the site at the moment.</p>
      )}
      <p>Remixt Plus members see no ads.</p>

      <h2>Who else handles your data</h2>
      <ul>
        <li>Hosting, storage and delivery: Cloudflare and Vercel; the database: a managed Postgres provider.</li>
        <li>Payments for Plus: Stripe or PayPal handle your card or account; we never see card numbers.</li>
        <li>Email (confirming your address, resetting a password): Resend.</li>
        <li>The Studio&apos;s AI helper: what you ask it, and a description of your mix, are sent to the AI provider through OpenRouter.</li>
        <li>Lyrics and song covers are looked up from public catalogues by song name; nothing about you is sent.</li>
      </ul>
      <p>We don&apos;t sell your personal data.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete a song or remix at any time from the Studio or your library.</li>
        <li>
          To get a copy of your data, correct it, or delete your account and everything in it, write to us through the{" "}
          <a href="#feedback" className="text-brand-strong underline">
            Feedback box
          </a>{" "}
          while signed in. We answer within 30 days.
        </li>
        <li>
          Copyright questions: see <Link href="/takedown" className="text-brand-strong underline">Copyright &amp; takedowns</Link>.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we&apos;ll say so on the site before it applies.</p>
    </article>
  );
}
