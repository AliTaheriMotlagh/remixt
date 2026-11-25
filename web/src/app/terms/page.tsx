import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { getSettings } from "@/lib/settings/server";
import { formatMoney } from "@/lib/monetize/policy";
import { SITE_NAME } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Terms and creator terms",
  description: `The rules for using ${SITE_NAME}, uploading music, and earning from ads on your remixes and songs.`,
  path: "/terms",
});

// The numbers come from Admin → Settings, so this page always says what the site really does.
export default async function TermsPage() {
  const s = await getSettings();
  const pct = (bp: number) => `${bp / 100}%`;
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-sm leading-relaxed sm:px-6 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:ps-5">
      <h1 className="text-2xl font-bold">Terms and creator terms</h1>
      <p className="text-muted">Last changed 25 November 2026.</p>

      <h2>Using {SITE_NAME}</h2>
      <ul>
        <li>Only upload music you have the right to use. Publishing a remix makes it public; the songs in it must allow that.</li>
        <li>No spam, no fake plays or ad views, no attempts to break into accounts or the site.</li>
        <li>We may remove content or close accounts that break these rules or the law.</li>
        <li>
          Rights holders can ask for music to be taken down: <Link href="/takedown" className="text-brand-strong underline">Copyright &amp; takedowns</Link>.
        </li>
      </ul>

      <h2>Earning from ads</h2>
      <p>Money from ads on a remix&apos;s page is shared:</p>
      <ul>
        <li>The songs&apos; artists: {pct(s.shares.remix.artists)} (kept for an artist until they claim their song and we verify the claim).</li>
        <li>The remix&apos;s makers: {pct(s.shares.remix.remixers)} (its owner can share this with collaborators).</li>
        <li>
          {SITE_NAME}: {pct(s.shares.remix.platform)}, out of which each song&apos;s uploader gets {pct(s.shares.uploader)} and the member whose computer split it{" "}
          {pct(s.shares.miner)}.
        </li>
      </ul>
      <p>
        Ads from advertising networks are shared the same way once a month, after the network has paid us, in proportion to the views on each page.
        Clicking ads earns nobody anything; only real views count. Views from robots, from the people the ad would pay, and unusual numbers of views
        from one network address are not paid.
      </p>

      <h2>Getting paid</h2>
      <ul>
        <li>Earnings wait {s.payouts.holdDays} days before they can be withdrawn (to catch invalid traffic and refunds).</li>
        <li>You can withdraw from {formatMoney(s.payouts.minMicros)}. Payouts are sent by hand to the method you choose; you&apos;re told when it&apos;s sent.</li>
        <li>Money kept for an artist who never claims their song goes to {SITE_NAME} after {s.payouts.unclaimedYears} years.</li>
        <li>Earnings from fake views, false claims to songs, or music you had no right to use are forfeited.</li>
        <li>You are responsible for any tax on what you earn.</li>
        <li>
          We can change the shares and rules with notice on the site; changes apply to new views only — what you already earned stays as it was.
        </li>
      </ul>

      <h2>Remixt Plus</h2>
      <p>
        Plus is a subscription with no ads and extra features. It renews until you cancel; cancelling stops the next payment and Plus stays on until
        the end of the period you paid for.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided as it is. We work to keep it running and your work safe, but keep your own copies of anything important. To the extent the
        law allows, we aren&apos;t liable for lost data or lost earnings.
      </p>

      <p>
        Questions: use the <a href="#feedback" className="text-brand-strong underline">Feedback box</a>. See also the{" "}
        <Link href="/privacy" className="text-brand-strong underline">privacy policy</Link>.
      </p>
    </article>
  );
}
